package sh.ravix.rest;

import sh.ravix.auth.OrgFiltered;

import jakarta.inject.Inject;
import jakarta.transaction.Transactional;
import jakarta.ws.rs.GET;
import jakarta.ws.rs.NotFoundException;
import jakarta.ws.rs.Path;
import jakarta.ws.rs.PathParam;
import jakarta.ws.rs.Produces;
import jakarta.ws.rs.core.MediaType;
import java.util.List;
import sh.ravix.entity.AppSetting;
import sh.ravix.entity.Domain;
import sh.ravix.platform.MtaStsService;
import sh.ravix.platform.PlatformService;

/** MTA-STS / TLS-RPT / DANE posture per domain. */
@Path("/api/tls-security")
@Produces(MediaType.APPLICATION_JSON)
@Transactional
@OrgFiltered
public class TlsSecurityResource {

    @Inject
    MtaStsService mtaSts;

    @Inject
    PlatformService platform;

    /** Posture for every configured domain. */
    @GET
    public List<MtaStsService.Posture> all() {
        String mailHost = mailHostname();
        return Domain.<Domain>listAll().stream()
                .map(d -> mtaSts.evaluate(d.name, mailHost))
                .toList();
    }

    /** Posture for a single domain. */
    @GET
    @Path("/{id}")
    public MtaStsService.Posture one(@PathParam("id") String id) {
        Domain d = Domain.<Domain>find("id", id).firstResult();
        if (d == null) throw new NotFoundException();
        return mtaSts.evaluate(d.name, mailHostname());
    }

    private String mailHostname() {
        AppSetting h = AppSetting.findById("hostname");
        return h != null && h.value != null && !h.value.isBlank() ? h.value : platform.hostname();
    }
}
