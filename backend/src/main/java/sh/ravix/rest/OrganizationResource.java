package sh.ravix.rest;

import io.quarkus.panache.common.Sort;
import jakarta.inject.Inject;
import jakarta.transaction.Transactional;
import jakarta.ws.rs.Consumes;
import jakarta.ws.rs.DELETE;
import jakarta.ws.rs.ForbiddenException;
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
import sh.ravix.auth.Roles;
import sh.ravix.auth.TenantContext;
import sh.ravix.entity.AdminUser;
import sh.ravix.entity.Alias;
import sh.ravix.entity.Domain;
import sh.ravix.entity.Mailbox;
import sh.ravix.entity.OrgMembership;
import sh.ravix.entity.Organization;
import sh.ravix.util.Ids;

/**
 * Organizations (tenants) management. Most actions are super-admin only; any
 * authenticated user may list the orgs they belong to (for the switcher).
 */
@Path("/api/organizations")
@Produces(MediaType.APPLICATION_JSON)
@Consumes(MediaType.APPLICATION_JSON)
@Transactional
public class OrganizationResource {

    @Inject
    TenantContext tenant;

    public record OrgView(String id, String name, String slug, String status,
                          int quotaDomains, int quotaMailboxes, long quotaStorageMb,
                          long domains, long mailboxes, String myRole) {}

    public record MemberView(String membershipId, String userId, String email, String role) {}

    public record CreateOrgRequest(String name, String slug,
                                   Integer quotaDomains, Integer quotaMailboxes, Long quotaStorageMb) {}

    public record AddMemberRequest(String email, String role) {}

    private void requireSuperadmin() {
        if (!tenant.superadmin) throw new ForbiddenException("superadmin_only");
    }

    /** Orgs the caller can see: all for super-admins, own for members. */
    @GET
    public List<OrgView> list() {
        List<Organization> orgs = Organization.listAll(Sort.by("name"));
        return orgs.stream()
                .filter(o -> tenant.superadmin || tenant.memberOrgIds.contains(o.id))
                .map(this::toView)
                .toList();
    }

    private OrgView toView(Organization o) {
        // Counts must bypass the request orgFilter (it's pinned to one org),
        // so count explicitly by org_id.
        long domains = Domain.count("orgId", o.id);
        long mailboxes = Mailbox.count("orgId", o.id);
        String myRole = OrgMembership.<OrgMembership>find(
                "orgId = ?1 and adminUserId = ?2", o.id,
                tenant != null ? currentUserId() : null).firstResultOptional()
                .map(m -> m.role).orElse(tenant.superadmin ? "superadmin" : null);
        return new OrgView(o.id, o.name, o.slug, o.status, o.quotaDomains,
                o.quotaMailboxes, o.quotaStorageMb, domains, mailboxes, myRole);
    }

    private String currentUserId() {
        // Resolve via the first membership lookup is not reliable; use the
        // injected CurrentUser instead.
        return cu != null && cu.user != null ? cu.user.id : null;
    }

    @Inject
    sh.ravix.auth.CurrentUser cu;

    @POST
    public Response create(CreateOrgRequest req) {
        requireSuperadmin();
        if (req == null || req.name() == null || req.name().isBlank()) {
            return Response.status(Response.Status.BAD_REQUEST)
                    .entity(java.util.Map.of("error", "name_required")).build();
        }
        Organization o = new Organization();
        o.id = Ids.generate("org");
        o.name = req.name().trim();
        o.slug = req.slug() == null || req.slug().isBlank()
                ? o.name.toLowerCase().replaceAll("[^a-z0-9]+", "-") : req.slug().trim();
        o.status = "active";
        o.quotaDomains = req.quotaDomains() == null ? 0 : req.quotaDomains();
        o.quotaMailboxes = req.quotaMailboxes() == null ? 0 : req.quotaMailboxes();
        o.quotaStorageMb = req.quotaStorageMb() == null ? 0 : req.quotaStorageMb();
        o.createdAt = OffsetDateTime.now();
        o.persist();
        return Response.status(Response.Status.CREATED).entity(toView(o)).build();
    }

    @DELETE
    @Path("/{id}")
    public Response delete(@PathParam("id") String id) {
        requireSuperadmin();
        if ("org_default".equals(id)) {
            return Response.status(Response.Status.CONFLICT)
                    .entity(java.util.Map.of("error", "cannot_delete_default")).build();
        }
        Organization o = Organization.findById(id);
        if (o == null) throw new NotFoundException();
        long domains = Domain.count("orgId", id);
        long mailboxes = Mailbox.count("orgId", id);
        long aliases = Alias.count("orgId", id);
        if (domains + mailboxes + aliases > 0) {
            return Response.status(Response.Status.CONFLICT)
                    .entity(java.util.Map.of("error", "org_not_empty",
                            "domains", domains, "mailboxes", mailboxes, "aliases", aliases))
                    .build();
        }
        OrgMembership.delete("orgId", id);
        o.delete();
        return Response.noContent().build();
    }

    // --- Members ------------------------------------------------------------

    @GET
    @Path("/{id}/members")
    public List<MemberView> members(@PathParam("id") String id) {
        if (!tenant.superadmin && !tenant.memberOrgIds.contains(id)) {
            throw new ForbiddenException();
        }
        return OrgMembership.<OrgMembership>list("orgId", id).stream()
                .map(m -> {
                    AdminUser u = AdminUser.findById(m.adminUserId);
                    return new MemberView(m.id, m.adminUserId,
                            u == null ? "(deleted)" : u.email, m.role);
                })
                .toList();
    }

    @POST
    @Path("/{id}/members")
    public Response addMember(@PathParam("id") String id, AddMemberRequest req) {
        requireSuperadmin();
        Organization o = Organization.findById(id);
        if (o == null) throw new NotFoundException();
        if (req == null || req.email() == null || req.email().isBlank()) {
            return Response.status(Response.Status.BAD_REQUEST)
                    .entity(java.util.Map.of("error", "email_required")).build();
        }
        AdminUser u = AdminUser.find("email", req.email().trim()).firstResult();
        if (u == null) {
            return Response.status(Response.Status.NOT_FOUND)
                    .entity(java.util.Map.of("error", "user_not_found")).build();
        }
        OrgMembership existing = OrgMembership.find(
                "orgId = ?1 and adminUserId = ?2", id, u.id).firstResult();
        if (existing != null) {
            existing.role = Roles.normalize(req.role());
            return Response.ok(new MemberView(existing.id, u.id, u.email, existing.role)).build();
        }
        OrgMembership m = new OrgMembership();
        m.id = Ids.generate("mbr");
        m.orgId = id;
        m.adminUserId = u.id;
        m.role = Roles.normalize(req.role());
        m.createdAt = OffsetDateTime.now();
        m.persist();
        return Response.status(Response.Status.CREATED)
                .entity(new MemberView(m.id, u.id, u.email, m.role)).build();
    }

    @DELETE
    @Path("/{id}/members/{membershipId}")
    public Response removeMember(@PathParam("id") String id,
                                 @PathParam("membershipId") String membershipId) {
        requireSuperadmin();
        OrgMembership m = OrgMembership.findById(membershipId);
        if (m == null || !id.equals(m.orgId)) throw new NotFoundException();
        m.delete();
        return Response.noContent().build();
    }
}
