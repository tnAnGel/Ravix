package sh.ravix.platform;

import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;
import jakarta.transaction.Transactional;
import java.io.IOException;
import java.net.InetSocketAddress;
import java.net.Socket;
import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.List;
import org.jboss.logging.Logger;
import sh.ravix.entity.AppSetting;
import sh.ravix.entity.Domain;

/**
 * "Can this server actually send mail?" — runs an end-to-end readiness probe
 * covering local services, outbound port 25 (the common ISP block), relay
 * config, virtual-domain configuration in Postfix, and the DNS records that
 * decide whether providers accept the mail.
 */
@ApplicationScoped
public class MailReadinessService {

    private static final Logger LOG = Logger.getLogger(MailReadinessService.class);
    private static final int CONNECT_TIMEOUT_MS = 4000;

    /** Hosts to probe for outbound port 25 reachability (real public MXs). */
    private static final String[] PORT25_TARGETS = {
            "gmail-smtp-in.l.google.com",
            "alt1.gmail-smtp-in.l.google.com",
            "outlook-com.olc.protection.outlook.com"
    };

    @Inject
    PlatformService platform;

    @Inject
    DnsService dns;

    public enum Status { PASS, WARN, FAIL, INFO }

    public record Check(String key, String label, Status status, String detail) {}

    public record Readiness(
            String overall,                // ready | degraded | blocked
            String summary,
            OffsetDateTime checkedAt,
            List<Check> checks,
            boolean port25Reachable,
            boolean relayConfigured,
            boolean canSendOutbound) {}

    /** Run the full readiness probe synchronously. */
    @Transactional
    public Readiness check() {
        List<Check> out = new ArrayList<>();

        // --- 1. Postfix running ---
        boolean postfixActive = serviceActive("postfix");
        out.add(new Check("postfix-running", "Postfix service",
                postfixActive ? Status.PASS : Status.FAIL,
                postfixActive ? "active" : "Postfix is not running — install/start from Platform → Software."));

        // --- 2. Outbound port 25 (ISP block check) ---
        String reachedVia = null;
        for (String host : PORT25_TARGETS) {
            if (tcpProbe(host, 25)) { reachedVia = host; break; }
        }
        boolean port25 = reachedVia != null;
        out.add(new Check("outbound-25", "Outbound SMTP (port 25)",
                port25 ? Status.PASS : Status.FAIL,
                port25 ? "Connected to " + reachedVia + ":25"
                       : "All probes to public MX servers on :25 timed out. Your hosting provider almost certainly blocks outbound 25 — configure an SMTP relay below, or ask the provider to open it."));

        // --- 3. Outbound port 587 (relay path) ---
        boolean port587 = tcpProbe("smtp.gmail.com", 587)
                || tcpProbe("smtp.mailgun.org", 587);
        out.add(new Check("outbound-587", "Outbound submission (port 587)",
                port587 ? Status.PASS : Status.WARN,
                port587 ? "Reachable — SMTP relay will work."
                        : "Port 587 also blocked — even a relay won't work without opening this."));

        // --- 4. Local listeners (SMTP / submission / IMAP) ---
        out.add(localListener(25,  "Local SMTP listener (25)"));
        out.add(localListener(587, "Local submission listener (587)"));
        out.add(localListener(465, "Local SMTPS listener (465)"));
        out.add(localListener(993, "Local IMAPS listener (993)"));

        // --- 5. Postfix knows our domain(s) ---
        out.add(domainsConfigured());

        // --- 6. Mail hostname matches a real DNS name ---
        out.add(hostnameSane());

        // --- 7. OpenDKIM ---
        boolean dkimActive = serviceActive("opendkim");
        out.add(new Check("opendkim", "DKIM signing (OpenDKIM)",
                dkimActive ? Status.PASS : Status.WARN,
                dkimActive ? "active" : "OpenDKIM not running. Install from Platform → Software, then run Apply config."));

        // --- 8. Relay configured? ---
        boolean relay = getSetting("relay_host") != null && !getSetting("relay_host").isBlank();
        out.add(new Check("relay", "Outbound SMTP relay",
                relay ? Status.PASS : (port25 ? Status.INFO : Status.WARN),
                relay
                    ? "Configured: relay via " + getSetting("relay_host")
                    : port25
                        ? "Not configured — sending directly from your IP (port 25 reachable)."
                        : "Not configured — and port 25 is blocked. Configure a relay in Settings → Outbound relay."));

        // --- Overall verdict ---
        boolean canSend = postfixActive && (port25 || relay);
        String overall;
        String summary;
        if (!postfixActive) {
            overall = "blocked";
            summary = "Postfix is not running — install the mail stack from Platform → Software.";
        } else if (canSend) {
            overall = out.stream().anyMatch(c -> c.status() == Status.FAIL || c.status() == Status.WARN)
                    ? "degraded" : "ready";
            summary = relay
                    ? "Outbound mail goes through your configured SMTP relay."
                    : "Outbound mail goes directly from this server.";
        } else {
            overall = "blocked";
            summary = "Outbound port 25 is blocked and no SMTP relay is configured — mail will queue forever.";
        }

        return new Readiness(overall, summary, OffsetDateTime.now(), out,
                port25, relay, canSend);
    }

    // --- Individual checks -------------------------------------------------

    private Check localListener(int port, String label) {
        boolean up = tcpProbe("127.0.0.1", port);
        return new Check("local-" + port, label,
                up ? Status.PASS : Status.WARN,
                up ? "Listening on 127.0.0.1:" + port
                   : "Not listening — install/configure the matching service.");
    }

    private Check domainsConfigured() {
        long count = Domain.count();
        if (count == 0) {
            return new Check("domains", "Mail domains configured", Status.WARN,
                    "No domains added in Ravix yet. Go to Mail → Domains.");
        }
        // Check whether Postfix's virtual_mailbox_maps file actually contains any rules.
        String mapsFile = "/etc/postfix/ravix/virtual_mailboxes";
        boolean populated = platform.fileExists(mapsFile)
                && platform.readFile(mapsFile).orElse("").lines()
                        .anyMatch(l -> !l.trim().isEmpty() && !l.startsWith("#"));
        return new Check("domains", "Mail domains applied to Postfix",
                populated ? Status.PASS : Status.WARN,
                populated
                    ? count + " domain(s) wired into Postfix"
                    : "Domains exist but virtual mailbox maps are empty — click 'Apply configuration' to write them.");
    }

    private Check hostnameSane() {
        String host = mailHostname();
        if (host == null || host.isBlank() || host.equals("localhost")) {
            return new Check("hostname", "Mail hostname configured", Status.FAIL,
                    "Mail hostname is unset or 'localhost'. Set it in Settings → General.");
        }
        // Must resolve and the A record should match this server.
        List<String> a = dns.a(host);
        if (a.isEmpty()) {
            return new Check("hostname", "Mail hostname resolves", Status.WARN,
                    host + " has no A record. Publish A " + host + " → <this server's IP>.");
        }
        return new Check("hostname", "Mail hostname (" + host + ")", Status.PASS,
                "Resolves to " + String.join(", ", a));
    }

    // --- Helpers -----------------------------------------------------------

    private boolean tcpProbe(String host, int port) {
        try (Socket s = new Socket()) {
            s.connect(new InetSocketAddress(host, port), CONNECT_TIMEOUT_MS);
            return true;
        } catch (IOException e) {
            return false;
        }
    }

    private boolean serviceActive(String name) {
        if (!platform.isLinux()) return false;
        return "active".equals(platform.run(3, "systemctl", "is-active", name).orElse("").trim());
    }

    private String mailHostname() {
        AppSetting h = AppSetting.findById("hostname");
        return h != null && h.value != null && !h.value.isBlank() ? h.value : platform.hostname();
    }

    private String getSetting(String key) {
        AppSetting s = AppSetting.findById(key);
        return s == null ? null : s.value;
    }
}
