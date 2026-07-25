package sh.ravix.rest;

import jakarta.annotation.security.PermitAll;
import jakarta.ws.rs.GET;
import jakarta.ws.rs.Path;
import jakarta.ws.rs.PathParam;
import jakarta.ws.rs.Produces;
import jakarta.ws.rs.core.Response;
import sh.ravix.entity.Domain;

/**
 * Public, unauthenticated `.well-known` endpoints — currently the MTA-STS
 * policy file. Nginx is configured (by ProvisioningService) to forward
 * `https://mta-sts.<domain>/.well-known/mta-sts.txt` to this endpoint with
 * the `<domain>` part captured into the path, so receivers see exactly the
 * RFC-8461 layout while we keep generation server-side.
 *
 * The policy must match the published MX target — we just look the domain
 * up in the local DB and emit our standard policy.
 */
@Path("/api/well-known")
@PermitAll
public class WellKnownResource {

    @GET
    @Path("/mta-sts/{domain}")
    @Produces("text/plain; charset=utf-8")
    public Response mtaSts(@PathParam("domain") String domain) {
        if (domain == null || domain.isBlank()) {
            return Response.status(Response.Status.BAD_REQUEST).build();
        }
        // Trust only domains we manage — otherwise the panel could be made
        // to advertise a policy for someone else's mail.
        Domain d = Domain.find("name", domain).firstResult();
        if (d == null) {
            return Response.status(Response.Status.NOT_FOUND).build();
        }
        // Per RFC 8461 §3.2 the file is plain text with CRLF separators.
        // mx must equal the hostname our MX record actually publishes.
        String body = "version: STSv1\r\n"
                    + "mode: enforce\r\n"
                    + "mx: " + d.name + "\r\n"
                    + "max_age: 604800\r\n";
        return Response.ok(body).build();
    }
}
