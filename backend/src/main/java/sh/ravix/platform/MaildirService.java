package sh.ravix.platform;

import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;
import jakarta.transaction.Transactional;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.Base64;
import java.util.Comparator;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.TreeSet;
import java.util.stream.Stream;
import org.eclipse.microprofile.config.inject.ConfigProperty;
import org.jboss.logging.Logger;
import sh.ravix.entity.Contact;
import sh.ravix.entity.Mailbox;
import sh.ravix.util.Ids;

/**
 * Reads and mutates a mailbox's on-disk Maildir (Maildir++ layout, as written
 * by Dovecot LMTP delivery). This is the real source of truth for webmail —
 * folders, messages, flags, attachments and search all operate on the
 * filesystem so the panel shows exactly what the IMAP clients see.
 *
 * Flags follow the Maildir convention: a message file is named
 * {@code <uid>:2,<flags>} where flags is a sorted letter set
 * (D draft, F flagged/starred, P passed, R replied, S seen, T trashed).
 * A file living in {@code new/} (no :2, suffix) is unread by definition.
 *
 * The DTO field names below match the frontend's Mail* types exactly so they
 * serialise straight to JSON with no mapping layer.
 */
@ApplicationScoped
public class MaildirService {

    private static final Logger LOG = Logger.getLogger(MaildirService.class);

    @ConfigProperty(name = "ravix.provision.vmail-base") String vmailBase;

    @Inject MimeParser mime;
    @Inject PlatformService platform;

    // Canonical folder key  →  Maildir++ subdirectory ("" = INBOX root).
    private static final Map<String, String> STD = Map.of(
            "inbox", "",
            "sent", ".Sent",
            "drafts", ".Drafts",
            "trash", ".Trash",
            "spam", ".Junk",
            "archive", ".Archive");

    // --- DTOs (field names mirror the frontend Mail* types) ----------------

    public record FolderInfo(String key, String name, long total, long unread) {}

    public record AttachmentInfo(int index, String filename, String contentType,
                                 long sizeBytes, boolean inline, String contentId) {}

    public record Summary(
            String id, String folder,
            String fromAddr, String fromName, String toAddr,
            String subject, String preview,
            boolean unread, boolean starred, boolean hasAttachments,
            String receivedAt, String threadId, int threadCount) {}

    public record Full(
            Summary summary, String ccAddr, String replyTo,
            String html, String text, String messageId, String inReplyTo,
            List<AttachmentInfo> attachments) {}

    public record Page(List<Summary> messages, long total, int offset, int limit) {}

    public record AttachmentBytes(byte[] data, String contentType, String filename) {}

    // --- Path resolution ---------------------------------------------------

    private Path maildirRoot(Mailbox m) {
        int at = m.email.indexOf('@');
        String local = at > 0 ? m.email.substring(0, at) : m.email;
        String domain = at > 0 ? m.email.substring(at + 1) : m.domain;
        return Path.of(vmailBase, domain, local, "Maildir");
    }

    private Path folderDir(Mailbox m, String key) {
        Path root = maildirRoot(m);
        String sub = STD.containsKey(key) ? STD.get(key) : "." + key;
        return sub.isEmpty() ? root : root.resolve(sub);
    }

    // --- Folders -----------------------------------------------------------

    public List<FolderInfo> folders(Mailbox m) {
        List<FolderInfo> out = new ArrayList<>();
        for (String key : List.of("inbox", "sent", "drafts", "spam", "trash", "archive")) {
            long[] tc = countFolder(folderDir(m, key));
            out.add(new FolderInfo(key, key, tc[0], tc[1]));
        }
        // Any extra Maildir++ subfolders created from an IMAP client.
        Path root = maildirRoot(m);
        if (Files.isDirectory(root)) {
            try (Stream<Path> s = Files.list(root)) {
                s.filter(Files::isDirectory)
                 .map(p -> p.getFileName().toString())
                 .filter(n -> n.startsWith("."))
                 .map(n -> n.substring(1))
                 .filter(n -> !isStandardSub("." + n))
                 .sorted()
                 .forEach(name -> {
                     long[] tc = countFolder(root.resolve("." + name));
                     out.add(new FolderInfo(name, name, tc[0], tc[1]));
                 });
            } catch (IOException e) {
                LOG.debugf("folder enumerate failed: %s", e.getMessage());
            }
        }
        return out;
    }

    private boolean isStandardSub(String sub) {
        return STD.values().stream().anyMatch(v -> v.equalsIgnoreCase(sub));
    }

    private long[] countFolder(Path dir) {
        long total = 0, unread = 0;
        for (String sub : new String[]{"new", "cur"}) {
            Path d = dir.resolve(sub);
            if (!Files.isDirectory(d)) continue;
            try (Stream<Path> s = Files.list(d)) {
                for (Path f : (Iterable<Path>) s::iterator) {
                    if (!Files.isRegularFile(f)) continue;
                    total++;
                    if (!flags(f).contains("S")) unread++;
                }
            } catch (IOException ignored) { /* skip */ }
        }
        return new long[]{total, unread};
    }

    // --- Listing -----------------------------------------------------------

    public Page list(Mailbox m, String folderKey, String query, int offset, int limit) {
        Path dir = folderDir(m, folderKey);
        List<Path> files = allFiles(dir);

        // Thread index over the whole folder (header-only parse — cheap).
        Map<Path, MimeParser.Headers> hdrs = new HashMap<>();
        for (Path f : files) hdrs.put(f, mime.headers(f));
        Map<Path, ThreadRef> threads = buildThreads(files, hdrs);

        // Optional search across headers + body.
        if (query != null && !query.isBlank()) {
            String needle = query.toLowerCase();
            files = files.stream().filter(f -> matches(f, hdrs.get(f), needle)).toList();
        }

        // Newest first by Maildir epoch (filename prefix), no parse needed.
        files = new ArrayList<>(files);
        files.sort(Comparator.comparingLong(MaildirService::epochOf).reversed());

        long total = files.size();
        int from = Math.max(0, offset);
        int to = Math.min(files.size(), from + Math.max(1, limit));
        List<Summary> page = new ArrayList<>();
        for (Path f : (from < to ? files.subList(from, to) : List.<Path>of())) {
            page.add(summary(m, folderKey, f, threads.get(f)));
        }
        return new Page(page, total, from, limit);
    }

    private Summary summary(Mailbox m, String folderKey, Path f, ThreadRef tr) {
        MimeParser.Parsed p = mime.parse(f);
        MimeParser.Headers h = p.headers();
        String preview = previewOf(p);
        boolean hasAtt = p.attachments().stream().anyMatch(a -> !a.inline());
        String fl = flags(f);
        return new Summary(
                encodeId(m.id, folderKey, uid(f)),
                folderKey,
                h.fromAddr(), h.fromName(), h.toAddr(),
                h.subject() == null || h.subject().isBlank() ? "(no subject)" : h.subject(),
                preview,
                !fl.contains("S"),
                fl.contains("F"),
                hasAtt,
                h.date().toString(),
                tr == null ? null : tr.threadId,
                tr == null ? 1 : tr.count);
    }

    // --- Read a whole conversation ----------------------------------------

    /** All messages of a thread within a folder, oldest first. Reuses read()
     *  so each message is fully decoded (HTML/text/attachments). */
    public List<Full> thread(Mailbox m, String folderKey, String threadId) {
        if (threadId == null || threadId.isBlank()) return List.of();
        Path dir = folderDir(m, folderKey);
        List<Path> files = allFiles(dir);
        Map<Path, MimeParser.Headers> hdrs = new HashMap<>();
        for (Path f : files) hdrs.put(f, mime.headers(f));
        Map<Path, ThreadRef> threads = buildThreads(files, hdrs);

        List<Path> members = files.stream()
                .filter(f -> {
                    ThreadRef tr = threads.get(f);
                    return tr != null && threadId.equals(tr.threadId);
                })
                .sorted(Comparator.comparingLong(MaildirService::epochOf)) // oldest first
                .toList();

        List<Full> out = new ArrayList<>();
        for (Path f : members) {
            read(m, encodeId(m.id, folderKey, uid(f)), false).ifPresent(out::add);
        }
        return out;
    }

    // --- Read single -------------------------------------------------------

    public Optional<Full> read(Mailbox m, String id, boolean markRead) {
        Decoded d = decodeId(id);
        if (d == null || !d.mailboxId.equals(m.id)) return Optional.empty();
        Optional<Path> found = resolve(m, d.folderKey, d.uid);
        if (found.isEmpty()) return Optional.empty();
        Path f = found.get();

        MimeParser.Parsed p = mime.parse(f);
        if (markRead && !flags(f).contains("S")) {
            f = setFlag(f, 'S', true);
        }
        MimeParser.Headers h = p.headers();
        String fl = flags(f);
        Summary s = new Summary(
                encodeId(m.id, d.folderKey, uid(f)),
                d.folderKey,
                h.fromAddr(), h.fromName(), h.toAddr(),
                h.subject() == null || h.subject().isBlank() ? "(no subject)" : h.subject(),
                previewOf(p),
                !fl.contains("S"), fl.contains("F"),
                p.attachments().stream().anyMatch(a -> !a.inline()),
                h.date().toString(), null, 1);
        List<AttachmentInfo> atts = p.attachments().stream()
                .map(a -> new AttachmentInfo(a.index(), a.filename(), a.contentType(),
                        a.sizeBytes(), a.inline(), a.contentId()))
                .toList();
        return Optional.of(new Full(s, p.ccAddr(), p.replyTo(), p.html(), p.text(),
                h.messageId(), h.inReplyTo(), atts));
    }

    public Optional<AttachmentBytes> attachment(Mailbox m, String id, int index) {
        Decoded d = decodeId(id);
        if (d == null || !d.mailboxId.equals(m.id)) return Optional.empty();
        Optional<Path> found = resolve(m, d.folderKey, d.uid);
        if (found.isEmpty()) return Optional.empty();
        MimeParser.Parsed p = mime.parse(found.get());
        MimeParser.Attachment meta = p.attachments().stream()
                .filter(a -> a.index() == index).findFirst().orElse(null);
        if (meta == null) return Optional.empty();
        byte[] data = mime.attachmentBytes(found.get(), index);
        if (data == null) return Optional.empty();
        return Optional.of(new AttachmentBytes(data, meta.contentType(),
                meta.filename() == null ? "attachment-" + index : meta.filename()));
    }

    // --- Mutations ---------------------------------------------------------

    public Optional<Summary> setRead(Mailbox m, String id, boolean unread) {
        return mutate(m, id, f -> setFlag(f, 'S', !unread));
    }

    public Optional<Summary> setStar(Mailbox m, String id, boolean starred) {
        return mutate(m, id, f -> setFlag(f, 'F', starred));
    }

    public Optional<Summary> move(Mailbox m, String id, String targetKey) {
        Decoded d = decodeId(id);
        if (d == null || !d.mailboxId.equals(m.id)) return Optional.empty();
        Optional<Path> found = resolve(m, d.folderKey, d.uid);
        if (found.isEmpty()) return Optional.empty();
        Path dest = moveTo(found.get(), folderDir(m, targetKey));
        if (dest == null) return Optional.empty();
        // Spam learning when moving in/out of the Junk folder.
        if ("spam".equals(targetKey)) learn(dest, true);
        else if ("spam".equals(d.folderKey) && "inbox".equals(targetKey)) learn(dest, false);
        return Optional.of(summary(m, targetKey, dest, null));
    }

    public boolean delete(Mailbox m, String id) {
        Decoded d = decodeId(id);
        if (d == null || !d.mailboxId.equals(m.id)) return false;
        Optional<Path> found = resolve(m, d.folderKey, d.uid);
        if (found.isEmpty()) return false;
        try {
            if ("trash".equals(d.folderKey)) {
                Files.deleteIfExists(found.get());     // permanent
            } else {
                moveTo(found.get(), folderDir(m, "trash"));
            }
            return true;
        } catch (IOException e) {
            LOG.warnf("delete failed for %s: %s", id, e.getMessage());
            return false;
        }
    }

    public long emptyTrash(Mailbox m) {
        Path dir = folderDir(m, "trash");
        long n = 0;
        for (Path f : allFiles(dir)) {
            try { Files.deleteIfExists(f); n++; } catch (IOException ignored) { /* skip */ }
        }
        return n;
    }

    /** Write a draft into .Drafts/cur and return its summary. */
    public Summary saveDraft(Mailbox m, byte[] rfc822) {
        Path dir = folderDir(m, "drafts").resolve("cur");
        try {
            Files.createDirectories(dir);
            String name = Ids.timeUid() + ":2,DS";  // seen + draft
            Path dest = dir.resolve(name);
            Files.write(dest, rfc822);
            chown(dest);
            return summary(m, "drafts", dest, null);
        } catch (IOException e) {
            LOG.warnf("draft save failed: %s", e.getMessage());
            throw new RuntimeException("draft save failed", e);
        }
    }

    /** Deliver a copy into .Sent/cur (called after a successful send). */
    public void appendToSent(Mailbox m, byte[] rfc822) {
        Path dir = folderDir(m, "sent").resolve("cur");
        try {
            Files.createDirectories(dir);
            Path dest = dir.resolve(Ids.timeUid() + ":2,S");
            Files.write(dest, rfc822);
            chown(dest);
        } catch (IOException e) {
            LOG.warnf("append-to-Sent failed: %s", e.getMessage());
        }
    }

    /** Resolve the owning mailbox from an opaque message id. */
    public Optional<Mailbox> mailboxOf(String id) {
        Decoded d = decodeId(id);
        if (d == null) return Optional.empty();
        return Optional.ofNullable(Mailbox.findById(d.mailboxId));
    }

    // --- Contacts harvest --------------------------------------------------

    /** Upsert the From/To addresses seen in a folder into the contact book. */
    @Transactional
    public void harvestContacts(Mailbox m, String folderKey) {
        Path dir = folderDir(m, folderKey);
        List<Path> files = allFiles(dir);
        int cap = Math.min(files.size(), 500);
        for (int i = 0; i < cap; i++) {
            MimeParser.Headers h = mime.headers(files.get(i));
            if ("sent".equals(folderKey)) {
                upsertContact(m.id, h.toAddr(), null);
            } else if (h.fromAddr() != null && !h.fromAddr().equalsIgnoreCase(m.email)) {
                upsertContact(m.id, h.fromAddr(), h.fromName());
            }
        }
    }

    private void upsertContact(String mailboxId, String email, String name) {
        if (email == null || email.isBlank() || !email.contains("@")) return;
        String e = email.trim().toLowerCase();
        Contact c = Contact.find("mailboxId = ?1 and email = ?2", mailboxId, e).firstResult();
        if (c == null) {
            c = new Contact();
            c.id = Ids.generate("ct");
            c.mailboxId = mailboxId;
            c.email = e;
            c.name = name;
            c.seenCount = 1;
            c.lastSeen = OffsetDateTime.now();
            c.persist();
        } else {
            c.seenCount++;
            c.lastSeen = OffsetDateTime.now();
            if ((c.name == null || c.name.isBlank()) && name != null) c.name = name;
        }
    }

    // --- File / flag plumbing ---------------------------------------------

    private List<Path> allFiles(Path folderDir) {
        List<Path> out = new ArrayList<>();
        for (String sub : new String[]{"new", "cur"}) {
            Path d = folderDir.resolve(sub);
            if (!Files.isDirectory(d)) continue;
            try (Stream<Path> s = Files.list(d)) {
                s.filter(Files::isRegularFile).forEach(out::add);
            } catch (IOException ignored) { /* skip */ }
        }
        return out;
    }

    private Optional<Summary> mutate(Mailbox m, String id, java.util.function.Function<Path, Path> op) {
        Decoded d = decodeId(id);
        if (d == null || !d.mailboxId.equals(m.id)) return Optional.empty();
        Optional<Path> found = resolve(m, d.folderKey, d.uid);
        if (found.isEmpty()) return Optional.empty();
        Path after = op.apply(found.get());
        return Optional.of(summary(m, d.folderKey, after, null));
    }

    private Optional<Path> resolve(Mailbox m, String folderKey, String uid) {
        Path dir = folderDir(m, folderKey);
        for (Path f : allFiles(dir)) {
            if (uid(f).equals(uid)) return Optional.of(f);
        }
        return Optional.empty();
    }

    private static String flags(Path file) {
        String name = file.getFileName().toString();
        int idx = name.indexOf(":2,");
        if (idx < 0) return "";   // new/ — no flags
        return name.substring(idx + 3);
    }

    private static String uid(Path file) {
        String name = file.getFileName().toString();
        int idx = name.indexOf(":2,");
        return idx < 0 ? name : name.substring(0, idx);
    }

    /** Set/clear a single flag letter, normalising the sorted flag set and
     *  promoting the file from new/ to cur/ as Maildir requires. */
    private Path setFlag(Path file, char flag, boolean on) {
        try {
            String base = uid(file);
            TreeSet<Character> set = new TreeSet<>();
            for (char c : flags(file).toCharArray()) if (Character.isLetter(c)) set.add(c);
            if (on) set.add(flag); else set.remove(flag);
            StringBuilder fb = new StringBuilder();
            set.forEach(fb::append);
            String newName = base + ":2," + fb;
            Path curDir = "new".equals(file.getParent().getFileName().toString())
                    ? file.getParent().getParent().resolve("cur")
                    : file.getParent();
            Files.createDirectories(curDir);
            Path dest = curDir.resolve(newName);
            if (!dest.equals(file)) {
                Files.move(file, dest, StandardCopyOption.REPLACE_EXISTING);
            }
            return dest;
        } catch (IOException e) {
            LOG.warnf("flag change failed for %s: %s", file, e.getMessage());
            return file;
        }
    }

    private Path moveTo(Path file, Path targetFolderDir) {
        try {
            Path cur = targetFolderDir.resolve("cur");
            Files.createDirectories(cur);
            String fl = flags(file);
            String name = Ids.timeUid() + ":2," + fl;
            Path dest = cur.resolve(name);
            Files.move(file, dest, StandardCopyOption.REPLACE_EXISTING);
            chown(dest);
            return dest;
        } catch (IOException e) {
            LOG.warnf("move failed for %s: %s", file, e.getMessage());
            return null;
        }
    }

    /** Keep delivered/created files owned by the vmail user so Dovecot can
     *  read and rewrite them. Best-effort; ignored off-Linux. */
    private void chown(Path p) {
        if (platform.isLinux()) {
            platform.exec(5, "chown", "vmail:vmail", p.toString());
        }
    }

    private void learn(Path file, boolean spam) {
        if (platform.isLinux()) {
            platform.exec(15, "rspamadm", spam ? "learn_spam" : "learn_ham", file.toString());
        }
    }

    // --- Threading ---------------------------------------------------------

    private static final class ThreadRef {
        String threadId;
        int count;
    }

    /** Union-find over Message-IDs + reference chains, with a normalised-subject
     *  fallback so threads survive clients that drop References headers. */
    private Map<Path, ThreadRef> buildThreads(List<Path> files, Map<Path, MimeParser.Headers> hdrs) {
        Map<String, String> parent = new HashMap<>();   // union-find
        Map<Path, String> keyOf = new HashMap<>();
        Map<String, String> bySubject = new HashMap<>();

        for (Path f : files) {
            MimeParser.Headers h = hdrs.get(f);
            String self = h.messageId() != null ? h.messageId() : "uid:" + uid(f);
            keyOf.put(f, self);
            find(parent, self);
            if (h.inReplyTo() != null) union(parent, self, h.inReplyTo());
            if (!h.references().isEmpty()) {
                union(parent, self, h.references().get(h.references().size() - 1));
            }
            String subj = normSubject(h.subject());
            if (!subj.isEmpty()) {
                String prior = bySubject.putIfAbsent(subj, self);
                if (prior != null) union(parent, self, prior);
            }
        }

        Map<String, Integer> counts = new HashMap<>();
        Map<Path, String> root = new HashMap<>();
        for (Path f : files) {
            String r = find(parent, keyOf.get(f));
            root.put(f, r);
            counts.merge(r, 1, Integer::sum);
        }
        Map<Path, ThreadRef> out = new HashMap<>();
        for (Path f : files) {
            ThreadRef tr = new ThreadRef();
            tr.threadId = Integer.toHexString(root.get(f).hashCode());
            tr.count = counts.get(root.get(f));
            out.put(f, tr);
        }
        return out;
    }

    private static String find(Map<String, String> p, String x) {
        p.putIfAbsent(x, x);
        String r = x;
        while (!p.get(r).equals(r)) r = p.get(r);
        p.put(x, r);
        return r;
    }

    private static void union(Map<String, String> p, String a, String b) {
        String ra = find(p, a), rb = find(p, b);
        if (!ra.equals(rb)) p.put(ra, rb);
    }

    private static String normSubject(String s) {
        if (s == null) return "";
        String t = s.trim().toLowerCase();
        while (true) {
            String before = t;
            t = t.replaceFirst("^(re|fwd|fw|ответ|пересл)\\s*(\\[\\d+\\])?\\s*:\\s*", "");
            if (t.equals(before)) break;
        }
        return t.trim();
    }

    // --- Misc helpers ------------------------------------------------------

    private boolean matches(Path f, MimeParser.Headers h, String needle) {
        if (h != null) {
            if (contains(h.subject(), needle) || contains(h.fromAddr(), needle)
                    || contains(h.fromName(), needle) || contains(h.toAddr(), needle)) {
                return true;
            }
        }
        MimeParser.Parsed p = mime.parse(f);
        return contains(p.text(), needle) || contains(stripHtml(p.html()), needle);
    }

    private static boolean contains(String hay, String needle) {
        return hay != null && hay.toLowerCase().contains(needle);
    }

    private static String previewOf(MimeParser.Parsed p) {
        String body = p.text() != null ? p.text() : stripHtml(p.html());
        if (body == null) return "";
        String flat = body.replaceAll("\\s+", " ").trim();
        return flat.length() > 200 ? flat.substring(0, 200) : flat;
    }

    private static String stripHtml(String html) {
        if (html == null) return null;
        return html.replaceAll("(?s)<style.*?</style>", " ")
                   .replaceAll("(?s)<script.*?</script>", " ")
                   .replaceAll("<[^>]+>", " ")
                   .replaceAll("&nbsp;", " ");
    }

    private static long epochOf(Path file) {
        try {
            String name = file.getFileName().toString();
            int dot = name.indexOf('.');
            return Long.parseLong(dot > 0 ? name.substring(0, dot) : name);
        } catch (Exception e) {
            try {
                return Files.getLastModifiedTime(file).toMillis() / 1000;
            } catch (Exception e2) {
                return 0;
            }
        }
    }

    // --- Stable opaque message id -----------------------------------------

    private record Decoded(String mailboxId, String folderKey, String uid) {}

    private static String encodeId(String mailboxId, String folderKey, String uid) {
        String raw = mailboxId + " " + folderKey + " " + uid;
        return Base64.getUrlEncoder().withoutPadding()
                .encodeToString(raw.getBytes(StandardCharsets.UTF_8));
    }

    private static Decoded decodeId(String id) {
        try {
            String raw = new String(Base64.getUrlDecoder().decode(id), StandardCharsets.UTF_8);
            String[] parts = raw.split(" ", 3);
            if (parts.length != 3) return null;
            return new Decoded(parts[0], parts[1], parts[2]);
        } catch (Exception e) {
            return null;
        }
    }
}
