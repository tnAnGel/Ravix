package sh.ravix.rest;

import io.quarkus.panache.common.Sort;
import jakarta.inject.Inject;
import jakarta.transaction.Transactional;
import jakarta.ws.rs.GET;
import jakarta.ws.rs.Path;
import jakarta.ws.rs.Produces;
import jakarta.ws.rs.core.MediaType;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import sh.ravix.dto.SystemDto;
import sh.ravix.entity.AppSetting;
import sh.ravix.entity.CommandCheck;
import sh.ravix.entity.InstallLog;
import sh.ravix.entity.PackageStatus;
import sh.ravix.platform.PlatformService;

@Path("/api/system")
@Produces(MediaType.APPLICATION_JSON)
@Transactional
public class SystemResource {

    @Inject
    PlatformService platform;

    @GET
    public SystemDto get() {
        Map<String, String> s = new HashMap<>();
        for (AppSetting a : AppSetting.<AppSetting>listAll()) {
            s.put(a.key, a.value);
        }

        // Live OS facts (fall back to stored settings when a field is unavailable).
        String os = platform.osName();
        String kernel = platform.kernel();
        String arch = platform.arch();
        String uptime = platform.uptime();
        String hostname = s.getOrDefault("hostname", platform.hostname());

        List<PackageStatus> packages =
                PackageStatus.<PackageStatus>listAll(Sort.by("sortOrder")).stream()
                        .map(this::livePackage).toList();
        List<CommandCheck> commands =
                CommandCheck.<CommandCheck>listAll(Sort.by("sortOrder")).stream()
                        .map(this::liveCommand).toList();
        List<InstallLog> installLog = InstallLog.listAll(Sort.by("sortOrder"));

        return new SystemDto(
                hostname,
                s.get("version"),
                s.get("install_mode"),
                os,
                kernel,
                arch,
                uptime,
                s.get("system_user"),
                new SystemDto.Paths(
                        s.get("path_app"), s.get("path_config"), s.get("path_data"),
                        s.get("path_logs"), s.get("path_sqlite")),
                packages,
                commands,
                installLog);
    }

    /** Query the real installed version via dpkg; keep seed values as a fallback. */
    private PackageStatus livePackage(PackageStatus p) {
        if (platform.isLinux()) {
            Optional<String> v = platform.run(3, "dpkg-query", "-W", "-f=${Version}", p.name);
            PackageStatus out = new PackageStatus();
            out.name = p.name;
            if (v.isPresent() && !v.get().isBlank()) {
                out.version = v.get().split("-")[0];
                out.status = "installed";
            } else {
                out.version = p.version;
                out.status = "not installed";
            }
            return out;
        }
        return p;
    }

    /** Run the health-check command for real on Linux; keep seed otherwise.
     *  Goes through `bash -c` so shell substitutions like $(hostname) in the
     *  seed strings actually expand — the previous direct argv split treated
     *  $(...) as a literal argument and every such check reported
     *  "command failed". */
    private CommandCheck liveCommand(CommandCheck c) {
        if (platform.isLinux()) {
            Optional<String> out = platform.run(5, "bash", "-c", c.cmd);
            CommandCheck live = new CommandCheck();
            live.cmd = c.cmd;
            live.ok = out.isPresent();
            String first = out.map(o -> o.isBlank() ? "(no output)" : o.split("\n")[0])
                              .orElse("command failed");
            live.result = first.length() > 120 ? first.substring(0, 120) : first;
            return live;
        }
        return c;
    }
}
