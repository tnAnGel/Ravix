package sh.ravix.platform;

import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;
import java.util.List;
import sh.ravix.entity.DnsRecord;
import sh.ravix.entity.Domain;

/** Generates expected DNS records and verifies them against live DNS. */
@ApplicationScoped
public class DomainChecker {

    @Inject
    DnsService dns;

    /** Build the set of expected records for a freshly added domain. */
    public void generateRecords(Domain d, String mailHostname) {
        d.records.clear();
        d.records.add(record(d, 0, "MX", "@", "10 " + mailHostname, 3600, 10));
        d.records.add(record(d, 1, "SPF", "@", "v=spf1 mx ~all", 3600, null));
        d.records.add(record(d, 2, "DKIM", d.dkimSelector + "._domainkey",
                DkimKeys.txtValue(d.dkimPublicKey), 3600, null));
        // p=none for warmup — matches what CloudflareService.plan publishes.
        // Operator can tighten to quarantine/reject later via the wizard; the
        // checker accepts both as valid below.
        d.records.add(record(d, 3, "DMARC", "_dmarc",
                "v=DMARC1; p=none; rua=mailto:dmarc@" + d.name + "; pct=100; aspf=r; adkim=r",
                3600, null));
        d.records.add(record(d, 4, "PTR", mailHostname, mailHostname, null, null));
        d.checkMx = "pending";
        d.checkSpf = "pending";
        d.checkDkim = "pending";
        d.checkDmarc = "pending";
    }

    /** Query live DNS and update each record's detected value + status. */
    public void recheck(Domain d, String mailHostname) {
        for (DnsRecord r : d.records) {
            switch (r.type) {
                case "MX" -> {
                    // Keep the displayed "expected" in sync with the current mail hostname.
                    r.expected = "10 " + mailHostname;
                    checkMx(d, r, mailHostname);
                }
                case "SPF" -> checkSpf(d, r);
                case "DKIM" -> checkDkim(d, r);
                case "DMARC" -> checkDmarc(d, r);
                case "PTR" -> {
                    r.host = mailHostname;
                    r.expected = mailHostname;
                    checkPtr(r, mailHostname);
                }
                default -> { /* unknown */ }
            }
        }
        recomputeStatus(d);
    }

    private void checkMx(Domain d, DnsRecord r, String mailHostname) {
        List<String> mx = dns.mx(d.name);
        if (mx.isEmpty()) {
            r.detected = null;
            r.status = "fail";
        } else {
            // dig returns "10 host." — JNDI returns the same shape.
            String first = mx.get(0).replaceAll("\\.$", "").trim();
            r.detected = first;
            // Accept the configured mail hostname OR the domain name itself,
            // since either is a reasonable MX target.
            String fl = first.toLowerCase();
            r.status = (fl.contains(mailHostname.toLowerCase())
                    || fl.contains(d.name.toLowerCase()))
                    ? "pass" : "warn";
        }
        d.checkMx = r.status;
    }

    private void checkSpf(Domain d, DnsRecord r) {
        String spf = dns.txt(d.name).stream()
                .filter(v -> v.toLowerCase().startsWith("v=spf1"))
                .findFirst().orElse(null);
        if (spf == null) {
            r.detected = null;
            r.status = "fail";
        } else {
            r.detected = spf;
            String low = spf.toLowerCase();
            r.status = (low.contains("-all") || low.contains("~all")) ? "pass" : "warn";
        }
        d.checkSpf = r.status;
    }

    private void checkDkim(Domain d, DnsRecord r) {
        String host = d.dkimSelector + "._domainkey." + d.name;
        String rec = dns.txt(host).stream()
                .filter(v -> v.toLowerCase().contains("v=dkim1"))
                .findFirst().orElse(null);
        if (rec == null) {
            r.detected = null;
            r.status = "fail";
        } else {
            r.detected = rec;
            r.status = rec.contains(d.dkimPublicKey.substring(0, Math.min(40, d.dkimPublicKey.length())))
                    ? "pass" : "warn";
        }
        d.checkDkim = r.status;
    }

    private void checkDmarc(Domain d, DnsRecord r) {
        String rec = dns.txt("_dmarc." + d.name).stream()
                .filter(v -> v.toLowerCase().startsWith("v=dmarc1"))
                .findFirst().orElse(null);
        if (rec == null) {
            r.detected = null;
            r.status = "fail";
        } else {
            r.detected = rec;
            String low = rec.toLowerCase();
            // Any published DMARC is a pass — p=none is the right starting
            // point during warmup, quarantine/reject is the long-term goal.
            // We don't warn on p=none because we ARE the ones publishing it.
            r.status = low.contains("p=") ? "pass" : "warn";
        }
        d.checkDmarc = r.status;
    }

    private void checkPtr(DnsRecord r, String mailHostname) {
        List<String> a = dns.a(mailHostname);
        if (a.isEmpty()) {
            r.detected = null;
            r.status = "warn";
            return;
        }
        String ip = a.get(0);
        r.host = ip;
        List<String> ptr = dns.ptr(ip);
        if (ptr.isEmpty()) {
            r.detected = null;
            r.status = "warn";
        } else {
            String name = ptr.get(0).replaceAll("\\.$", "");
            r.detected = name;
            r.status = name.equalsIgnoreCase(mailHostname) ? "pass" : "warn";
        }
    }

    private void recomputeStatus(Domain d) {
        String[] checks = {d.checkMx, d.checkSpf, d.checkDkim, d.checkDmarc, d.checkSsl};
        int fails = 0;
        int warns = 0;
        for (String c : checks) {
            if ("fail".equals(c)) fails++;
            else if ("warn".equals(c)) warns++;
        }
        if ("fail".equals(d.checkSsl) || fails >= 2) {
            d.status = "critical";
        } else if (fails > 0 || warns > 0) {
            d.status = "warning";
        } else {
            d.status = "healthy";
        }
    }

    private DnsRecord record(Domain d, int order, String type, String host,
                             String expected, Integer ttl, Integer priority) {
        DnsRecord r = new DnsRecord();
        r.domain = d;
        r.sortOrder = order;
        r.type = type;
        r.host = host;
        r.expected = expected;
        r.detected = null;
        r.status = "pending";
        r.ttl = ttl;
        r.priority = priority;
        return r;
    }
}
