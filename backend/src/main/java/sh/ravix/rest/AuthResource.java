package sh.ravix.rest;

import jakarta.inject.Inject;
import jakarta.ws.rs.Consumes;
import jakarta.ws.rs.GET;
import jakarta.ws.rs.HeaderParam;
import jakarta.ws.rs.POST;
import jakarta.ws.rs.Path;
import jakarta.ws.rs.Produces;
import jakarta.ws.rs.core.Context;
import jakarta.ws.rs.core.MediaType;
import jakarta.ws.rs.core.Response;
import java.util.LinkedHashMap;
import java.util.Map;
import sh.ravix.auth.AuthService;
import sh.ravix.auth.CurrentUser;
import sh.ravix.entity.AdminUser;
import sh.ravix.entity.AppSetting;

/** Real authentication: login issues a session token; /me returns the caller. */
@Path("/api/auth")
@Produces(MediaType.APPLICATION_JSON)
@Consumes(MediaType.APPLICATION_JSON)
public class AuthResource {

    @Inject
    AuthService authService;

    @Inject
    CurrentUser currentUser;

    @Inject
    sh.ravix.platform.PlatformService platform;

    @Inject
    sh.ravix.auth.TotpService totp;

    @Inject
    sh.ravix.auth.LoginRateLimiter rateLimiter;

    @Context
    jakarta.ws.rs.core.HttpHeaders httpHeaders;

    @Context
    jakarta.ws.rs.core.UriInfo uriInfo;

    public record LoginRequest(String username, String password, String code) {}

    @POST
    @Path("/login")
    public Response login(LoginRequest req) {
        String who = req == null ? null : req.username();
        String ip = clientIp();

        // Throttle before verifying the password, so a locked-out key costs no
        // BCrypt work and cannot be used as a CPU amplifier.
        long retryAfter = rateLimiter.retryAfter(who, ip);
        if (retryAfter > 0) {
            audit(who, "login", 429, "rate-limited sign-in attempt from " + ip);
            return Response.status(429)
                    .header("Retry-After", retryAfter)
                    .entity(Map.of("error", "too_many_attempts", "retryAfter", retryAfter))
                    .build();
        }

        AuthService.LoginOutcome outcome = authService.login(
                who,
                req == null ? null : req.password(),
                req == null ? null : req.code());
        switch (outcome.result()) {
            case OK -> {
                rateLimiter.recordSuccess(who, ip);
                AdminUser user = authService.resolve(outcome.token()).orElse(null);
                audit(who, "login", 200, "successful sign-in");
                Map<String, Object> body = new LinkedHashMap<>();
                // The session also rides in an HttpOnly cookie (below), which is
                // what the panel actually uses. The token stays in the body for
                // non-browser clients and for backwards compatibility.
                body.put("token", outcome.token());
                body.put("user", user == null ? null : userView(user));
                return Response.ok(body)
                        .header("Set-Cookie", sessionCookie(outcome.token()))
                        .build();
            }
            case TWO_FACTOR_REQUIRED -> {
                // Not a credential failure — do not count it against the limiter,
                // or a user fumbling their TOTP code would lock themselves out.
                return Response.status(Response.Status.UNAUTHORIZED)
                        .entity(Map.of("error", "2fa_required")).build();
            }
            default -> {
                rateLimiter.recordFailure(who, ip);
                audit(who, "login", 401, "failed sign-in");
                return Response.status(Response.Status.UNAUTHORIZED)
                        .entity(Map.of("error", "invalid_credentials")).build();
            }
        }
    }

    /**
     * The session cookie the browser uses.
     *
     * {@code HttpOnly} keeps it out of reach of any script on the page, so an XSS
     * bug can no longer walk off with a live admin session. {@code SameSite=Strict}
     * is what stands in for a CSRF token: the browser will not attach this cookie
     * to a request originating from another site.
     */
    private String sessionCookie(String token) {
        return cookie(token, 60 * 60 * 24 * 30);
    }

    private String clearedSessionCookie() {
        return cookie("", 0);
    }

    private String cookie(String value, long maxAgeSeconds) {
        StringBuilder sb = new StringBuilder();
        sb.append(SESSION_COOKIE).append('=').append(value)
          .append("; Path=/; HttpOnly; SameSite=Strict; Max-Age=").append(maxAgeSeconds);
        if (requestIsHttps()) sb.append("; Secure");
        return sb.toString();
    }

    /**
     * Nginx terminates TLS and proxies to loopback, so the request Quarkus sees is
     * plain HTTP. Trust {@code X-Forwarded-Proto} for the Secure flag, and fall
     * back to the request scheme when Ravix is reached directly.
     */
    private boolean requestIsHttps() {
        String fwd = httpHeaders == null ? null : httpHeaders.getHeaderString("X-Forwarded-Proto");
        if (fwd != null && !fwd.isBlank()) return fwd.trim().equalsIgnoreCase("https");
        return uriInfo != null && "https".equalsIgnoreCase(uriInfo.getRequestUri().getScheme());
    }

    private String clientIp() {
        if (httpHeaders == null) return null;
        // Nginx sets X-Real-IP / X-Forwarded-For; take the left-most entry.
        String real = httpHeaders.getHeaderString("X-Real-IP");
        if (real != null && !real.isBlank()) return real.trim();
        String fwd = httpHeaders.getHeaderString("X-Forwarded-For");
        if (fwd != null && !fwd.isBlank()) return fwd.split(",")[0].trim();
        return null;
    }

    public static final String SESSION_COOKIE = "ravix_session";

    @jakarta.transaction.Transactional
    void audit(String actor, String action, int status, String detail) {
        sh.ravix.entity.AuditLog log = new sh.ravix.entity.AuditLog();
        log.at = java.time.OffsetDateTime.now();
        log.actor = actor;
        log.action = action;
        log.status = status;
        log.detail = detail;
        log.persist();
    }

    @POST
    @Path("/logout")
    public Response logout(@HeaderParam("Authorization") String auth,
                           @jakarta.ws.rs.CookieParam(SESSION_COOKIE) String cookieToken) {
        // Kill whichever credential the caller presented — the panel sends the
        // cookie, scripted clients send the header.
        if (auth != null && auth.startsWith("Bearer ")) {
            authService.logout(auth.substring(7));
        }
        if (cookieToken != null && !cookieToken.isBlank()) {
            authService.logout(cookieToken);
        }
        return Response.noContent()
                .header("Set-Cookie", clearedSessionCookie())
                .build();
    }

    /** Authenticated caller (used by the topbar / route guard). */
    @GET
    @Path("/me")
    public Map<String, Object> me() {
        return userView(currentUser.user);
    }

    public record ChangePasswordRequest(String currentPassword, String newPassword) {}

    /** Change the signed-in admin's own password. */
    @POST
    @Path("/password")
    public Response changePassword(ChangePasswordRequest req) {
        boolean ok = req != null && authService.changePassword(
                currentUser.user.id, req.currentPassword(), req.newPassword());
        if (!ok) {
            return Response.status(Response.Status.BAD_REQUEST)
                    .entity(Map.of("error", "invalid_password")).build();
        }
        return Response.ok(Map.of("ok", true)).build();
    }

    // --- Two-factor (TOTP) -------------------------------------------------

    public record TwoFactorEnableRequest(String code) {}
    public record TwoFactorDisableRequest(String password) {}

    /** Begin 2FA enrolment for the signed-in admin: returns secret + otpauth URI. */
    @POST
    @Path("/2fa/setup")
    public Response twoFactorSetup() {
        String secret = authService.beginTwoFactorSetup(currentUser.user.id);
        if (secret == null) {
            return Response.status(Response.Status.BAD_REQUEST).build();
        }
        String uri = totp.otpauthUri("Ravix", currentUser.user.email, secret);
        return Response.ok(Map.of("secret", secret, "otpauthUri", uri)).build();
    }

    /** Confirm enrolment with a code from the authenticator app. */
    @POST
    @Path("/2fa/enable")
    public Response twoFactorEnable(TwoFactorEnableRequest req) {
        boolean ok = req != null && authService.enableTwoFactor(currentUser.user.id, req.code());
        return ok ? Response.ok(Map.of("ok", true)).build()
                : Response.status(Response.Status.BAD_REQUEST)
                        .entity(Map.of("error", "invalid_code")).build();
    }

    /** Turn off 2FA after re-entering the account password. */
    @POST
    @Path("/2fa/disable")
    public Response twoFactorDisable(TwoFactorDisableRequest req) {
        boolean ok = req != null && authService.disableTwoFactor(currentUser.user.id, req.password());
        return ok ? Response.ok(Map.of("ok", true)).build()
                : Response.status(Response.Status.BAD_REQUEST)
                        .entity(Map.of("error", "invalid_password")).build();
    }

    /** Public liveness probe for the login screen. */
    @GET
    @Path("/status")
    public Map<String, Object> status() {
        AppSetting hostname = AppSetting.findById("hostname");
        AppSetting version = AppSetting.findById("version");
        String host = hostname != null && hostname.value != null && !hostname.value.isBlank()
                ? hostname.value : platform.hostname();
        // "configured" = the operator has done at least one intentional thing.
        // We surface this so the login screen can hide the "First-time setup"
        // link on a panel that's already in use (otherwise anyone hitting
        // /login could re-walk the wizard and overwrite admin creds / DNS).
        boolean configured =
                sh.ravix.entity.Domain.count() > 0
                || (hostname != null && hostname.value != null
                    && !hostname.value.isBlank()
                    && !hostname.value.equals(platform.hostname()));
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("online", true);
        out.put("hostname", host);
        out.put("version", version == null ? "0.1.0" : version.value);
        out.put("configured", configured);
        return out;
    }

    static Map<String, Object> userView(AdminUser user) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("id", user.id);
        m.put("email", user.email);
        m.put("role", user.role);
        m.put("twoFactor", user.twoFactor);
        m.put("superadmin", user.superadmin);
        m.put("orgs", orgsFor(user));
        return m;
    }

    /** Orgs the user may act in: their memberships, plus — for a super-admin —
     *  every organization (so they can switch into any tenant). */
    static java.util.List<Map<String, Object>> orgsFor(AdminUser user) {
        java.util.LinkedHashMap<String, Map<String, Object>> byId = new LinkedHashMap<>();
        for (sh.ravix.entity.OrgMembership mb :
                sh.ravix.entity.OrgMembership.<sh.ravix.entity.OrgMembership>list("adminUserId", user.id)) {
            sh.ravix.entity.Organization o = sh.ravix.entity.Organization.findById(mb.orgId);
            Map<String, Object> e = new LinkedHashMap<>();
            e.put("id", mb.orgId);
            e.put("name", o == null ? mb.orgId : o.name);
            e.put("role", mb.role);
            byId.put(mb.orgId, e);
        }
        if (user.superadmin) {
            for (sh.ravix.entity.Organization o :
                    sh.ravix.entity.Organization.<sh.ravix.entity.Organization>listAll()) {
                byId.computeIfAbsent(o.id, k -> {
                    Map<String, Object> e = new LinkedHashMap<>();
                    e.put("id", o.id);
                    e.put("name", o.name);
                    e.put("role", "superadmin");
                    return e;
                });
            }
        }
        return new java.util.ArrayList<>(byId.values());
    }
}
