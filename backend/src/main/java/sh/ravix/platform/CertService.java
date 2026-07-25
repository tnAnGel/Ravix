package sh.ravix.platform;

import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Optional;
import sh.ravix.dto.CertificateDto;

/** Reads installed Let's Encrypt certificates from /etc/letsencrypt/live via openssl. */
@ApplicationScoped
public class CertService {

    private static final String LIVE_DIR = "/etc/letsencrypt/live";
    private static final OffsetDateTime NOW = OffsetDateTime.now();

    @Inject
    PlatformService platform;

    @Inject
    ProvisioningService provisioning;

    /** Live certificates, or empty if Let's Encrypt isn't present (caller falls back to DB). */
    public Optional<List<CertificateDto>> live() {
        if (!platform.isLinux() || !platform.fileExists(LIVE_DIR)) {
            return Optional.empty();
        }
        Optional<String> ls = platform.run(5, "ls", "-1", LIVE_DIR);
        if (ls.isEmpty()) return Optional.empty();

        List<CertificateDto> out = new ArrayList<>();
        for (String dir : ls.get().split("\n")) {
            String domain = dir.trim();
            if (domain.isEmpty() || domain.startsWith("README")) continue;
            String certPath = LIVE_DIR + "/" + domain + "/cert.pem";
            Optional<String> info = platform.run(5, "openssl", "x509",
                    "-in", certPath, "-noout", "-issuer", "-startdate", "-enddate");
            if (info.isEmpty()) continue;
            out.add(parse(domain, info.get()));
        }
        return Optional.of(out);
    }

    private CertificateDto parse(String domain, String openssl) {
        String issuer = "Let's Encrypt";
        OffsetDateTime issued = NOW;
        OffsetDateTime expires = NOW.plusDays(90);
        for (String line : openssl.split("\n")) {
            String l = line.trim();
            if (l.startsWith("issuer=")) {
                issuer = extractCn(l.substring(7));
            } else if (l.startsWith("notBefore=")) {
                issued = parseDate(l.substring(10), issued);
            } else if (l.startsWith("notAfter=")) {
                expires = parseDate(l.substring(9), expires);
            }
        }
        long days = java.time.Duration.between(NOW, expires).toDays();
        String status = days < 0 ? "critical" : days <= 14 ? "warning" : "healthy";

        return new CertificateDto(
                "le_" + domain, domain, issuer, "lets-encrypt", status,
                issued, expires, true,
                new CertificateDto.LastRenewal(issued, "success", "Issued via ACME (certbot)"));
    }

    private static String extractCn(String dn) {
        for (String part : dn.split(",")) {
            String p = part.trim();
            if (p.startsWith("CN")) {
                int eq = p.indexOf('=');
                if (eq >= 0) return p.substring(eq + 1).trim();
            }
        }
        return dn.trim();
    }

    /**
     * Issue a Let's Encrypt certificate for {@code domain} via certbot --nginx.
     * MUST run in a background task, never on the request thread: certbot
     * reloads nginx mid-issuance, which would drop the in-flight (nginx-proxied)
     * HTTP response and the browser would see a generic "Load failed".
     */
    public boolean issue(String domain, String email, TaskService.LogSink sink) {
        if (!platform.isLinux()) {
            sink.append("Not on Linux — certbot is unavailable in this environment.");
            return false;
        }
        if (platform.run(3, "which", "certbot").isEmpty()) {
            sink.append("✗ certbot is not installed — install it from Platform → Software first.");
            return false;
        }
        // Serve the ACME HTTP-01 challenge from /var/www/html via the panel's
        // nginx vhost, then validate with --webroot. NOT --nginx: the panel
        // already has a high-priority `^~ /.well-known/acme-challenge/` location
        // (added for webroot), which overrides certbot --nginx's temporary one
        // and makes Let's Encrypt fetch the wrong content ("Error getting
        // validation data"). --webroot writes the token where that location
        // serves it, so validation succeeds and nginx is never reloaded.
        // Ensure the dedicated :80 ACME vhost + webroot exist (the panel itself
        // is HTTPS on its own port and doesn't serve ACME).
        provisioning.refreshPanelTls();
        platform.exec(5, "mkdir", "-p", "/var/www/html/.well-known/acme-challenge");

        String emailArg = (email != null && !email.isBlank())
                ? "--email " + email.trim() : "--register-unsafely-without-email";
        sink.append("▸ Requesting Let's Encrypt certificate for " + domain + " (HTTP-01 via webroot)…");
        String out = platform.run(300, "bash", "-c",
                "certbot certonly --webroot -w /var/www/html -d " + domain
                        + " --non-interactive --agree-tos " + emailArg
                        + " --keep-until-expiring 2>&1 | tail -40").orElse("");
        if (!out.isBlank()) sink.append(out);

        boolean ok = platform.fileExists(LIVE_DIR + "/" + domain + "/fullchain.pem");
        if (!ok) {
            String diag = out.isBlank()
                    ? "certbot exited with an error. Common causes: DNS A/AAAA doesn't point to this "
                            + "server, port 80 isn't reachable from the internet, or rate-limited."
                    : out;
            io.quarkus.narayana.jta.QuarkusTransaction.requiringNew().run(() ->
                    sh.ravix.entity.Event.persist(sh.ravix.rest.DomainResource.event(
                            "ssl", "warning",
                            "certbot issuance for " + domain + " failed: " + diag.replaceAll("\\s+", " "))));
            sink.append("✗ Issuance failed for " + domain + ".");
            return false;
        }

        io.quarkus.narayana.jta.QuarkusTransaction.requiringNew().run(() -> recordIssued(domain));
        platform.run(5, "systemctl", "enable", "--now", "certbot.timer");
        // If this cert is for the panel host, switch the panel from its
        // self-signed cert to the real one (no-op otherwise).
        try { provisioning.refreshPanelTls(); } catch (Exception ignore) { /* best-effort */ }
        sink.append("✓ Certificate issued for " + domain + " — auto-renewal (certbot.timer) enabled.");
        return true;
    }

    /** Persist the freshly issued certificate. Runs inside an active tx
     *  (opened by the caller's QuarkusTransaction). */
    private void recordIssued(String domain) {
        OffsetDateTime now = OffsetDateTime.now();
        sh.ravix.entity.Certificate c =
                sh.ravix.entity.Certificate.find("domain", domain).firstResult();
        if (c == null) {
            c = new sh.ravix.entity.Certificate();
            c.id = sh.ravix.util.Ids.generate("cert");
            c.domain = domain;
        }
        c.type = "lets-encrypt";
        c.issuer = "Let's Encrypt";
        c.autoRenew = true;
        c.issuedAt = now;
        c.expiresAt = now.plusDays(90);
        c.lastRenewalAt = now;
        c.lastRenewalStatus = "success";
        c.lastRenewalDetail = "Issued via ACME";
        c.status = "healthy";
        c.persist();
        sh.ravix.entity.Event.persist(sh.ravix.rest.DomainResource.event(
                "ssl", "success", "Issued Let's Encrypt certificate for " + domain));
    }

    /** Parse openssl date e.g. "Aug 12 00:00:00 2026 GMT". */
    static OffsetDateTime parseDate(String s, OffsetDateTime fallback) {   // package-private for unit tests
        try {
            String normalized = s.trim().replaceAll("\\s+", " ").replace(" GMT", "");
            DateTimeFormatter fmt =
                    DateTimeFormatter.ofPattern("MMM d HH:mm:ss yyyy", Locale.ENGLISH);
            return java.time.LocalDateTime.parse(normalized, fmt).atOffset(ZoneOffset.UTC);
        } catch (Exception e) {
            return fallback;
        }
    }
}
