package sh.ravix.auth;

import jakarta.annotation.Priority;
import jakarta.inject.Inject;
import jakarta.ws.rs.Priorities;
import jakarta.ws.rs.container.ContainerRequestContext;
import jakarta.ws.rs.container.ContainerRequestFilter;
import jakarta.ws.rs.core.MediaType;
import jakarta.ws.rs.core.Response;
import jakarta.ws.rs.ext.Provider;
import java.util.Map;
import java.util.Optional;
import sh.ravix.entity.AdminUser;
import sh.ravix.entity.OrgMembership;

/**
 * Requires a valid Bearer session token for all {@code /api/**} endpoints,
 * except the auth bootstrap and API docs.
 */
@Provider
@Priority(Priorities.AUTHENTICATION)
public class AuthFilter implements ContainerRequestFilter {

    @Inject
    AuthService authService;

    @Inject
    CurrentUser currentUser;

    @Inject
    TenantContext tenant;

    @Override
    public void filter(ContainerRequestContext ctx) {
        String path = ctx.getUriInfo().getPath();
        if (isPublic(path) || "OPTIONS".equalsIgnoreCase(ctx.getMethod())) {
            return;
        }

        // The panel authenticates with an HttpOnly cookie (unreadable from JS, so
        // XSS cannot lift a session); scripted clients and API keys still use the
        // Authorization header. The cookie wins when both are present.
        String token = null;
        jakarta.ws.rs.core.Cookie session =
                ctx.getCookies().get(sh.ravix.rest.AuthResource.SESSION_COOKIE);
        if (session != null && session.getValue() != null && !session.getValue().isBlank()) {
            token = session.getValue();
        }
        if (token == null) {
            String header = ctx.getHeaderString("Authorization");
            if (header != null && header.startsWith("Bearer ")) {
                token = header.substring(7);
            }
        }

        Optional<AdminUser> user = authService.resolve(token);
        if (user.isEmpty()) {
            ctx.abortWith(Response.status(Response.Status.UNAUTHORIZED)
                    .type(MediaType.APPLICATION_JSON)
                    .entity(Map.of("error", "unauthorized"))
                    .build());
            return;
        }
        currentUser.user = user.get();

        // --- Tenant scope (multi-tenant phases B/A) ------------------------
        resolveTenant(ctx, user.get());

        // --- Role enforcement (Phase C — Team RBAC) ------------------------
        String forbidden = authorize(ctx, user.get(), p(path));
        if (forbidden != null) {
            ctx.abortWith(Response.status(Response.Status.FORBIDDEN)
                    .type(MediaType.APPLICATION_JSON)
                    .entity(Map.of("error", "forbidden", "reason", forbidden))
                    .build());
        }
    }

    /**
     * Returns a non-null reason string when the caller's role forbids this
     * request, or null when allowed.
     *
     * Rules:
     *  - Safe methods (GET/HEAD) are always allowed.
     *  - viewer: read-only. The only mutations allowed are self-service auth
     *    actions (logout, own password, own 2FA).
     *  - admin: may mutate platform resources, but NOT manage the team
     *    (/api/admin-users) — that is owner-only.
     *  - owner: everything.
     */
    private String authorize(ContainerRequestContext ctx, AdminUser user, String p) {
        String method = ctx.getMethod();
        boolean safe = "GET".equalsIgnoreCase(method) || "HEAD".equalsIgnoreCase(method);
        if (safe) return null;

        // Self-service auth endpoints are allowed for any authenticated role.
        if (p.startsWith("/api/auth/logout")
                || p.startsWith("/api/auth/password")
                || p.startsWith("/api/auth/2fa")) {
            return null;
        }

        String role = Roles.roleOf(user);
        if (Roles.VIEWER.equals(role)) {
            return "read_only_role";
        }
        // admin may do everything except manage the team.
        if (Roles.ADMIN.equals(role) && p.startsWith("/api/admin-users")) {
            return "owner_only";
        }
        return null; // owner, or admin on a non-team resource
    }

    private static String p(String path) {
        return path.startsWith("/") ? path : "/" + path;
    }

    /**
     * Populate {@link TenantContext} and, when the request is scoped to a
     * single org, enable the Hibernate {@code orgFilter} on the request's
     * session so every tenant-scoped query is automatically filtered.
     *
     * Effective org resolution:
     *  - super-admin: acts globally unless an {@code X-Ravix-Org} header (or
     *    {@code ?org=}) selects a specific org.
     *  - regular member: the requested org if they belong to it, else their
     *    first/primary membership.
     */
    private void resolveTenant(ContainerRequestContext ctx, AdminUser user) {
        tenant.superadmin = user.superadmin;
        tenant.orgId = null;
        tenant.memberOrgIds.clear();

        for (OrgMembership m : OrgMembership.<OrgMembership>list("adminUserId", user.id)) {
            if (m.orgId != null) tenant.memberOrgIds.add(m.orgId);
        }

        String requested = ctx.getHeaderString("X-Ravix-Org");
        if (requested == null || requested.isBlank()) {
            requested = ctx.getUriInfo().getQueryParameters().getFirst("org");
        }
        requested = (requested == null || requested.isBlank()) ? null : requested.trim();

        if (user.superadmin) {
            // Global by default; act within a specific org only when asked.
            tenant.orgId = requested; // may be null (global)
        } else if (requested != null && tenant.memberOrgIds.contains(requested)) {
            tenant.orgId = requested;
        } else if (!tenant.memberOrgIds.isEmpty()) {
            tenant.orgId = tenant.memberOrgIds.iterator().next();
        }

        // NB: the Hibernate orgFilter is enabled by OrgFilterInterceptor (inside
        // the request transaction), NOT here — a JAX-RS filter runs on a
        // different session than the @Transactional resource method.
    }

    private boolean isPublic(String path) {
        // Path is relative to the application (no leading /api when using getPath()? )
        String p = path.startsWith("/") ? path : "/" + path;
        return p.startsWith("/api/auth/login")
                || p.startsWith("/api/auth/status")
                // Prometheus scrape endpoint — non-sensitive gauges; optionally
                // guarded by ravix.metrics.token inside the resource.
                || p.startsWith("/api/metrics")
                // Public open/click tracking — hit by mail clients, no session.
                || p.startsWith("/api/t/")
                || p.startsWith("/api/openapi")
                || p.startsWith("/api/swagger")
                // Public — receivers (Google, Microsoft) hit this URL to fetch
                // the MTA-STS / TLS-RPT policy file. No auth ever.
                || p.startsWith("/api/well-known/")
                // Localhost-only — certbot deploy-hook calls /cert-renewed
                // and the panel listens on 127.0.0.1, so anything reaching
                // this endpoint is already on-host. Hook itself sends an
                // X-Ravix-Hook: 1 header which the resource validates.
                || p.startsWith("/api/internal/")
                // Transactional send API — authenticates with its own API key
                // (Bearer), SendGrid-compatible, so the panel session filter
                // must not intercept it.
                || p.startsWith("/api/v3/")
                || p.equals("/api/auth/login")
                || p.contains("openapi")
                || p.contains("swagger");
    }
}
