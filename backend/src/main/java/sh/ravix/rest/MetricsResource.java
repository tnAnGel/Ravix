package sh.ravix.rest;

import jakarta.inject.Inject;
import jakarta.ws.rs.GET;
import jakarta.ws.rs.Path;
import jakarta.ws.rs.Produces;
import jakarta.ws.rs.core.Response;
import java.time.OffsetDateTime;
import java.time.temporal.ChronoUnit;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.eclipse.microprofile.config.inject.ConfigProperty;
import sh.ravix.entity.Alias;
import sh.ravix.entity.Campaign;
import sh.ravix.entity.Certificate;
import sh.ravix.entity.Domain;
import sh.ravix.entity.Mailbox;
import sh.ravix.entity.Organization;
import sh.ravix.entity.QueueItem;
import sh.ravix.entity.ServiceStatus;
import sh.ravix.platform.ServiceStatusService;

/**
 * Prometheus exporter (Band 3 — monitoring). Exposes operational gauges in the
 * Prometheus text format at {@code /api/metrics} and a JSON alert summary at
 * {@code /api/monitoring/alerts}.
 *
 * {@code /api/metrics} is allow-listed in AuthFilter so a scraper can reach it
 * without a panel session. It exposes only non-sensitive counters. Set
 * {@code ravix.metrics.token} to require {@code ?token=} on the scrape URL.
 */
@Path("/api")
public class MetricsResource {

    // Optional, not defaultValue="" — SmallRye treats an empty default as
    // "missing" and crashes at startup when the property is unset.
    @ConfigProperty(name = "ravix.metrics.token")
    java.util.Optional<String> metricsToken;

    @Inject
    sh.ravix.auth.CurrentUser currentUser;

    @Inject
    sh.ravix.platform.ServiceStatusService serviceStatus;

    @GET
    @Path("/metrics")
    @Produces("text/plain; version=0.0.4; charset=utf-8")
    public Response metrics(@jakarta.ws.rs.QueryParam("token") String token) {
        String required = metricsToken.filter(s -> !s.isBlank()).orElse(null);
        if (required != null && !required.equals(token)) {
            return Response.status(Response.Status.UNAUTHORIZED).build();
        }
        StringBuilder b = new StringBuilder(2048);

        gauge(b, "ravix_up", "Panel liveness", 1);
        gauge(b, "ravix_domains_total", "Managed domains", Domain.count());
        gauge(b, "ravix_mailboxes_total", "Mailboxes", Mailbox.count());
        gauge(b, "ravix_aliases_total", "Aliases", Alias.count());
        gauge(b, "ravix_campaigns_total", "Campaigns", Campaign.count());
        gauge(b, "ravix_organizations_total", "Tenant organizations", Organization.count());

        // Service up/down.
        b.append("# HELP ravix_service_up Mail service running (1) or not (0)\n");
        b.append("# TYPE ravix_service_up gauge\n");
        for (ServiceStatus s : serviceStatus.live()) {
            b.append("ravix_service_up{service=\"").append(esc(s.name)).append("\"} ")
                    .append(ServiceStatusService.isUp(s) ? 1 : 0).append('\n');
        }

        // Queue by state.
        b.append("# HELP ravix_queue_messages Messages in the mail queue by state\n");
        b.append("# TYPE ravix_queue_messages gauge\n");
        Map<String, Long> byState = new LinkedHashMap<>();
        byState.put("active", 0L);
        byState.put("deferred", 0L);
        byState.put("hold", 0L);
        for (QueueItem q : QueueItem.<QueueItem>listAll()) {
            String st = q.state == null ? "active" : q.state.toLowerCase();
            byState.merge(st, 1L, Long::sum);
        }
        byState.forEach((st, n) ->
                b.append("ravix_queue_messages{state=\"").append(esc(st)).append("\"} ").append(n).append('\n'));

        // Certificate expiry (days remaining).
        b.append("# HELP ravix_certificate_expiry_days Days until the TLS certificate expires\n");
        b.append("# TYPE ravix_certificate_expiry_days gauge\n");
        OffsetDateTime now = OffsetDateTime.now();
        for (Certificate c : Certificate.<Certificate>listAll()) {
            if (c.expiresAt == null) continue;
            long days = ChronoUnit.DAYS.between(now, c.expiresAt);
            b.append("ravix_certificate_expiry_days{domain=\"").append(esc(c.domain)).append("\"} ")
                    .append(days).append('\n');
        }

        return Response.ok(b.toString()).build();
    }

    private static void gauge(StringBuilder b, String name, String help, long value) {
        b.append("# HELP ").append(name).append(' ').append(help).append('\n');
        b.append("# TYPE ").append(name).append(" gauge\n");
        b.append(name).append(' ').append(value).append('\n');
    }

    private static String esc(String s) {
        return s == null ? "" : s.replace("\\", "\\\\").replace("\"", "\\\"");
    }

    // --- Alert summary (authed) --------------------------------------------

    public record Alert(String severity, String category, String message) {}

    @GET
    @Path("/monitoring/alerts")
    @Produces("application/json")
    public List<Alert> alerts() {
        List<Alert> out = new java.util.ArrayList<>();
        OffsetDateTime now = OffsetDateTime.now();

        for (ServiceStatus s : serviceStatus.live()) {
            if (!ServiceStatusService.isUp(s)) {
                out.add(new Alert("critical", "service", s.name + " is not running"));
            }
        }
        for (Certificate c : Certificate.<Certificate>listAll()) {
            if (c.expiresAt == null) continue;
            long days = ChronoUnit.DAYS.between(now, c.expiresAt);
            if (days < 0) {
                out.add(new Alert("critical", "certificate", c.domain + " certificate expired"));
            } else if (days <= 14) {
                out.add(new Alert("warning", "certificate", c.domain + " certificate expires in " + days + "d"));
            }
        }
        long deferred = QueueItem.count("state", "deferred");
        if (deferred >= 25) {
            out.add(new Alert("warning", "queue", deferred + " deferred messages in the queue"));
        }
        long held = QueueItem.count("state", "hold");
        if (held > 0) {
            out.add(new Alert("warning", "queue", held + " messages on hold"));
        }
        return out;
    }
}
