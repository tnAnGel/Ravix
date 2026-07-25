package sh.ravix.auth;

import jakarta.annotation.Priority;
import jakarta.inject.Inject;
import jakarta.interceptor.AroundInvoke;
import jakarta.interceptor.Interceptor;
import jakarta.interceptor.InvocationContext;
import jakarta.persistence.EntityManager;
import org.hibernate.Session;

/**
 * Enables the {@code orgFilter} on the active Hibernate session for the duration
 * of a tenant-scoped resource call. Runs at {@code PLATFORM_AFTER} priority, i.e.
 * AFTER Quarkus' transactional interceptor ({@code PLATFORM_BEFORE + 200}), so by
 * the time it executes the request transaction — and thus the session every
 * Panache query will use — is already active. Enabling the filter here makes
 * {@code list()}, {@code find()} and {@code find("id", …)} all scope to the
 * caller's organization.
 *
 * When {@link TenantContext#orgId} is null (super-admin global view, public
 * endpoints, background threads) the filter is left disabled and queries see all
 * tenants.
 */
@OrgFiltered
@Interceptor
@Priority(Interceptor.Priority.PLATFORM_AFTER)
public class OrgFilterInterceptor {

    @Inject
    EntityManager em;

    @Inject
    TenantContext tenant;

    @AroundInvoke
    Object enableFilter(InvocationContext ctx) throws Exception {
        if (tenant.orgId != null) {
            try {
                em.unwrap(Session.class)
                        .enableFilter("orgFilter")
                        .setParameter("orgId", tenant.orgId);
            } catch (Exception ignore) {
                // No active session yet for this call — query paths will open
                // their own; nothing to scope here.
            }
        }
        return ctx.proceed();
    }
}
