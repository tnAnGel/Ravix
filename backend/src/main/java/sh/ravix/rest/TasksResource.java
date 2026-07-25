package sh.ravix.rest;

import jakarta.inject.Inject;
import jakarta.ws.rs.GET;
import jakarta.ws.rs.NotFoundException;
import jakarta.ws.rs.Path;
import jakarta.ws.rs.PathParam;
import jakarta.ws.rs.Produces;
import jakarta.ws.rs.QueryParam;
import jakarta.ws.rs.core.MediaType;
import java.util.List;
import sh.ravix.entity.BackgroundTask;
import sh.ravix.platform.TaskService;

/** Polled by the UI to show progress / log of long-running operations. */
@Path("/api/tasks")
@Produces(MediaType.APPLICATION_JSON)
public class TasksResource {

    @Inject
    TaskService tasks;

    @GET
    public List<BackgroundTask> list(
            @QueryParam("kind") String kind,
            @QueryParam("active") Boolean active) {
        return tasks.recent(kind, active != null && active, 50);
    }

    @GET
    @Path("/{id}")
    public BackgroundTask get(@PathParam("id") String id) {
        BackgroundTask t = tasks.get(id);
        if (t == null) throw new NotFoundException();
        return t;
    }
}
