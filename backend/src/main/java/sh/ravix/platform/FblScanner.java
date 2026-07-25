package sh.ravix.platform;

import io.quarkus.scheduler.Scheduled;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import java.util.stream.Stream;
import org.eclipse.microprofile.config.inject.ConfigProperty;
import org.jboss.logging.Logger;

/**
 * Ingests ARF feedback-loop complaint reports dropped into an inbox directory
 * (e.g. delivered to fbl@ and filed by the MTA). Extracts the original
 * recipient and records a suppression entry, then archives the file. No-op if
 * the inbox doesn't exist.
 */
@ApplicationScoped
public class FblScanner {

    private static final Logger LOG = Logger.getLogger(FblScanner.class);
    // ARF puts the complained-about address in Original-Rcpt-To / Original-Mail-From.
    private static final Pattern RCPT = Pattern.compile(
            "(?im)^(Original-Rcpt-To|Original-Mail-From|X-Original-To)\\s*:\\s*<?([^>\\s]+@[^>\\s]+)>?");

    @Inject
    ReputationService reputation;

    @ConfigProperty(name = "ravix.fbl.inbox", defaultValue = "/var/lib/ravix/fbl/inbox")
    String inboxDir;

    @Scheduled(every = "180s", concurrentExecution = Scheduled.ConcurrentExecution.SKIP)
    void scan() {
        Path inbox = Path.of(inboxDir);
        if (!Files.isDirectory(inbox)) return;
        Path processed = inbox.resolveSibling("processed");
        try {
            Files.createDirectories(processed);
            try (Stream<Path> files = Files.list(inbox)) {
                files.filter(Files::isRegularFile).forEach(this::ingest);
            }
        } catch (Exception e) {
            LOG.debugf("FBL scan error: %s", e.getMessage());
        }
    }

    private void ingest(Path f) {
        try {
            String content = Files.readString(f, java.nio.charset.StandardCharsets.ISO_8859_1);
            Matcher m = RCPT.matcher(content);
            if (m.find()) {
                reputation.recordComplaint(m.group(2), "fbl");
                LOG.infof("FBL complaint recorded for %s", m.group(2));
            }
            Files.move(f, f.resolveSibling("processed").resolve(f.getFileName()),
                    java.nio.file.StandardCopyOption.REPLACE_EXISTING);
        } catch (Exception e) {
            LOG.warnf("Failed to process FBL file %s: %s", f, e.getMessage());
        }
    }
}
