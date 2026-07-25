package sh.ravix.entity;

import io.quarkus.hibernate.orm.panache.PanacheEntityBase;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.OffsetDateTime;

/**
 * A tenant. One Ravix install / one mail stack serves many organizations;
 * each owns a slice of domains, mailboxes, aliases, campaigns, contacts, etc.
 * The mail stack itself stays global (Postfix routes by domain) — isolation
 * is enforced at the application layer via the Hibernate {@code orgFilter}.
 */
@Entity
@Table(name = "organization")
public class Organization extends PanacheEntityBase {

    @Id
    public String id;

    public String name;
    public String slug;
    public String status;            // active | suspended

    @Column(name = "quota_domains")
    public int quotaDomains;         // 0 = unlimited

    @Column(name = "quota_mailboxes")
    public int quotaMailboxes;       // 0 = unlimited

    @Column(name = "quota_storage_mb")
    public long quotaStorageMb;      // 0 = unlimited

    @Column(name = "created_at")
    public OffsetDateTime createdAt;
}
