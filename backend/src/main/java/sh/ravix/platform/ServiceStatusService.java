package sh.ravix.platform;

import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;
import java.util.List;
import java.util.Optional;
import sh.ravix.entity.ServiceStatus;

/**
 * Single source of truth for "is this mail service running right now". The
 * {@code service_status} table only holds seed metadata (name, description,
 * sort order) — its {@code state} column is NOT kept in sync with the host, so
 * reading it directly reports every service as whatever was last seeded
 * (typically "stopped"). The /services page already overlaid live systemd
 * state; this centralises that logic so the monitoring alerts and the
 * Prometheus exporter report the SAME live truth instead of the stale column.
 */
@ApplicationScoped
public class ServiceStatusService {

    @Inject
    PlatformService platform;

    /** Whether a (possibly live-overlaid) status counts as up. Exact tokens, not
     *  substrings — a substring match wrongly classified "inactive" as up
     *  (it contains "active"). overlay() already normalises systemd output to
     *  running/degraded/stopped, so these four cover every real value. */
    public static boolean isUp(ServiceStatus s) {
        String st = s.state == null ? "" : s.state.trim().toLowerCase();
        return switch (st) {
            case "running", "active", "up", "online" -> true;
            default -> false;
        };
    }

    /** All registered services with their state overlaid from live systemd. */
    public List<ServiceStatus> live() {
        return ServiceStatus.<ServiceStatus>listAll().stream().map(this::overlay).toList();
    }

    /** Copy {@code s} with {@link ServiceStatus#state} replaced by live
     *  {@code systemctl is-active <id>} (off-Linux or when the probe fails, the
     *  seed state is kept so dev/test output stays meaningful). */
    public ServiceStatus overlay(ServiceStatus s) {
        if (!platform.isLinux()) return s;
        ServiceStatus out = new ServiceStatus();
        out.id = s.id;
        out.name = s.name;
        out.description = s.description;
        out.version = s.version;
        out.memoryMb = s.memoryMb;
        out.sortOrder = s.sortOrder;
        out.uptime = s.uptime;

        Optional<String> active = platform.run(3, "systemctl", "is-active", s.id);
        if (active.isEmpty()) {
            out.state = s.state;
            return out;
        }
        out.state = switch (active.get().trim()) {
            case "active" -> "running";
            case "activating", "reloading" -> "degraded";
            default -> "stopped";
        };
        return out;
    }
}
