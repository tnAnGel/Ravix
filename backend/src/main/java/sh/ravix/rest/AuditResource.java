package sh.ravix.rest;

import io.quarkus.panache.common.Page;
import io.quarkus.panache.common.Sort;
import jakarta.transaction.Transactional;
import jakarta.ws.rs.GET;
import jakarta.ws.rs.Path;
import jakarta.ws.rs.Produces;
import jakarta.ws.rs.QueryParam;
import jakarta.ws.rs.core.MediaType;
import java.util.List;
import sh.ravix.entity.AuditLog;

/** Read access to the admin audit log. */
@Path("/api/audit")
@Produces(MediaType.APPLICATION_JSON)
@Transactional
public class AuditResource {

    @GET
    public List<AuditLog> list(
            @QueryParam("actor") String actor,
            @QueryParam("limit") Integer limit) {
        int size = limit == null || limit <= 0 || limit > 500 ? 200 : limit;
        if (actor != null && !actor.isBlank()) {
            return AuditLog.find("actor", Sort.by("at").descending(), actor)
                    .page(Page.ofSize(size)).list();
        }
        return AuditLog.findAll(Sort.by("at").descending()).page(Page.ofSize(size)).list();
    }
}
