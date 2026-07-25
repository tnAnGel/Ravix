package sh.ravix.platform;

import io.quarkus.scheduler.Scheduled;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.stream.Stream;
import org.eclipse.microprofile.config.inject.ConfigProperty;
import org.jboss.logging.Logger;
import sh.ravix.entity.DmarcReport;

/**
 * Periodically ingests DMARC aggregate-report files dropped into an inbox
 * directory (xml / .gz / .zip — e.g. extracted from rua@ mail), then moves
 * each into a processed subdirectory. No-op if the inbox doesn't exist.
 */
@ApplicationScoped
public class DmarcScanner {

    private static final Logger LOG = Logger.getLogger(DmarcScanner.class);

    @Inject
    DmarcService dmarc;

    @ConfigProperty(name = "ravix.dmarc.inbox", defaultValue = "/var/lib/ravix/dmarc/inbox")
    String inboxDir;

    @Scheduled(every = "120s", concurrentExecution = Scheduled.ConcurrentExecution.SKIP)
    void scan() {
        Path inbox = Path.of(inboxDir);
        if (!Files.isDirectory(inbox)) return;
        Path processed = inbox.resolveSibling("processed");
        try {
            Files.createDirectories(processed);
            try (Stream<Path> files = Files.list(inbox)) {
                files.filter(Files::isRegularFile).filter(this::looksLikeReport).forEach(f -> {
                    try {
                        DmarcReport r = dmarc.ingest(Files.readAllBytes(f));
                        Files.move(f, processed.resolve(f.getFileName()),
                                java.nio.file.StandardCopyOption.REPLACE_EXISTING);
                        if (r != null) {
                            LOG.infof("Ingested DMARC report %s for %s", f.getFileName(), r.domain);
                        }
                    } catch (Exception e) {
                        LOG.warnf("Failed to process DMARC file %s: %s", f, e.getMessage());
                    }
                });
            }
        } catch (Exception e) {
            LOG.debugf("DMARC scan error: %s", e.getMessage());
        }
    }

    private boolean looksLikeReport(Path p) {
        String n = p.getFileName().toString().toLowerCase();
        return n.endsWith(".xml") || n.endsWith(".gz") || n.endsWith(".zip");
    }
}
