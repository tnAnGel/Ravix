package sh.ravix.entity;

import io.quarkus.hibernate.orm.panache.PanacheEntityBase;
import jakarta.persistence.CollectionTable;
import jakarta.persistence.Column;
import jakarta.persistence.ElementCollection;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.Table;
import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.List;

@Entity
@Table(name = "alias")
@jakarta.persistence.EntityListeners(sh.ravix.entity.OrgStamp.class)
@org.hibernate.annotations.Filter(name = "orgFilter", condition = "org_id = :orgId")
public class Alias extends PanacheEntityBase {
    /** Owning tenant (multi-tenant). Stamped on create; the orgFilter scopes reads. */
    @jakarta.persistence.Column(name = "org_id")
    public String orgId;


    @Id
    public String id;

    public String source;
    public String domain;
    public String status;

    @Column(name = "catch_all")
    public boolean catchAll;

    @Column(name = "created_at")
    public OffsetDateTime createdAt;

    /** Stored in alias_destination(alias_id, destination); ordering not significant. */
    @ElementCollection(fetch = FetchType.EAGER)
    @CollectionTable(name = "alias_destination", joinColumns = @JoinColumn(name = "alias_id"))
    @Column(name = "destination")
    public List<String> destinations = new ArrayList<>();
}
