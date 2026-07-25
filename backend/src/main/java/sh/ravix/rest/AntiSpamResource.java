package sh.ravix.rest;

import io.quarkus.panache.common.Sort;
import jakarta.inject.Inject;
import jakarta.transaction.Transactional;
import jakarta.ws.rs.Consumes;
import jakarta.ws.rs.DELETE;
import jakarta.ws.rs.GET;
import jakarta.ws.rs.POST;
import jakarta.ws.rs.PUT;
import jakarta.ws.rs.Path;
import jakarta.ws.rs.Produces;
import jakarta.ws.rs.QueryParam;
import jakarta.ws.rs.core.MediaType;
import jakarta.ws.rs.core.Response;
import java.math.BigDecimal;
import java.util.Arrays;
import java.util.List;
import sh.ravix.dto.AntiSpamDto;
import sh.ravix.entity.AntispamSetting;
import sh.ravix.entity.Domain;
import sh.ravix.entity.Event;
import sh.ravix.entity.SenderListEntry;
import sh.ravix.entity.SpamDecision;
import sh.ravix.platform.PlatformService;

@Path("/api/anti-spam")
@Produces(MediaType.APPLICATION_JSON)
@Consumes(MediaType.APPLICATION_JSON)
@Transactional
public class AntiSpamResource {

    @Inject
    PlatformService platform;

    @Inject
    sh.ravix.platform.ProvisioningService provisioning;

    public record UpdateAntiSpamRequest(
            BigDecimal spamThreshold,
            BigDecimal rejectThreshold,
            Boolean greylisting,
            Boolean dkimSigning) {}

    public record SenderRequest(String listType, String value) {}

    @GET
    public AntiSpamDto get() {
        return build();
    }

    @PUT
    public AntiSpamDto update(UpdateAntiSpamRequest req) {
        AntispamSetting s = AntispamSetting.findById(1);
        if (req.spamThreshold() != null) s.spamThreshold = req.spamThreshold();
        if (req.rejectThreshold() != null) s.rejectThreshold = req.rejectThreshold();
        if (req.greylisting() != null) s.greylisting = req.greylisting();
        if (req.dkimSigning() != null) s.dkimSigning = req.dkimSigning();
        provisioning.syncAntispam();
        return build();
    }

    @POST
    @Path("/list")
    public AntiSpamDto addEntry(SenderRequest req) {
        if (req != null && req.value() != null && !req.value().isBlank()) {
            String type = "blacklist".equals(req.listType()) ? "blacklist" : "whitelist";
            SenderListEntry e = new SenderListEntry();
            e.listType = type;
            e.value = req.value().trim();
            e.persist();
        }
        return build();
    }

    @DELETE
    @Path("/list")
    public AntiSpamDto removeEntry(
            @QueryParam("listType") String listType,
            @QueryParam("value") String value) {
        SenderListEntry.delete("listType = ?1 and value = ?2", listType, value);
        return build();
    }

    @POST
    @Path("/restart")
    public Response restart() {
        boolean ok = platform.exec(10, "systemctl", "restart", "rspamd");
        // Re-evaluate live state so the panel reflects reality after the restart.
        AntiSpamDto view = build();
        Event.persist(DomainResource.event("spam", ok ? "success" : "warning",
                ok ? "Rspamd restarted" : "Rspamd restart requested (not available on this host)"));
        return Response.ok(java.util.Map.of("ok", ok, "status", view.status(),
                "rspamdRunning", view.rspamdRunning(), "redisConnected", view.redisConnected())).build();
    }

    /** Is the rspamd service active on this host? */
    private boolean rspamdRunning() {
        if (!platform.isLinux()) return false;
        return "active".equals(platform.run(3, "systemctl", "is-active", "rspamd").orElse("").trim());
    }

    /** Can we reach the Redis backend rspamd uses for Bayes / greylisting? */
    private boolean redisConnected() {
        if (!platform.isLinux()) return false;
        return platform.run(3, "redis-cli", "ping").orElse("").toUpperCase().contains("PONG");
    }

    private AntiSpamDto build() {
        AntispamSetting s = AntispamSetting.findById(1);
        boolean rspamd = rspamdRunning();
        boolean redis = redisConnected();

        // Derive the real status from live service state (Linux); off-Linux keep stored value.
        String status = s.status;
        if (platform.isLinux()) {
            status = !rspamd ? "inactive" : (redis ? "healthy" : "degraded");
            if (!status.equals(s.status)) {
                s.status = status;
            }
        }

        List<String> whitelist = SenderListEntry.<SenderListEntry>list("listType", "whitelist")
                .stream().map(e -> e.value).toList();
        List<String> blacklist = SenderListEntry.<SenderListEntry>list("listType", "blacklist")
                .stream().map(e -> e.value).toList();
        List<AntiSpamDto.Decision> decisions =
                SpamDecision.<SpamDecision>listAll(Sort.by("ts").descending()).stream()
                        .map(d -> new AntiSpamDto.Decision(
                                d.id, d.ts, d.sender, d.action, d.score,
                                Arrays.asList(d.symbols.split(","))))
                        .toList();
        long signed = Domain.count("checkDkim = 'pass'");
        long total = Domain.count();
        return new AntiSpamDto(
                status, rspamd, redis, s.spamThreshold, s.rejectThreshold, s.greylisting, s.dkimSigning,
                s.bayesLearned, signed, total, whitelist, blacklist, decisions);
    }
}
