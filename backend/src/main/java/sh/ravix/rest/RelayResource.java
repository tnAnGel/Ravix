package sh.ravix.rest;

import jakarta.inject.Inject;
import jakarta.transaction.Transactional;
import jakarta.ws.rs.Consumes;
import jakarta.ws.rs.DELETE;
import jakarta.ws.rs.GET;
import jakarta.ws.rs.POST;
import jakarta.ws.rs.PUT;
import jakarta.ws.rs.Path;
import jakarta.ws.rs.Produces;
import jakarta.ws.rs.core.MediaType;
import jakarta.ws.rs.core.Response;
import java.util.Map;
import sh.ravix.platform.RelayService;

/** Outbound SMTP relay configuration. */
@Path("/api/relay")
@Produces(MediaType.APPLICATION_JSON)
@Consumes(MediaType.APPLICATION_JSON)
public class RelayResource {

    @Inject
    RelayService relay;

    public record RelayBody(String host, Integer port, String user, String password) {}
    public record TestBody(String to, String from) {}

    @GET
    public RelayService.Config get() {
        return relay.current();
    }

    @PUT
    @Transactional
    public RelayService.Config save(RelayBody body) {
        return relay.saveAndApply(
                body == null ? null : body.host(),
                body == null || body.port() == null ? 587 : body.port(),
                body == null ? null : body.user(),
                body == null ? null : body.password());
    }

    @DELETE
    @Transactional
    public Response clear() {
        relay.clear();
        return Response.noContent().build();
    }

    @POST
    @Path("/test")
    public Response test(TestBody body) {
        if (body == null || body.to() == null || body.to().isBlank()) {
            return Response.status(Response.Status.BAD_REQUEST)
                    .entity(Map.of("error", "to_required")).build();
        }
        boolean ok = relay.sendTest(body.to(), body.from());
        return Response.ok(Map.of("ok", ok)).build();
    }
}
