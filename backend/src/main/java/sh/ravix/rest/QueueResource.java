package sh.ravix.rest;

import io.quarkus.panache.common.Sort;
import jakarta.inject.Inject;
import jakarta.transaction.Transactional;
import jakarta.ws.rs.Consumes;
import jakarta.ws.rs.GET;
import jakarta.ws.rs.POST;
import jakarta.ws.rs.Path;
import jakarta.ws.rs.Produces;
import jakarta.ws.rs.QueryParam;
import jakarta.ws.rs.core.MediaType;
import jakarta.ws.rs.core.Response;
import java.util.List;
import sh.ravix.dto.QueueSummaryDto;
import sh.ravix.entity.Event;
import sh.ravix.entity.QueueItem;
import sh.ravix.platform.PlatformService;

@Path("/api/queue")
@Produces(MediaType.APPLICATION_JSON)
@Consumes(MediaType.APPLICATION_JSON)
@Transactional
public class QueueResource {

    @Inject
    PlatformService platform;

    @Inject
    sh.ravix.platform.QueueService queue;

    public record QueueActionRequest(List<String> ids) {}

    @POST
    @Path("/flush")
    public Response flush() {
        // Tell Postfix to attempt delivery of all queued mail.
        platform.exec(15, "postqueue", "-f");
        // Keep the fallback (DB) view consistent on non-Postfix hosts.
        QueueItem.update("state = 'active' where state = 'deferred'");
        Event.persist(DomainResource.event("queue", "info", "Mail queue flushed"));
        return Response.ok().build();
    }

    @GET
    public List<QueueItem> list(@QueryParam("state") String state) {
        return queue.items(state);
    }

    @GET
    @Path("/summary")
    public QueueSummaryDto summary() {
        return queue.summary();
    }

    @POST
    @Path("/retry")
    public Response retry(QueueActionRequest req) {
        if (req != null && req.ids() != null) {
            for (String id : req.ids()) {
                // Re-queue and deliver now on a real host.
                platform.exec(10, "postsuper", "-r", id);
                platform.exec(10, "postqueue", "-i", id);
                QueueItem q = QueueItem.findById(id);
                if (q != null) {
                    q.state = "active";
                    q.attempts += 1;
                }
            }
        }
        return Response.ok().build();
    }

    @POST
    @Path("/hold")
    public Response hold(QueueActionRequest req) {
        if (req != null && req.ids() != null) {
            for (String id : req.ids()) {
                platform.exec(10, "postsuper", "-h", id);
                QueueItem q = QueueItem.findById(id);
                if (q != null) q.state = "hold";
            }
        }
        return Response.ok().build();
    }

    @POST
    @Path("/delete")
    public Response deleteSelected(QueueActionRequest req) {
        if (req != null && req.ids() != null) {
            for (String id : req.ids()) {
                platform.exec(10, "postsuper", "-d", id);
                QueueItem.deleteById(id);
            }
        }
        return Response.noContent().build();
    }
}
