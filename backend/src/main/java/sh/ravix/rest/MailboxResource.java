package sh.ravix.rest;

import sh.ravix.auth.OrgFiltered;

import io.quarkus.panache.common.Sort;
import jakarta.transaction.Transactional;
import jakarta.ws.rs.Consumes;
import jakarta.ws.rs.DELETE;
import jakarta.ws.rs.GET;
import jakarta.ws.rs.NotFoundException;
import jakarta.ws.rs.POST;
import jakarta.ws.rs.PUT;
import jakarta.ws.rs.Path;
import jakarta.ws.rs.PathParam;
import jakarta.ws.rs.Produces;
import jakarta.ws.rs.QueryParam;
import jakarta.ws.rs.core.MediaType;
import jakarta.ws.rs.core.Response;
import java.time.OffsetDateTime;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import sh.ravix.entity.Event;
import sh.ravix.entity.Mailbox;
import sh.ravix.util.Ids;

@Path("/api/mailboxes")
@Produces(MediaType.APPLICATION_JSON)
@Consumes(MediaType.APPLICATION_JSON)
@Transactional
@OrgFiltered
public class MailboxResource {

    @jakarta.inject.Inject
    sh.ravix.auth.PasswordHasher hasher;

    @jakarta.inject.Inject
    sh.ravix.platform.ProvisioningService provisioning;

    @jakarta.inject.Inject
    sh.ravix.platform.MaildirService maildir;

    @jakarta.inject.Inject
    sh.ravix.platform.MailComposer composer;

    @jakarta.inject.Inject
    sh.ravix.platform.ImapImportService imapImport;

    @jakarta.inject.Inject
    sh.ravix.platform.TaskService tasks;

    public record CreateMailboxRequest(
            String email, String displayName, String domain, Integer quotaMb, String password) {}

    public record ImportRequest(
            String host, Integer port, String user, String password, boolean ssl,
            String localPassword) {}

    public record QuotaRequest(int quotaMb) {}

    public record PasswordRequest(String password) {}

    @GET
    public List<Mailbox> list(
            @QueryParam("domain") String domain,
            @QueryParam("status") String status) {
        boolean hasDomain = domain != null && !domain.isBlank();
        boolean hasStatus = status != null && !status.isBlank();
        if (hasDomain && hasStatus) {
            return Mailbox.list("domain = ?1 and status = ?2", Sort.by("email"), domain, status);
        }
        if (hasDomain) {
            return Mailbox.list("domain", Sort.by("email"), domain);
        }
        if (hasStatus) {
            return Mailbox.list("status", Sort.by("email"), status);
        }
        return Mailbox.listAll(Sort.by("email"));
    }

    @GET
    @Path("/{id}")
    public Mailbox get(@PathParam("id") String id) {
        return find(id);
    }

    @POST
    public Response create(CreateMailboxRequest req) {
        Mailbox m = new Mailbox();
        m.id = Ids.generate("mb");
        m.email = req.email();
        m.displayName = req.displayName() == null ? req.email() : req.displayName();
        m.domain = req.domain();
        m.quotaMb = req.quotaMb() == null ? 2048 : req.quotaMb();
        m.usedMb = 0;
        m.status = "active";
        m.createdAt = OffsetDateTime.now();
        if (req.password() != null && !req.password().isBlank()) {
            m.passwordHash = hasher.hash(req.password());
        }
        m.persist();
        provisioning.syncMailData();
        Event.persist(DomainResource.event("mailbox", "info", "New mailbox " + m.email + " created"));
        return Response.status(Response.Status.CREATED).entity(m).build();
    }

    @PUT
    @Path("/{id}/quota")
    public Mailbox setQuota(@PathParam("id") String id, QuotaRequest req) {
        Mailbox m = find(id);
        m.quotaMb = req.quotaMb();
        return m;
    }

    @POST
    @Path("/{id}/toggle")
    public Mailbox toggle(@PathParam("id") String id) {
        Mailbox m = find(id);
        m.status = "active".equals(m.status) ? "disabled" : "active";
        provisioning.syncMailData();
        Event.persist(DomainResource.event("mailbox", "warning",
                "Mailbox " + m.email + " " + ("active".equals(m.status) ? "enabled" : "disabled")));
        return m;
    }

    @POST
    @Path("/{id}/reset-password")
    public Response resetPassword(@PathParam("id") String id, PasswordRequest req) {
        Mailbox m = find(id);
        if (req != null && req.password() != null && !req.password().isBlank()) {
            m.passwordHash = hasher.hash(req.password());
            provisioning.syncMailData();
        }
        Event.persist(DomainResource.event("mailbox", "success", "Password reset for " + m.email));
        return Response.ok().build();
    }

    @DELETE
    @Path("/{id}")
    public Response delete(@PathParam("id") String id) {
        Mailbox m = find(id);
        m.delete();
        provisioning.syncMailData();
        Event.persist(DomainResource.event("mailbox", "warning", "Mailbox " + m.email + " deleted"));
        return Response.noContent().build();
    }

    /** Import mail from a remote IMAP account into this mailbox via imapsync.
     *  Runs as a background task; poll /api/tasks for progress. */
    @POST
    @Path("/{id}/import")
    public Response importMail(@PathParam("id") String id, ImportRequest req) {
        Mailbox m = find(id);
        if (req == null || req.host() == null || req.host().isBlank()
                || req.user() == null || req.localPassword() == null) {
            return Response.status(Response.Status.BAD_REQUEST)
                    .entity(Map.of("error", "host_user_localPassword_required")).build();
        }
        String email = m.email;
        var remote = new sh.ravix.platform.ImapImportService.Remote(
                req.host(), req.port() == null ? 0 : req.port(), req.user(), req.password(), req.ssl());
        String localPass = req.localPassword();
        var task = tasks.start("imap-import", email, "import");
        tasks.submit(task.id, sink -> {
            imapImport.run(sink, email, localPass, remote);
            return "Import finished for " + email;
        });
        Event.persist(DomainResource.event("mailbox", "info",
                "IMAP import started for " + email + " from " + req.host()));
        return Response.status(Response.Status.ACCEPTED)
                .entity(Map.of("taskId", task.id, "status", "running")).build();
    }

    // ------------------------------------------------------------------
    // Webmail: folders, messages and compose — backed by the real Maildir
    // ------------------------------------------------------------------

    @GET
    @Path("/{id}/folders")
    public List<sh.ravix.platform.MaildirService.FolderInfo> folders(@PathParam("id") String id) {
        return maildir.folders(find(id));
    }

    @GET
    @Path("/{id}/messages")
    public sh.ravix.platform.MaildirService.Page messages(
            @PathParam("id") String id,
            @QueryParam("folder") String folder,
            @QueryParam("q") String q,
            @QueryParam("offset") Integer offset,
            @QueryParam("limit") Integer limit) {
        Mailbox m = find(id);
        String f = (folder == null || folder.isBlank()) ? "inbox" : folder;
        // Opportunistically harvest contacts from this folder for autocomplete.
        try { maildir.harvestContacts(m, f); } catch (Exception ignored) { /* non-fatal */ }
        return maildir.list(m, f, q, offset == null ? 0 : offset, limit == null ? 50 : limit);
    }

    /** Compose / reply / draft — multipart so attachments ride along. */
    @POST
    @Path("/{id}/messages")
    @Consumes(MediaType.MULTIPART_FORM_DATA)
    public Response compose(
            @PathParam("id") String id,
            @org.jboss.resteasy.reactive.RestForm String to,
            @org.jboss.resteasy.reactive.RestForm String cc,
            @org.jboss.resteasy.reactive.RestForm String bcc,
            @org.jboss.resteasy.reactive.RestForm String subject,
            @org.jboss.resteasy.reactive.RestForm String html,
            @org.jboss.resteasy.reactive.RestForm String text,
            @org.jboss.resteasy.reactive.RestForm String inReplyTo,
            @org.jboss.resteasy.reactive.RestForm String references,
            @org.jboss.resteasy.reactive.RestForm("draft") String draftFlag,
            @org.jboss.resteasy.reactive.RestForm("attachments")
                    List<org.jboss.resteasy.reactive.multipart.FileUpload> files) {
        Mailbox sender = find(id);
        boolean draft = "true".equalsIgnoreCase(draftFlag);

        List<sh.ravix.platform.MailComposer.Attachment> atts = new java.util.ArrayList<>();
        if (files != null) {
            for (var fu : files) {
                try {
                    atts.add(new sh.ravix.platform.MailComposer.Attachment(
                            fu.fileName(),
                            fu.contentType(),
                            java.nio.file.Files.readAllBytes(fu.uploadedFile())));
                } catch (Exception e) {
                    return Response.status(Response.Status.BAD_REQUEST)
                            .entity(Map.of("error", "attachment_read_failed")).build();
                }
            }
        }

        var d = new sh.ravix.platform.MailComposer.Draft(
                sender.email, sender.displayName,
                to, cc, bcc, subject, blankToNull(html), blankToNull(text),
                blankToNull(inReplyTo),
                references == null || references.isBlank()
                        ? List.of() : List.of(references.trim().split("\\s+")),
                atts);

        try {
            if (draft) {
                var msg = composer.build(d);
                var summary = maildir.saveDraft(sender, composer.toBytes(msg));
                return Response.status(Response.Status.CREATED).entity(summary).build();
            }
            var msg = composer.build(d);
            boolean ok = composer.send(d);
            if (!ok) {
                return Response.status(Response.Status.BAD_GATEWAY)
                        .entity(Map.of("error", "send_failed",
                                "detail", "Local MTA did not accept the message. Check the queue and logs.")).build();
            }
            maildir.appendToSent(sender, composer.toBytes(msg));
            Event.persist(DomainResource.event("mail", "info",
                    "Sent mail from " + sender.email + " to " + (to == null ? "" : to)));
            return Response.status(Response.Status.CREATED)
                    .entity(Map.of("ok", true)).build();
        } catch (Exception e) {
            return Response.status(Response.Status.INTERNAL_SERVER_ERROR)
                    .entity(Map.of("error", "compose_failed", "detail", e.getMessage())).build();
        }
    }

    @DELETE
    @Path("/{id}/trash")
    public Map<String, Object> emptyTrash(@PathParam("id") String id) {
        long deleted = maildir.emptyTrash(find(id));
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("deleted", deleted);
        return out;
    }

    // --- Contacts (compose autocomplete) ----------------------------------

    @GET
    @Path("/{id}/contacts")
    public List<sh.ravix.entity.Contact> contacts(
            @PathParam("id") String id, @QueryParam("q") String q) {
        find(id);
        String needle = q == null ? "" : q.trim().toLowerCase();
        var all = sh.ravix.entity.Contact.<sh.ravix.entity.Contact>list(
                "mailboxId", io.quarkus.panache.common.Sort.by("seenCount").descending(), id);
        return all.stream()
                .filter(c -> needle.isEmpty()
                        || c.email.toLowerCase().contains(needle)
                        || (c.name != null && c.name.toLowerCase().contains(needle)))
                .limit(10)
                .toList();
    }

    private static String blankToNull(String s) {
        return s == null || s.isBlank() ? null : s;
    }

    private Mailbox find(String id) {
        Mailbox m = Mailbox.<Mailbox>find("id", id).firstResult();
        if (m == null) {
            throw new NotFoundException("Mailbox not found: " + id);
        }
        return m;
    }
}
