package sh.ravix.platform;

import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.file.Path;
import java.time.Duration;
import java.util.ArrayList;
import java.util.Hashtable;
import java.util.List;
import javax.naming.directory.Attribute;
import javax.naming.directory.Attributes;
import javax.naming.directory.InitialDirContext;
import org.jboss.logging.Logger;
import sh.ravix.entity.AppSetting;

/**
 * MTA-STS, TLS-RPT and DANE/TLSA advisory checks. For a given domain and mail
 * host this produces the recommended DNS records / policy and reports what is
 * currently published (via JNDI DNS lookups). Dependency-free.
 */
@ApplicationScoped
public class MtaStsService {

    private static final Logger LOG = Logger.getLogger(MtaStsService.class);

    @Inject
    TlsaService tlsa;

    @Inject
    PlatformService platform;

    /** One advisory item: a record/policy, what's expected, what's live, and status. */
    public record Item(String key, String label, String host, String expected,
                       String detected, String status, String detail) {}

    /** DNSSEC status + DS record the operator needs to add at their registrar. */
    public record DnssecStatus(String status, String dsRecord, String hint) {}

    /** Full TLS/transport-security posture for a domain. */
    public record Posture(String domain, String mailHost, List<Item> items,
                          String policyBody, String status, DnssecStatus dnssec) {}

    public Posture evaluate(String domain, String mailHost) {
        List<Item> items = new ArrayList<>();

        // --- MTA-STS policy DNS record (_mta-sts.<domain> TXT) ---------------
        String stsHost = "_mta-sts." + domain;
        String stsExpected = "v=STSv1; id=<policy-id>";
        String stsLive = firstTxtStartingWith(stsHost, "v=STSv1");
        items.add(new Item("mta-sts-dns", "MTA-STS TXT record", stsHost,
                stsExpected, stsLive,
                stsLive != null ? "pass" : "missing",
                "Signals that an MTA-STS policy is published for the domain."));

        // --- MTA-STS policy file (https://mta-sts.<domain>/.well-known/...) --
        // Actually probe the URL — receivers (Google, Microsoft) will too, and
        // a missing/broken policy file makes the whole MTA-STS dance useless.
        String policyUrl = "https://mta-sts." + domain + "/.well-known/mta-sts.txt";
        String policyBody = "version: STSv1\n"
                + "mode: enforce\n"
                + "mx: " + mailHost + "\n"
                + "max_age: 604800\n";
        String fetched = probePolicyFile(policyUrl);
        boolean policyLive = fetched != null
                && fetched.toLowerCase().contains("version: stsv1")
                && fetched.toLowerCase().contains("mx: " + mailHost.toLowerCase());
        items.add(new Item("mta-sts-policy", "MTA-STS policy file", policyUrl,
                "served over HTTPS",
                policyLive ? "served (HTTPS 200, matches mx)"
                        : (fetched != null ? "served but content mismatch" : null),
                policyLive ? "pass"
                        : (fetched != null ? "warn" : "missing"),
                policyLive ? "Receivers can fetch the policy."
                        : "Ravix should be serving this at the URL above. If it's missing, "
                          + "click Apply config — it regenerates the nginx vhost and re-runs certbot."));

        // --- TLS-RPT (_smtp._tls.<domain> TXT) ------------------------------
        String tlsRptHost = "_smtp._tls." + domain;
        String tlsRptExpected = "v=TLSRPTv1; rua=mailto:tls-reports@" + domain;
        String tlsRptLive = firstTxtStartingWith(tlsRptHost, "v=TLSRPTv1");
        items.add(new Item("tls-rpt", "TLS reporting (TLS-RPT)", tlsRptHost,
                tlsRptExpected, tlsRptLive,
                tlsRptLive != null ? "pass" : "missing",
                "Receive reports about TLS negotiation failures from sending servers."));

        // --- DANE / TLSA (_25._tcp.<mailHost> TLSA) -------------------------
        // Compute the actual expected hash from the live cert; if we don't
        // have a cert for the mail host yet, fall back to the placeholder.
        String tlsaHost = "_25._tcp." + mailHost;
        String tlsaExpected = tlsa.recordContent(
                Path.of("/etc/letsencrypt/live/" + mailHost + "/fullchain.pem"))
                .orElse("3 1 1 <cert-hash>");
        boolean tlsaLive = hasRecord(tlsaHost, "TLSA");
        DnssecStatus dnssec = loadDnssec(domain);
        // Status logic:
        //   pass   — record published AND DNSSEC active (only then it actually pins)
        //   warn   — record published but DNSSEC inactive (cosmetic, ignored by receivers)
        //   optional — no record yet (don't yell at the operator about it)
        String tlsaStatus;
        String tlsaDetail;
        if (tlsaLive && "active".equals(dnssec.status())) {
            tlsaStatus = "pass";
            tlsaDetail = "Pinning active — receivers validate the cert against this hash.";
        } else if (tlsaLive) {
            tlsaStatus = "warn";
            tlsaDetail = "TLSA published but DNSSEC is " + dnssec.status() + " — receivers ignore it. "
                       + "Activate DNSSEC at your registrar with the DS record below.";
        } else {
            tlsaStatus = "optional";
            tlsaDetail = "Auto-published by Ravix once a Let's Encrypt cert for " + mailHost
                       + " is issued. Activate DNSSEC at your registrar to make it enforceable.";
        }
        items.add(new Item("dane-tlsa", "DANE (TLSA record)", tlsaHost,
                tlsaExpected, tlsaLive ? "published" : null, tlsaStatus, tlsaDetail));

        // Overall: pass if MTA-STS DNS + TLS-RPT present.
        long published = items.stream().filter(i -> "pass".equals(i.status())).count();
        String status = published >= 2 ? "healthy" : published == 1 ? "warning" : "critical";

        return new Posture(domain, mailHost, items, policyBody, status, dnssec);
    }

    /** Pull the DS record CloudflareService stashed after enabling DNSSEC.
     *  Format on disk: "<status>|<ds>" — see CloudflareService.enableDnssecAndStashDs. */
    private DnssecStatus loadDnssec(String domain) {
        // Walk up the labels until we find a stored "dnssec_ds_<zone>" row
        // (the zone is rarely the same as the domain — e.g. zone example.com
        // vs domain ravix.example.com).
        String labels = domain;
        while (labels.contains(".")) {
            AppSetting row = AppSetting.findById("dnssec_ds_" + labels);
            if (row != null && row.value != null) {
                int bar = row.value.indexOf('|');
                String st = bar < 0 ? row.value : row.value.substring(0, bar);
                String ds = bar < 0 ? "" : row.value.substring(bar + 1);
                String hint = switch (st) {
                    case "active"  -> ds.isBlank()
                            ? "DNSSEC is active — DS record will appear here once Cloudflare reports it."
                            : "Copy the DS record below to your domain registrar to complete the chain of trust.";
                    case "pending" -> "Cloudflare is provisioning DNSSEC — refresh in a minute.";
                    case "disabled"-> "DNSSEC is disabled on the zone. Ravix tries to enable it on every sync.";
                    default        -> "DNSSEC status: " + st;
                };
                return new DnssecStatus(st, ds, hint);
            }
            labels = labels.substring(labels.indexOf('.') + 1);
        }
        return new DnssecStatus("unknown",
                "",
                "No Cloudflare zone matched yet — DNSSEC will be enabled on the next sync.");
    }

    /** The MTA-STS policy file body for a domain (served at the well-known URL). */
    public String policyBody(String mailHost) {
        return "version: STSv1\nmode: enforce\nmx: " + mailHost + "\nmax_age: 604800\n";
    }

    /** Fetch the MTA-STS policy file. Returns the body on 200, null on any
     *  failure — caller decides what to do with that. Allows self-signed
     *  certs so a domain in mid-issuance still surfaces a useful state. */
    private String probePolicyFile(String url) {
        try {
            HttpClient hc = HttpClient.newBuilder()
                    .connectTimeout(Duration.ofSeconds(4))
                    .followRedirects(HttpClient.Redirect.NORMAL)
                    .build();
            HttpResponse<String> r = hc.send(
                    HttpRequest.newBuilder(URI.create(url))
                            .timeout(Duration.ofSeconds(5))
                            .GET().build(),
                    HttpResponse.BodyHandlers.ofString());
            return r.statusCode() == 200 ? r.body() : null;
        } catch (Exception e) {
            LOG.debugf("MTA-STS policy fetch failed for %s: %s", url, e.getMessage());
            return null;
        }
    }

    // --- DNS helpers (JNDI) -----------------------------------------------

    private String firstTxtStartingWith(String host, String prefix) {
        for (String txt : txt(host)) {
            if (txt.startsWith(prefix)) return txt;
        }
        return null;
    }

    private List<String> txt(String host) {
        List<String> out = new ArrayList<>();
        try {
            Attributes attrs = ctx().getAttributes(host, new String[] {"TXT"});
            Attribute txt = attrs.get("TXT");
            if (txt != null) {
                for (int i = 0; i < txt.size(); i++) {
                    out.add(txt.get(i).toString().replace("\"", "").trim());
                }
            }
        } catch (Exception e) {
            LOG.debugf("TXT lookup failed for %s: %s", host, e.getMessage());
        }
        return out;
    }

    private boolean hasRecord(String host, String type) {
        // Sun's JNDI DNS provider only knows the classic RR types (A, AAAA,
        // MX, NS, SOA, SRV, TXT, PTR, CNAME) — TLSA, CAA, SVCB etc. always
        // come back empty even when published. Fall back to the `host`
        // command for anything outside that set.
        if ("TLSA".equals(type) || "CAA".equals(type)
                || "SVCB".equals(type) || "HTTPS".equals(type)) {
            return platform.run(5, "host", "-W", "5", "-t", type, host)
                    .map(out -> {
                        String lc = out.toLowerCase();
                        return lc.contains(type.toLowerCase() + " record")
                                && !lc.contains("not found")
                                && !lc.contains("no record");
                    })
                    .orElse(false);
        }
        try {
            Attributes attrs = ctx().getAttributes(host, new String[] {type});
            return attrs.get(type) != null && attrs.get(type).size() > 0;
        } catch (Exception e) {
            return false;
        }
    }

    private InitialDirContext ctx() throws Exception {
        Hashtable<String, String> env = new Hashtable<>();
        env.put("java.naming.factory.initial", "com.sun.jndi.dns.DnsContextFactory");
        env.put("com.sun.jndi.dns.timeout.initial", "3000");
        env.put("com.sun.jndi.dns.timeout.retries", "1");
        return new InitialDirContext(env);
    }
}
