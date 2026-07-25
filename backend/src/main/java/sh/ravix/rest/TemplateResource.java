package sh.ravix.rest;

import sh.ravix.auth.OrgFiltered;

import io.quarkus.panache.common.Sort;
import jakarta.transaction.Transactional;
import jakarta.ws.rs.Consumes;
import jakarta.ws.rs.DELETE;
import jakarta.ws.rs.GET;
import jakarta.ws.rs.NotFoundException;
import jakarta.ws.rs.POST;
import jakarta.ws.rs.PUT;
import jakarta.ws.rs.Path;
import jakarta.ws.rs.PathParam;
import jakarta.ws.rs.Produces;
import jakarta.ws.rs.core.MediaType;
import jakarta.ws.rs.core.Response;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.Map;
import sh.ravix.entity.EmailTemplate;
import sh.ravix.util.Ids;

/** Reusable subject + body templates for campaigns. */
@Path("/api/templates")
@Produces(MediaType.APPLICATION_JSON)
@Consumes(MediaType.APPLICATION_JSON)
@Transactional
@OrgFiltered
public class TemplateResource {

    public record TemplateRequest(String name, String subject, String body) {}

    @GET
    public List<EmailTemplate> list() {
        return EmailTemplate.listAll(Sort.by("updatedAt").descending());
    }

    @POST
    public Response create(TemplateRequest req) {
        if (req == null || req.name() == null || req.name().isBlank()) {
            return Response.status(Response.Status.BAD_REQUEST)
                    .entity(Map.of("error", "name_required")).build();
        }
        EmailTemplate t = new EmailTemplate();
        t.id = Ids.generate("tpl");
        t.name = req.name().trim();
        t.subject = req.subject() == null ? "" : req.subject();
        t.body = req.body() == null ? "" : req.body();
        t.updatedAt = OffsetDateTime.now();
        t.persist();
        return Response.status(Response.Status.CREATED).entity(t).build();
    }

    @PUT
    @Path("/{id}")
    public EmailTemplate update(@PathParam("id") String id, TemplateRequest req) {
        EmailTemplate t = EmailTemplate.<EmailTemplate>find("id", id).firstResult();
        if (t == null) throw new NotFoundException();
        if (req.name() != null && !req.name().isBlank()) t.name = req.name().trim();
        if (req.subject() != null) t.subject = req.subject();
        if (req.body() != null) t.body = req.body();
        t.updatedAt = OffsetDateTime.now();
        return t;
    }

    @DELETE
    @Path("/{id}")
    public Response delete(@PathParam("id") String id) {
        EmailTemplate t = EmailTemplate.<EmailTemplate>find("id", id).firstResult();
        if (t == null) throw new NotFoundException();
        t.delete();
        return Response.noContent().build();
    }
}
