package sh.ravix.rest;

import jakarta.transaction.Transactional;
import jakarta.ws.rs.GET;
import jakarta.ws.rs.HeaderParam;
import jakarta.ws.rs.Path;
import jakarta.ws.rs.PathParam;
import jakarta.ws.rs.Produces;
import jakarta.ws.rs.QueryParam;
import jakarta.ws.rs.core.Context;
import jakarta.ws.rs.core.HttpHeaders;
import jakarta.ws.rs.core.Response;
import java.net.URI;
import java.time.OffsetDateTime;
import java.util.Base64;
import sh.ravix.entity.Campaign;
import sh.ravix.entity.CampaignRecipient;
import sh.ravix.entity.TrackingEvent;
import sh.ravix.util.Ids;

/**
 * Public open/click tracking endpoints (Band 4). Reached by mail clients, not
 * the panel — allow-listed in AuthFilter. No tenant context, so lookups by
 * tracking id work across organizations.
 */
@Path("/api/t")
public class TrackingResource {

    // 1x1 transparent GIF.
    private static final byte[] PIXEL = Base64.getDecoder().decode(
            "R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7");

    @GET
    @Path("/o/{tid}")
    @Produces("image/gif")
    @Transactional
    public Response open(@PathParam("tid") String tid,
                         @HeaderParam("User-Agent") String ua,
                         @Context HttpHeaders headers) {
        CampaignRecipient r = CampaignRecipient.find("trackingId", tid).firstResult();
        if (r != null) {
            boolean first = r.openedAt == null;
            r.openedAt = r.openedAt == null ? OffsetDateTime.now() : r.openedAt;
            r.openCount += 1;
            Campaign c = Campaign.findById(r.campaignId);
            if (c != null && first) c.opens += 1;
            record(r, "open", null, ua);
        }
        return Response.ok(PIXEL)
                .header("Cache-Control", "no-store, no-cache, must-revalidate, private")
                .header("Pragma", "no-cache")
                .build();
    }

    @GET
    @Path("/c/{tid}")
    @Transactional
    public Response click(@PathParam("tid") String tid,
                          @QueryParam("u") String u,
                          @HeaderParam("User-Agent") String ua) {
        String target = (u == null || u.isBlank()) ? "/" : u;
        // Only ever redirect to http(s) to avoid open-redirect to javascript: etc.
        if (!target.startsWith("http://") && !target.startsWith("https://")) {
            target = "/";
        }
        CampaignRecipient r = CampaignRecipient.find("trackingId", tid).firstResult();
        if (r != null) {
            boolean firstClick = r.clickCount == 0;
            r.clickCount += 1;
            r.lastClickedAt = OffsetDateTime.now();
            // A click implies an open even if the pixel was blocked.
            if (r.openedAt == null) {
                r.openedAt = OffsetDateTime.now();
                r.openCount += 1;
            }
            Campaign c = Campaign.findById(r.campaignId);
            if (c != null && firstClick) c.clicks += 1;
            record(r, "click", u, ua);
        }
        return Response.seeOther(URI.create(target)).build();
    }

    private void record(CampaignRecipient r, String type, String url, String ua) {
        TrackingEvent e = new TrackingEvent();
        e.id = Ids.generate("trk");
        e.campaignId = r.campaignId;
        e.recipientId = r.id;
        e.type = type;
        e.url = url;
        e.userAgent = ua;
        e.at = OffsetDateTime.now();
        e.persist();
    }
}
