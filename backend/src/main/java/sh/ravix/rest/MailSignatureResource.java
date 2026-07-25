package sh.ravix.rest;

import sh.ravix.auth.OrgFiltered;

import jakarta.transaction.Transactional;
import jakarta.ws.rs.Consumes;
import jakarta.ws.rs.GET;
import jakarta.ws.rs.NotFoundException;
import jakarta.ws.rs.PUT;
import jakarta.ws.rs.Path;
import jakarta.ws.rs.PathParam;
import jakarta.ws.rs.Produces;
import jakarta.ws.rs.core.MediaType;
import sh.ravix.entity.Mailbox;
import sh.ravix.entity.MailSignature;
import sh.ravix.util.Ids;

/** Per-mailbox HTML signature, appended by the composer. */
@Path("/api/mailboxes/{mid}/signature")
@Produces(MediaType.APPLICATION_JSON)
@Consumes(MediaType.APPLICATION_JSON)
@Transactional
@OrgFiltered
public class MailSignatureResource {

    public record SignatureBody(String html, Boolean enabled) {}

    @GET
    public MailSignature get(@PathParam("mid") String mid) {
        mailbox(mid);
        MailSignature s = MailSignature.find("mailboxId", mid).firstResult();
        if (s == null) {
            s = new MailSignature();
            s.id = Ids.generate("sig");
            s.mailboxId = mid;
            s.html = "";
            s.enabled = false;
        }
        return s;
    }

    @PUT
    public MailSignature put(@PathParam("mid") String mid, SignatureBody b) {
        mailbox(mid);
        MailSignature s = MailSignature.find("mailboxId", mid).firstResult();
        if (s == null) {
            s = new MailSignature();
            s.id = Ids.generate("sig");
            s.mailboxId = mid;
            s.persist();
        }
        if (b.html() != null) s.html = b.html();
        if (b.enabled() != null) s.enabled = b.enabled();
        return s;
    }

    private Mailbox mailbox(String mid) {
        Mailbox m = Mailbox.<Mailbox>find("id", mid).firstResult();
        if (m == null) throw new NotFoundException("mailbox not found");
        return m;
    }
}
