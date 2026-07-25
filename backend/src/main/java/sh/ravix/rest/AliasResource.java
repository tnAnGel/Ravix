package sh.ravix.rest;

import sh.ravix.auth.OrgFiltered;

import io.quarkus.panache.common.Sort;
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
import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.List;
import sh.ravix.entity.Alias;
import sh.ravix.entity.Event;
import sh.ravix.platform.ProvisioningService;
import sh.ravix.util.Ids;

@Path("/api/aliases")
@Produces(MediaType.APPLICATION_JSON)
@Consumes(MediaType.APPLICATION_JSON)
@Transactional
@OrgFiltered
public class AliasResource {

    @jakarta.inject.Inject
    ProvisioningService provisioning;

    public record CreateAliasRequest(
            String source, String domain, List<String> destinations, boolean catchAll) {}

    @GET
    public List<Alias> list() {
        return Alias.listAll(Sort.by("source"));
    }

    @POST
    public Response create(CreateAliasRequest req) {
        Alias a = new Alias();
        a.id = Ids.generate("al");
        a.source = req.catchAll() ? "*@" + req.domain() : req.source();
        a.domain = req.domain();
        a.status = "active";
        a.catchAll = req.catchAll();
        a.createdAt = OffsetDateTime.now();
        a.destinations = new ArrayList<>(
                req.destinations() == null ? List.of() : req.destinations());
        a.persist();
        provisioning.syncMailData();
        Event.persist(DomainResource.event("domain", "info", "Alias " + a.source + " created"));
        return Response.status(Response.Status.CREATED).entity(a).build();
    }

    @POST
    @Path("/{id}/toggle")
    public Alias toggle(@PathParam("id") String id) {
        Alias a = find(id);
        a.status = "active".equals(a.status) ? "disabled" : "active";
        provisioning.syncMailData();
        return a;
    }

    @DELETE
    @Path("/{id}")
    public Response delete(@PathParam("id") String id) {
        Alias a = find(id);
        a.delete();
        provisioning.syncMailData();
        Event.persist(DomainResource.event("domain", "warning", "Alias " + a.source + " deleted"));
        return Response.noContent().build();
    }

    private Alias find(String id) {
        Alias a = Alias.<Alias>find("id", id).firstResult();
        if (a == null) {
            throw new NotFoundException("Alias not found: " + id);
        }
        return a;
    }
}
