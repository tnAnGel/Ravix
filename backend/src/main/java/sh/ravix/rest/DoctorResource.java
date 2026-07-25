package sh.ravix.rest;

import jakarta.inject.Inject;
import jakarta.ws.rs.Consumes;
import jakarta.ws.rs.POST;
import jakarta.ws.rs.Path;
import jakarta.ws.rs.PathParam;
import jakarta.ws.rs.Produces;
import jakarta.ws.rs.core.MediaType;
import jakarta.ws.rs.core.Response;
import java.util.Map;
import sh.ravix.platform.DoctorService;

/** One-button mail-server diagnosis + automated fixes. */
@Path("/api/doctor")
@Produces(MediaType.APPLICATION_JSON)
@Consumes(MediaType.APPLICATION_JSON)
public class DoctorResource {

    @Inject DoctorService doctor;

    /** Run the full diagnostic and return per-check verdicts. */
    @POST
    @Path("/run")
    public DoctorService.Report run() {
        return doctor.run();
    }

    /** Apply a named automated fix surfaced by a check. */
    @POST
    @Path("/fix/{id}")
    public Response fix(@PathParam("id") String id) {
        DoctorService.FixResult r = doctor.applyFix(id);
        return Response.status(r.ok() ? Response.Status.OK : Response.Status.BAD_REQUEST)
                .entity(Map.of("ok", r.ok(), "detail", r.detail()))
                .build();
    }
}
