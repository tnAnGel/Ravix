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
import jakarta.ws.rs.core.MediaType;
import jakarta.ws.rs.core.Response;
import java.time.OffsetDateTime;
import java.util.List;
import sh.ravix.dto.DomainDto;
import sh.ravix.entity.Alias;
import sh.ravix.entity.AppSetting;
import sh.ravix.entity.Domain;
import sh.ravix.entity.Event;
import sh.ravix.entity.Mailbox;
import sh.ravix.platform.DkimKeys;
import sh.ravix.platform.DomainChecker;
import sh.ravix.platform.ProvisioningService;
import sh.ravix.util.Ids;

@Path("/api/domains")
@Produces(MediaType.APPLICATION_JSON)
@Consumes(MediaType.APPLICATION_JSON)
@Transactional
@OrgFiltered
public class DomainResource {

    public record CreateDomainRequest(String name, String dkimSelector) {}

    @Inject
    DomainChecker checker;

    @Inject
    ProvisioningService provisioning;

    @Inject
    sh.ravix.platform.PlatformService platform;

    @Inject
    sh.ravix.platform.CloudflareService cloudflare;

    @GET
    public List<DomainDto> list() {
        return Domain.<Domain>listAll().stream().map(this::toDto).toList();
    }

    @GET
    @Path("/{id}")
    public DomainDto get(@PathParam("id") String id) {
        Domain d = Domain.<Domain>find("id", id).firstResult();
        if (d == null) {
            throw new NotFoundException("Domain not found: " + id);
        }
        return toDto(d);
    }

    @POST
    public Response create(CreateDomainRequest req) {
        Domain d = new Domain();
        d.id = Ids.generate("dom");
        d.name = req.name();
        d.status = "warning"; // freshly added: DNS not yet verified
        d.createdAt = OffsetDateTime.now();
        d.checkSsl = "pending";
        d.dkimSelector = (req.dkimSelector() == null || req.dkimSelector().isBlank())
                ? "ravix" + OffsetDateTime.now().getYear() : req.dkimSelector();

        // Generate a real 2048-bit DKIM key pair; store the private key.
        DkimKeys.Pair pair = DkimKeys.generate();
        d.dkimPublicKey = pair.publicKeyBase64();
        d.dkimPrivateKey = pair.privatePem();
        d.sslAutoRenew = true;

        // First-domain bootstrap: if the operator hasn't picked a mail
        // hostname yet, default it to this domain. That way PTR/HELO/checker
        // expectations all line up immediately instead of dangling at the
        // OS hostname (e.g. spb-3-vm-feuy).
        AppSetting hostSetting = AppSetting.findById("hostname");
        if (hostSetting == null || hostSetting.value == null || hostSetting.value.isBlank()
                || hostSetting.value.equals(platform.hostname())) {
            if (hostSetting == null) { hostSetting = new AppSetting(); hostSetting.key = "hostname"; }
            hostSetting.value = d.name;
            hostSetting.persist();
        }

        // Build the expected DNS records, then verify against live DNS.
        checker.generateRecords(d, mailHostname());
        d.persist();
        checker.recheck(d, mailHostname());

        provisioning.syncMailData();
        // If a CF token is configured, publish DNS for the new domain
        // immediately so the operator doesn't have to wait for the next
        // startup/hourly tick or visit the wizard.
        try {
            int n = cloudflare.autoSyncAll();
            if (n > 0) Event.persist(event("domain", "info",
                    "Cloudflare DNS published for " + d.name));
        } catch (Exception e) {
            Event.persist(event("domain", "warning",
                    "Cloudflare auto-sync failed for " + d.name + ": " + e.getMessage()));
        }
        Event.persist(event("domain", "info", "Domain " + d.name + " added"));
        return Response.status(Response.Status.CREATED).entity(toDto(d)).build();
    }

    @POST
    @Path("/{id}/recheck")
    public DomainDto recheck(@PathParam("id") String id) {
        Domain d = Domain.<Domain>find("id", id).firstResult();
        if (d == null) {
            throw new NotFoundException("Domain not found: " + id);
        }
        checker.recheck(d, mailHostname());
        Event.persist(event("domain", "info",
                "DNS rechecked for " + d.name + " — status " + d.status));
        return toDto(d);
    }

    /** Push the current DNS plan to Cloudflare for THIS domain right now,
     *  bypassing the hourly tick. Useful when the operator just changed
     *  something in CF dashboard or wants immediate convergence. */
    @POST
    @Path("/{id}/cloudflare-sync")
    public Response cloudflareSync(@PathParam("id") String id) {
        Domain d = Domain.<Domain>find("id", id).firstResult();
        if (d == null) {
            throw new NotFoundException("Domain not found: " + id);
        }
        if (cloudflare.token() == null || cloudflare.token().isBlank()) {
            return Response.status(Response.Status.PRECONDITION_REQUIRED)
                    .entity(java.util.Map.of("error", "cloudflare_token_missing",
                            "detail", "Set a Cloudflare API token in Settings first."))
                    .build();
        }
        try {
            int n = cloudflare.autoSyncAll();
            checker.recheck(d, mailHostname());
            Event.persist(event("domain", "info",
                    "Cloudflare DNS push triggered for " + d.name + " (" + n + " domain(s) synced)"));
            return Response.ok(java.util.Map.of(
                    "ok", true,
                    "syncedDomains", n,
                    "domain", toDto(d))).build();
        } catch (Exception e) {
            Event.persist(event("domain", "warning",
                    "Cloudflare sync failed for " + d.name + ": " + e.getMessage()));
            return Response.status(Response.Status.BAD_GATEWAY)
                    .entity(java.util.Map.of("error", "cloudflare_apply_failed",
                            "detail", e.getMessage())).build();
        }
    }

    private String mailHostname() {
        AppSetting h = AppSetting.findById("hostname");
        return h != null && h.value != null && !h.value.isBlank() ? h.value : platform.hostname();
    }

    @DELETE
    @Path("/{id}")
    public Response delete(@PathParam("id") String id) {
        Domain d = Domain.<Domain>find("id", id).firstResult();
        if (d == null) {
            throw new NotFoundException("Domain not found: " + id);
        }
        Event.persist(event("domain", "warning", "Domain " + d.name + " removed"));
        d.delete();
        provisioning.syncMailData();
        return Response.noContent().build();
    }

    private DomainDto toDto(Domain d) {
        long mailboxes = Mailbox.count("domain", d.name);
        long aliases = Alias.count("domain", d.name);
        return DomainDto.from(d, mailboxes, aliases);
    }

    public static Event event(String category, String severity, String message) {
        Event e = new Event();
        e.id = Ids.generate("ev");
        e.category = category;
        e.severity = severity;
        e.message = message;
        e.at = OffsetDateTime.now();
        return e;
    }
}
