package sh.ravix.entity;

import io.quarkus.hibernate.orm.panache.PanacheEntityBase;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.OffsetDateTime;

/** Join between an {@link AdminUser} and an {@link Organization}, with the
 *  user's role inside that org (owner | admin | viewer). */
@Entity
@Table(name = "org_membership")
public class OrgMembership extends PanacheEntityBase {

    @Id
    public String id;

    @Column(name = "org_id")
    public String orgId;

    @Column(name = "admin_user_id")
    public String adminUserId;

    public String role;              // owner | admin | viewer (within the org)

    @Column(name = "created_at")
    public OffsetDateTime createdAt;
}
