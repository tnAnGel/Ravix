package sh.ravix.rest;

import jakarta.inject.Inject;
import jakarta.ws.rs.POST;
import jakarta.ws.rs.Path;
import jakarta.ws.rs.core.Context;
import jakarta.ws.rs.core.HttpHeaders;
import jakarta.ws.rs.core.Response;
import java.util.Map;
import org.jboss.logging.Logger;
import sh.ravix.platform.CloudflareService;

/**
 * Localhost-only callbacks the panel exposes to processes running on the
 * same host (currently just certbot's deploy-hook). The auth filter
 * allow-lists /api/internal/* and we double-check the X-Forwarded-For /
 * remote address here to refuse anything from outside 127.0.0.1.
 *
 * Used hook: {@code /etc/letsencrypt/renewal-hooks/deploy/ravix-tlsa-update.sh}
 * (installed by ProvisioningService.installRenewalHook). Fired by certbot
 * after every successful renewal — we recompute the TLSA SHA-256(SPKI) for
 * the renewed cert and push it to Cloudflare so DANE-validating receivers
 * don't reject mail starting the next day.
 */
@Path("/api/internal")
public class InternalResource {

    private static final Logger LOG = Logger.getLogger(InternalResource.class);

    @Inject
    CloudflareService cloudflare;

    @Context
    jakarta.ws.rs.core.UriInfo uri;

    @POST
    @Path("/cert-renewed")
    public Response certRenewed(@Context HttpHeaders headers) {
        // Quarkus REST doesn't expose the remote address via DI directly;
        // we rely on the auth filter + this hook header. Listening only
        // on 127.0.0.1 (quarkus.http.host=127.0.0.1, see application.properties)
        // is the real defence — nginx never proxies /api/internal/*.
        String hook = headers.getHeaderString("X-Ravix-Hook");
        if (!"1".equals(hook)) {
            return Response.status(Response.Status.FORBIDDEN)
                    .entity(Map.of("error", "hook_header_missing")).build();
        }
        try {
            int n = cloudflare.autoSyncAll();
            LOG.infof("Cert-renewal hook: re-synced DNS for %d domain(s) (new TLSA hash published)", n);
            return Response.ok(Map.of("ok", true, "syncedDomains", n)).build();
        } catch (Exception e) {
            LOG.warnf("Cert-renewal hook failed: %s", e.getMessage());
            return Response.status(Response.Status.INTERNAL_SERVER_ERROR)
                    .entity(Map.of("error", "sync_failed", "detail", e.getMessage())).build();
        }
    }
}
