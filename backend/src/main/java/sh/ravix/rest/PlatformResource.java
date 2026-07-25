package sh.ravix.rest;

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
import jakarta.ws.rs.QueryParam;
import jakarta.ws.rs.core.MediaType;
import jakarta.ws.rs.core.Response;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import sh.ravix.dto.SoftwareComponentDto;
import sh.ravix.entity.Event;
import sh.ravix.platform.PlatformService;
import sh.ravix.platform.SoftwareCatalog;

/** Software provisioning: install / service control / config editing for the mail stack. */
@Path("/api/platform")
@Produces(MediaType.APPLICATION_JSON)
@Consumes(MediaType.APPLICATION_JSON)
public class PlatformResource {

    @Inject
    PlatformService platform;

    @Inject
    sh.ravix.platform.ProvisioningService provisioning;

    @Inject
    sh.ravix.platform.TaskService tasks;

    private static final List<String> ACTIONS =
            List.of("install", "reinstall", "uninstall", "start", "stop", "restart");

    public record ConfigWrite(String path, String content) {}

    // --- Components --------------------------------------------------------

    @GET
    @Path("/components")
    public List<SoftwareComponentDto> components() {
        return SoftwareCatalog.COMPONENTS.stream().map(this::toDto).toList();
    }

    @GET
    @Path("/components/{id}")
    public SoftwareComponentDto component(@PathParam("id") String id) {
        SoftwareCatalog.Component c = SoftwareCatalog.byId(id);
        if (c == null) throw new NotFoundException();
        return toDto(c);
    }

    // --- Actions -----------------------------------------------------------

    @POST
    @Path("/components/{id}/{action}")
    public Response action(@PathParam("id") String id, @PathParam("action") String action) {
        SoftwareCatalog.Component c = SoftwareCatalog.byId(id);
        if (c == null) throw new NotFoundException();
        if (!ACTIONS.contains(action)) {
            return Response.status(Response.Status.BAD_REQUEST)
                    .entity(Map.of("error", "unknown_action")).build();
        }

        // Slow operations (apt) run as a BackgroundTask so the HTTP thread
        // returns immediately and the UI can poll for progress + log. Service
        // control (start/stop/restart) is fast — keep it synchronous.
        if (action.equals("install") || action.equals("reinstall") || action.equals("uninstall")) {
            sh.ravix.entity.BackgroundTask t = tasks.start("software", c.id(), action);
            tasks.submit(t.id, sink -> {
                sink.append("$ " + action + " " + c.pkg() + "  (component: " + c.name() + ")");
                Optional<String> output = switch (action) {
                    case "install" -> install(c, sink);
                    case "reinstall" -> aptCmd(sink, concat(new String[]{"install", "-y", "--reinstall"}, pkgs(c)));
                    case "uninstall" -> aptCmd(sink, concat(new String[]{"remove", "-y"}, pkgs(c)));
                    default -> Optional.empty();
                };
                if (output.isEmpty()) {
                    throw new RuntimeException(action + " failed (see log)");
                }
                logEvent(action, c, true);
                return "\n# " + action + " done.";
            });
            return Response.accepted(Map.of(
                    "taskId", t.id,
                    "status", "running",
                    "action", action,
                    "componentId", c.id())).build();
        }

        // start / stop / restart — synchronous, fast.
        Optional<String> output = Optional.empty();
        if (c.unit() != null) {
            output = platform.run(20, "systemctl", action, c.unit());
            if (output.isEmpty()) output = Optional.of("");
        }
        boolean ok = output.isPresent();
        logEvent(action, c, ok);
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("ok", ok);
        body.put("output", output.orElse("This action requires systemd on the target host."));
        body.put("component", toDto(c));
        return Response.ok(body).build();
    }

    @Transactional
    void logEvent(String action, SoftwareCatalog.Component c, boolean ok) {
        String detail = c != null
                ? "Software: " + action + " " + c.name() + (ok ? " ok" : " — failed")
                : "Apply config: " + (ok ? "ok" : "failed");
        Event.persist(DomainResource.event("system", ok ? "info" : "warning", detail));
    }

    // --- Apply configuration (render DB → mail-stack config) ---------------

    @POST
    @Path("/apply")
    public Response apply() {
        // Async: rendering Postfix/Dovecot/OpenDKIM/Rspamd configs + reloading
        // those services takes a few seconds and shouldn't tie up an HTTP
        // worker. Return a task id immediately so the UI can show progress.
        sh.ravix.entity.BackgroundTask t = tasks.start("apply", null, "apply");
        tasks.submit(t.id, sink -> {
            sink.append("▸ Rendering Postfix / Dovecot / OpenDKIM / Rspamd configuration…");
            var result = provisioning.syncAll();
            for (String f : result.files()) sink.append("  wrote " + f);
            sink.append(result.reloaded()
                    ? "▸ Reloaded mail services."
                    : "▸ Reload skipped (no MTA on this host).");
            logEvent("apply", null, true);
            return "✓ Applied (" + result.files().size() + " files).";
        });
        return Response.accepted(Map.of(
                "taskId", t.id, "status", "running", "action", "apply")).build();
    }

    // --- Config editor -----------------------------------------------------

    @GET
    @Path("/config")
    public Response readConfig(@QueryParam("path") String path) {
        if (path == null || !SoftwareCatalog.isAllowedConfigPath(path)) {
            return Response.status(Response.Status.FORBIDDEN)
                    .entity(Map.of("error", "path_not_allowed")).build();
        }
        boolean exists = platform.fileExists(path);
        String content = platform.readFile(path).orElse("");
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("path", path);
        body.put("exists", exists);
        body.put("content", content);
        return Response.ok(body).build();
    }

    @PUT
    @Path("/config")
    @Transactional
    public Response writeConfig(ConfigWrite req) {
        if (req == null || req.path() == null || !SoftwareCatalog.isAllowedConfigPath(req.path())) {
            return Response.status(Response.Status.FORBIDDEN)
                    .entity(Map.of("error", "path_not_allowed")).build();
        }
        boolean ok = platform.writeFile(req.path(), req.content() == null ? "" : req.content());
        Event.persist(DomainResource.event("system", ok ? "info" : "warning",
                "Config " + (ok ? "saved" : "save failed") + ": " + req.path()));
        return Response.ok(Map.of("ok", ok)).build();
    }

    // --- Mapping -----------------------------------------------------------

    /**
     * Install a component non-interactively, streaming output to the task log.
     */
    private Optional<String> install(SoftwareCatalog.Component c,
                                     sh.ravix.platform.TaskService.LogSink sink) {
        sink.append("▸ Refreshing apt index…");
        platform.runEnv(60, DEBIAN_NONINTERACTIVE, "apt-get", "update")
                .ifPresent(sink::append);

        if ("postfix".equals(c.id())) {
            String hostname = platform.hostname();
            sink.append("▸ Preseeding Postfix debconf (Internet Site, " + hostname + ")…");
            platform.shell(15,
                    "echo \"postfix postfix/main_mailer_type select Internet Site\" | debconf-set-selections; "
                  + "echo \"postfix postfix/mailname string " + hostname + "\" | debconf-set-selections");
        }

        sink.append("▸ apt-get install -y " + c.pkg() + " …");
        Optional<String> installed = platform.runEnv(
                300, DEBIAN_NONINTERACTIVE,
                concat(new String[]{"apt-get", "install", "-y",
                        "-o", "Dpkg::Options::=--force-confdef",
                        "-o", "Dpkg::Options::=--force-confold"}, pkgs(c)));
        if (installed.isEmpty()) {
            sink.append("✗ apt-get install failed");
            return Optional.empty();
        }
        sink.append(installed.get());

        if (c.unit() != null) {
            sink.append("▸ systemctl enable --now " + c.unit());
            platform.run(20, "systemctl", "enable", "--now", c.unit())
                    .ifPresent(sink::append);
        }
        return Optional.of("ok");
    }

    private static final java.util.Map<String, String> DEBIAN_NONINTERACTIVE =
            java.util.Map.of("DEBIAN_FRONTEND", "noninteractive");

    /** Split a component's (possibly multi-package) pkg string into args. */
    private static String[] pkgs(SoftwareCatalog.Component c) {
        return c.pkg().trim().split("\\s+");
    }

    /** Concatenate a fixed prefix with a variable tail (package list). */
    private static String[] concat(String[] head, String[] tail) {
        String[] out = new String[head.length + tail.length];
        System.arraycopy(head, 0, out, 0, head.length);
        System.arraycopy(tail, 0, out, head.length, tail.length);
        return out;
    }

    private Optional<String> aptCmd(sh.ravix.platform.TaskService.LogSink sink, String... args) {
        sink.append("▸ apt-get " + String.join(" ", args));
        String[] cmd = new String[args.length + 1];
        cmd[0] = "apt-get";
        System.arraycopy(args, 0, cmd, 1, args.length);
        Optional<String> out = platform.runEnv(300, DEBIAN_NONINTERACTIVE, cmd);
        out.ifPresent(sink::append);
        return out;
    }

    private SoftwareComponentDto toDto(SoftwareCatalog.Component c) {
        boolean installed;
        String version;
        if (platform.isLinux()) {
            // A component may list several space-separated packages (e.g.
            // Dovecot = imapd + lmtpd + sieve). The first one is primary and
            // determines "installed" + the displayed version.
            String primary = c.pkg().trim().split("\\s+")[0];
            Optional<String> v = platform.run(3, "dpkg-query", "-W", "-f=${Version}", primary);
            installed = v.isPresent() && !v.get().isBlank();
            version = installed ? v.get().split("-")[0] : "";
        } else {
            installed = false;
            version = "";
        }

        boolean hasService = c.unit() != null;
        String serviceState = "unknown";
        if (hasService && platform.isLinux()) {
            String active = platform.run(3, "systemctl", "is-active", c.unit()).orElse("unknown").trim();
            serviceState = switch (active) {
                case "active" -> "running";
                case "activating", "reloading" -> "degraded";
                case "inactive", "failed", "dead" -> "stopped";
                default -> installed ? "stopped" : "unknown";
            };
        }

        List<SoftwareComponentDto.ConfigFileDto> configs = c.configs().stream()
                .map(f -> new SoftwareComponentDto.ConfigFileDto(
                        f.path(), f.label(), platform.fileExists(f.path())))
                .toList();

        return new SoftwareComponentDto(
                c.id(), c.name(), c.description(), c.pkg(),
                installed, version, hasService, serviceState, configs);
    }
}
