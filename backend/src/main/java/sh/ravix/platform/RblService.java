package sh.ravix.platform;

import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;
import jakarta.transaction.Transactional;
import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.jboss.logging.Logger;
import sh.ravix.entity.AppSetting;
import sh.ravix.entity.Domain;
import sh.ravix.entity.Event;
import sh.ravix.entity.RblCheck;

/**
 * Checks the server's mail IP(s) against well-known DNSBLs (RBLs) by querying
 * the reversed-IP under each blacklist zone. A returned A record means listed.
 */
@ApplicationScoped
public class RblService {

    private static final Logger LOG = Logger.getLogger(RblService.class);

    /** Widely-used public DNSBL zones. */
    public static final List<String> ZONES = List.of(
            "zen.spamhaus.org",
            "b.barracudacentral.org",
            "bl.spamcop.net",
            "dnsbl.sorbs.net",
            "psbl.surriel.com",
            "cbl.abuseat.org");

    @Inject
    DnsService dns;

    @Inject
    PlatformService platform;

    public record ZoneResult(String zone, boolean listed, String result) {}
    public record IpResult(String ip, int listedCount, List<ZoneResult> zones, OffsetDateTime checkedAt) {}

    /** The mail IP(s) to monitor: the resolved A records of the mail hostname. */
    public List<String> monitoredIps() {
        String host = mailHostname();
        List<String> ips = new ArrayList<>(dns.a(host));
        // Fall back to the primary domain MX target's A record if needed.
        if (ips.isEmpty()) {
            for (Domain d : Domain.<Domain>listAll()) {
                List<String> mx = dns.mx(d.name);
                if (!mx.isEmpty()) {
                    ips.addAll(dns.a(mx.get(0).replaceAll("\\.$", "")));
                    if (!ips.isEmpty()) break;
                }
            }
        }
        return ips;
    }

    /** Run a full scan of all monitored IPs against all zones; persist + alert. */
    @Transactional
    public List<IpResult> scanAndStore() {
        List<IpResult> out = new ArrayList<>();
        for (String ip : monitoredIps()) {
            out.add(checkIp(ip, true));
        }
        return out;
    }

    /** Read the latest stored results without re-querying DNS. */
    @Transactional
    public List<IpResult> latest() {
        Map<String, List<ZoneResult>> byIp = new LinkedHashMap<>();
        Map<String, OffsetDateTime> when = new LinkedHashMap<>();
        for (RblCheck c : RblCheck.<RblCheck>listAll()) {
            byIp.computeIfAbsent(c.ip, k -> new ArrayList<>())
                    .add(new ZoneResult(c.zone, c.listed, c.result));
            when.merge(c.ip, c.checkedAt, (a, b) -> a.isAfter(b) ? a : b);
        }
        List<IpResult> out = new ArrayList<>();
        byIp.forEach((ip, zones) -> {
            int listed = (int) zones.stream().filter(ZoneResult::listed).count();
            out.add(new IpResult(ip, listed, zones, when.get(ip)));
        });
        return out;
    }

    @Transactional
    public IpResult checkIp(String ip, boolean store) {
        String reversed = reverse(ip);
        if (reversed == null) {
            return new IpResult(ip, 0, List.of(), OffsetDateTime.now());
        }
        List<ZoneResult> results = new ArrayList<>();
        int listedCount = 0;
        OffsetDateTime now = OffsetDateTime.now();
        for (String zone : ZONES) {
            List<String> a = dns.a(reversed + "." + zone);
            boolean listed = !a.isEmpty();
            String result = listed ? String.join(",", a) : null;
            if (listed) listedCount++;
            results.add(new ZoneResult(zone, listed, result));

            if (store) {
                RblCheck rec = RblCheck.find("ip = ?1 and zone = ?2", ip, zone).firstResult();
                boolean wasListed = rec != null && rec.listed;
                if (rec == null) {
                    rec = new RblCheck();
                    rec.ip = ip;
                    rec.zone = zone;
                }
                rec.listed = listed;
                rec.result = result;
                rec.checkedAt = now;
                rec.persist();
                // Alert on a new listing / delisting.
                if (listed && !wasListed) {
                    Event.persist(sh.ravix.rest.DomainResource.event("system", "critical",
                            "Mail IP " + ip + " is listed on " + zone));
                } else if (!listed && wasListed) {
                    Event.persist(sh.ravix.rest.DomainResource.event("system", "success",
                            "Mail IP " + ip + " delisted from " + zone));
                }
            }
        }
        return new IpResult(ip, listedCount, results, now);
    }

    /** Reverse an IPv4 address for DNSBL queries (1.2.3.4 -> 4.3.2.1). */
    private static String reverse(String ip) {
        String[] parts = ip.split("\\.");
        if (parts.length != 4) return null; // IPv4 only
        return parts[3] + "." + parts[2] + "." + parts[1] + "." + parts[0];
    }

    private String mailHostname() {
        AppSetting h = AppSetting.findById("hostname");
        return h != null && h.value != null && !h.value.isBlank() ? h.value : platform.hostname();
    }
}
