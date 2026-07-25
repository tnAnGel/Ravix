package sh.ravix.rest;

import jakarta.inject.Inject;
import jakarta.ws.rs.Consumes;
import jakarta.ws.rs.GET;
import jakarta.ws.rs.POST;
import jakarta.ws.rs.Path;
import jakarta.ws.rs.Produces;
import jakarta.ws.rs.core.MediaType;
import jakarta.ws.rs.core.Response;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import sh.ravix.entity.Event;
import sh.ravix.entity.FblComplaint;
import sh.ravix.platform.ReputationService;

/** Sending reputation: warm-up ramp, reputation score, FBL complaints. */
@Path("/api/reputation")
@Produces(MediaType.APPLICATION_JSON)
@Consumes(MediaType.APPLICATION_JSON)
public class ReputationResource {

    @Inject
    ReputationService reputation;

    public record WarmupRequest(Boolean enabled, String startDate, Integer targetDaily) {}
    public record ComplaintRequest(String email, String source) {}

    /** Combined dashboard payload: score + warm-up + today's usage. */
    @GET
    public Map<String, Object> overview() {
        ReputationService.Warmup w = reputation.warmup();
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("reputation", reputation.reputation());
        out.put("warmup", w);
        out.put("sentToday", reputation.sentToday());
        out.put("dailyCap", reputation.currentDailyCap() == Integer.MAX_VALUE ? null : reputation.currentDailyCap());
        return out;
    }

    @POST
    @Path("/warmup")
    @jakarta.transaction.Transactional
    public ReputationService.Warmup updateWarmup(WarmupRequest req) {
        ReputationService.Warmup w = reputation.updateWarmup(
                req == null ? null : req.enabled(),
                req == null ? null : req.startDate(),
                req == null ? null : req.targetDaily());
        Event.persist(DomainResource.event("campaign", "info",
                "Warm-up " + (w.enabled() ? "enabled (cap " + w.dailyCap() + "/day)" : "disabled")));
        return w;
    }

    @GET
    @Path("/complaints")
    public List<FblComplaint> complaints() {
        return reputation.complaints(200);
    }

    /** Manually record an FBL complaint (also fed by the ARF mail ingester). */
    @POST
    @Path("/complaints")
    public Response addComplaint(ComplaintRequest req) {
        FblComplaint c = reputation.recordComplaint(
                req == null ? null : req.email(),
                req == null ? "manual" : req.source());
        if (c == null) {
            return Response.status(Response.Status.BAD_REQUEST)
                    .entity(Map.of("error", "invalid_email")).build();
        }
        return Response.ok(c).build();
    }
}
