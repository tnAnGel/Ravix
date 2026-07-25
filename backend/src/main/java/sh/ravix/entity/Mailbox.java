package sh.ravix.entity;

import io.quarkus.hibernate.orm.panache.PanacheEntityBase;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.OffsetDateTime;

/**
 * A mailbox (email account). Field names are camelCase to match the frontend
 * JSON contract; {@code @Column} maps them to snake_case database columns.
 */
@Entity
@Table(name = "mailbox")
@jakarta.persistence.EntityListeners(sh.ravix.entity.OrgStamp.class)
@org.hibernate.annotations.Filter(name = "orgFilter", condition = "org_id = :orgId")
public class Mailbox extends PanacheEntityBase {
    /** Owning tenant (multi-tenant). Stamped on create; the orgFilter scopes reads. */
    @jakarta.persistence.Column(name = "org_id")
    public String orgId;


    @Id
    public String id;

    public String email;

    @Column(name = "display_name")
    public String displayName;

    public String domain;

    @Column(name = "quota_mb")
    public int quotaMb;

    @Column(name = "used_mb")
    public int usedMb;

    public String status;

    @Column(name = "last_login")
    public OffsetDateTime lastLogin;

    @Column(name = "created_at")
    public OffsetDateTime createdAt;

    @com.fasterxml.jackson.annotation.JsonIgnore
    @Column(name = "password_hash")
    public String passwordHash;
}
