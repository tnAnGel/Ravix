package sh.ravix.platform;

import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * Imports mail from a remote IMAP account into a local mailbox using
 * {@code imapsync} (Band 4). The operator supplies both the remote credentials
 * and the target mailbox's own password, so no Dovecot master user is needed.
 * Passwords are passed via 0600 temp files (--passfile) so they never appear in
 * the process list.
 */
@ApplicationScoped
public class ImapImportService {

    @Inject
    PlatformService platform;

    public record Remote(String host, int port, String user, String password, boolean ssl) {}

    public boolean isInstalled() {
        return platform.fileExists("/usr/bin/imapsync")
                || platform.run(2, "which", "imapsync").isPresent();
    }

    public void run(TaskService.LogSink sink, String localEmail, String localPassword, Remote r) {
        if (!platform.isLinux()) {
            sink.append("Not on Linux — imapsync is unavailable in this environment.");
            return;
        }
        if (r == null || r.host() == null || r.host().isBlank()
                || r.user() == null || r.user().isBlank()) {
            sink.append("✗ Missing remote host/user.");
            return;
        }
        if (!isInstalled()) {
            sink.append("▸ Installing imapsync…");
            platform.runEnv(300, Map.of("DEBIAN_FRONTEND", "noninteractive"),
                    "apt-get", "install", "-y", "imapsync");
            if (!isInstalled()) {
                sink.append("✗ imapsync could not be installed.");
                return;
            }
        }

        String suffix = UUID.randomUUID().toString().substring(0, 8);
        String pf1 = "/tmp/ravix-imap1-" + suffix;
        String pf2 = "/tmp/ravix-imap2-" + suffix;
        platform.writeGenerated(pf1, r.password() == null ? "" : r.password());
        platform.writeGenerated(pf2, localPassword == null ? "" : localPassword);
        platform.exec(5, "chmod", "600", pf1);
        platform.exec(5, "chmod", "600", pf2);

        try {
            int port1 = r.port() > 0 ? r.port() : (r.ssl() ? 993 : 143);
            List<String> cmd = new ArrayList<>(List.of(
                    "imapsync",
                    "--host1", r.host(), "--port1", String.valueOf(port1),
                    "--user1", r.user(), "--passfile1", pf1,
                    "--host2", "127.0.0.1", "--port2", "143",
                    "--user2", localEmail, "--passfile2", pf2,
                    "--automap", "--nofoldersizes", "--no-modulesversion",
                    "--timeout", "120"));
            if (r.ssl()) cmd.add("--ssl1");

            sink.append("▸ Importing mail from " + r.host() + " (" + r.user()
                    + ") into " + localEmail + " …");
            var out = platform.run(3600, cmd.toArray(new String[0]));
            if (out.isPresent()) {
                // imapsync is verbose; keep the tail so the log stays readable.
                String text = out.get();
                String[] lines = text.split("\n");
                int from = Math.max(0, lines.length - 60);
                StringBuilder tail = new StringBuilder();
                for (int i = from; i < lines.length; i++) tail.append(lines[i]).append('\n');
                sink.append(tail.toString());
                sink.append("✓ imapsync finished for " + localEmail + ".");
            } else {
                sink.append("✗ imapsync produced no output / failed — check remote "
                        + "credentials, SSL setting and that the host is reachable.");
            }
        } finally {
            platform.exec(5, "rm", "-f", pf1, pf2);
        }
    }
}
