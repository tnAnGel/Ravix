package sh.ravix.rest;

import jakarta.inject.Inject;
import jakarta.ws.rs.Consumes;
import jakarta.ws.rs.DELETE;
import jakarta.ws.rs.GET;
import jakarta.ws.rs.POST;
import jakarta.ws.rs.PUT;
import jakarta.ws.rs.Path;
import jakarta.ws.rs.Produces;
import jakarta.ws.rs.core.MediaType;
import jakarta.ws.rs.core.Response;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import sh.ravix.platform.CloudflareService;
import sh.ravix.platform.CloudflareService.ApplyResult;
import sh.ravix.platform.CloudflareService.Plan;
import sh.ravix.platform.CloudflareService.TokenStatus;
import sh.ravix.platform.CloudflareService.Zone;

/** Cloudflare integration: token, zones, DNS plan & apply. */
@Path("/api/cloudflare")
@Produces(MediaType.APPLICATION_JSON)
@Consumes(MediaType.APPLICATION_JSON)
public class CloudflareResource {

    @Inject
    CloudflareService cf;

    public record TokenBody(String token) {}
    public record PlanBody(String zoneId, String hostname, String ip, String ipv6) {}

    /** Whether a token is on file (does NOT return the token itself). */
    @GET
    @Path("/status")
    public Map<String, Object> status() {
        String t = cf.token();
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("configured", t != null && !t.isBlank());
        if (m.get("configured") == Boolean.TRUE) {
            TokenStatus s = cf.verifyToken(t);
            m.put("valid", s.valid());
            m.put("tokenStatus", s.status());
        }
        return m;
    }

    /** Save a token (verified first; refuses if it doesn't work). */
    @PUT
    @Path("/token")
    public Response saveToken(TokenBody body) {
        if (body == null || body.token() == null || body.token().isBlank()) {
            return Response.status(Response.Status.BAD_REQUEST)
                    .entity(Map.of("error", "token_required")).build();
        }
        TokenStatus s = cf.verifyToken(body.token());
        // Only refuse a token Cloudflare actively reports as invalid. If we
        // merely couldn't verify it right now (rate-limit, or no egress from
        // this host to api.cloudflare.com) we still save it and let the
        // startup/hourly sync confirm later — otherwise a transient network
        // blip or CF throttle would block setup entirely.
        if (!s.valid() && "invalid".equals(s.status())) {
            return Response.status(Response.Status.BAD_REQUEST)
                    .entity(Map.of("error", "invalid_token",
                            "detail", "Cloudflare rejected this token. Check it has Zone:DNS:Edit "
                                    + "permission and hasn't expired.")).build();
        }
        cf.saveToken(body.token());
        if (s.valid()) {
            return Response.ok(Map.of("valid", true, "status", s.status())).build();
        }
        // Saved, but verification was inconclusive — tell the operator why.
        String why = s.status() != null && s.status().startsWith("unreachable")
                ? "Token saved, but this server could not reach api.cloudflare.com to verify it "
                  + "(check the server's outbound internet/DNS). It will be verified automatically."
                : "Token saved, but Cloudflare is rate-limiting verification right now. "
                  + "It will be verified automatically in a moment.";
        return Response.ok(Map.of("valid", false, "status", s.status(), "warning", why)).build();
    }

    @DELETE
    @Path("/token")
    public Response clearToken() {
        cf.clearToken();
        return Response.noContent().build();
    }

    /** Zones visible to the saved token. */
    @GET
    @Path("/zones")
    public Response zones() {
        try {
            List<Zone> z = cf.listZones();
            return Response.ok(z).build();
        } catch (Exception e) {
            return Response.status(Response.Status.BAD_REQUEST)
                    .entity(Map.of("error", "cloudflare_error", "detail", e.getMessage())).build();
        }
    }

    /** Preview what would change in the zone. */
    @POST
    @Path("/plan")
    public Response plan(PlanBody body) {
        if (body == null) {
            return Response.status(Response.Status.BAD_REQUEST)
                    .entity(Map.of("error", "body_required")).build();
        }
        try {
            Plan p = cf.plan(body.zoneId(), body.hostname(), body.ip(), body.ipv6());
            return Response.ok(p).build();
        } catch (Exception e) {
            return Response.status(Response.Status.BAD_REQUEST)
                    .entity(Map.of("error", "plan_failed", "detail", e.getMessage())).build();
        }
    }

    /** Apply the plan (creates/updates only the records Ravix owns). */
    @POST
    @Path("/apply")
    public Response apply(PlanBody body) {
        if (body == null) {
            return Response.status(Response.Status.BAD_REQUEST)
                    .entity(Map.of("error", "body_required")).build();
        }
        try {
            List<ApplyResult> results = cf.apply(body.zoneId(), body.hostname(), body.ip(), body.ipv6());
            boolean allOk = results.stream().allMatch(ApplyResult::ok);
            Map<String, Object> out = new LinkedHashMap<>();
            out.put("ok", allOk);
            out.put("results", results);
            return Response.ok(out).build();
        } catch (Exception e) {
            return Response.status(Response.Status.BAD_REQUEST)
                    .entity(Map.of("error", "apply_failed", "detail", e.getMessage())).build();
        }
    }

    /** Re-apply the current DNS plan for every managed domain right now.
     *  Same effect as the hourly tick / startup tick, just synchronous from
     *  the UI — used by the "Push to Cloudflare" button on /tls-security. */
    @POST
    @Path("/sync-all")
    public Response syncAll() {
        try {
            int n = cf.autoSyncAll();
            return Response.ok(Map.of("ok", true, "syncedDomains", n)).build();
        } catch (Exception e) {
            return Response.status(Response.Status.BAD_GATEWAY)
                    .entity(Map.of("error", "sync_failed", "detail", e.getMessage()))
                    .build();
        }
    }

    /** Best-effort guess at this server's public IPv4 and IPv6 (for the wizard's defaults).
     *  Both are optional in the response — empty strings if the lookup failed. */
    @GET
    @Path("/public-ip")
    public Response publicIp() {
        return Response.ok(Map.of(
                "ip",   probe("https://api.ipify.org"),
                "ipv6", probe("https://api6.ipify.org")
        )).build();
    }

    private static String probe(String url) {
        try {
            java.net.http.HttpClient hc = java.net.http.HttpClient.newHttpClient();
            java.net.http.HttpResponse<String> r = hc.send(
                    java.net.http.HttpRequest.newBuilder(java.net.URI.create(url))
                            .timeout(java.time.Duration.ofSeconds(4)).GET().build(),
                    java.net.http.HttpResponse.BodyHandlers.ofString());
            String body = r.body().trim();
            // Validate it actually looks like an IP — some hot-spot captive
            // portals return HTML on these endpoints.
            return body.matches("[0-9a-fA-F:.]+") ? body : "";
        } catch (Exception e) {
            return "";
        }
    }
}
