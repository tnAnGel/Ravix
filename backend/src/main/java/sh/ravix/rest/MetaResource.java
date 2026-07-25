package sh.ravix.rest;

import io.quarkus.panache.common.Sort;
import jakarta.inject.Inject;
import jakarta.transaction.Transactional;
import jakarta.ws.rs.GET;
import jakarta.ws.rs.Path;
import jakarta.ws.rs.Produces;
import jakarta.ws.rs.core.MediaType;
import java.util.List;
import sh.ravix.entity.DeliverabilityCheck;
import sh.ravix.entity.Domain;
import sh.ravix.entity.ServiceStatus;
import sh.ravix.platform.MailReadinessService;
import sh.ravix.platform.PlatformService;

/** Read-only reference data: service statuses and the deliverability checklist. */
@Path("/api")
@Produces(MediaType.APPLICATION_JSON)
@Transactional
public class MetaResource {

    @Inject
    PlatformService platform;

    @Inject
    MailReadinessService readiness;

    @Inject
    sh.ravix.platform.ServiceStatusService serviceStatus;

    @GET
    @Path("/services")
    public List<ServiceStatus> services() {
        return ServiceStatus.<ServiceStatus>listAll(Sort.by("sortOrder")).stream()
                .map(serviceStatus::overlay).toList();
    }

    /** Deliverability checklist derived from the live mail-readiness probe
     *  plus per-domain DNS state. Previously this just returned static seed
     *  rows from DB; now every row reflects something the operator can act
     *  on (port 25 blocked? DKIM not published? SPF -all? domain in DNS?). */
    @GET
    @Path("/deliverability")
    public List<DeliverabilityCheck> deliverability() {
        java.util.List<DeliverabilityCheck> out = new java.util.ArrayList<>();
        // 1. Outbound transport — feeds the same status the readiness banner shows.
        MailReadinessService.Readiness r = readiness.check();
        int i = 0;
        for (MailReadinessService.Check c : r.checks()) {
            DeliverabilityCheck d = new DeliverabilityCheck();
            d.id = c.key();
            d.label = c.label();
            d.status = switch (c.status()) {
                case PASS -> "pass";
                case WARN, INFO -> "warn";
                case FAIL -> "fail";
            };
            d.detail = c.detail();
            d.sortOrder = i++;
            out.add(d);
        }
        // 2. Per-domain DNS state — each domain contributes MX/SPF/DKIM/DMARC
        // rows so the operator sees exactly which leg is broken on which domain.
        for (Domain dom : Domain.<Domain>listAll()) {
            out.add(rowOf("domain-mx-" + dom.id,   dom.name + " — MX",    dom.checkMx,    i++));
            out.add(rowOf("domain-spf-" + dom.id,  dom.name + " — SPF",   dom.checkSpf,   i++));
            out.add(rowOf("domain-dkim-" + dom.id, dom.name + " — DKIM",  dom.checkDkim,  i++));
            out.add(rowOf("domain-dmarc-" + dom.id,dom.name + " — DMARC", dom.checkDmarc, i++));
        }
        // 3. Seed extras (anything the operator added through UI), kept for completeness.
        for (DeliverabilityCheck seed : DeliverabilityCheck.<DeliverabilityCheck>listAll(Sort.by("sortOrder"))) {
            // Avoid clashing with the synthetic ids above.
            if (out.stream().noneMatch(d -> d.id.equals(seed.id))) {
                seed.sortOrder = i++;
                out.add(seed);
            }
        }
        return out;
    }

    /** Map the domain-level "pass/warn/fail/pending" labels into the
     *  deliverability checklist's row shape. */
    private DeliverabilityCheck rowOf(String id, String label, String checkStatus, int order) {
        DeliverabilityCheck d = new DeliverabilityCheck();
        d.id = id;
        d.label = label;
        d.status = switch (checkStatus == null ? "pending" : checkStatus) {
            case "pass"   -> "pass";
            case "fail"   -> "fail";
            case "warn"   -> "warn";
            default       -> "warn";
        };
        d.detail = "Live state from DNS — open the domain page to see the expected vs detected value.";
        d.sortOrder = order;
        return d;
    }

}
