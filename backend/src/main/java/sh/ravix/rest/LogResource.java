package sh.ravix.rest;

import io.quarkus.panache.common.Sort;
import jakarta.inject.Inject;
import jakarta.transaction.Transactional;
import jakarta.ws.rs.GET;
import jakarta.ws.rs.Path;
import jakarta.ws.rs.Produces;
import jakarta.ws.rs.QueryParam;
import jakarta.ws.rs.core.MediaType;
import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import org.eclipse.microprofile.config.inject.ConfigProperty;
import sh.ravix.entity.LogLine;
import sh.ravix.platform.PlatformService;

@Path("/api/logs")
@Produces(MediaType.APPLICATION_JSON)
@Transactional
public class LogResource {

    @Inject
    PlatformService platform;

    @ConfigProperty(name = "ravix.log.postfix") String postfixLog;
    @ConfigProperty(name = "ravix.log.dovecot") String dovecotLog;
    @ConfigProperty(name = "ravix.log.rspamd") String rspamdLog;
    @ConfigProperty(name = "ravix.log.nginx") String nginxLog;
    @ConfigProperty(name = "ravix.log.ravix") String ravixLog;

    @GET
    public List<LogLine> list(@QueryParam("source") String source) {
        List<String> sources = (source == null || source.isBlank() || "all".equals(source))
                ? List.of("postfix", "dovecot", "rspamd", "nginx", "ravix")
                : List.of(source);

        List<LogLine> live = new ArrayList<>();
        for (String src : sources) {
            String path = pathFor(src);
            if (path == null) continue;
            List<String> lines = platform.tail(path, 80);
            for (String line : lines) {
                if (line.isBlank()) continue;
                live.add(toLogLine(src, line));
            }
        }

        if (!live.isEmpty()) {
            live.sort((a, b) -> b.timestamp.compareTo(a.timestamp));
            return live;
        }

        // Fallback: seeded log lines (developer machine / no log files present).
        Sort sort = Sort.by("timestamp").descending();
        if (source != null && !source.isBlank() && !"all".equals(source)) {
            return LogLine.list("source", sort, source);
        }
        return LogLine.listAll(sort);
    }

    private String pathFor(String src) {
        return switch (src) {
            case "postfix" -> postfixLog;
            case "dovecot" -> dovecotLog;
            case "rspamd" -> rspamdLog;
            case "nginx" -> nginxLog;
            case "ravix" -> ravixLog;
            default -> null;
        };
    }

    private static final Map<String, String> ERR_WORDS =
            Map.of("error", "error", "fatal", "error", "fail", "error",
                    "warn", "warning", "warning", "warning");

    private LogLine toLogLine(String src, String line) {
        LogLine l = new LogLine();
        l.id = src + ":" + Integer.toHexString(line.hashCode());
        l.source = src;
        l.timestamp = OffsetDateTime.now();
        l.process = src;
        l.message = line;
        String low = line.toLowerCase();
        l.level = "info";
        for (var e : ERR_WORDS.entrySet()) {
            if (low.contains(e.getKey())) { l.level = e.getValue(); break; }
        }
        return l;
    }
}
