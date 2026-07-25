package sh.ravix.rest;

import jakarta.inject.Inject;
import jakarta.ws.rs.GET;
import jakarta.ws.rs.POST;
import jakarta.ws.rs.Path;
import jakarta.ws.rs.Produces;
import jakarta.ws.rs.core.MediaType;
import java.time.Duration;
import java.time.OffsetDateTime;
import sh.ravix.platform.MailReadinessService;

/** "Can this server send mail?" — cached probe + manual re-run. */
@Path("/api/mail-readiness")
@Produces(MediaType.APPLICATION_JSON)
public class MailReadinessResource {

    @Inject
    MailReadinessService probe;

    private volatile MailReadinessService.Readiness cached;

    /** Cached result; recomputes if older than 5 minutes (or first call). */
    @GET
    public MailReadinessService.Readiness get() {
        MailReadinessService.Readiness r = cached;
        if (r == null
                || r.checkedAt() == null
                || Duration.between(r.checkedAt(), OffsetDateTime.now()).toMinutes() >= 5) {
            r = probe.check();
            cached = r;
        }
        return r;
    }

    /** Force a fresh run (used by the "Re-test" button). */
    @POST
    @Path("/run")
    public MailReadinessService.Readiness run() {
        MailReadinessService.Readiness r = probe.check();
        cached = r;
        return r;
    }
}
