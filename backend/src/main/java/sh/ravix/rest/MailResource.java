package sh.ravix.rest;

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
import jakarta.ws.rs.core.MediaType;
import jakarta.ws.rs.core.Response;
import java.util.List;
import sh.ravix.entity.Mailbox;
import sh.ravix.platform.MaildirService;

/** Message-level webmail operations, backed by the on-disk Maildir.
 *  The message id is an opaque token that encodes which mailbox + folder +
 *  Maildir unique it refers to, so these endpoints need no extra context. */
@Path("/api/messages")
@Produces(MediaType.APPLICATION_JSON)
@Consumes(MediaType.APPLICATION_JSON)
@Transactional
public class MailResource {

    static final List<String> FOLDERS =
            List.of("inbox", "sent", "drafts", "spam", "trash", "archive");

    @Inject MaildirService maildir;

    public record MoveRequest(String folder) {}
    public record ReadRequest(Boolean unread) {}
    public record StarRequest(Boolean starred) {}

    /** Fetch a single message in full (HTML, text, attachments). Marks read. */
    @GET
    @Path("/{id}")
    public MaildirService.Full message(@PathParam("id") String id) {
        Mailbox m = mailbox(id);
        return maildir.read(m, id, true)
                .orElseThrow(() -> new NotFoundException("Message not found"));
    }

    /** Fetch the whole conversation this message belongs to, oldest first.
     *  Marks the opened message read. Used by the reading pane's thread view. */
    @GET
    @Path("/{id}/thread")
    public List<MaildirService.Full> thread(@PathParam("id") String id) {
        Mailbox m = mailbox(id);
        MaildirService.Full opened = maildir.read(m, id, true)
                .orElseThrow(() -> new NotFoundException("Message not found"));
        String tid = opened.summary().threadId();
        if (tid == null || tid.isBlank()) {
            return List.of(opened);
        }
        List<MaildirService.Full> all = maildir.thread(m, opened.summary().folder(), tid);
        return all.isEmpty() ? List.of(opened) : all;
    }

    @POST
    @Path("/{id}/read")
    public MaildirService.Summary setRead(@PathParam("id") String id, ReadRequest req) {
        Mailbox m = mailbox(id);
        boolean unread = req != null && Boolean.TRUE.equals(req.unread());
        return maildir.setRead(m, id, unread)
                .orElseThrow(() -> new NotFoundException("Message not found"));
    }

    @POST
    @Path("/{id}/star")
    public MaildirService.Summary toggleStar(@PathParam("id") String id, StarRequest req) {
        Mailbox m = mailbox(id);
        boolean starred;
        if (req != null && req.starred() != null) {
            starred = req.starred();
        } else {
            starred = !maildir.read(m, id, false)
                    .map(f -> f.summary().starred()).orElse(false);
        }
        return maildir.setStar(m, id, starred)
                .orElseThrow(() -> new NotFoundException("Message not found"));
    }

    @POST
    @Path("/{id}/move")
    public MaildirService.Summary move(@PathParam("id") String id, MoveRequest req) {
        Mailbox m = mailbox(id);
        if (req == null || req.folder() == null || req.folder().isBlank()) {
            throw new NotFoundException("folder required");
        }
        return maildir.move(m, id, req.folder())
                .orElseThrow(() -> new NotFoundException("Message not found"));
    }

    @DELETE
    @Path("/{id}")
    public Response delete(@PathParam("id") String id) {
        Mailbox m = mailbox(id);
        boolean ok = maildir.delete(m, id);
        if (!ok) throw new NotFoundException("Message not found");
        return Response.noContent().build();
    }

    /** Download (or inline-serve) the Nth attachment of a message. */
    @GET
    @Path("/{id}/attachments/{index}")
    @Produces(MediaType.WILDCARD)
    public Response attachment(@PathParam("id") String id, @PathParam("index") int index) {
        Mailbox m = mailbox(id);
        return maildir.attachment(m, id, index)
                .<Response>map(a -> Response.ok(a.data())
                        .header("Content-Type", a.contentType())
                        .header("Content-Disposition",
                                "inline; filename=\"" + sanitize(a.filename()) + "\"")
                        .header("Content-Length", a.data().length)
                        .build())
                .orElseThrow(() -> new NotFoundException("Attachment not found"));
    }

    private Mailbox mailbox(String id) {
        return maildir.mailboxOf(id)
                .orElseThrow(() -> new NotFoundException("Message not found"));
    }

    private static String sanitize(String name) {
        return name == null ? "attachment" : name.replaceAll("[\\r\\n\"]", "_");
    }
}
