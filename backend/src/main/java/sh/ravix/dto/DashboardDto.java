package sh.ravix.dto;

import java.util.List;

/** Aggregated dashboard payload. */
public record DashboardDto(
        Health health,
        Metrics metrics,
        Host host,
        List<ResourceMetric> resources,
        List<Point> cpuHistory,
        List<Point> queueHistory,
        QueueSummaryDto queueSummary) {

    public record Health(int score, String status, String summary) {}

    public record Host(int vcpus, double load, String dataPath) {}

    public record Metrics(
            long domains,
            long domainsNeedAttention,
            long mailboxes,
            long mailboxesActive,
            long mailboxesSuspended,
            long sslActive,
            long sslTotal,
            long queueTotal,
            long queueDeferred,
            long queueFailed) {}

    public record ResourceMetric(String label, double used, double total, String unit) {}

    public record Point(int t, double value) {}
}
