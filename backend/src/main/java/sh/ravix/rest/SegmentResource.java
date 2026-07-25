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
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import sh.ravix.entity.Mailbox;
import sh.ravix.entity.Segment;
import sh.ravix.util.Ids;

/** Reusable audience segments resolved against mailboxes. */
@Path("/api/segments")
@Produces(MediaType.APPLICATION_JSON)
@Consumes(MediaType.APPLICATION_JSON)
@Transactional
@OrgFiltered
public class SegmentResource {

    public record CreateSegmentRequest(String name, String type, String filterValue) {}

    @GET
    public List<Map<String, Object>> list() {
        return Segment.<Segment>listAll(Sort.by("name")).stream()
                .map(s -> {
                    Map<String, Object> m = new LinkedHashMap<>();
                    m.put("id", s.id);
                    m.put("name", s.name);
                    m.put("type", s.type);
                    m.put("filterValue", s.filterValue);
                    m.put("count", resolveCount(s.type, s.filterValue));
                    m.put("createdAt", s.createdAt);
                    return m;
                })
                .toList();
    }

    @POST
    public Response create(CreateSegmentRequest req) {
        if (req == null || req.name() == null || req.name().isBlank()) {
            return Response.status(Response.Status.BAD_REQUEST)
                    .entity(Map.of("error", "name_required")).build();
        }
        Segment s = new Segment();
        s.id = Ids.generate("seg");
        s.name = req.name().trim();
        s.type = req.type() == null ? "all" : req.type();
        s.filterValue = req.filterValue();
        s.createdAt = OffsetDateTime.now();
        s.persist();
        return Response.status(Response.Status.CREATED).entity(s).build();
    }

    @DELETE
    @Path("/{id}")
    public Response delete(@PathParam("id") String id) {
        Segment s = Segment.<Segment>find("id", id).firstResult();
        if (s == null) throw new NotFoundException();
        s.delete();
        return Response.noContent().build();
    }

    private long resolveCount(String type, String filterValue) {
        return switch (type == null ? "all" : type) {
            case "domain" -> Mailbox.count("domain = ?1 and status = 'active'", filterValue);
            case "status" -> Mailbox.count("status", filterValue);
            default -> Mailbox.count("status", "active");
        };
    }
}
