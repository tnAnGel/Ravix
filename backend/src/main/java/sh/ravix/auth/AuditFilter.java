package sh.ravix.auth;

import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;
import jakarta.ws.rs.container.ContainerRequestContext;
import jakarta.ws.rs.container.ContainerResponseContext;
import jakarta.ws.rs.container.ContainerResponseFilter;
import jakarta.ws.rs.ext.Provider;

/**
 * Records every state-changing admin API call (POST/PUT/PATCH/DELETE) into the
 * audit log, with the acting admin, source IP and resulting HTTP status.
 */
@Provider
@ApplicationScoped
public class AuditFilter implements ContainerResponseFilter {

    @Inject
    CurrentUser currentUser;

    @Inject
    AuditWriter writer;

    /**
     * Note the absence of {@code @Transactional} here: the transaction belongs to
     * {@link AuditWriter}, so it opens only for requests we actually record.
     * Opening it for every response also caught CORS preflight, which runs on the
     * IO thread where a JTA transaction is not allowed.
     */
    @Override
    public void filter(ContainerRequestContext req, ContainerResponseContext res) {
        String method = req.getMethod();
        if (!(method.equals("POST") || method.equals("PUT")
                || method.equals("PATCH") || method.equals("DELETE"))) {
            return;
        }
        String path = req.getUriInfo().getPath();
        // Skip noisy / non-mutating endpoints.
        if (path.startsWith("auth/login") || path.startsWith("auth/logout")
                || path.startsWith("auth/status")) {
            return;
        }

        writer.write(
                currentUser != null && currentUser.user != null ? currentUser.user.email : null,
                method + " /api/" + path,
                req.getUriInfo().getPathParameters().isEmpty()
                        ? null : req.getUriInfo().getPathParameters().toString(),
                clientIp(req),
                res.getStatus());
    }

    private String clientIp(ContainerRequestContext req) {
        String xff = req.getHeaderString("X-Forwarded-For");
        if (xff != null && !xff.isBlank()) {
            return xff.split(",")[0].trim();
        }
        String real = req.getHeaderString("X-Real-IP");
        return real != null ? real : "";
    }
}
