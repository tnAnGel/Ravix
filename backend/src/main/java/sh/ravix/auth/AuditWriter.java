package sh.ravix.auth;

import jakarta.enterprise.context.ApplicationScoped;
import jakarta.transaction.Transactional;
import java.time.OffsetDateTime;
import sh.ravix.entity.AuditLog;

/**
 * Persists audit rows for {@link AuditFilter}.
 *
 * This exists as a separate bean so the transaction starts only when a row is
 * actually written. Annotating the filter method itself opened a JTA
 * transaction for <em>every</em> response — including CORS preflight, which is
 * answered on the IO thread and cannot block, turning an OPTIONS request into a
 * 500.
 */
@ApplicationScoped
public class AuditWriter {

    @Transactional
    public void write(String actor, String action, String target, String ip, int status) {
        AuditLog log = new AuditLog();
        log.at = OffsetDateTime.now();
        log.actor = actor;
        log.action = action;
        log.target = target;
        log.ip = ip;
        log.status = status;
        log.persist();
    }
}
