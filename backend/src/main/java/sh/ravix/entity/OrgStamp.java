package sh.ravix.entity;

import io.quarkus.arc.Arc;
import io.quarkus.arc.InstanceHandle;
import jakarta.persistence.PrePersist;
import java.lang.reflect.Field;
import sh.ravix.auth.TenantContext;

/**
 * JPA entity listener that stamps {@code org_id} on tenant-scoped rows at
 * insert time, from the request's {@link TenantContext}. Centralising this
 * means no create path can forget to set the owning org — including rows
 * created deep inside services, not just REST resources.
 *
 * In background threads (scanners, provisioning) the request scope is inactive,
 * the lookup fails, and nothing is stamped — which is correct, since those run
 * unscoped and operate across all tenants.
 */
public class OrgStamp {

    @PrePersist
    public void stamp(Object entity) {
        try {
            Field f = entity.getClass().getDeclaredField("orgId");
            f.setAccessible(true);
            if (f.get(entity) != null) {
                return; // explicitly set by the caller — respect it
            }
            InstanceHandle<TenantContext> handle = Arc.container().instance(TenantContext.class);
            if (handle == null || !handle.isAvailable()) {
                return;
            }
            TenantContext tc = handle.get(); // throws if request scope inactive
            if (tc != null && tc.orgId != null) {
                f.set(entity, tc.orgId);
            }
        } catch (Exception ignore) {
            // No orgId field, or no active request scope — leave as-is.
        }
    }
}
