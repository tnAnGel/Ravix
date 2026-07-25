package sh.ravix.rest;

import sh.ravix.auth.OrgFiltered;

import io.quarkus.panache.common.Sort;
import jakarta.inject.Inject;
import jakarta.transaction.Transactional;
import jakarta.ws.rs.Consumes;
import jakarta.ws.rs.DELETE;
import jakarta.ws.rs.GET;
import jakarta.ws.rs.NotFoundException;
import jakarta.ws.rs.POST;
import jakarta.ws.rs.Path;
import jakarta.ws.rs.PathParam;
import jakarta.ws.rs.Produces;
import jakarta.ws.rs.core.MediaType;
import jakarta.ws.rs.core.Response;
import java.util.List;
import java.util.Map;
import sh.ravix.entity.ApiKey;
import sh.ravix.entity.Event;
import sh.ravix.platform.ApiKeyService;

/** Management of transactional-API keys (panel-session authenticated). */
@Path("/api/api-keys")
@Produces(MediaType.APPLICATION_JSON)
@Consumes(MediaType.APPLICATION_JSON)
@Transactional
@OrgFiltered
public class ApiKeyResource {

    @Inject ApiKeyService keys;

    public record CreateBody(String name, String scopes) {}

    @GET
    public List<ApiKey> list() {
        return ApiKey.listAll(Sort.by("createdAt").descending());
    }

    /** Create a key — the plaintext is returned ONCE here and never again. */
    @POST
    public Response create(CreateBody b) {
        ApiKeyService.Issued issued = keys.create(
                b == null ? null : b.name(), b == null ? null : b.scopes());
        Event.persist(DomainResource.event("system", "info",
                "API key created: " + issued.row().name));
        return Response.status(Response.Status.CREATED)
                .entity(Map.of("key", issued.row(), "secret", issued.plaintext()))
                .build();
    }

    @POST
    @Path("/{id}/toggle")
    public ApiKey toggle(@PathParam("id") String id) {
        ApiKey k = find(id);
        k.enabled = !k.enabled;
        return k;
    }

    @DELETE
    @Path("/{id}")
    public Response delete(@PathParam("id") String id) {
        ApiKey k = find(id);
        Event.persist(DomainResource.event("system", "warning", "API key revoked: " + k.name));
        k.delete();
        return Response.noContent().build();
    }

    private ApiKey find(String id) {
        ApiKey k = ApiKey.<ApiKey>find("id", id).firstResult();
        if (k == null) throw new NotFoundException("key not found");
        return k;
    }
}
