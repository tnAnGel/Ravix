package sh.ravix.entity;

import com.fasterxml.jackson.annotation.JsonIgnore;
import io.quarkus.hibernate.orm.panache.PanacheEntityBase;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.OffsetDateTime;

/** An API key for the transactional send API. Only the bcrypt hash is stored. */
@Entity
@Table(name = "api_key")
@jakarta.persistence.EntityListeners(sh.ravix.entity.OrgStamp.class)
@org.hibernate.annotations.Filter(name = "orgFilter", condition = "org_id = :orgId")
public class ApiKey extends PanacheEntityBase {
    /** Owning tenant (multi-tenant). Stamped on create; the orgFilter scopes reads. */
    @jakarta.persistence.Column(name = "org_id")
    public String orgId;


    @Id
    public String id;

    public String name;

    @JsonIgnore
    @Column(name = "key_hash")
    public String keyHash;

    public String last4;
    public String scopes;

    @Column(name = "created_at")
    public OffsetDateTime createdAt;

    @Column(name = "last_used")
    public OffsetDateTime lastUsed;

    @Column(name = "sent_count")
    public long sentCount;

    public boolean enabled;
}
