package sh.ravix.rest;

import sh.ravix.auth.OrgFiltered;

import jakarta.inject.Inject;
import jakarta.transaction.Transactional;
import jakarta.ws.rs.Consumes;
import jakarta.ws.rs.DELETE;
import jakarta.ws.rs.GET;
import jakarta.ws.rs.NotFoundException;
import jakarta.ws.rs.POST;
import jakarta.ws.rs.Path;
import jakarta.ws.rs.PathParam;
import jakarta.ws.rs.Produces;
import jakarta.ws.rs.QueryParam;
import jakarta.ws.rs.core.MediaType;
import jakarta.ws.rs.core.Response;
import java.util.List;
import sh.ravix.entity.InboxSeed;
import sh.ravix.platform.InboxPlacementService;
import sh.ravix.util.Ids;

/** Inbox-placement testing: instant self-score + optional IMAP seed read. */
@Path("/api/inbox-test")
@Produces(MediaType.APPLICATION_JSON)
@Consumes(MediaType.APPLICATION_JSON)
@Transactional
@OrgFiltered
public class InboxPlacementResource {

    @Inject InboxPlacementService placement;

    public record SeedBody(String label, String email, String imapHost,
                           Integer imapPort, String imapUser, String imapPass) {}

    /** Run a test. ?seeds=true also fires probes to the seed mailboxes. */
    @POST
    @Path("/run")
    public InboxPlacementService.Result run(@QueryParam("seeds") Boolean seeds) {
        return placement.run(Boolean.TRUE.equals(seeds));
    }

    /** Read the seed mailboxes for the latest probe (call after a short wait). */
    @POST
    @Path("/check-seeds")
    public InboxPlacementService.Result checkSeeds() {
        return placement.checkSeeds();
    }

    @GET
    @Path("/latest")
    public InboxPlacementService.Result latest() {
        return placement.latest();
    }

    // --- seed mailbox management ------------------------------------------

    @GET
    @Path("/seeds")
    public List<InboxSeed> seeds() {
        return InboxSeed.listAll();
    }

    @POST
    @Path("/seeds")
    public Response addSeed(SeedBody b) {
        if (b == null || b.email() == null || b.imapHost() == null
                || b.imapUser() == null || b.imapPass() == null) {
            return Response.status(Response.Status.BAD_REQUEST)
                    .entity(java.util.Map.of("error", "missing_fields")).build();
        }
        InboxSeed s = new InboxSeed();
        s.id = Ids.generate("seed");
        s.label = (b.label() == null || b.label().isBlank())
                ? guessLabel(b.email()) : b.label().trim();
        s.email = b.email().trim();
        s.imapHost = b.imapHost().trim();
        s.imapPort = b.imapPort() == null ? 993 : b.imapPort();
        s.imapUser = b.imapUser().trim();
        s.imapPass = b.imapPass();
        s.enabled = true;
        s.persist();
        return Response.status(Response.Status.CREATED).entity(s).build();
    }

    @POST
    @Path("/seeds/{id}/toggle")
    public InboxSeed toggle(@PathParam("id") String id) {
        InboxSeed s = InboxSeed.<InboxSeed>find("id", id).firstResult();
        if (s == null) throw new NotFoundException("seed not found");
        s.enabled = !s.enabled;
        return s;
    }

    @DELETE
    @Path("/seeds/{id}")
    public Response deleteSeed(@PathParam("id") String id) {
        InboxSeed s = InboxSeed.<InboxSeed>find("id", id).firstResult();
        if (s == null) throw new NotFoundException("seed not found");
        s.delete();
        return Response.noContent().build();
    }

    private static String guessLabel(String email) {
        String d = email.contains("@") ? email.substring(email.indexOf('@') + 1) : email;
        if (d.contains("gmail")) return "Gmail";
        if (d.contains("yandex")) return "Yandex";
        if (d.contains("mail.ru")) return "Mail.ru";
        if (d.contains("outlook") || d.contains("hotmail") || d.contains("live")) return "Outlook";
        if (d.contains("yahoo")) return "Yahoo";
        if (d.contains("proton")) return "Proton";
        return d;
    }
}
