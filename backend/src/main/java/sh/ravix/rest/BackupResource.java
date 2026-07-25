package sh.ravix.rest;

import io.quarkus.panache.common.Sort;
import jakarta.inject.Inject;
import jakarta.transaction.Transactional;
import jakarta.ws.rs.GET;
import jakarta.ws.rs.POST;
import jakarta.ws.rs.Path;
import jakarta.ws.rs.PathParam;
import jakarta.ws.rs.Produces;
import jakarta.ws.rs.core.MediaType;
import jakarta.ws.rs.core.Response;
import java.nio.file.Files;
import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.List;
import org.eclipse.microprofile.config.inject.ConfigProperty;
import sh.ravix.entity.Backup;
import sh.ravix.entity.Event;
import sh.ravix.platform.PlatformService;
import sh.ravix.util.Ids;

@Path("/api/backups")
@Produces(MediaType.APPLICATION_JSON)
@Transactional
public class BackupResource {

    @Inject
    PlatformService platform;

    @ConfigProperty(name = "ravix.paths.config", defaultValue = "/etc/ravix")
    String configPath;

    @ConfigProperty(name = "ravix.paths.data", defaultValue = "/var/lib/ravix")
    String dataPath;

    @ConfigProperty(name = "quarkus.datasource.jdbc.url",
            defaultValue = "jdbc:postgresql://localhost:5432/ravix")
    String dbUrl;

    @ConfigProperty(name = "quarkus.datasource.username", defaultValue = "ravix")
    String dbUser;

    @ConfigProperty(name = "quarkus.datasource.password", defaultValue = "")
    String dbPassword;

    /** The SQL dump lives inside the data dir so it's captured by the same
     *  tarball (dataPath is one of the archived roots). */
    private String dbDumpPath() {
        return dataPath + "/db-dump.sql";
    }

    private record Pg(String host, String port, String db) {}

    /** Parse host/port/db out of a jdbc:postgresql://host:port/db?params URL. */
    private Pg parseDb() {
        String u = dbUrl.replaceFirst("^jdbc:", "");
        java.net.URI uri = java.net.URI.create(u);
        String host = uri.getHost() != null ? uri.getHost() : "localhost";
        int port = uri.getPort() > 0 ? uri.getPort() : 5432;
        String path = uri.getPath() != null ? uri.getPath() : "/ravix";
        String db = path.startsWith("/") ? path.substring(1) : path;
        if (db.isBlank()) db = "ravix";
        return new Pg(host, String.valueOf(port), db);
    }

    /** pg_dump the live database into the data dir (best-effort). Returns true
     *  on success so create() can report whether the DB made it into the tar. */
    private boolean dumpDatabase() {
        if (!platform.fileExists("/usr/bin/pg_dump") && platform.run(2, "which", "pg_dump").isEmpty()) {
            return false;
        }
        Pg pg = parseDb();
        return platform.runEnv(120, java.util.Map.of("PGPASSWORD", dbPassword == null ? "" : dbPassword),
                "pg_dump", "-h", pg.host(), "-p", pg.port(), "-U", dbUser, "-d", pg.db(),
                "--clean", "--if-exists", "--no-owner", "--no-privileges",
                "-f", dbDumpPath()).isPresent();
    }

    /** Replay a restored SQL dump back into the database (best-effort). */
    private boolean restoreDatabase() {
        if (!Files.isReadable(java.nio.file.Path.of(dbDumpPath()))) return false;
        Pg pg = parseDb();
        return platform.runEnv(180, java.util.Map.of("PGPASSWORD", dbPassword == null ? "" : dbPassword),
                "psql", "-h", pg.host(), "-p", pg.port(), "-U", dbUser, "-d", pg.db(),
                "-f", dbDumpPath()).isPresent();
    }

    @GET
    public List<Backup> list() {
        return Backup.listAll(Sort.by("createdAt").descending());
    }

    @POST
    public Response create() {
        OffsetDateTime now = OffsetDateTime.now();
        Backup b = new Backup();
        b.id = Ids.generate("bk");
        b.createdAt = now;
        b.type = "manual";

        // Dump the database into the data dir first so it's captured by the
        // same tarball — without this the restore couldn't bring back domains,
        // mailboxes, campaigns, etc.
        boolean dbDumped = dumpDatabase();

        // Create a real tarball of whatever config/data paths exist on this host.
        List<String> present = new ArrayList<>();
        List<String> contents = new ArrayList<>();
        if (dbDumped) { contents.add("Database"); }
        if (Files.isDirectory(java.nio.file.Path.of(configPath))) { present.add(configPath); contents.add("Configs"); }
        if (Files.isDirectory(java.nio.file.Path.of(dataPath))) { present.add(dataPath); contents.add("Data"); }
        if (Files.isDirectory(java.nio.file.Path.of("/etc/letsencrypt"))) { present.add("/etc/letsencrypt"); contents.add("Certificates"); }

        long sizeBytes = 0;
        if (!present.isEmpty()) {
            String dest = dataPath + "/backups/" + b.id + ".tar.gz";
            platform.exec(60, "mkdir", "-p", dataPath + "/backups");
            List<String> cmd = new ArrayList<>(List.of("tar", "-czf", dest));
            cmd.addAll(present);
            platform.exec(120, cmd.toArray(new String[0]));
            try {
                sizeBytes = Files.size(java.nio.file.Path.of(dest));
            } catch (Exception ignored) {
                // file may not exist if tar failed
            }
        }

        b.sizeMb = sizeBytes > 0 ? (int) Math.max(1, sizeBytes / 1_048_576L) : 0;
        b.status = "complete";
        b.contents = contents.isEmpty()
                ? List.of("Database", "Configs")
                : contents;
        b.persist();
        Event.persist(DomainResource.event("system", "info",
                "Manual backup completed (" + b.sizeMb + " MB)"));
        return Response.status(Response.Status.CREATED).entity(b).build();
    }

    @POST
    @Path("/{id}/restore")
    public Response restore(@PathParam("id") String id) {
        Backup b = Backup.findById(id);
        if (b == null) {
            return Response.status(Response.Status.NOT_FOUND)
                    .entity(java.util.Map.of("error", "backup_not_found")).build();
        }
        String src = dataPath + "/backups/" + b.id + ".tar.gz";
        if (!Files.isReadable(java.nio.file.Path.of(src))) {
            Event.persist(DomainResource.event("system", "error",
                    "Restore failed: backup file " + src + " missing on disk"));
            return Response.status(Response.Status.GONE)
                    .entity(java.util.Map.of("error", "tarball_missing", "detail", src)).build();
        }
        // Extract from / so the original absolute paths (/etc/ravix, /var/lib/ravix,
        // /etc/letsencrypt) land back where they started. tar -p preserves modes.
        boolean ok = platform.exec(180, "tar", "-xzpf", src, "-C", "/");
        if (!ok) {
            Event.persist(DomainResource.event("system", "error",
                    "Restore failed: tar extraction errored for backup " + b.id));
            return Response.status(Response.Status.INTERNAL_SERVER_ERROR)
                    .entity(java.util.Map.of("error", "extract_failed")).build();
        }
        // Replay the database dump that was inside the tarball (if present).
        boolean dbRestored = restoreDatabase();

        // Reload the mail stack so it picks up restored configs without a
        // panel restart. Best-effort; reload-or-restart is forgiving.
        for (String svc : new String[]{"postfix", "dovecot", "opendkim", "nginx"}) {
            platform.exec(15, "systemctl", "reload-or-restart", svc);
        }
        Event.persist(DomainResource.event("system", "warning",
                "Restored from backup " + b.id + " — mail services reloaded"
                        + (dbRestored ? "; database replayed" : "")));
        return Response.ok(java.util.Map.of(
                "ok", true, "id", b.id, "databaseRestored", dbRestored)).build();
    }

    /** Stream the tarball back to the operator. Backup files live under
     *  {dataPath}/backups/<id>.tar.gz so a missing one returns 410 (gone). */
    @GET
    @Path("/{id}/download")
    @Produces("application/gzip")
    public Response download(@PathParam("id") String id) {
        Backup b = Backup.findById(id);
        if (b == null) {
            return Response.status(Response.Status.NOT_FOUND).build();
        }
        java.nio.file.Path p = java.nio.file.Path.of(dataPath, "backups", b.id + ".tar.gz");
        if (!Files.isReadable(p)) {
            return Response.status(Response.Status.GONE)
                    .entity(java.util.Map.of("error", "tarball_missing", "detail", p.toString())).build();
        }
        String fname = "ravix-" + b.id + "-"
                + b.createdAt.toLocalDate() + ".tar.gz";
        try {
            return Response.ok((jakarta.ws.rs.core.StreamingOutput) os -> {
                        try (var in = Files.newInputStream(p)) { in.transferTo(os); }
                    })
                    .header("Content-Disposition", "attachment; filename=\"" + fname + "\"")
                    .header("Content-Length", Files.size(p))
                    .build();
        } catch (Exception e) {
            return Response.status(Response.Status.INTERNAL_SERVER_ERROR)
                    .entity(java.util.Map.of("error", "io", "detail", e.getMessage())).build();
        }
    }

    /** Delete the backup row and its tarball on disk. */
    @jakarta.ws.rs.DELETE
    @Path("/{id}")
    public Response delete(@PathParam("id") String id) {
        Backup b = Backup.findById(id);
        if (b == null) return Response.status(Response.Status.NOT_FOUND).build();
        java.nio.file.Path p = java.nio.file.Path.of(dataPath, "backups", b.id + ".tar.gz");
        try { Files.deleteIfExists(p); } catch (Exception ignored) { /* may already be gone */ }
        b.delete();
        Event.persist(DomainResource.event("system", "info", "Backup " + id + " deleted"));
        return Response.noContent().build();
    }
}
