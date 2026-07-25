package sh.ravix.rest;

import jakarta.inject.Inject;
import jakarta.transaction.Transactional;
import jakarta.ws.rs.GET;
import jakarta.ws.rs.Path;
import jakarta.ws.rs.Produces;
import jakarta.ws.rs.core.MediaType;
import java.util.ArrayList;
import java.util.List;
import org.eclipse.microprofile.config.inject.ConfigProperty;
import sh.ravix.dto.DashboardDto;
import sh.ravix.dto.QueueSummaryDto;
import sh.ravix.entity.Certificate;
import sh.ravix.entity.Domain;
import sh.ravix.entity.Mailbox;
import sh.ravix.platform.MetricsHistory;
import sh.ravix.platform.PlatformService;

@Path("/api/dashboard")
@Produces(MediaType.APPLICATION_JSON)
@Transactional
public class DashboardResource {

    @Inject
    PlatformService platform;

    @Inject
    MetricsHistory history;

    @Inject
    sh.ravix.platform.QueueService queueService;

    @ConfigProperty(name = "ravix.paths.data", defaultValue = "/var/lib/ravix")
    String dataPath;

    @GET
    public DashboardDto get() {
        long domains = Domain.count();
        long domainsNeedAttention = Domain.count("status <> 'healthy'");
        long mailboxes = Mailbox.count();
        long mailboxesActive = Mailbox.count("status", "active");
        long mailboxesSuspended = Mailbox.count("status", "suspended");
        long sslTotal = Certificate.count();
        long sslActive = Certificate.count("status <> 'critical'");

        QueueSummaryDto queue = queueService.summary();

        // Health score derived from outstanding issues across real data.
        int score = 100;
        score -= (int) Domain.count("status", "warning") * 8;
        score -= (int) Domain.count("status", "critical") * 16;
        score -= (int) (sslTotal - sslActive) * 6;
        score -= (int) queue.failed() * 2;
        score = Math.max(0, Math.min(100, score));
        String status = score >= 90 ? "healthy" : score >= 60 ? "warning" : "critical";
        String summary = domainsNeedAttention == 0
                ? "All systems healthy"
                : domainsNeedAttention + " domain" + (domainsNeedAttention == 1 ? "" : "s") + " need attention";

        DashboardDto.Metrics metrics = new DashboardDto.Metrics(
                domains, domainsNeedAttention, mailboxes, mailboxesActive, mailboxesSuspended,
                sslActive, sslTotal, queue.total(), queue.deferred(), queue.failed());

        // Live host metrics.
        int cpu = platform.cpuPercent();
        long[] mem = platform.memoryMb();
        long[] disk = platform.diskGb(dataPath);
        history.record(cpu, queue.total());

        List<DashboardDto.ResourceMetric> resources = List.of(
                new DashboardDto.ResourceMetric("CPU", cpu, 100, "%"),
                new DashboardDto.ResourceMetric("RAM", mem[0], mem[1], "MB"),
                new DashboardDto.ResourceMetric("Disk", disk[0], disk[1], "GB"));

        return new DashboardDto(
                new DashboardDto.Health(score, status, summary),
                metrics,
                new DashboardDto.Host(platform.cpuCount(), platform.loadAverage(), dataPath),
                resources,
                toPoints(history.cpu()),
                toPoints(history.queue()),
                queue);
    }

    private List<DashboardDto.Point> toPoints(List<Double> samples) {
        List<DashboardDto.Point> points = new ArrayList<>(samples.size());
        for (int i = 0; i < samples.size(); i++) {
            points.add(new DashboardDto.Point(i, samples.get(i)));
        }
        return points;
    }
}
