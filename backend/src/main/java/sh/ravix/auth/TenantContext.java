package sh.ravix.auth;

import jakarta.enterprise.context.RequestScoped;
import java.util.HashSet;
import java.util.Set;
import jakarta.ws.rs.NotFoundException;

/**
 * Per-request tenant scope (multi-tenant phases B/A).
 *
 * Populated by {@link AuthFilter} after the user is resolved:
 *  - {@link #superadmin} — the operator; may act globally or within any org.
 *  - {@link #memberOrgIds} — orgs the user belongs to.
 *  - {@link #orgId} — the effective org for this request (the one the
 *    {@code orgFilter} is bound to). Null means "global / unscoped" and is
 *    only allowed for super-admins.
 */
@RequestScoped
public class TenantContext {

    public boolean superadmin;
    public String orgId;                       // effective org, or null for global
    public final Set<String> memberOrgIds = new HashSet<>();

    /** True when queries should be filtered to a single org. */
    public boolean isScoped() {
        return orgId != null;
    }

    /** The org new rows must be stamped with. Throws if there is no scope and
     *  the caller is not acting within a specific org (e.g. a super-admin in
     *  global mode trying to create tenant-owned data without picking an org). */
    public String requireOrg() {
        if (orgId == null) {
            throw new jakarta.ws.rs.BadRequestException(
                    "No organization selected — pick one before creating tenant data.");
        }
        return orgId;
    }

    /** True when the caller may see/touch rows belonging to the given org. */
    public boolean canAccess(String rowOrgId) {
        if (superadmin) return true;
        return rowOrgId != null && memberOrgIds.contains(rowOrgId);
    }

    /** Guard for by-id mutations: the Hibernate filter does NOT apply to
     *  findById() (primary-key load), so resources must call this before
     *  updating/deleting an entity fetched by id. 404 (not 403) so existence
     *  is not revealed across tenants. */
    public void assertAccess(String rowOrgId) {
        if (!canAccess(rowOrgId)) {
            throw new NotFoundException();
        }
    }
}
