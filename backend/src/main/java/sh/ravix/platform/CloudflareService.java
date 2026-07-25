package sh.ravix.platform;

import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;
import jakarta.transaction.Transactional;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import org.jboss.logging.Logger;
import sh.ravix.entity.AppSetting;
import sh.ravix.entity.Domain;

/**
 * Thin client for the Cloudflare REST API + a "publish the records this mail
 * domain needs" planner that touches only Ravix's records (MX, SPF, DKIM,
 * DMARC, A for the mail host) and never blasts unrelated entries in the zone.
 */
@ApplicationScoped
public class CloudflareService {

    private static final Logger LOG = Logger.getLogger(CloudflareService.class);
    private static final String API = "https://api.cloudflare.com/client/v4";
    private final HttpClient http = HttpClient.newBuilder()
            .connectTimeout(Duration.ofSeconds(8)).build();

    @Inject
    DomainChecker checker;

    @Inject
    TlsaService tlsa;

    // --- Records and actions returned to the UI ----------------------------

    public enum Action { CREATE, UPDATE, UNCHANGED, SKIP, DELETE }

    public record PlanRecord(
            String label,        // "A", "MX", "SPF", "DKIM", "DMARC"
            String type,         // CF type
            String name,         // FQDN
            String expected,     // value we want
            String current,      // existing value or null
            String existingId,   // CF record id (for update)
            Action action,
            int priority,        // for MX
            String note) {}

    public record Plan(String zone, String hostname, String ip, List<PlanRecord> records) {}

    public record ApplyResult(
            String label, String name, Action action, boolean ok, String detail) {}

    public record TokenStatus(boolean valid, String status, String email) {}

    public record Zone(String id, String name, String status) {}

    // --- Token storage -----------------------------------------------------

    public String token() {
        AppSetting s = AppSetting.findById("cloudflare_token");
        return s == null ? null : s.value;
    }

    @Transactional
    public void saveToken(String token) {
        AppSetting s = AppSetting.findById("cloudflare_token");
        if (s == null) { s = new AppSetting(); s.key = "cloudflare_token"; }
        s.value = token == null ? "" : token.trim();
        s.persist();
    }

    @Transactional
    public void clearToken() {
        AppSetting.deleteById("cloudflare_token");
    }

    // --- API calls ---------------------------------------------------------

    public TokenStatus verifyToken(String token) {
        try {
            String body = get(token, "/user/tokens/verify");
            // {"success":true,"result":{"id":"...","status":"active"},...}
            if (body.contains("\"success\":true")) {
                String status = extract(body, "\"status\":\"([^\"]+)\"");
                return new TokenStatus(true, status == null ? "active" : status, null);
            }
            // Cloudflare answered but didn't accept the call. Distinguish a
            // temporary rate-limit (code 971) from a genuinely bad token so
            // the caller can decide whether to save-and-retry or reject.
            String low = body.toLowerCase();
            if (low.contains("971") || low.contains("throttl")
                    || low.contains("rate limit") || low.contains("please wait")) {
                return new TokenStatus(false, "throttled", null);
            }
            return new TokenStatus(false, "invalid", null);
        } catch (Exception e) {
            // Couldn't even reach Cloudflare (no egress / DNS from this host).
            LOG.warnf("CF verifyToken unreachable: %s", e.getMessage());
            return new TokenStatus(false, "unreachable: " + e.getMessage(), null);
        }
    }

    /** All zones the token can see. */
    public List<Zone> listZones() throws Exception {
        String tok = requireToken();
        String body = get(tok, "/zones?per_page=50");
        // Cheap structural extraction — no JSON dep, mirrors how DmarcService parses XML.
        List<Zone> out = new ArrayList<>();
        Pattern p = Pattern.compile("\"id\":\"([^\"]+)\",\"name\":\"([^\"]+)\"[^}]*?\"status\":\"([^\"]+)\"");
        Matcher m = p.matcher(body);
        while (m.find()) out.add(new Zone(m.group(1), m.group(2), m.group(3)));
        return out;
    }

    /** Records of the listed types for a zone, used to diff against our plan. */
    public List<Map<String, String>> listRecords(String zoneId) throws Exception {
        String tok = requireToken();
        String body = get(tok, "/zones/" + zoneId + "/dns_records?per_page=200");
        return parseRecords(body);
    }

    // --- Planning ----------------------------------------------------------

    /** Compute the records we'd add/update to make {hostname} a working MX.
     *  ipv6 is optional — pass null/blank to skip the AAAA record. */
    @Transactional
    public Plan plan(String zoneId, String hostname, String ip, String ipv6) throws Exception {
        if (hostname == null || hostname.isBlank()) throw new IllegalArgumentException("hostname required");
        if (ip == null || ip.isBlank()) throw new IllegalArgumentException("ip required");
        Zone zone = findZone(zoneId);

        // Ensure we have a Ravix Domain for this hostname so we know its DKIM key.
        Domain d = Domain.find("name", hostname).firstResult();
        if (d == null) {
            d = createMinimalDomain(hostname);
        }

        List<Map<String, String>> existing = listRecords(zoneId);
        List<PlanRecord> recs = new ArrayList<>();

        // A record for the hostname.
        recs.add(diffSimple(existing, "A", hostname, ip, "A"));
        // AAAA — only when the server actually has a routable IPv6. Gmail's
        // IPv6 sender policy needs PTR-and-AAAA forward-confirm, so publishing
        // an AAAA without that is harmful; the caller passes ipv6 only when
        // it has confirmed reachability.
        if (ipv6 != null && !ipv6.isBlank()) {
            recs.add(diffSimple(existing, "AAAA", hostname, ipv6, "AAAA"));
        }
        // mta-sts.<host> A/AAAA so the MTA-STS policy file is reachable on
        // its required subdomain. We serve it via the panel's nginx — see
        // ProvisioningService.renderNginxVhosts.
        recs.add(diffSimple(existing, "A", "mta-sts." + hostname, ip, "MTA-STS host A"));
        if (ipv6 != null && !ipv6.isBlank()) {
            recs.add(diffSimple(existing, "AAAA", "mta-sts." + hostname, ipv6, "MTA-STS host AAAA"));
        }
        // MX → 10 hostname. diffMx already replaces THE FIRST MX. We also
        // queue DELETE for every additional MX (Cloudflare Email Routing
        // adds three "_dc-mx.<hash>.<zone>" records that intercept inbound
        // and break delivery). Same logic for the auto-DKIM record CF Email
        // Routing publishes under "cf2024-1._domainkey.<host>".
        recs.add(diffMx(existing, hostname, hostname, 10));
        recs.addAll(deleteExtraMx(existing, hostname));
        recs.addAll(deleteCfRouting(existing, hostname));
        // SPF.
        recs.addAll(diffTxt(existing, hostname, "v=spf1 mx ~all", "SPF",
                v -> v != null && v.toLowerCase().startsWith("v=spf1")));
        // DKIM.
        String dkimHost = d.dkimSelector + "._domainkey." + hostname;
        String dkimValue = DkimKeys.txtValue(d.dkimPublicKey);
        recs.addAll(diffTxt(existing, dkimHost, dkimValue, "DKIM",
                v -> v != null && v.toLowerCase().contains("v=dkim1")));
        // DMARC — start at p=none for warmup. Tightening to quarantine/reject
        // is the user's call once they see clean aggregate reports for a week
        // or two; publishing p=quarantine on day 1 causes Gmail to dump even
        // legitimate first messages into Spam.
        String dmarc = "v=DMARC1; p=none; rua=mailto:dmarc@" + hostname + "; pct=100; aspf=r; adkim=r";
        recs.addAll(diffTxt(existing, "_dmarc." + hostname, dmarc, "DMARC",
                v -> v != null && v.toLowerCase().startsWith("v=dmarc1")));
        // MTA-STS — declares "this domain wants TLS." Receivers cache the policy
        // file (served over HTTPS) and refuse to deliver in cleartext if a
        // downgrade attack is attempted. The TXT just announces the policy ID.
        String stsId = "ravix" + (System.currentTimeMillis() / 1000L);
        recs.addAll(diffTxt(existing, "_mta-sts." + hostname,
                "v=STSv1; id=" + stsId, "MTA-STS",
                v -> v != null && v.toLowerCase().startsWith("v=stsv1")));
        // TLS-RPT — receivers send back daily reports about TLS negotiation
        // failures, so the operator notices misconfigured certs / downgrades.
        recs.addAll(diffTxt(existing, "_smtp._tls." + hostname,
                "v=TLSRPTv1; rua=mailto:tls-reports@" + hostname, "TLS-RPT",
                v -> v != null && v.toLowerCase().startsWith("v=tlsrptv1")));

        // DANE TLSA — pins the SMTP server's TLS cert via DNSSEC. We
        // compute the hash from the live cert in /etc/letsencrypt/live/.
        // The record is harmless when DNSSEC isn't yet active at the
        // registrar (receivers ignore it); harmful only if the hash
        // drifts from the live cert — see InternalResource.certRenewed
        // for the renewal-hook side that keeps them in sync.
        java.util.Optional<String> tlsaContent = tlsa.recordContent(
                java.nio.file.Path.of("/etc/letsencrypt/live/" + hostname + "/fullchain.pem"));
        if (tlsaContent.isPresent()) {
            recs.add(diffTlsa(existing, "_25._tcp." + hostname, tlsaContent.get()));
        }

        return new Plan(zone.name(), hostname, ip, recs);
    }

    /** Backwards-compatible overload — no IPv6. */
    @Transactional
    public Plan plan(String zoneId, String hostname, String ip) throws Exception {
        return plan(zoneId, hostname, ip, null);
    }

    /** Execute the plan against Cloudflare. */
    @Transactional
    public List<ApplyResult> apply(String zoneId, String hostname, String ip, String ipv6) throws Exception {
        Plan p = plan(zoneId, hostname, ip, ipv6);
        List<ApplyResult> out = new ArrayList<>();
        for (PlanRecord r : p.records()) {
            try {
                ApplyResult ar = applyOne(zoneId, r);
                out.add(ar);
            } catch (Exception e) {
                out.add(new ApplyResult(r.label(), r.name(), Action.SKIP, false,
                        "Cloudflare error: " + e.getMessage()));
            }
        }
        // Trigger a Ravix-side recheck so the domain's status updates immediately.
        Domain d = Domain.find("name", hostname).firstResult();
        if (d != null) {
            checker.recheck(d, mailHostname());
        }
        return out;
    }

    /** Backwards-compatible overload. */
    @Transactional
    public List<ApplyResult> apply(String zoneId, String hostname, String ip) throws Exception {
        return apply(zoneId, hostname, ip, null);
    }

    /** Best-effort: for every Domain in our DB, find a matching Cloudflare
     *  zone the saved token can see and re-apply our DNS plan. Used by
     *  ProvisioningService.syncAll so a single "Apply config" click both
     *  rewrites the local mail-daemon configs AND keeps the public DNS in
     *  step — operator does not have to revisit the wizard for each domain
     *  every time we improve the planner (e.g. adding MTA-STS support).
     *
     *  Silent on missing token / no matching zone — this is a hook, not a
     *  primary action. Returns the number of domains successfully synced. */
    /** Re-sync DNS on app startup so the public records always match the
     *  current planner — operator never has to revisit anything for a deploy
     *  to take effect. */
    // Startup hook lives in ProvisioningService.scheduledFullSync (uses the
    // scheduler so it runs inside a transactional context). That method
    // calls syncAll → autoSyncAll, so this class does NOT need its own
    // startup observer. The hourly scheduler below is the redundancy
    // backstop in case syncAll never gets called by Apply config.

    /** Hourly background re-sync so manual fiddling in the CF dashboard,
     *  Email Routing toggles, or planner improvements pushed via update
     *  converge back to the truth without human action. */
    @io.quarkus.scheduler.Scheduled(every = "1h", delay = 5, delayUnit = java.util.concurrent.TimeUnit.MINUTES)
    void scheduledSync() {
        try { autoSyncAll(); }
        catch (Exception e) { LOG.warnf("Cloudflare scheduled sync failed: %s", e.getMessage()); }
    }

    @Transactional
    public int autoSyncAll() {
        String tok = token();
        if (tok == null || tok.isBlank()) return 0;
        List<Zone> zones;
        try { zones = listZones(); }
        catch (Exception e) { LOG.warnf("CF autoSync: listZones failed: %s", e.getMessage()); return 0; }

        // Resolve current public IPs once. Skipped silently if probes fail.
        String ip4 = probePublicIp("https://api.ipify.org");
        String ip6 = probePublicIp("https://api6.ipify.org");

        int synced = 0;
        for (Domain d : Domain.<Domain>listAll()) {
            Zone match = pickZone(zones, d.name);
            if (match == null) continue;
            try {
                apply(match.id(), d.name, ip4, ip6.isBlank() ? null : ip6);
                // Best-effort: enable DNSSEC and stash the resulting DS
                // record so the UI can show the operator what to paste at
                // the registrar. Idempotent — CF returns 200 even if it
                // was already active.
                try { enableDnssecAndStashDs(match); }
                catch (Exception e) { LOG.warnf("DNSSEC enable for %s: %s", match.name(), e.getMessage()); }
                synced++;
                LOG.infof("CF autoSync: re-applied DNS for %s in zone %s", d.name, match.name());
            } catch (Exception e) {
                LOG.warnf("CF autoSync: apply failed for %s: %s", d.name, e.getMessage());
            }
        }
        return synced;
    }

    /** Ask Cloudflare to sign the zone (DNSSEC active) and remember the DS
     *  record content under AppSetting "dnssec_ds_<zone>". The TLS-security
     *  page surfaces that so the operator can hand it to the registrar —
     *  CF can only sign the zone, the chain-of-trust completes at the
     *  registrar. Safe to call on an already-active zone. */
    private void enableDnssecAndStashDs(Zone zone) throws Exception {
        // PATCH {"status":"active"} both enables and reports current state.
        String resp = patch(requireToken(),
                "/zones/" + zone.id() + "/dnssec",
                "{\"status\":\"active\"}");
        // Response shape: result.{status, ds, key_tag, algorithm, digest, ...}
        String status = extract(resp, "\"status\":\"([^\"]+)\"");
        String ds = extract(resp, "\"ds\":\"([^\"]+)\"");
        // Normalize escaped slashes / quotes back to plain text for storage.
        if (ds != null) ds = ds.replace("\\/", "/").replace("\\\"", "\"");
        AppSetting dsRow = AppSetting.findById("dnssec_ds_" + zone.name());
        if (dsRow == null) { dsRow = new AppSetting(); dsRow.key = "dnssec_ds_" + zone.name(); }
        // Store "<status>|<ds>" so the UI can show both at once.
        dsRow.value = (status == null ? "unknown" : status) + "|" + (ds == null ? "" : ds);
        dsRow.persist();
        if ("active".equals(status)) {
            LOG.infof("DNSSEC active on %s — DS: %s", zone.name(), ds);
        } else {
            LOG.infof("DNSSEC for %s: status=%s (DS may be empty until pending)", zone.name(), status);
        }
    }

    /** Pick the longest-suffix zone that owns `hostname`. */
    private static Zone pickZone(List<Zone> zones, String hostname) {
        Zone best = null; int bestLen = 0;
        String h = hostname == null ? "" : hostname.toLowerCase();
        for (Zone z : zones) {
            String zn = z.name() == null ? "" : z.name().toLowerCase();
            if (h.equals(zn) || h.endsWith("." + zn)) {
                if (zn.length() > bestLen) { best = z; bestLen = zn.length(); }
            }
        }
        return best;
    }

    private static String probePublicIp(String url) {
        try {
            java.net.http.HttpClient hc = java.net.http.HttpClient.newHttpClient();
            java.net.http.HttpResponse<String> r = hc.send(
                    java.net.http.HttpRequest.newBuilder(java.net.URI.create(url))
                            .timeout(java.time.Duration.ofSeconds(4)).GET().build(),
                    java.net.http.HttpResponse.BodyHandlers.ofString());
            String body = r.body().trim();
            return body.matches("[0-9a-fA-F:.]+") ? body : "";
        } catch (Exception e) { return ""; }
    }

    private ApplyResult applyOne(String zoneId, PlanRecord r) throws Exception {
        if (r.action() == Action.UNCHANGED || r.action() == Action.SKIP) {
            return new ApplyResult(r.label(), r.name(), r.action(), true,
                    r.action() == Action.UNCHANGED ? "Already correct" : "Skipped");
        }
        if (r.action() == Action.DELETE) {
            String json = delete(requireToken(), "/zones/" + zoneId + "/dns_records/" + r.existingId());
            boolean ok = json.contains("\"success\":true");
            return new ApplyResult(r.label(), r.name(), r.action(), ok,
                    ok ? "Deleted" : "Cloudflare: " + json.substring(0, Math.min(200, json.length())));
        }
        String body = recordBody(r);
        String json;
        if (r.action() == Action.CREATE) {
            json = post(requireToken(), "/zones/" + zoneId + "/dns_records", body);
        } else { // UPDATE
            json = put(requireToken(), "/zones/" + zoneId + "/dns_records/" + r.existingId(), body);
        }
        boolean ok = json.contains("\"success\":true");
        return new ApplyResult(r.label(), r.name(), r.action(), ok,
                ok ? (r.action() == Action.CREATE ? "Created" : "Updated")
                   : "Cloudflare: " + json.substring(0, Math.min(200, json.length())));
    }

    /** Plan DELETEs for any MX at `name` whose target isn't our hostname.
     *  Specifically catches Cloudflare Email Routing's `_dc-mx.<hash>.<zone>`
     *  triple — we already UPDATE one of them via diffMx, this DELETEs the
     *  rest so receivers see exactly one MX. */
    private List<PlanRecord> deleteExtraMx(List<Map<String, String>> existing, String name) {
        List<PlanRecord> out = new ArrayList<>();
        boolean keptOne = false;
        for (Map<String, String> r : existing) {
            if (!"MX".equals(r.get("type"))) continue;
            if (!equalsHost(r.get("name"), name)) continue;
            String content = r.get("content");
            // The first matching MX is the one diffMx already targeted for
            // UPDATE — leave it. Any further MX at the same host is dropped.
            if (!keptOne) { keptOne = true; continue; }
            out.add(new PlanRecord("MX cleanup", "MX", name,
                    "(delete)", content, r.get("id"), Action.DELETE, 0,
                    "Extra MX (" + content + ") — replaced by single primary"));
        }
        return out;
    }

    /** DELETE Cloudflare Email Routing's auto-DKIM record at
     *  `cf2024-<n>._domainkey.<host>` so it doesn't conflict with our key. */
    private List<PlanRecord> deleteCfRouting(List<Map<String, String>> existing, String name) {
        List<PlanRecord> out = new ArrayList<>();
        String suffix = "._domainkey." + name.toLowerCase();
        for (Map<String, String> r : existing) {
            if (!"TXT".equals(r.get("type"))) continue;
            String rn = strip(r.get("name") == null ? "" : r.get("name").toLowerCase());
            // cf2024-1._domainkey.<host>, cf2024-2._domainkey.<host>, ...
            if (!rn.endsWith(suffix)) continue;
            if (!rn.startsWith("cf20")) continue;
            out.add(new PlanRecord("CF Routing DKIM", "TXT", rn,
                    "(delete)", r.get("content"), r.get("id"), Action.DELETE, 0,
                    "Cloudflare Email Routing auto-DKIM — not used by Ravix"));
        }
        return out;
    }

    private String recordBody(PlanRecord r) {
        // CF needs ttl=1 (auto), proxied=false for mail-related records.
        if ("MX".equals(r.type())) {
            return String.format(
                    "{\"type\":\"MX\",\"name\":\"%s\",\"content\":\"%s\",\"priority\":%d,\"ttl\":1,\"proxied\":false}",
                    esc(r.name()), esc(r.expected()), r.priority());
        }
        if ("TLSA".equals(r.type())) {
            // CF expects TLSA as a structured "data" object, not a flat
            // content string. Parse our "3 1 1 <hash>" expected value.
            String[] parts = r.expected().trim().split("\\s+");
            if (parts.length != 4) {
                throw new IllegalArgumentException("TLSA must be '<usage> <selector> <matching> <hash>': " + r.expected());
            }
            return String.format(
                    "{\"type\":\"TLSA\",\"name\":\"%s\",\"data\":{\"usage\":%s,\"selector\":%s,\"matching_type\":%s,\"certificate\":\"%s\"},\"ttl\":1,\"proxied\":false}",
                    esc(r.name()), parts[0], parts[1], parts[2], parts[3]);
        }
        return String.format(
                "{\"type\":\"%s\",\"name\":\"%s\",\"content\":\"%s\",\"ttl\":1,\"proxied\":false}",
                r.type(), esc(r.name()), esc(r.expected()));
    }

    /** TLSA diff. CF stores it back as content "3 1 1 <hash>" (lowercase
     *  hex) — so we normalize both sides before equality compare. */
    private PlanRecord diffTlsa(List<Map<String, String>> existing, String name, String want) {
        Map<String, String> cur = find(existing, "TLSA", name);
        String w = normalizeTlsa(want);
        if (cur == null) {
            return new PlanRecord("DANE TLSA", "TLSA", name, want, null, null, Action.CREATE, 0,
                    "Pins SMTP cert via DNSSEC — receivers honor it once DS is at the registrar.");
        }
        String c = normalizeTlsa(cur.get("content"));
        if (w.equals(c)) {
            return new PlanRecord("DANE TLSA", "TLSA", name, want, cur.get("content"), cur.get("id"),
                    Action.UNCHANGED, 0, null);
        }
        return new PlanRecord("DANE TLSA", "TLSA", name, want, cur.get("content"), cur.get("id"),
                Action.UPDATE, 0, "Cert rotated — updating hash so DANE keeps validating.");
    }
    private static String normalizeTlsa(String s) {
        return s == null ? "" : s.toLowerCase().replaceAll("\\s+", " ").trim();
    }

    // --- Diff helpers -------------------------------------------------------

    private PlanRecord diffSimple(List<Map<String, String>> existing, String type, String name, String want, String label) {
        Map<String, String> cur = find(existing, type, name);
        if (cur == null) {
            return new PlanRecord(label, type, name, want, null, null, Action.CREATE, 0, null);
        }
        String content = cur.get("content");
        if (want.equals(content)) {
            return new PlanRecord(label, type, name, want, content, cur.get("id"), Action.UNCHANGED, 0, null);
        }
        return new PlanRecord(label, type, name, want, content, cur.get("id"), Action.UPDATE, 0,
                "Replacing existing " + type + " record");
    }

    private PlanRecord diffMx(List<Map<String, String>> existing, String name, String target, int priority) {
        Map<String, String> cur = find(existing, "MX", name);
        String want = target;
        if (cur == null) {
            return new PlanRecord("MX", "MX", name, want, null, null, Action.CREATE, priority, null);
        }
        String content = cur.get("content");
        int p = parseInt(cur.get("priority"));
        if (target.equals(content) && p == priority) {
            return new PlanRecord("MX", "MX", name, want, p + " " + content, cur.get("id"), Action.UNCHANGED, priority, null);
        }
        return new PlanRecord("MX", "MX", name, want, p + " " + content, cur.get("id"), Action.UPDATE, priority,
                "Existing MX points elsewhere — will replace");
    }

    /** TXT diff with a "kind" matcher so we don't touch other TXTs at the same host.
     *  Returns a LIST: the primary record (CREATE/UPDATE/UNCHANGED) plus a
     *  DELETE for every duplicate. RFC 6376 §3.6.2.2 says verifiers MUST
     *  fail if multiple DKIM TXTs exist at the same selector — a single
     *  stray DKIM record will make Gmail mark every message dkim=fail.
     *  Same convergence-to-one rule for SPF/DMARC where strictly only one
     *  record per type per host is valid. */
    private List<PlanRecord> diffTxt(List<Map<String, String>> existing, String name, String want,
                                     String label, java.util.function.Predicate<String> matcher) {
        List<PlanRecord> out = new ArrayList<>();
        List<Map<String, String>> matches = new ArrayList<>();
        for (Map<String, String> r : existing) {
            if (!"TXT".equals(r.get("type"))) continue;
            if (!equalsHost(r.get("name"), name)) continue;
            if (matcher.test(unquote(r.get("content")))) matches.add(r);
        }
        if (matches.isEmpty()) {
            out.add(new PlanRecord(label, "TXT", name, want, null, null, Action.CREATE, 0, null));
            return out;
        }
        Map<String, String> primary = matches.get(0);
        String content = unquote(primary.get("content"));
        if (want.equals(content)) {
            out.add(new PlanRecord(label, "TXT", name, want, content, primary.get("id"),
                    Action.UNCHANGED, 0, null));
        } else {
            out.add(new PlanRecord(label, "TXT", name, want, content, primary.get("id"),
                    Action.UPDATE, 0, "Replacing existing " + label + " record"));
        }
        // DELETE every additional duplicate so verifiers see exactly one
        // record per selector.
        for (int i = 1; i < matches.size(); i++) {
            Map<String, String> dup = matches.get(i);
            out.add(new PlanRecord(label + " duplicate", "TXT", name, "(delete)",
                    dup.get("content"), dup.get("id"), Action.DELETE, 0,
                    "Duplicate " + label + " record — RFC requires exactly one, deleting extras."));
        }
        return out;
    }

    /** Strip a single layer of leading+trailing double quotes from a CF-stored
     *  TXT content. The API returns quoted strings for records created via
     *  raw curl ("v=DKIM1; ..."), unquoted for records created via this
     *  service. Normalize for equality comparison. */
    private static String unquote(String s) {
        if (s == null) return "";
        s = s.trim();
        if (s.length() >= 2 && s.startsWith("\"") && s.endsWith("\"")) {
            s = s.substring(1, s.length() - 1);
        }
        return s;
    }

    private Map<String, String> find(List<Map<String, String>> recs, String type, String name) {
        for (Map<String, String> r : recs) {
            if (type.equals(r.get("type")) && equalsHost(r.get("name"), name)) return r;
        }
        return null;
    }

    private static boolean equalsHost(String a, String b) {
        if (a == null || b == null) return false;
        return strip(a).equalsIgnoreCase(strip(b));
    }
    private static String strip(String s) {
        return s.endsWith(".") ? s.substring(0, s.length() - 1) : s;
    }
    private static int parseInt(String s) {
        try { return s == null ? 0 : Integer.parseInt(s.trim()); }
        catch (NumberFormatException e) { return 0; }
    }

    // --- Ravix-side domain ---------------------------------------------------

    private Domain createMinimalDomain(String hostname) {
        // Replicates DomainResource.create() minimally so we have a DKIM key.
        Domain d = new Domain();
        d.id = sh.ravix.util.Ids.generate("dom");
        d.name = hostname;
        d.status = "warning";
        d.createdAt = java.time.OffsetDateTime.now();
        d.checkSsl = "pending";
        d.dkimSelector = "ravix" + java.time.OffsetDateTime.now().getYear();
        DkimKeys.Pair pair = DkimKeys.generate();
        d.dkimPublicKey = pair.publicKeyBase64();
        d.dkimPrivateKey = pair.privatePem();
        checker.generateRecords(d, mailHostname());
        d.persist();
        return d;
    }

    private String mailHostname() {
        AppSetting h = AppSetting.findById("hostname");
        return h != null && h.value != null && !h.value.isBlank() ? h.value : "localhost";
    }

    // --- HTTP plumbing ------------------------------------------------------

    private String requireToken() {
        String t = token();
        if (t == null || t.isBlank()) throw new IllegalStateException("Cloudflare API token not configured");
        return t;
    }

    private Zone findZone(String id) throws Exception {
        for (Zone z : listZones()) if (z.id().equals(id)) return z;
        throw new IllegalArgumentException("Zone not found: " + id);
    }

    private String get(String token, String path) throws Exception {
        return send(HttpRequest.newBuilder(URI.create(API + path))
                .header("Authorization", "Bearer " + token)
                .header("Content-Type", "application/json")
                .GET().build());
    }

    private String post(String token, String path, String body) throws Exception {
        return send(HttpRequest.newBuilder(URI.create(API + path))
                .header("Authorization", "Bearer " + token)
                .header("Content-Type", "application/json")
                .POST(HttpRequest.BodyPublishers.ofString(body)).build());
    }

    private String put(String token, String path, String body) throws Exception {
        return send(HttpRequest.newBuilder(URI.create(API + path))
                .header("Authorization", "Bearer " + token)
                .header("Content-Type", "application/json")
                .PUT(HttpRequest.BodyPublishers.ofString(body)).build());
    }

    private String delete(String token, String path) throws Exception {
        return send(HttpRequest.newBuilder(URI.create(API + path))
                .header("Authorization", "Bearer " + token)
                .header("Content-Type", "application/json")
                .DELETE().build());
    }

    private String patch(String token, String path, String body) throws Exception {
        return send(HttpRequest.newBuilder(URI.create(API + path))
                .header("Authorization", "Bearer " + token)
                .header("Content-Type", "application/json")
                .method("PATCH", HttpRequest.BodyPublishers.ofString(body)).build());
    }

    private String send(HttpRequest req) throws Exception {
        HttpResponse<String> res = http.send(req, HttpResponse.BodyHandlers.ofString());
        return res.body();
    }

    /** Pull id/type/name/content/priority for every CF record. Uses Jackson
     *  because the prior hand-rolled brace-matcher mis-counted depth when
     *  record `content` itself contained quoted braces / inner double-quotes
     *  (a DKIM TXT split into multiple "..." "..." strings was the trigger):
     *  only the first record would be returned and duplicate-DKIM cleanup
     *  silently no-op'd. */
    private List<Map<String, String>> parseRecords(String body) {
        List<Map<String, String>> out = new ArrayList<>();
        try {
            com.fasterxml.jackson.databind.JsonNode root =
                    new com.fasterxml.jackson.databind.ObjectMapper().readTree(body);
            com.fasterxml.jackson.databind.JsonNode result = root.get("result");
            if (result == null || !result.isArray()) return out;
            for (com.fasterxml.jackson.databind.JsonNode r : result) {
                Map<String, String> m = new LinkedHashMap<>();
                for (String key : new String[] {"id", "type", "name", "content", "priority"}) {
                    com.fasterxml.jackson.databind.JsonNode v = r.get(key);
                    if (v != null && !v.isNull()) m.put(key, v.asText());
                }
                out.add(m);
            }
        } catch (Exception e) {
            LOG.warnf("CF response parse failed: %s", e.getMessage());
        }
        return out;
    }

    private static String extract(String s, String regex) {
        Matcher m = Pattern.compile(regex).matcher(s);
        if (m.find()) {
            // For quoted captures, return the quoted group; otherwise the numeric group.
            for (int i = m.groupCount(); i >= 1; i--) {
                String g = m.group(i);
                if (g != null) return g;
            }
        }
        return null;
    }

    private static String esc(String s) {
        return s == null ? "" : s.replace("\\", "\\\\").replace("\"", "\\\"");
    }
}
