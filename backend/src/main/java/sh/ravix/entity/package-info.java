/**
 * Defines the {@code orgFilter} Hibernate filter used to enforce tenant
 * isolation. Tenant-scoped entities carry {@code @Filter(name="orgFilter",
 * condition="org_id = :orgId")}; {@link sh.ravix.auth.TenantFilter} enables it
 * per HTTP request with the caller's effective organization. Requests with no
 * org context (background scanners, provisioning, super-admin global view) run
 * with the filter disabled and therefore see every tenant's rows.
 */
@FilterDef(name = "orgFilter", parameters = @ParamDef(name = "orgId", type = String.class))
package sh.ravix.entity;

import org.hibernate.annotations.FilterDef;
import org.hibernate.annotations.ParamDef;
