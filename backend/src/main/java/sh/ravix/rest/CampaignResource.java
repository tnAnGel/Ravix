package sh.ravix.rest;

import sh.ravix.auth.OrgFiltered;

import io.quarkus.panache.common.Sort;
import jakarta.transaction.Transactional;
import jakarta.ws.rs.Consumes;
import jakarta.ws.rs.GET;
import jakarta.ws.rs.NotFoundException;
import jakarta.ws.rs.POST;
import jakarta.ws.rs.Path;
import jakarta.ws.rs.PathParam;
import jakarta.ws.rs.Produces;
import jakarta.ws.rs.core.MediaType;
import jakarta.ws.rs.core.Response;
import java.time.OffsetDateTime;
import java.util.List;
import sh.ravix.entity.Campaign;
import sh.ravix.entity.Event;
import sh.ravix.util.Ids;

@Path("/api/campaigns")
@Produces(MediaType.APPLICATION_JSON)
@Consumes(MediaType.APPLICATION_JSON)
@Transactional
@OrgFiltered
public class CampaignResource {

    @jakarta.inject.Inject
    sh.ravix.platform.CampaignSender campaignSender;

    public record CreateCampaignRequest(
            String name, String sender, String subject, String body,
            String preheader, String replyTo, String audienceType, String audienceRef,
            String templateId, Integer recipients, Integer ratePerHour, Boolean unsubscribe,
            String scheduledAt) {}

    @GET
    public List<Campaign> list() {
        return Campaign.listAll(Sort.by("updatedAt").descending());
    }

    @GET
    @Path("/{id}")
    public Campaign get(@PathParam("id") String id) {
        return find(id);
    }

    @POST
    public Response create(CreateCampaignRequest req) {
        Campaign c = new Campaign();
        c.id = Ids.generate("camp");
        c.name = req.name();
        c.sender = req.sender();
        c.subject = req.subject() == null ? "" : req.subject();
        c.body = req.body() == null ? "" : req.body();
        c.preheader = req.preheader();
        c.replyTo = req.replyTo();
        c.audienceType = req.audienceType() == null ? "all" : req.audienceType();
        c.audienceRef = req.audienceRef();
        c.templateId = req.templateId();
        c.recipients = req.recipients() == null ? 0 : req.recipients();
        c.ratePerHour = req.ratePerHour() == null ? 500 : req.ratePerHour();
        c.unsubscribe = req.unsubscribe() == null || req.unsubscribe();
        c.status = req.scheduledAt() != null ? "scheduled" : "draft";
        c.scheduledAt = req.scheduledAt() != null ? OffsetDateTime.parse(req.scheduledAt()) : null;
        c.updatedAt = OffsetDateTime.now();
        c.persist();
        Event.persist(DomainResource.event("campaign", "info", "Campaign '" + c.name + "' created"));
        return Response.status(Response.Status.CREATED).entity(c).build();
    }

    @POST
    @Path("/{id}/pause")
    public Campaign pause(@PathParam("id") String id) {
        Campaign c = find(id);
        c.status = "paused";
        c.updatedAt = OffsetDateTime.now();
        return c;
    }

    @POST
    @Path("/{id}/resume")
    public Campaign resume(@PathParam("id") String id) {
        Campaign c = find(id);
        c.status = "sending";
        c.updatedAt = OffsetDateTime.now();
        return c;
    }

    @POST
    @Path("/{id}/send")
    public Campaign send(@PathParam("id") String id) {
        Campaign c = find(id);
        // Materialise the audience and begin throttled delivery via the MTA.
        campaignSender.startSending(c);
        Event.persist(DomainResource.event("campaign", "info",
                "Campaign '" + c.name + "' started sending to " + c.recipients + " recipients"));
        return c;
    }

    /** Recipients of a campaign with their per-message delivery status. */
    @GET
    @Path("/{id}/recipients")
    public List<sh.ravix.entity.CampaignRecipient> recipients(@PathParam("id") String id) {
        find(id);
        return sh.ravix.entity.CampaignRecipient.list("campaignId", Sort.by("id"), id);
    }

    public record LinkStat(String url, long clicks) {}

    /** Per-link click counts for a campaign (Band 4 analytics). */
    @GET
    @Path("/{id}/links")
    public List<LinkStat> links(@PathParam("id") String id) {
        find(id);
        @SuppressWarnings("unchecked")
        List<Object[]> rows = sh.ravix.entity.TrackingEvent.getEntityManager()
                .createQuery("select t.url, count(t.id) from TrackingEvent t "
                        + "where t.campaignId = ?1 and t.type = 'click' and t.url is not null "
                        + "group by t.url order by count(t.id) desc")
                .setParameter(1, id)
                .getResultList();
        return rows.stream()
                .map(r -> new LinkStat((String) r[0], ((Number) r[1]).longValue()))
                .toList();
    }

    public record ImportRequest(List<String> emails) {}

    /** Import an explicit recipient list (CSV / paste). Sets audience to 'list'. */
    @POST
    @Path("/{id}/recipients/import")
    public Campaign importRecipients(@PathParam("id") String id, ImportRequest req) {
        Campaign c = find(id);
        int added = 0;
        if (req != null && req.emails() != null) {
            for (String raw : req.emails()) {
                if (raw == null) continue;
                String email = raw.trim();
                if (email.isEmpty() || !email.contains("@")) continue;
                sh.ravix.entity.CampaignRecipient r = new sh.ravix.entity.CampaignRecipient();
                r.campaignId = c.id;
                r.email = email;
                r.status = "pending";
                r.persist();
                added++;
            }
        }
        c.audienceType = "list";
        c.recipients = (int) sh.ravix.entity.CampaignRecipient.count("campaignId", c.id);
        c.updatedAt = OffsetDateTime.now();
        return c;
    }

    public record AudienceRequest(String audienceType, String audienceRef) {}

    /** Preview how many mailboxes an audience resolves to (live, for the composer). */
    @POST
    @Path("/preview-audience")
    public java.util.Map<String, Object> previewAudience(AudienceRequest req) {
        var mailboxes = campaignSender.audienceFor(
                req == null ? "all" : req.audienceType(),
                req == null ? null : req.audienceRef());
        java.util.Map<String, Object> out = new java.util.LinkedHashMap<>();
        out.put("count", mailboxes.size());
        out.put("sample", mailboxes.stream().limit(5).map(m -> m.email).toList());
        return out;
    }

    @jakarta.ws.rs.DELETE
    @Path("/{id}")
    public Response delete(@PathParam("id") String id) {
        Campaign c = find(id);
        c.delete();
        return Response.noContent().build();
    }

    private Campaign find(String id) {
        Campaign c = Campaign.<Campaign>find("id", id).firstResult();
        if (c == null) {
            throw new NotFoundException("Campaign not found: " + id);
        }
        return c;
    }
}
