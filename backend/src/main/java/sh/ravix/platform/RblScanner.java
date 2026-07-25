package sh.ravix.platform;

import io.quarkus.scheduler.Scheduled;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;
import org.jboss.logging.Logger;

/** Periodically rescans the mail IP(s) against the DNSBLs and raises alerts. */
@ApplicationScoped
public class RblScanner {

    private static final Logger LOG = Logger.getLogger(RblScanner.class);

    @Inject
    RblService rbl;

    // Every 6 hours; the first run is delayed so startup isn't blocked on DNS.
    @Scheduled(every = "6h", delay = 2, delayUnit = java.util.concurrent.TimeUnit.MINUTES,
            concurrentExecution = Scheduled.ConcurrentExecution.SKIP)
    void scan() {
        try {
            var results = rbl.scanAndStore();
            long listed = results.stream().filter(r -> r.listedCount() > 0).count();
            LOG.infof("RBL scan complete: %d IP(s), %d with listings", results.size(), listed);
        } catch (Exception e) {
            LOG.warnf("RBL scan failed: %s", e.getMessage());
        }
    }
}
