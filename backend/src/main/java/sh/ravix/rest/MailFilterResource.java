package sh.ravix.rest;

import sh.ravix.auth.OrgFiltered;

import io.quarkus.panache.common.Sort;
import jakarta.inject.Inject;
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
import jakarta.ws.rs.core.MediaType;
import jakarta.ws.rs.core.Response;
import java.util.List;
import sh.ravix.entity.Mailbox;
import sh.ravix.entity.MailFilter;
import sh.ravix.platform.SieveService;
import sh.ravix.util.Ids;

/** CRUD for per-mailbox delivery filters; each change recompiles the Sieve. */
@Path("/api/mailboxes/{mid}/filters")
@Produces(MediaType.APPLICATION_JSON)
@Consumes(MediaType.APPLICATION_JSON)
@Transactional
@OrgFiltered
public class MailFilterResource {

    @Inject SieveService sieve;

    public record FilterBody(
            String name, String field, String op, String value,
            String action, String target, Boolean enabled, Integer ord) {}

    @GET
    public List<MailFilter> list(@PathParam("mid") String mid) {
        return MailFilter.list("mailboxId", Sort.by("ord"), mid);
    }

    @POST
    public Response create(@PathParam("mid") String mid, FilterBody b) {
        Mailbox m = mailbox(mid);
        MailFilter f = new MailFilter();
        f.id = Ids.generate("flt");
        f.mailboxId = mid;
        apply(f, b);
        f.ord = b.ord() != null ? b.ord() : (int) MailFilter.count("mailboxId", mid);
        f.persist();
        sieve.rebuild(m);
        return Response.status(Response.Status.CREATED).entity(f).build();
    }

    @PUT
    @Path("/{id}")
    public MailFilter update(@PathParam("mid") String mid, @PathParam("id") String id, FilterBody b) {
        Mailbox m = mailbox(mid);
        MailFilter f = MailFilter.<MailFilter>find("id", id).firstResult();
        if (f == null || !f.mailboxId.equals(mid)) throw new NotFoundException("filter not found");
        apply(f, b);
        sieve.rebuild(m);
        return f;
    }

    @DELETE
    @Path("/{id}")
    public Response delete(@PathParam("mid") String mid, @PathParam("id") String id) {
        Mailbox m = mailbox(mid);
        MailFilter f = MailFilter.<MailFilter>find("id", id).firstResult();
        if (f == null || !f.mailboxId.equals(mid)) throw new NotFoundException("filter not found");
        f.delete();
        sieve.rebuild(m);
        return Response.noContent().build();
    }

    private void apply(MailFilter f, FilterBody b) {
        if (b.name() != null) f.name = b.name();
        if (b.field() != null) f.field = b.field();
        if (b.op() != null) f.op = b.op();
        if (b.value() != null) f.value = b.value();
        if (b.action() != null) f.action = b.action();
        f.target = b.target();
        f.enabled = b.enabled() == null || b.enabled();
        if (b.ord() != null) f.ord = b.ord();
    }

    private Mailbox mailbox(String mid) {
        Mailbox m = Mailbox.<Mailbox>find("id", mid).firstResult();
        if (m == null) throw new NotFoundException("mailbox not found");
        return m;
    }
}
