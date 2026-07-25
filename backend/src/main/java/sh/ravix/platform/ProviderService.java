package sh.ravix.platform;

import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;
import java.net.InetSocketAddress;
import java.net.Socket;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.util.List;
import org.jboss.logging.Logger;

/**
 * Detects the hosting provider from the server's public IP (whois/ASN) and
 * returns a provider-specific "playbook": the known port-25 policy plus a
 * ready-to-paste support-ticket body. This turns the single most painful
 * deliverability blocker — outbound :25 blocked, often only on one IP family
 * — into a copy/paste action instead of hours of confusion.
 */
@ApplicationScoped
public class ProviderService {

    private static final Logger LOG = Logger.getLogger(ProviderService.class);
    private static final HttpClient HTTP = HttpClient.newBuilder()
            .connectTimeout(Duration.ofSeconds(5)).build();

    @Inject PlatformService platform;

    public record Playbook(
            String ip,
            String ipv6,
            String asn,
            String org,             // detected hosting org
            String providerKey,     // selectel | hetzner | digitalocean | aws | ovh | generic
            boolean port25v4,       // outbound IPv4 :25 reachable
            boolean port25v6,       // outbound IPv6 :25 reachable
            String policyNote,      // human summary of the provider's known stance
            String ticketSubject,
            String ticketBody) {}

    public Playbook detect() {
        String ip4 = probePublicIp("https://api.ipify.org");
        String ip6 = probePublicIp("https://api6.ipify.org");
        boolean v4 = !ip4.isBlank() && tcpProbe("64.233.184.26", 25);
        boolean v6 = tcpProbe6("gmail-smtp-in.l.google.com", 25);

        Whois w = whois(ip4.isBlank() ? ip6 : ip4);
        String key = classify(w.org, w.asn);
        String host = platform.hostname();

        String[] tpl = ticketFor(key, ip4, ip6, host, v4, v6);
        return new Playbook(ip4, ip6, w.asn, w.org, key, v4, v6,
                policyNote(key, v4, v6), tpl[0], tpl[1]);
    }

    // --- provider classification ------------------------------------------

    private static String classify(String org, String asn) {
        String o = (org == null ? "" : org).toLowerCase();
        if (o.contains("selectel")) return "selectel";
        if (o.contains("hetzner")) return "hetzner";
        if (o.contains("digitalocean") || o.contains("digital ocean")) return "digitalocean";
        if (o.contains("amazon") || o.contains("aws")) return "aws";
        if (o.contains("ovh")) return "ovh";
        if (o.contains("google")) return "gcp";
        if (o.contains("microsoft") || o.contains("azure")) return "azure";
        if (o.contains("timeweb")) return "timeweb";
        if (o.contains("reg.ru") || o.contains("regru")) return "regru";
        if (o.contains("beget")) return "beget";
        if (o.contains("vultr")) return "vultr";
        if (o.contains("linode") || o.contains("akamai")) return "linode";
        return "generic";
    }

    private static String policyNote(String key, boolean v4, boolean v6) {
        String base = switch (key) {
            case "selectel" -> "Selectel blocks outbound TCP 25 by default and opens it per request "
                    + "for clients with a configured PTR. IPv6 is sometimes left open even when IPv4 is blocked.";
            case "hetzner" -> "Hetzner blocks outbound 25 on new accounts and unblocks it after a short "
                    + "anti-abuse review via a support request.";
            case "digitalocean" -> "DigitalOcean blocks outbound 25 on all Droplets and only lifts it via a "
                    + "support ticket explaining your legitimate use case.";
            case "aws" -> "AWS throttles/blocks outbound 25 by default; you must submit the 'Request to remove "
                    + "email sending limitations' form (and ideally set a reverse DNS).";
            case "ovh" -> "OVH allows outbound 25 by default on most ranges; if blocked, it's toggled in the "
                    + "control panel under the IP's anti-spam settings.";
            case "timeweb", "regru", "beget" -> "Russian shared/VPS hosts commonly block outbound 25 and open it "
                    + "per request once you confirm the server runs a legitimate mail service with PTR set.";
            default -> "Many providers block outbound TCP 25 to fight spam and open it per request for "
                    + "legitimate mail servers with a configured PTR.";
        };
        String observed;
        if (v4 && v6) observed = " Observed: outbound 25 is OPEN on both IPv4 and IPv6 — you're good.";
        else if (v6 && !v4) observed = " Observed: IPv4 :25 is BLOCKED but IPv6 :25 is OPEN — a common "
                + "asymmetric policy. Either prefer IPv6 outbound, or ask them to open IPv4 too.";
        else if (v4) observed = " Observed: outbound 25 is OPEN on IPv4.";
        else observed = " Observed: outbound 25 is BLOCKED on both families — you must get it opened or use a relay.";
        return base + observed;
    }

    /** Returns [subject, body]. The body is intentionally neutral and factual —
     *  the fastest way past a tier-1 support agent. */
    private static String[] ticketFor(String key, String ip4, String ip6, String host,
                                      boolean v4, boolean v6) {
        String subject = "Request to open outbound TCP 25 (SMTP) for " + (ip4.isBlank() ? ip6 : ip4);

        StringBuilder b = new StringBuilder();
        b.append("Hello,\n\n");
        b.append("I'm running a self-hosted mail server on this host and need outbound TCP port 25 open.\n\n");
        b.append("Server:\n");
        if (!ip4.isBlank()) b.append("  IPv4: ").append(ip4).append("\n");
        if (!ip6.isBlank()) b.append("  IPv6: ").append(ip6).append("\n");
        b.append("  Hostname: ").append(host).append("\n\n");

        if (v6 && !v4) {
            b.append("Note on your current policy: outbound 25 over IPv6 is already open on this host, ")
             .append("but IPv4 is blocked. This asymmetry means the block doesn't actually prevent ")
             .append("sending — it only breaks delivery to IPv4-only receivers. Please either open ")
             .append("IPv4 :25 as well, or confirm the intended policy.\n\n");
        }

        b.append("The server is correctly configured for legitimate mail:\n");
        b.append("  - Reverse DNS (PTR) is set to the sending hostname\n");
        b.append("  - SPF, DKIM and DMARC are published\n");
        b.append("  - TLS is enabled for SMTP\n\n");
        b.append("I confirm this server will not be used to send spam. ");

        switch (key) {
            case "aws" -> b.append("I understand AWS uses the 'Request to remove email sending limitations' "
                    + "form for this — please advise if that's the correct path.\n");
            case "selectel" -> b.append("Please open outbound 25 for the IPs above; PTR is already configured "
                    + "on your side.\n");
            default -> b.append("Please open outbound port 25 for the IPs above.\n");
        }
        b.append("\nThank you.");
        return new String[]{subject, b.toString()};
    }

    // --- whois / ASN -------------------------------------------------------

    private record Whois(String asn, String org) {}

    private Whois whois(String ip) {
        if (ip == null || ip.isBlank()) return new Whois("unknown", "unknown");
        // ip-api.com is free, no key, returns AS + org. Fall back gracefully.
        try {
            HttpResponse<String> r = HTTP.send(
                    HttpRequest.newBuilder(java.net.URI.create(
                            "http://ip-api.com/json/" + ip + "?fields=as,org,isp"))
                            .timeout(Duration.ofSeconds(5)).GET().build(),
                    HttpResponse.BodyHandlers.ofString());
            String body = r.body();
            String as = extract(body, "\"as\":\"([^\"]*)\"");
            String org = extract(body, "\"org\":\"([^\"]*)\"");
            String isp = extract(body, "\"isp\":\"([^\"]*)\"");
            String orgFinal = (org != null && !org.isBlank()) ? org : isp;
            return new Whois(as == null ? "unknown" : as,
                    orgFinal == null ? "unknown" : orgFinal);
        } catch (Exception e) {
            LOG.debugf("whois failed for %s: %s", ip, e.getMessage());
            return new Whois("unknown", "unknown");
        }
    }

    // --- probes ------------------------------------------------------------

    private String probePublicIp(String url) {
        try {
            HttpResponse<String> r = HTTP.send(
                    HttpRequest.newBuilder(java.net.URI.create(url))
                            .timeout(Duration.ofSeconds(4)).GET().build(),
                    HttpResponse.BodyHandlers.ofString());
            String body = r.body().trim();
            return body.matches("[0-9a-fA-F:.]+") ? body : "";
        } catch (Exception e) {
            return "";
        }
    }

    private boolean tcpProbe(String host, int port) {
        try (Socket s = new Socket()) {
            s.connect(new InetSocketAddress(host, port), 4000);
            return true;
        } catch (Exception e) {
            return false;
        }
    }

    private boolean tcpProbe6(String host, int port) {
        try {
            for (java.net.InetAddress a : java.net.InetAddress.getAllByName(host)) {
                if (!(a instanceof java.net.Inet6Address)) continue;
                try (Socket s = new Socket()) {
                    s.connect(new InetSocketAddress(a, port), 4000);
                    return true;
                } catch (Exception ignored) { /* next */ }
            }
        } catch (Exception ignored) { /* none */ }
        return false;
    }

    private static String extract(String s, String regex) {
        var m = java.util.regex.Pattern.compile(regex).matcher(s);
        return m.find() ? m.group(1) : null;
    }
}
