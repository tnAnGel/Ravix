package sh.ravix.platform;

import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;
import jakarta.mail.Flags;
import jakarta.mail.Folder;
import jakarta.mail.Message;
import jakarta.mail.Session;
import jakarta.mail.Store;
import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.Properties;
import org.jboss.logging.Logger;
import sh.ravix.entity.AppSetting;
import sh.ravix.entity.Domain;
import sh.ravix.entity.InboxSeed;
import sh.ravix.entity.InboxTest;
import sh.ravix.util.Ids;

/**
 * Inbox-placement testing in two layers:
 *
 *  1. Self-score (always, instant): scores the domain's own deliverability
 *     posture from data we already have — SPF/DKIM/DMARC presence + alignment,
 *     PTR forward-confirm, RBL listings, DMARC policy strictness, and content
 *     heuristics. No external service, no credentials. Returns 0–10 + findings.
 *
 *  2. Seed placement (optional): if the operator registered seed mailboxes
 *     (their own Gmail/Yandex/… with an app password), we deliver a uniquely
 *     tagged probe to each, wait, then read each over IMAP and report whether
 *     it landed in Inbox or the Spam/Junk folder.
 */
@ApplicationScoped
public class InboxPlacementService {

    private static final Logger LOG = Logger.getLogger(InboxPlacementService.class);
    private static final ObjectMapper JSON = new ObjectMapper();

    @Inject DnsService dns;
    @Inject DomainChecker checker;
    @Inject RblService rbl;
    @Inject MailComposer composer;
    @Inject PlatformService platform;

    public record Finding(String key, String label, String status, int points, int max, String detail) {}

    public record SeedResult(String label, String email, String placement, String detail) {}

    public record Result(
            String id, String domain, String fromAddr,
            int score, String grade, String summary,
            List<Finding> findings, List<SeedResult> seeds,
            String probeTag, boolean seedsPending, String createdAt) {}

    // --- Run ---------------------------------------------------------------

    @jakarta.transaction.Transactional
    public Result run(boolean useSeeds) {
        Domain d = Domain.<Domain>find("order by createdAt asc").firstResult();
        String mailHost = mailHostname();
        String fromAddr = d != null ? "postmaster@" + d.name : "postmaster@" + mailHost;

        List<Finding> findings = new ArrayList<>();
        int score = 0, max = 0;

        // Re-check DNS so the verdict is current.
        if (d != null) checker.recheck(d, mailHost);

        // --- auth: SPF / DKIM / DMARC ---
        max += 3;
        score += authFindings(d, findings);

        // --- PTR forward-confirm (2) ---
        max += 2;
        score += ptrFinding(mailHost, findings);

        // --- RBL (2) ---
        max += 2;
        score += rblFinding(findings);

        // --- DMARC policy strictness (1) ---
        max += 1;
        score += dmarcPolicyFinding(d, findings);

        // --- MTA-STS present (1) ---
        max += 1;
        score += mtaStsFinding(mailHost, findings);

        // --- TLS cert for mail host (1) ---
        max += 1;
        score += tlsFinding(mailHost, findings);

        int score10 = (int) Math.round(10.0 * score / Math.max(1, max));
        String grade = score10 >= 9 ? "excellent" : score10 >= 7 ? "good" : score10 >= 5 ? "fair" : "poor";
        String summary = switch (grade) {
            case "excellent" -> "Your domain is configured for strong inbox placement.";
            case "good" -> "Good posture — a couple of items would push you to excellent.";
            case "fair" -> "Deliverability gaps that may land you in spam at strict receivers.";
            default -> "Serious configuration gaps — mail will likely be filtered.";
        };

        // --- optional seed placement: fire the probes now, read them later ---
        List<SeedResult> seeds = new ArrayList<>();
        String probeTag = "";
        boolean pending = false;
        long enabledSeeds = InboxSeed.count("enabled", true);
        if (useSeeds && enabledSeeds > 0) {
            probeTag = sendProbes(fromAddr);
            pending = true;
        }

        InboxTest row = new InboxTest();
        row.id = Ids.generate("ibx");
        row.domain = d != null ? d.name : null;
        row.fromAddr = fromAddr;
        row.score = score10;
        row.grade = grade;
        row.summary = summary;
        row.reportJson = toJson(findings);
        // Stash the probe tag in the seed_json slot until the read pass runs.
        row.seedJson = pending ? "{\"tag\":\"" + probeTag + "\"}" : "[]";
        row.createdAt = OffsetDateTime.now();
        row.persist();

        return new Result(row.id, row.domain, fromAddr, score10, grade, summary,
                findings, seeds, probeTag, pending, row.createdAt.toString());
    }

    /** Read the seed mailboxes over IMAP for the latest test's probe and store
     *  the per-seed placement. Called after the operator waits ~30–60s. */
    @jakarta.transaction.Transactional
    public Result checkSeeds() {
        InboxTest row = InboxTest.<InboxTest>find("order by createdAt desc").firstResult();
        if (row == null) return null;
        String tag = extractTag(row.seedJson);
        if (tag != null) {
            String subject = "Ravix deliverability probe " + tag;
            List<SeedResult> seeds = new ArrayList<>();
            for (InboxSeed s : InboxSeed.<InboxSeed>list("enabled", true)) {
                try {
                    seeds.add(checkSeed(s, subject));
                } catch (Exception e) {
                    seeds.add(new SeedResult(s.label, s.email, "error", "IMAP check failed: " + e.getMessage()));
                }
            }
            row.seedJson = toJson(seeds);
        }
        return toResult(row);
    }

    public Result latest() {
        InboxTest row = InboxTest.<InboxTest>find("order by createdAt desc").firstResult();
        return row == null ? null : toResult(row);
    }

    private Result toResult(InboxTest row) {
        String tag = extractTag(row.seedJson);
        boolean pending = tag != null;
        List<SeedResult> seeds = pending ? List.of() : fromJson(row.seedJson, SeedResult.class);
        return new Result(row.id, row.domain, row.fromAddr, row.score, row.grade, row.summary,
                fromJson(row.reportJson, Finding.class), seeds,
                tag == null ? "" : tag, pending, row.createdAt.toString());
    }

    /** If seed_json holds a pending probe tag ({"tag":"…"}) return it, else null. */
    private String extractTag(String seedJson) {
        if (seedJson == null || !seedJson.contains("\"tag\"")) return null;
        var m = java.util.regex.Pattern.compile("\"tag\":\"([^\"]+)\"").matcher(seedJson);
        return m.find() ? m.group(1) : null;
    }

    // --- Individual scored checks -----------------------------------------

    private int authFindings(Domain d, List<Finding> out) {
        int pts = 0;
        boolean spf = d != null && "pass".equals(d.checkSpf);
        boolean dkim = d != null && "pass".equals(d.checkDkim);
        boolean dmarc = d != null && "pass".equals(d.checkDmarc);
        if (spf) pts++;
        if (dkim) pts++;
        if (dmarc) pts++;
        out.add(new Finding("spf", "auth", "SPF", spf ? 1 : 0, 1,
                spf ? "SPF published and valid." : "SPF missing/invalid — many receivers will distrust your mail."));
        out.add(new Finding("dkim", "auth", "DKIM", dkim ? 1 : 0, 1,
                dkim ? "DKIM published and matches the signing key." : "DKIM missing — Gmail/Outlook will flag this."));
        out.add(new Finding("dmarc", "auth", "DMARC", dmarc ? 1 : 0, 1,
                dmarc ? "DMARC policy published." : "DMARC missing — publish at least p=none."));
        return pts;
    }

    private int ptrFinding(String mailHost, List<Finding> out) {
        List<String> a = dns.a(mailHost);
        if (a.isEmpty()) {
            out.add(new Finding("ptr", "dns", "Reverse DNS", 0, 2,
                    mailHost + " has no A record, so PTR can't forward-confirm."));
            return 0;
        }
        String ip = a.get(0);
        List<String> ptr = dns.ptr(ip);
        if (ptr.isEmpty()) {
            out.add(new Finding("ptr", "dns", "Reverse DNS", 0, 2,
                    "No PTR for " + ip + " — Gmail/Outlook reject IPs with no reverse DNS."));
            return 0;
        }
        boolean ok = ptr.get(0).replaceAll("\\.$", "").equalsIgnoreCase(mailHost);
        out.add(new Finding("ptr", "dns", "Reverse DNS (forward-confirm)", ok ? 2 : 1, 2,
                ok ? "PTR " + ip + " → " + mailHost + " ✓" :
                     "PTR exists but doesn't match " + mailHost + " — partial credit."));
        return ok ? 2 : 1;
    }

    private int rblFinding(List<Finding> out) {
        List<String> ips = rbl.monitoredIps();
        if (ips.isEmpty()) {
            out.add(new Finding("rbl", "reputation", "Blacklists", 1, 2,
                    "No sending IP detected to check — assuming clean."));
            return 1;
        }
        int listed = 0;
        for (String ip : ips) {
            RblService.IpResult r = rbl.checkIp(ip, false);
            listed += r.listedCount();
        }
        boolean clean = listed == 0;
        out.add(new Finding("rbl", "reputation", "Blacklists (RBL)", clean ? 2 : 0, 2,
                clean ? "Not listed on any monitored blacklist." :
                        listed + " blacklist listing(s) — this severely hurts placement. See the RBL page."));
        return clean ? 2 : 0;
    }

    private int dmarcPolicyFinding(Domain d, List<Finding> out) {
        if (d == null) { out.add(new Finding("dmarc-policy", "auth", "DMARC policy", 0, 1, "No domain.")); return 0; }
        String rec = dns.txt("_dmarc." + d.name).stream()
                .filter(v -> v.toLowerCase().startsWith("v=dmarc1")).findFirst().orElse("");
        boolean enforced = rec.toLowerCase().contains("p=quarantine") || rec.toLowerCase().contains("p=reject");
        out.add(new Finding("dmarc-policy", "auth", "DMARC enforcement", enforced ? 1 : 0, 1,
                enforced ? "DMARC is enforced (quarantine/reject)." :
                        "DMARC is p=none. Fine for warm-up; tighten to quarantine once aggregate reports are clean."));
        return enforced ? 1 : 0;
    }

    private int mtaStsFinding(String mailHost, List<Finding> out) {
        boolean sts = dns.txt("_mta-sts." + mailHost).stream()
                .anyMatch(v -> v.toLowerCase().startsWith("v=stsv1"));
        out.add(new Finding("mta-sts", "tls", "MTA-STS", sts ? 1 : 0, 1,
                sts ? "MTA-STS policy published." : "MTA-STS not published (optional but improves trust)."));
        return sts ? 1 : 0;
    }

    private int tlsFinding(String mailHost, List<Finding> out) {
        boolean cert = platform.fileExists("/etc/letsencrypt/live/" + mailHost + "/fullchain.pem");
        out.add(new Finding("tls", "tls", "TLS certificate", cert ? 1 : 0, 1,
                cert ? "Trusted TLS cert for the mail host." :
                        "No trusted cert for " + mailHost + " — STARTTLS uses a self-signed cert."));
        return cert ? 1 : 0;
    }

    // --- Seed placement over IMAP -----------------------------------------

    /** Send a uniquely-tagged probe to every enabled seed. Returns the tag. */
    private String sendProbes(String fromAddr) {
        String tag = "RAVIX-PROBE-" + java.util.UUID.randomUUID().toString().substring(0, 12);
        String subject = "Ravix deliverability probe " + tag;
        for (InboxSeed s : InboxSeed.<InboxSeed>list("enabled", true)) {
            var draft = new MailComposer.Draft(
                    fromAddr, "Ravix Deliverability",
                    s.email, null, null,
                    subject,
                    "<p>This is an automated inbox-placement probe.</p><p>Tag: " + tag + "</p>",
                    "Inbox-placement probe. Tag: " + tag,
                    null, List.of(), List.of());
            composer.send(draft);
        }
        return tag;
    }

    private SeedResult checkSeed(InboxSeed s, String subject) throws Exception {
        Properties props = new Properties();
        props.put("mail.store.protocol", "imaps");
        props.put("mail.imaps.host", s.imapHost);
        props.put("mail.imaps.port", String.valueOf(s.imapPort));
        props.put("mail.imaps.ssl.enable", "true");
        props.put("mail.imaps.connectiontimeout", "10000");
        props.put("mail.imaps.timeout", "15000");
        Session session = Session.getInstance(props);

        try (Store store = session.getStore("imaps")) {
            store.connect(s.imapHost, s.imapPort, s.imapUser, s.imapPass);

            // Check Inbox first, then the spam/junk folders.
            if (foundIn(store, "INBOX", subject)) {
                return new SeedResult(s.label, s.email, "inbox", "Delivered to Inbox ✓");
            }
            for (String junk : new String[]{"[Gmail]/Spam", "Spam", "Junk", "Junk E-mail", "Bulk Mail"}) {
                if (foundIn(store, junk, subject)) {
                    return new SeedResult(s.label, s.email, "spam", "Landed in " + junk + " — being filtered.");
                }
            }
            return new SeedResult(s.label, s.email, "missing",
                    "Not found yet — may still be in transit, greylisted, or rejected.");
        }
    }

    private boolean foundIn(Store store, String folderName, String subject) {
        try {
            Folder f = store.getFolder(folderName);
            if (f == null || !f.exists()) return false;
            f.open(Folder.READ_ONLY);
            try {
                Message[] msgs = f.search(new jakarta.mail.search.SubjectTerm(subject));
                // SubjectTerm is a substring match — verify the tag is present.
                for (Message m : msgs) {
                    String subj = m.getSubject();
                    if (subj != null && subj.contains(subject)) {
                        return !m.isSet(Flags.Flag.DELETED);
                    }
                }
                return false;
            } finally {
                f.close(false);
            }
        } catch (Exception e) {
            LOG.debugf("folder %s check failed: %s", folderName, e.getMessage());
            return false;
        }
    }

    // --- helpers -----------------------------------------------------------

    private String toJson(Object o) {
        try { return JSON.writeValueAsString(o); } catch (Exception e) { return "[]"; }
    }

    @SuppressWarnings("unchecked")
    private <T> List<T> fromJson(String s, Class<T> type) {
        try {
            return (List<T>) JSON.readValue(s,
                    JSON.getTypeFactory().constructCollectionType(List.class, type));
        } catch (Exception e) {
            return List.of();
        }
    }

    private String mailHostname() {
        AppSetting h = AppSetting.findById("hostname");
        return h != null && h.value != null && !h.value.isBlank() ? h.value : platform.hostname();
    }
}
