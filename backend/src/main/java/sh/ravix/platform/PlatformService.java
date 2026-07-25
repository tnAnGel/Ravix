package sh.ravix.platform;

import com.sun.management.OperatingSystemMXBean;
import jakarta.enterprise.context.ApplicationScoped;
import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.lang.management.ManagementFactory;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import java.util.concurrent.TimeUnit;
import org.jboss.logging.Logger;

/**
 * Thin abstraction over the host OS. On Linux it runs real commands / reads
 * /proc; everywhere else it degrades gracefully (empty Optionals, JVM-derived
 * metrics) so the backend still runs on a developer's machine.
 */
@ApplicationScoped
public class PlatformService {

    private static final Logger LOG = Logger.getLogger(PlatformService.class);

    private final boolean linux =
            System.getProperty("os.name", "").toLowerCase().contains("linux");

    public boolean isLinux() {
        return linux;
    }

    /** Run a command with a timeout; returns trimmed stdout, or empty on any failure. */
    public Optional<String> run(long timeoutSeconds, String... command) {
        return runEnv(timeoutSeconds, java.util.Map.of(), command);
    }

    /** Run a command with extra environment variables. */
    public Optional<String> runEnv(long timeoutSeconds, java.util.Map<String, String> env,
                                   String... command) {
        try {
            ProcessBuilder pb = new ProcessBuilder(command).redirectErrorStream(true);
            pb.environment().putAll(env);
            Process p = pb.start();
            StringBuilder out = new StringBuilder();
            try (BufferedReader r = new BufferedReader(
                    new InputStreamReader(p.getInputStream(), StandardCharsets.UTF_8))) {
                String line;
                while ((line = r.readLine()) != null) {
                    out.append(line).append('\n');
                }
            }
            if (!p.waitFor(timeoutSeconds, TimeUnit.SECONDS)) {
                p.destroyForcibly();
                return Optional.empty();
            }
            if (p.exitValue() != 0) {
                return Optional.empty();
            }
            return Optional.of(out.toString().trim());
        } catch (Exception e) {
            LOG.debugf("command failed (%s): %s", String.join(" ", command), e.getMessage());
            return Optional.empty();
        }
    }

    /** Run a /bin/sh -c command string (for pipes/redirects). */
    public Optional<String> shell(long timeoutSeconds, String script) {
        return run(timeoutSeconds, "/bin/sh", "-c", script);
    }

    /** Run a command, feeding {@code stdin} to it; returns true on exit code 0. */
    public boolean runWithStdin(long timeoutSeconds, String stdin, String... command) {
        try {
            Process p = new ProcessBuilder(command).redirectErrorStream(true).start();
            try (var os = p.getOutputStream()) {
                os.write(stdin.getBytes(StandardCharsets.UTF_8));
            }
            if (!p.waitFor(timeoutSeconds, TimeUnit.SECONDS)) {
                p.destroyForcibly();
                return false;
            }
            return p.exitValue() == 0;
        } catch (Exception e) {
            LOG.debugf("stdin command failed (%s): %s", String.join(" ", command), e.getMessage());
            return false;
        }
    }

    /** Run a command and report success regardless of output (for actions). */
    public boolean exec(long timeoutSeconds, String... command) {
        try {
            Process p = new ProcessBuilder(command).redirectErrorStream(true).start();
            if (!p.waitFor(timeoutSeconds, TimeUnit.SECONDS)) {
                p.destroyForcibly();
                return false;
            }
            return p.exitValue() == 0;
        } catch (Exception e) {
            LOG.debugf("exec failed (%s): %s", String.join(" ", command), e.getMessage());
            return false;
        }
    }

    public Optional<String> readFile(String path) {
        try {
            Path p = Path.of(path);
            if (!Files.isReadable(p)) return Optional.empty();
            return Optional.of(Files.readString(p).trim());
        } catch (Exception e) {
            return Optional.empty();
        }
    }

    public boolean fileExists(String path) {
        return Files.exists(Path.of(path));
    }

    /** Write a generated file (no backup) — used by the provisioner. */
    public boolean writeGenerated(String path, String content) {
        try {
            Path p = Path.of(path);
            if (p.getParent() != null) {
                Files.createDirectories(p.getParent());
            }
            Files.writeString(p, content);
            return true;
        } catch (Exception e) {
            LOG.warnf("write %s failed: %s", path, e.getMessage());
            return false;
        }
    }

    /** Write a config file, taking a backup of the existing one first. */
    public boolean writeFile(String path, String content) {
        try {
            Path p = Path.of(path);
            if (p.getParent() != null) {
                Files.createDirectories(p.getParent());
            }
            if (Files.exists(p)) {
                Files.copy(p, Path.of(path + ".ravixbak"),
                        java.nio.file.StandardCopyOption.REPLACE_EXISTING);
            }
            Files.writeString(p, content);
            return true;
        } catch (Exception e) {
            LOG.warnf("write %s failed: %s", path, e.getMessage());
            return false;
        }
    }

    /** Last {@code n} lines of a file (uses `tail` on Linux, full read otherwise). */
    public List<String> tail(String path, int n) {
        if (linux) {
            Optional<String> out = run(3, "tail", "-n", String.valueOf(n), path);
            if (out.isPresent() && !out.get().isBlank()) {
                return List.of(out.get().split("\n"));
            }
            return List.of();
        }
        try {
            Path p = Path.of(path);
            if (!Files.isReadable(p)) return List.of();
            List<String> all = Files.readAllLines(p);
            int from = Math.max(0, all.size() - n);
            return new ArrayList<>(all.subList(from, all.size()));
        } catch (Exception e) {
            return List.of();
        }
    }

    // --- Host metrics ------------------------------------------------------

    public int cpuCount() {
        return Runtime.getRuntime().availableProcessors();
    }

    /** System-wide CPU usage percentage (0-100). */
    public int cpuPercent() {
        OperatingSystemMXBean os = osBean();
        double load = os != null ? os.getCpuLoad() : -1;
        if (load < 0) {
            // Fallback to load average / cpu count.
            double avg = ManagementFactory.getOperatingSystemMXBean().getSystemLoadAverage();
            if (avg < 0) return 0;
            return (int) Math.min(100, Math.round((avg / cpuCount()) * 100));
        }
        return (int) Math.round(load * 100);
    }

    public double loadAverage() {
        double avg = ManagementFactory.getOperatingSystemMXBean().getSystemLoadAverage();
        return avg < 0 ? 0 : Math.round(avg * 100.0) / 100.0;
    }

    /** {used, total} memory in MB. */
    public long[] memoryMb() {
        OperatingSystemMXBean os = osBean();
        if (os != null) {
            long total = os.getTotalMemorySize();
            long free = os.getFreeMemorySize();
            if (total > 0) {
                return new long[] {(total - free) / 1_048_576L, total / 1_048_576L};
            }
        }
        Runtime rt = Runtime.getRuntime();
        long total = rt.maxMemory();
        long used = rt.totalMemory() - rt.freeMemory();
        return new long[] {used / 1_048_576L, total / 1_048_576L};
    }

    /** {used, total} disk space in GB for the data path. */
    public long[] diskGb(String path) {
        try {
            java.io.File f = new java.io.File(path);
            if (!f.exists()) f = new java.io.File("/");
            long total = f.getTotalSpace();
            long usable = f.getUsableSpace();
            if (total > 0) {
                return new long[] {(total - usable) / 1_073_741_824L, total / 1_073_741_824L};
            }
        } catch (Exception ignored) {
            // fall through
        }
        return new long[] {0, 0};
    }

    /** Human-readable uptime string. */
    public String uptime() {
        Optional<String> proc = readFile("/proc/uptime");
        if (proc.isPresent()) {
            try {
                double seconds = Double.parseDouble(proc.get().split("\\s+")[0]);
                return formatDuration((long) seconds);
            } catch (Exception ignored) {
                // fall through
            }
        }
        long jvmSeconds = ManagementFactory.getRuntimeMXBean().getUptime() / 1000;
        return formatDuration(jvmSeconds);
    }

    public String osName() {
        Optional<String> release = readFile("/etc/os-release");
        if (release.isPresent()) {
            for (String line : release.get().split("\n")) {
                if (line.startsWith("PRETTY_NAME=")) {
                    return line.substring(12).replace("\"", "").trim();
                }
            }
        }
        return System.getProperty("os.name") + " " + System.getProperty("os.version");
    }

    public String kernel() {
        return run(2, "uname", "-r").orElse(System.getProperty("os.version"));
    }

    public String arch() {
        return System.getProperty("os.arch");
    }

    public String hostname() {
        Optional<String> h = readFile("/etc/hostname");
        if (h.isPresent() && !h.get().isBlank()) return h.get();
        return run(2, "hostname").orElseGet(() -> {
            try {
                return java.net.InetAddress.getLocalHost().getHostName();
            } catch (Exception e) {
                return "localhost";
            }
        });
    }

    private OperatingSystemMXBean osBean() {
        try {
            java.lang.management.OperatingSystemMXBean bean =
                    ManagementFactory.getOperatingSystemMXBean();
            if (bean instanceof OperatingSystemMXBean sun) {
                return sun;
            }
        } catch (Throwable ignored) {
            // not available
        }
        return null;
    }

    private static String formatDuration(long seconds) {
        long days = seconds / 86400;
        long hours = (seconds % 86400) / 3600;
        long mins = (seconds % 3600) / 60;
        if (days > 0) return String.format("%dd %dh %dm", days, hours, mins);
        if (hours > 0) return String.format("%dh %dm", hours, mins);
        return String.format("%dm", mins);
    }
}
