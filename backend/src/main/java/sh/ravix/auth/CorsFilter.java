package sh.ravix.auth;

import jakarta.annotation.Priority;
import jakarta.ws.rs.container.ContainerRequestContext;
import jakarta.ws.rs.container.ContainerRequestFilter;
import jakarta.ws.rs.container.ContainerResponseContext;
import jakarta.ws.rs.container.ContainerResponseFilter;
import jakarta.ws.rs.core.Response;
import jakarta.ws.rs.ext.Provider;
import java.util.Arrays;
import java.util.LinkedHashSet;
import java.util.Set;
import org.eclipse.microprofile.config.inject.ConfigProperty;

/**
 * CORS for the panel API, replacing the built-in Quarkus filter.
 *
 * Why hand-rolled: in production the panel and the API share an origin — Nginx
 * serves the bundle and proxies {@code /api} — but that origin is different on
 * every install (an IP here, a hostname there, a non-standard port). A static
 * allow-list cannot know it, and configuring the wrong one locks the operator
 * out of their own panel. A wildcard is the other extreme and hands every site
 * on the internet a credentialed channel to the API.
 *
 * So the rule is: <b>same-origin is always allowed</b> (that is the production
 * shape and involves no trust decision), and genuine cross-origin callers must
 * be named in {@code ravix.cors.origins} — which by default contains only the
 * Vite dev server.
 *
 * A disallowed origin simply gets no CORS headers back, which is what makes the
 * browser block it. We deliberately do not reject the request outright: CORS is
 * a browser control, and 403-ing here would break non-browser clients that
 * happen to send an Origin header. What actually protects state-changing
 * requests from another site is the {@code SameSite=Strict} session cookie —
 * the browser will not attach it cross-site at all.
 */
@Provider
@Priority(jakarta.ws.rs.Priorities.AUTHENTICATION - 100)
public class CorsFilter implements ContainerRequestFilter, ContainerResponseFilter {

    static final String ALLOWED_METHODS = "GET,POST,PUT,PATCH,DELETE,OPTIONS";
    static final String ALLOWED_HEADERS = "accept,content-type,authorization,x-ravix-org";

    /** Extra origins allowed to call the API cross-origin, comma-separated. */
    @ConfigProperty(name = "ravix.cors.origins",
            defaultValue = "http://localhost:5173,http://127.0.0.1:5173")
    String configuredOrigins;

    @Override
    public void filter(ContainerRequestContext ctx) {
        // Answer preflight here — it must never reach auth, which would 401 it.
        if ("OPTIONS".equalsIgnoreCase(ctx.getMethod())
                && ctx.getHeaderString("Access-Control-Request-Method") != null) {
            Response.ResponseBuilder pre = Response.noContent();
            applyHeaders(ctx, pre::header);
            ctx.abortWith(pre.build());
        }
    }

    @Override
    public void filter(ContainerRequestContext req, ContainerResponseContext res) {
        applyHeaders(req, (k, v) -> res.getHeaders().putSingle(k, v));
    }

    private interface HeaderSink { void put(String name, Object value); }

    private void applyHeaders(ContainerRequestContext ctx, HeaderSink sink) {
        String origin = ctx.getHeaderString("Origin");
        if (origin == null || origin.isBlank()) return;   // not a CORS request
        if (!isAllowed(ctx, origin)) return;              // browser will block it

        sink.put("Access-Control-Allow-Origin", origin);
        // Credentials ride in the session cookie, so this must be explicit — and
        // it is why Allow-Origin must echo one origin rather than "*".
        sink.put("Access-Control-Allow-Credentials", "true");
        sink.put("Access-Control-Allow-Methods", ALLOWED_METHODS);
        sink.put("Access-Control-Allow-Headers", ALLOWED_HEADERS);
        sink.put("Access-Control-Max-Age", "600");
        sink.put("Vary", "Origin");
    }

    private boolean isAllowed(ContainerRequestContext ctx, String origin) {
        return origin.equalsIgnoreCase(selfOrigin(ctx)) || allowList().contains(origin.toLowerCase());
    }

    /**
     * The origin the client used to reach us. Nginx terminates TLS and proxies to
     * loopback, so the scheme and host Quarkus sees are not the client's — the
     * forwarded headers are, and they are set by our own reverse proxy.
     */
    private String selfOrigin(ContainerRequestContext ctx) {
        String host = header(ctx, "X-Forwarded-Host");
        if (host == null) host = header(ctx, "Host");
        if (host == null) return null;
        // X-Forwarded-Host may carry a proxy chain; the client-facing one is first.
        int comma = host.indexOf(',');
        if (comma >= 0) host = host.substring(0, comma).trim();

        String scheme = header(ctx, "X-Forwarded-Proto");
        if (scheme == null) scheme = ctx.getUriInfo().getRequestUri().getScheme();
        if (scheme == null) return null;
        int c = scheme.indexOf(',');
        if (c >= 0) scheme = scheme.substring(0, c).trim();

        return scheme.toLowerCase() + "://" + host.toLowerCase();
    }

    private static String header(ContainerRequestContext ctx, String name) {
        String v = ctx.getHeaderString(name);
        return (v == null || v.isBlank()) ? null : v.trim();
    }

    private Set<String> allowList() {
        Set<String> out = new LinkedHashSet<>();
        if (configuredOrigins != null && !configuredOrigins.isBlank()) {
            Arrays.stream(configuredOrigins.split(","))
                    .map(String::trim)
                    .filter(s -> !s.isEmpty())
                    .map(String::toLowerCase)
                    .forEach(out::add);
        }
        return out;
    }
}
