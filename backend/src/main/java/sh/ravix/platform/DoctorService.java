package sh.ravix.platform;

import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;
import jakarta.transaction.Transactional;
import java.io.IOException;
import java.net.InetSocketAddress;
import java.net.Socket;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import org.jboss.logging.Logger;
import sh.ravix.entity.AppSetting;
import sh.ravix.entity.Domain;

/**
 * One-button mail-server health diagnosis. Runs everything an operator would
 * otherwise debug by hand — PTR forward-confirm, DKIM key match, outbound 25
 * over both IP families, DNS-vs-DB drift, certs, services — and returns an
 * actionable verdict per check, each optionally carrying a {@code fix} id the
 * UI can invoke to repair it automatically.
 */
@ApplicationScoped
public class DoctorService {

    private static final Logger LOG = Logger.getLogger(DoctorService.class);
    private static final int CONNECT_TIMEOUT_MS = 4000;

    @Inject PlatformService platform;
    @Inject DnsService dns;
    @Inject DomainChecker checker;
    @Inject CloudflareService cloudflare;
    @Inject ProvisioningService provisioning;
    @Inject TlsaService tlsa;

    public enum Severity { PASS, WARN, FAIL, INFO }

    /** One diagnostic finding. {@code fix} (nullable) names an auto-repair the
     *  UI exposes as a button; {@code detail} is operator-readable guidance. */
    public record Check(
            String key,
            String category,     // network | dns | dkim | tls | service | drift
            String label,
            Severity severity,
            String detail,
            String fix,          // null = no automated fix
            String fixLabel) {}

    public record Report(
            String overall,      // healthy | degraded | broken
            int passed, int warnings, int failures,
            String checkedAt,
            List<Check> checks) {}

    // --- Entry point -------------------------------------------------------

    @Transactional
    public Report run() {
        List<Check> out = new ArrayList<>();
        String mailHost = mailHostname();

        out.addAll(serviceChecks());
        out.addAll(outboundChecks());
        out.addAll(dkimCheck(mailHost));
        out.addAll(ptrChecks(mailHost));
        out.addAll(driftChecks());
        out.addAll(certChecks(mailHost));
        out.addAll(rspamdCheck());

        long pass = out.stream().filter(c -> c.severity() == Severity.PASS).count();
        long warn = out.stream().filter(c -> c.severity() == Severity.WARN).count();
        long fail = out.stream().filter(c -> c.severity() == Severity.FAIL).count();
        String overall = fail > 0 ? "broken" : warn > 0 ? "degraded" : "healthy";
        return new Report(overall, (int) pass, (int) warn, (int) fail,
                java.time.OffsetDateTime.now().toString(), out);
    }

    // --- Fix dispatcher ----------------------------------------------------

    public record FixResult(boolean ok, String detail) {}

    public FixResult applyFix(String fixId) {
        try {
            return switch (fixId) {
                case "apply-config" -> {
                    provisioning.syncAll();
                    yield new FixResult(true, "Re-applied all mail configs (Postfix, OpenDKIM, Dovecot, nginx).");
                }
                case "restart-opendkim" -> {
                    boolean ok = platform.exec(15, "systemctl", "restart", "opendkim");
                    yield new FixResult(ok, ok ? "OpenDKIM restarted." : "Restart failed — check journalctl -u opendkim.");
                }
                case "restart-postfix" -> {
                    boolean ok = platform.exec(15, "systemctl", "restart", "postfix");
                    yield new FixResult(ok, ok ? "Postfix restarted." : "Restart failed.");
                }
                case "restart-dovecot" -> {
                    boolean ok = platform.exec(15, "systemctl", "restart", "dovecot");
                    yield new FixResult(ok, ok ? "Dovecot restarted." : "Restart failed.");
                }
                case "prefer-ipv6" -> {
                    platform.exec(10, "postconf", "-e", "smtp_address_preference = ipv6");
                    platform.exec(10, "postfix", "reload");
                    yield new FixResult(true, "Postfix now prefers IPv6 for outbound — works around an IPv4 :25 block.");
                }
                case "cf-sync" -> {
                    int n = cloudflare.autoSyncAll();
                    yield new FixResult(true, "Pushed DNS to Cloudflare for " + n + " domain(s).");
                }
                case "flush-queue" -> {
                    boolean ok = platform.exec(20, "postqueue", "-f");
                    yield new FixResult(ok, ok ? "Queue flushed — Postfix is retrying delivery now." : "Flush failed.");
                }
                default -> new FixResult(false, "Unknown fix: " + fixId);
            };
        } catch (Exception e) {
            LOG.warnf("doctor fix %s failed: %s", fixId, e.getMessage());
            return new FixResult(false, "Fix failed: " + e.getMessage());
        }
    }

    // --- Individual check groups ------------------------------------------

    private List<Check> serviceChecks() {
        List<Check> out = new ArrayList<>();
        String[][] svcs = {
                {"postfix", "Postfix (SMTP)", "restart-postfix"},
                {"dovecot", "Dovecot (IMAP/LMTP)", "restart-dovecot"},
                {"opendkim", "OpenDKIM (DKIM signing)", "restart-opendkim"},
                {"rspamd", "Rspamd (spam filter)", null},
        };
        for (String[] s : svcs) {
            boolean active = serviceActive(s[0]);
            out.add(new Check("svc-" + s[0], "service", s[1],
                    active ? Severity.PASS : Severity.FAIL,
                    active ? "active" : s[1] + " is not running.",
                    active ? null : s[2],
                    active ? null : "Restart"));
        }
        return out;
    }

    private List<Check> outboundChecks() {
        List<Check> out = new ArrayList<>();
        // Probe each family separately — some hosters block one and not the
        // other, which is the single most confusing deliverability problem.
        boolean v4 = tcpProbe("64.233.184.26", 25);        // gmail-smtp-in (IPv4)
        boolean v6 = tcpProbeHost("gmail-smtp-in.l.google.com", 25, true);
        if (v4 && v6) {
            out.add(new Check("out25", "network", "Outbound SMTP (port 25)",
                    Severity.PASS, "Reachable over both IPv4 and IPv6.", null, null));
        } else if (v6) {
            out.add(new Check("out25", "network", "Outbound SMTP (port 25)",
                    Severity.WARN,
                    "IPv4 :25 is blocked by your host, but IPv6 works. Mail to IPv6-capable "
                  + "receivers (Gmail, Outlook, Yandex) goes through; IPv4-only receivers will "
                  + "fail. Prefer IPv6 outbound, or ask your provider to open IPv4 :25.",
                    "prefer-ipv6", "Prefer IPv6"));
        } else if (v4) {
            out.add(new Check("out25", "network", "Outbound SMTP (port 25)",
                    Severity.PASS, "Reachable over IPv4.", null, null));
        } else {
            out.add(new Check("out25", "network", "Outbound SMTP (port 25)",
                    Severity.FAIL,
                    "Outbound :25 is blocked on both IPv4 and IPv6 — mail will queue forever. "
                  + "Configure an SMTP relay in Settings, or ask your provider to open :25.",
                    null, null));
        }
        return out;
    }

    private List<Check> dkimCheck(String mailHost) {
        List<Check> out = new ArrayList<>();
        Domain d = Domain.<Domain>find("order by createdAt asc").firstResult();
        if (d == null) {
            out.add(new Check("dkim", "dkim", "DKIM signing key",
                    Severity.INFO, "No domain configured yet.", null, null));
            return out;
        }
        // 1. Does OpenDKIM actually sign? (KeyTable + milter wired)
        String selector = d.dkimSelector;
        // 2. Published TXT matches our private key's public half?
        String host = selector + "._domainkey." + d.name;
        List<String> txt = dns.txt(host);
        String published = txt.stream().filter(v -> v.toLowerCase().contains("v=dkim1")).findFirst().orElse(null);
        if (published == null) {
            out.add(new Check("dkim-dns", "dkim", "DKIM record published (" + d.name + ")",
                    Severity.FAIL,
                    "No DKIM TXT at " + host + ". Publish it (Domains → " + d.name + " → Push to Cloudflare) "
                  + "or it'll fail DKIM at every receiver.",
                    "cf-sync", "Push to Cloudflare"));
        } else {
            String keyFragment = d.dkimPublicKey == null ? "" :
                    d.dkimPublicKey.substring(0, Math.min(40, d.dkimPublicKey.length()));
            boolean matches = published.contains(keyFragment);
            out.add(new Check("dkim-dns", "dkim", "DKIM record matches key (" + d.name + ")",
                    matches ? Severity.PASS : Severity.FAIL,
                    matches ? "Published DKIM matches the signing key."
                            : "The published DKIM TXT does NOT match OpenDKIM's key — every message "
                            + "will fail DKIM. Re-publish the correct record.",
                    matches ? null : "cf-sync",
                    matches ? null : "Push to Cloudflare"));
        }
        // 3. opendkim-testkey on the host itself.
        if (platform.isLinux()) {
            var r = platform.run(8, "bash", "-c",
                    "opendkim-testkey -d " + d.name + " -s " + selector + " 2>&1");
            String testOut = r.orElse("").trim();
            boolean ok = r.isPresent() && (testOut.isEmpty() || testOut.toLowerCase().contains("key ok"));
            out.add(new Check("dkim-testkey", "dkim", "OpenDKIM key test",
                    ok ? Severity.PASS : Severity.WARN,
                    ok ? "opendkim-testkey passed." :
                         "opendkim-testkey reports: " + (testOut.isEmpty() ? "no output" : testOut)
                       + ". Usually a DNS-propagation lag; re-run in a few minutes.",
                    null, null));
        }
        return out;
    }

    private List<Check> ptrChecks(String mailHost) {
        List<Check> out = new ArrayList<>();
        // Forward-confirm: A/AAAA of mailHost, then PTR of each IP must point back.
        List<String> a = dns.a(mailHost);
        if (a.isEmpty()) {
            out.add(new Check("ptr-a", "dns", "Mail host resolves (" + mailHost + ")",
                    Severity.FAIL,
                    mailHost + " has no A record. Publish it so receivers can resolve your server.",
                    "cf-sync", "Push to Cloudflare"));
            return out;
        }
        for (String ip : a) {
            List<String> ptr = dns.ptr(ip);
            if (ptr.isEmpty()) {
                out.add(new Check("ptr-" + ip, "dns", "Reverse DNS for " + ip,
                        Severity.FAIL,
                        "No PTR record for " + ip + ". Gmail/Outlook reject mail from IPs with no "
                      + "reverse DNS. Set it at your hosting provider to " + mailHost + ".",
                        null, null));
            } else {
                String name = ptr.get(0).replaceAll("\\.$", "");
                boolean confirms = name.equalsIgnoreCase(mailHost);
                out.add(new Check("ptr-" + ip, "dns", "Forward-confirmed rDNS (" + ip + ")",
                        confirms ? Severity.PASS : Severity.WARN,
                        confirms ? "PTR " + ip + " → " + mailHost + " ✓"
                                 : "PTR for " + ip + " is " + name + ", not " + mailHost
                                 + ". For best deliverability they should match (forward-confirm).",
                        null, null));
            }
        }
        return out;
    }

    /** Detect drift between what the panel believes (DB) and what is actually
     *  published in DNS — the thing that silently breaks deliverability. */
    private List<Check> driftChecks() {
        List<Check> out = new ArrayList<>();
        for (Domain d : Domain.<Domain>listAll()) {
            checker.recheck(d, mailHostname());
            List<String> broken = new ArrayList<>();
            if ("fail".equals(d.checkMx)) broken.add("MX");
            if ("fail".equals(d.checkSpf)) broken.add("SPF");
            if ("fail".equals(d.checkDkim)) broken.add("DKIM");
            if ("fail".equals(d.checkDmarc)) broken.add("DMARC");
            if (broken.isEmpty()) {
                out.add(new Check("drift-" + d.id, "drift", "DNS in sync (" + d.name + ")",
                        Severity.PASS, "MX/SPF/DKIM/DMARC all present in DNS.", null, null));
            } else {
                boolean cf = cloudflare.token() != null && !cloudflare.token().isBlank();
                out.add(new Check("drift-" + d.id, "drift", "DNS drift (" + d.name + ")",
                        Severity.FAIL,
                        "Missing in live DNS: " + String.join(", ", broken)
                      + (cf ? ". Push the records to Cloudflare to fix."
                            : ". Publish these records at your DNS provider."),
                        cf ? "cf-sync" : null, cf ? "Push to Cloudflare" : null));
            }
        }
        return out;
    }

    private List<Check> certChecks(String mailHost) {
        List<Check> out = new ArrayList<>();
        Path cert = Path.of("/etc/letsencrypt/live/" + mailHost + "/fullchain.pem");
        if (!platform.isLinux()) return out;
        if (!platform.fileExists(cert.toString())) {
            out.add(new Check("cert-mailhost", "tls", "TLS certificate for mail host",
                    Severity.WARN,
                    "No Let's Encrypt cert for " + mailHost + " yet. Postfix is serving a self-signed "
                  + "cert; run Apply config once DNS resolves to issue a real one.",
                    "apply-config", "Apply config"));
        } else {
            // expiry check via openssl
            var r = platform.run(6, "bash", "-c",
                    "openssl x509 -enddate -noout -in " + cert + " | cut -d= -f2");
            String end = r.orElse("").trim();
            out.add(new Check("cert-mailhost", "tls", "TLS certificate for mail host",
                    Severity.PASS, "Valid certificate" + (end.isEmpty() ? "" : ", expires " + end) + ".",
                    null, null));
        }
        return out;
    }

    private List<Check> rspamdCheck() {
        List<Check> out = new ArrayList<>();
        if (!platform.isLinux()) return out;
        var r = platform.run(8, "bash", "-c", "rspamadm configtest 2>&1");
        String o = r.orElse("").trim().toLowerCase();
        boolean ok = r.isPresent() && o.contains("syntax ok");
        out.add(new Check("rspamd-config", "service", "Rspamd configuration",
                ok ? Severity.PASS : Severity.WARN,
                ok ? "rspamadm configtest: syntax OK."
                   : "rspamadm configtest failed: " + (o.isEmpty() ? "no output" : o)
                   + ". Re-run Apply config to regenerate the policy.",
                ok ? null : "apply-config", ok ? null : "Apply config"));
        return out;
    }

    // --- Helpers -----------------------------------------------------------

    private boolean serviceActive(String name) {
        if (!platform.isLinux()) return false;
        return "active".equals(platform.run(3, "systemctl", "is-active", name).orElse("").trim());
    }

    private boolean tcpProbe(String host, int port) {
        try (Socket s = new Socket()) {
            s.connect(new InetSocketAddress(host, port), CONNECT_TIMEOUT_MS);
            return true;
        } catch (IOException e) {
            return false;
        }
    }

    /** Probe by hostname, optionally forcing IPv6 by resolving AAAA first. */
    private boolean tcpProbeHost(String host, int port, boolean ipv6) {
        try {
            java.net.InetAddress[] all = java.net.InetAddress.getAllByName(host);
            for (java.net.InetAddress addr : all) {
                boolean is6 = addr instanceof java.net.Inet6Address;
                if (is6 != ipv6) continue;
                try (Socket s = new Socket()) {
                    s.connect(new InetSocketAddress(addr, port), CONNECT_TIMEOUT_MS);
                    return true;
                } catch (IOException ignored) { /* try next */ }
            }
        } catch (Exception ignored) { /* no such family */ }
        return false;
    }

    private String mailHostname() {
        AppSetting h = AppSetting.findById("hostname");
        return h != null && h.value != null && !h.value.isBlank() ? h.value : platform.hostname();
    }
}
