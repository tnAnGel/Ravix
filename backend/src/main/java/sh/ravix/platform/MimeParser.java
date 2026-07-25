package sh.ravix.platform;

import jakarta.enterprise.context.ApplicationScoped;
import jakarta.mail.Address;
import jakarta.mail.Multipart;
import jakarta.mail.Part;
import jakarta.mail.Session;
import jakarta.mail.internet.InternetAddress;
import jakarta.mail.internet.InternetHeaders;
import jakarta.mail.internet.MimeMessage;
import jakarta.mail.internet.MimeUtility;
import java.io.InputStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.List;
import java.util.Properties;
import org.jboss.logging.Logger;

/**
 * Parses RFC 5322 / MIME messages out of Maildir files using Jakarta Mail.
 * Two depths:
 *   - {@link #headers(Path)} reads only the header block (cheap) — used to
 *     build the thread index and message-list summaries across a whole folder.
 *   - {@link #parse(Path)} fully decodes the body, HTML/plain alternatives and
 *     attachments — used when a single message is opened.
 */
@ApplicationScoped
public class MimeParser {

    private static final Logger LOG = Logger.getLogger(MimeParser.class);
    private static final Session SESSION = Session.getInstance(new Properties());
    private static final String INLINE = "inline";

    // --- DTOs --------------------------------------------------------------

    public record Headers(
            String messageId,
            String inReplyTo,
            List<String> references,
            String subject,
            String fromAddr,
            String fromName,
            String toAddr,
            OffsetDateTime date) {}

    public record Attachment(
            int index,
            String filename,
            String contentType,
            long sizeBytes,
            boolean inline,
            String contentId) {}

    public record Parsed(
            Headers headers,
            String ccAddr,
            String replyTo,
            String html,        // may be null
            String text,        // may be null
            List<Attachment> attachments) {}

    // --- Header-only parse -------------------------------------------------

    public Headers headers(Path file) {
        try (InputStream in = Files.newInputStream(file)) {
            InternetHeaders ih = new InternetHeaders(in);
            String from = firstHeader(ih, "From");
            String[] addr = splitAddress(from);
            return new Headers(
                    clean(firstHeader(ih, "Message-ID")),
                    clean(firstHeader(ih, "In-Reply-To")),
                    refs(firstHeader(ih, "References")),
                    decode(firstHeader(ih, "Subject")),
                    addr[0],
                    addr[1],
                    firstAddress(firstHeader(ih, "To")),
                    parseDate(firstHeader(ih, "Date"), file));
        } catch (Exception e) {
            LOG.debugf("header parse failed for %s: %s", file, e.getMessage());
            return new Headers(null, null, List.of(), "(unparseable)", "", null, "", epochOf(file));
        }
    }

    // --- Full parse --------------------------------------------------------

    public Parsed parse(Path file) {
        try (InputStream in = Files.newInputStream(file)) {
            MimeMessage msg = new MimeMessage(SESSION, in);
            Acc acc = new Acc();
            walk(msg, acc);

            String[] from = addr(msg.getFrom());
            OffsetDateTime date = msg.getSentDate() != null
                    ? OffsetDateTime.ofInstant(msg.getSentDate().toInstant(), ZoneOffset.UTC)
                    : epochOf(file);
            Headers h = new Headers(
                    clean(msg.getMessageID()),
                    clean(header(msg, "In-Reply-To")),
                    refs(header(msg, "References")),
                    msg.getSubject() == null ? "" : msg.getSubject(),
                    from[0], from[1],
                    joinAddr(msg.getRecipients(jakarta.mail.Message.RecipientType.TO)),
                    date);
            return new Parsed(
                    h,
                    joinAddr(msg.getRecipients(jakarta.mail.Message.RecipientType.CC)),
                    joinAddr(msg.getReplyTo()),
                    acc.html.isEmpty() ? null : acc.html.toString(),
                    acc.text.isEmpty() ? null : acc.text.toString(),
                    acc.attachments);
        } catch (Exception e) {
            LOG.warnf("MIME parse failed for %s: %s", file, e.getMessage());
            return new Parsed(headers(file), "", "", null, "(could not decode message)", List.of());
        }
    }

    /** Extract the raw bytes of the Nth attachment (in walk order). */
    public byte[] attachmentBytes(Path file, int index) {
        try (InputStream in = Files.newInputStream(file)) {
            MimeMessage msg = new MimeMessage(SESSION, in);
            int[] counter = {0};
            return findAttachment(msg, index, counter);
        } catch (Exception e) {
            LOG.warnf("attachment extract failed for %s[%d]: %s", file, index, e.getMessage());
            return null;
        }
    }

    private byte[] findAttachment(Part part, int target, int[] counter) throws Exception {
        Object content;
        try { content = part.getContent(); } catch (Exception e) { content = null; }
        if (content instanceof Multipart mp) {
            for (int i = 0; i < mp.getCount(); i++) {
                byte[] r = findAttachment(mp.getBodyPart(i), target, counter);
                if (r != null) return r;
            }
            return null;
        }
        if (isAttachment(part)) {
            if (counter[0] == target) {
                return part.getInputStream().readAllBytes();
            }
            counter[0]++;
        }
        return null;
    }

    // --- Body walk ---------------------------------------------------------

    private static final class Acc {
        final StringBuilder html = new StringBuilder();
        final StringBuilder text = new StringBuilder();
        final List<Attachment> attachments = new ArrayList<>();
        int attIndex = 0;
    }

    private void walk(Part part, Acc acc) throws Exception {
        Object content;
        try {
            content = part.getContent();
        } catch (Exception e) {
            content = null;
        }

        if (content instanceof Multipart mp) {
            for (int i = 0; i < mp.getCount(); i++) {
                walk(mp.getBodyPart(i), acc);
            }
            return;
        }

        if (isAttachment(part)) {
            String cid = clean(header(part, "Content-ID"));
            boolean inline = INLINE.equalsIgnoreCase(part.getDisposition()) || cid != null;
            acc.attachments.add(new Attachment(
                    acc.attIndex++,
                    decode(part.getFileName()),
                    baseType(part.getContentType()),
                    Math.max(0, part.getSize()),
                    inline,
                    cid));
            return;
        }

        if (part.isMimeType("text/html") && content instanceof String s) {
            acc.html.append(s);
        } else if (part.isMimeType("text/plain") && content instanceof String s) {
            acc.text.append(s);
        }
    }

    private boolean isAttachment(Part part) throws Exception {
        String disp = part.getDisposition();
        if (Part.ATTACHMENT.equalsIgnoreCase(disp)) return true;
        if (part.getFileName() != null && !part.getFileName().isBlank()) return true;
        // Inline image referenced by Content-ID from the HTML body.
        if (INLINE.equalsIgnoreCase(disp) && part.getContentType() != null
                && part.getContentType().toLowerCase().startsWith("image/")) {
            return true;
        }
        return false;
    }

    // --- Helpers -----------------------------------------------------------

    private static String firstHeader(InternetHeaders ih, String name) {
        String[] v = ih.getHeader(name);
        return v != null && v.length > 0 ? v[0] : null;
    }

    private static String header(Part p, String name) {
        try {
            String[] v = p.getHeader(name);
            return v != null && v.length > 0 ? v[0] : null;
        } catch (Exception e) {
            return null;
        }
    }

    private static String decode(String raw) {
        if (raw == null) return null;
        try {
            return MimeUtility.decodeText(raw);
        } catch (Exception e) {
            return raw;
        }
    }

    private static String clean(String s) {
        if (s == null) return null;
        s = s.trim();
        return s.isEmpty() ? null : s;
    }

    private static List<String> refs(String header) {
        if (header == null || header.isBlank()) return List.of();
        List<String> out = new ArrayList<>();
        for (String tok : header.split("\\s+")) {
            String t = tok.trim();
            if (!t.isEmpty()) out.add(t);
        }
        return out;
    }

    /** Returns [address, displayName] from a From header. */
    private static String[] splitAddress(String raw) {
        if (raw == null) return new String[]{"", null};
        try {
            InternetAddress[] a = InternetAddress.parse(raw);
            if (a.length > 0) {
                return new String[]{a[0].getAddress(), decode(a[0].getPersonal())};
            }
        } catch (Exception ignored) { /* fall through */ }
        return new String[]{raw.trim(), null};
    }

    private static String firstAddress(String raw) {
        if (raw == null) return "";
        try {
            InternetAddress[] a = InternetAddress.parse(raw);
            if (a.length > 0) return a[0].getAddress();
        } catch (Exception ignored) { /* fall through */ }
        return raw.trim();
    }

    private static String[] addr(Address[] addrs) {
        if (addrs == null || addrs.length == 0) return new String[]{"", null};
        if (addrs[0] instanceof InternetAddress ia) {
            return new String[]{ia.getAddress(), decode(ia.getPersonal())};
        }
        return new String[]{addrs[0].toString(), null};
    }

    private static String joinAddr(Address[] addrs) {
        if (addrs == null || addrs.length == 0) return "";
        List<String> parts = new ArrayList<>();
        for (Address a : addrs) {
            if (a instanceof InternetAddress ia) parts.add(ia.getAddress());
            else parts.add(a.toString());
        }
        return String.join(", ", parts);
    }

    private static String baseType(String contentType) {
        if (contentType == null) return "application/octet-stream";
        int semi = contentType.indexOf(';');
        return (semi > 0 ? contentType.substring(0, semi) : contentType).trim().toLowerCase();
    }

    private static OffsetDateTime parseDate(String raw, Path file) {
        if (raw == null) return epochOf(file);
        try {
            jakarta.mail.internet.MailDateFormat f = new jakarta.mail.internet.MailDateFormat();
            return OffsetDateTime.ofInstant(f.parse(raw.trim()).toInstant(), ZoneOffset.UTC);
        } catch (Exception e) {
            return epochOf(file);
        }
    }

    private static OffsetDateTime epochOf(Path file) {
        // Maildir filenames begin with the delivery epoch seconds.
        try {
            String name = file.getFileName().toString();
            int dot = name.indexOf('.');
            long secs = Long.parseLong(dot > 0 ? name.substring(0, dot) : name);
            return java.time.Instant.ofEpochSecond(secs).atOffset(ZoneOffset.UTC);
        } catch (Exception e) {
            try {
                return OffsetDateTime.ofInstant(
                        Files.getLastModifiedTime(file).toInstant(), ZoneOffset.UTC);
            } catch (Exception e2) {
                return OffsetDateTime.now(ZoneOffset.UTC);
            }
        }
    }
}
