package sh.ravix.rest;

import jakarta.inject.Inject;
import jakarta.ws.rs.GET;
import jakarta.ws.rs.POST;
import jakarta.ws.rs.Path;
import jakarta.ws.rs.Produces;
import jakarta.ws.rs.core.MediaType;
import jakarta.ws.rs.core.Response;
import java.util.Map;
import sh.ravix.platform.RadicaleService;
import sh.ravix.platform.TaskService;

/** CalDAV/CardDAV (Radicale) management — install/uninstall run as background
 *  tasks because the pip install can take a minute. */
@Path("/api/radicale")
@Produces(MediaType.APPLICATION_JSON)
public class RadicaleResource {

    @Inject RadicaleService radicale;
    @Inject TaskService tasks;

    @GET
    @Path("/status")
    public RadicaleService.Status status() {
        return radicale.status();
    }

    @POST
    @Path("/install")
    public Response install() {
        var task = tasks.start("radicale", "radicale", "install");
        tasks.submit(task.id, sink -> {
            radicale.install(sink);
            return "Radicale install finished.";
        });
        return Response.status(Response.Status.ACCEPTED)
                .entity(Map.of("taskId", task.id, "status", "running", "action", "install"))
                .build();
    }

    @POST
    @Path("/uninstall")
    public Response uninstall() {
        var task = tasks.start("radicale", "radicale", "uninstall");
        tasks.submit(task.id, sink -> {
            radicale.uninstall(sink);
            return "Radicale removed.";
        });
        return Response.status(Response.Status.ACCEPTED)
                .entity(Map.of("taskId", task.id, "status", "running", "action", "uninstall"))
                .build();
    }
}
