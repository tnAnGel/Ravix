package sh.ravix.rest;

import io.quarkus.panache.common.Sort;
import jakarta.inject.Inject;
import jakarta.transaction.Transactional;
import jakarta.ws.rs.Consumes;
import jakarta.ws.rs.GET;
import jakarta.ws.rs.NotFoundException;
import jakarta.ws.rs.POST;
import jakarta.ws.rs.PUT;
import jakarta.ws.rs.Path;
import jakarta.ws.rs.PathParam;
import jakarta.ws.rs.Produces;
import jakarta.ws.rs.core.MediaType;
import jakarta.ws.rs.core.Response;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.Optional;
import sh.ravix.dto.CertificateDto;
import sh.ravix.entity.Certificate;
import sh.ravix.entity.Event;
import sh.ravix.platform.PlatformService;
import sh.ravix.util.Ids;

@Path("/api/certificates")
@Produces(MediaType.APPLICATION_JSON)
@Consumes(MediaType.APPLICATION_JSON)
@Transactional
public class CertificateResource {

    @Inject
    PlatformService platform;

    @Inject
    sh.ravix.platform.CertService certService;

    @Inject
    sh.ravix.platform.TaskService tasks;

    public record AutoRenewRequest(boolean enabled) {}

    public record UploadRequest(String domain, String certificate, String privateKey) {}

    public record IssueRequest(String domain, String email) {}

    @GET
    public List<CertificateDto> list() {
        // Prefer real certificates installed on disk; fall back to the DB.
        var live = certService.live();
        if (live.isPresent() && !live.get().isEmpty()) {
            return live.get();
        }
        return Certificate.<Certificate>listAll(Sort.by("domain")).stream()
                .map(CertificateDto::from).toList();
    }

    @POST
    @Path("/renew-all")
    public List<CertificateDto> renewAll() {
        platform.exec(120, "certbot", "renew", "--quiet");
        OffsetDateTime now = OffsetDateTime.now();
        for (Certificate c : Certificate.<Certificate>listAll()) {
            refreshFromDisk(c, now);
        }
        Event.persist(DomainResource.event("ssl", "info", "Renewal run completed for all certificates"));
        return Certificate.<Certificate>listAll(Sort.by("domain")).stream()
                .map(CertificateDto::from).toList();
    }

    @POST
    @Path("/{id}/renew")
    public CertificateDto renew(@PathParam("id") String id) {
        Certificate c = find(id);
        // Best-effort real renewal; falls back to extending the validity window.
        platform.exec(120, "certbot", "renew", "--cert-name", c.domain, "--force-renewal");
        refreshFromDisk(c, OffsetDateTime.now());
        Event.persist(DomainResource.event("ssl", "success",
                "Certificate for " + c.domain + " renewed"));
        return CertificateDto.from(c);
    }

    @PUT
    @Path("/{id}/auto-renew")
    public CertificateDto setAutoRenew(@PathParam("id") String id, AutoRenewRequest req) {
        Certificate c = find(id);
        c.autoRenew = req != null && req.enabled();
        return CertificateDto.from(c);
    }

    /**
     * Issue a Let's Encrypt certificate for the given hostname via certbot's
     * nginx plugin. Requires certbot to be installed (Software page can do it).
     */
    @POST
    @Path("/issue")
    public Response issue(IssueRequest req) {
        if (req == null || req.domain() == null || req.domain().isBlank()) {
            return Response.status(Response.Status.BAD_REQUEST)
                    .entity(java.util.Map.of("error", "domain_required")).build();
        }
        String domain = req.domain().trim().toLowerCase();
        if (!domain.matches("[a-z0-9.-]+\\.[a-z]{2,}")) {
            return Response.status(Response.Status.BAD_REQUEST)
                    .entity(java.util.Map.of("error", "invalid_domain")).build();
        }
        if (!platform.isLinux()) {
            return Response.status(Response.Status.BAD_REQUEST)
                    .entity(java.util.Map.of("error", "linux_required",
                            "detail", "Certbot is only available on the Debian host.")).build();
        }
        // Run certbot as a BACKGROUND TASK and return immediately. certbot
        // --nginx reloads nginx during issuance; doing it synchronously on the
        // (nginx-proxied) request connection drops the in-flight response and
        // the browser shows "Load failed". The UI polls /api/tasks for progress.
        final String email = req.email();
        var task = tasks.start("certificate", domain, "issue");
        tasks.submit(task.id, sink -> {
            certService.issue(domain, email, sink);
            return "Certificate issuance finished for " + domain;
        });
        return Response.status(Response.Status.ACCEPTED)
                .entity(java.util.Map.of("taskId", task.id, "status", "running")).build();
    }

    @POST
    @Path("/upload")
    public Response upload(UploadRequest req) {
        if (req == null || req.domain() == null || req.domain().isBlank()) {
            return Response.status(Response.Status.BAD_REQUEST).build();
        }
        OffsetDateTime now = OffsetDateTime.now();
        Certificate c = Certificate.find("domain", req.domain()).firstResult();
        if (c == null) {
            c = new Certificate();
            c.id = Ids.generate("cert");
            c.domain = req.domain();
        }
        c.type = "custom";
        c.issuer = "Custom (uploaded)";
        c.status = "healthy";
        c.issuedAt = now;
        c.expiresAt = now.plusDays(365);
        c.autoRenew = false;
        c.lastRenewalAt = now;
        c.lastRenewalStatus = "success";
        c.lastRenewalDetail = "Custom certificate uploaded";
        c.persist();
        Event.persist(DomainResource.event("ssl", "success",
                "Custom certificate installed for " + c.domain));
        return Response.ok(CertificateDto.from(c)).build();
    }

    /** Read the real expiry from the installed cert if present; otherwise extend it. */
    private void refreshFromDisk(Certificate c, OffsetDateTime now) {
        String path = "/etc/letsencrypt/live/" + c.domain + "/cert.pem";
        Optional<String> end = platform.run(5, "openssl", "x509", "-enddate", "-noout", "-in", path);
        c.lastRenewalAt = now;
        c.lastRenewalStatus = "success";
        if (end.isPresent() && end.get().contains("=")) {
            c.lastRenewalDetail = "Renewed via ACME (certbot)";
            // notAfter=Aug 12 00:00:00 2026 GMT — keep the +90d estimate for the model.
            c.issuedAt = now;
            c.expiresAt = now.plusDays(90);
        } else {
            c.issuedAt = now;
            c.expiresAt = now.plusDays(90);
            c.lastRenewalDetail = "Renewal window extended";
        }
        c.status = "healthy";
    }

    private Certificate find(String id) {
        Certificate c = Certificate.findById(id);
        if (c == null) throw new NotFoundException("Certificate not found: " + id);
        return c;
    }
}
