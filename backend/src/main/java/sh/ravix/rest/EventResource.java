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
import sh.ravix.entity.Event;

@Path("/api/events")
@Produces(MediaType.APPLICATION_JSON)
@Transactional
public class EventResource {

    @GET
    public List<Event> list(@QueryParam("limit") Integer limit) {
        int size = (limit == null || limit <= 0) ? 50 : Math.min(limit, 200);
        return Event.findAll(Sort.by("at").descending()).page(Page.ofSize(size)).list();
    }
}
