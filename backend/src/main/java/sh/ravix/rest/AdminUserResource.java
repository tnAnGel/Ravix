package sh.ravix.rest;

import io.quarkus.panache.common.Sort;
import jakarta.inject.Inject;
import jakarta.transaction.Transactional;
import jakarta.ws.rs.Consumes;
import jakarta.ws.rs.DELETE;
import jakarta.ws.rs.GET;
import jakarta.ws.rs.NotFoundException;
import jakarta.ws.rs.POST;
import jakarta.ws.rs.Path;
import jakarta.ws.rs.PathParam;
import jakarta.ws.rs.Produces;
import jakarta.ws.rs.core.MediaType;
import jakarta.ws.rs.core.Response;
import java.time.OffsetDateTime;
import java.util.List;
import sh.ravix.auth.CurrentUser;
import sh.ravix.auth.PasswordHasher;
import sh.ravix.auth.Roles;
import sh.ravix.entity.AdminUser;
import sh.ravix.util.Ids;

@Path("/api/admin-users")
@Produces(MediaType.APPLICATION_JSON)
@Consumes(MediaType.APPLICATION_JSON)
@Transactional
public class AdminUserResource {

    @Inject
    PasswordHasher hasher;

    @Inject
    CurrentUser currentUser;

    @Inject
    sh.ravix.auth.TenantContext tenant;

    public record AdminView(String id, String email, String role, boolean twoFactor) {}

    public record CreateRequest(String email, String password, String role) {}

    @GET
    public List<AdminView> list() {
        return AdminUser.<AdminUser>listAll(Sort.by("createdAt")).stream()
                .map(u -> new AdminView(u.id, u.email, u.role, u.twoFactor))
                .toList();
    }

    public record RoleRequest(String role) {}

    @POST
    public Response create(CreateRequest req) {
        if (req == null || req.email() == null || req.email().isBlank()) {
            return Response.status(Response.Status.BAD_REQUEST)
                    .entity(java.util.Map.of("error", "email_required")).build();
        }
        if (AdminUser.find("email", req.email().trim()).firstResult() != null) {
            return Response.status(Response.Status.CONFLICT)
                    .entity(java.util.Map.of("error", "email_exists")).build();
        }
        AdminUser u = new AdminUser();
        u.id = Ids.generate("usr");
        u.email = req.email().trim();
        u.role = Roles.normalize(req.role());
        u.passwordHash = hasher.hash(
                req.password() == null || req.password().isBlank() ? "changeme" : req.password());
        u.twoFactor = false;
        u.createdAt = OffsetDateTime.now();
        u.persist();
        // Give the new member access to an org so they can see data: the
        // creator's current org when scoped, otherwise the default org.
        String orgId = tenant.orgId != null ? tenant.orgId : "org_default";
        sh.ravix.entity.OrgMembership m = new sh.ravix.entity.OrgMembership();
        m.id = Ids.generate("mbr");
        m.orgId = orgId;
        m.adminUserId = u.id;
        m.role = u.role;
        m.createdAt = OffsetDateTime.now();
        m.persist();
        return Response.status(Response.Status.CREATED)
                .entity(new AdminView(u.id, u.email, u.role, u.twoFactor))
                .build();
    }

    /** Change a member's role. Owner-only (enforced in AuthFilter); guards
     *  against demoting the last remaining owner. */
    @POST
    @Path("/{id}/role")
    public Response changeRole(@PathParam("id") String id, RoleRequest req) {
        AdminUser u = AdminUser.findById(id);
        if (u == null) throw new NotFoundException();
        String newRole = Roles.normalize(req == null ? null : req.role());
        // Block demoting the last owner — there must always be at least one.
        if (Roles.isOwner(u) && !Roles.OWNER.equals(newRole)
                && AdminUser.<AdminUser>listAll().stream().filter(Roles::isOwner).count() <= 1) {
            return Response.status(Response.Status.CONFLICT)
                    .entity(java.util.Map.of("error", "last_owner")).build();
        }
        u.role = newRole;
        return Response.ok(new AdminView(u.id, u.email, u.role, u.twoFactor)).build();
    }

    @POST
    @Path("/{id}/2fa")
    public AdminView toggleTwoFactor(@PathParam("id") String id) {
        AdminUser u = AdminUser.findById(id);
        if (u == null) throw new NotFoundException();
        u.twoFactor = !u.twoFactor;
        return new AdminView(u.id, u.email, u.role, u.twoFactor);
    }

    @DELETE
    @Path("/{id}")
    public Response delete(@PathParam("id") String id) {
        // Don't allow deleting yourself or the last remaining admin.
        if (currentUser.user != null && currentUser.user.id.equals(id)) {
            return Response.status(Response.Status.CONFLICT)
                    .entity(java.util.Map.of("error", "cannot_delete_self"))
                    .build();
        }
        if (AdminUser.count() <= 1) {
            return Response.status(Response.Status.CONFLICT)
                    .entity(java.util.Map.of("error", "last_admin"))
                    .build();
        }
        AdminUser target = AdminUser.findById(id);
        if (target != null && Roles.isOwner(target)
                && AdminUser.<AdminUser>listAll().stream().filter(Roles::isOwner).count() <= 1) {
            return Response.status(Response.Status.CONFLICT)
                    .entity(java.util.Map.of("error", "last_owner"))
                    .build();
        }
        AdminUser.deleteById(id);
        return Response.noContent().build();
    }
}
