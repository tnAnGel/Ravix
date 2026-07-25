package sh.ravix.entity;

import io.quarkus.hibernate.orm.panache.PanacheEntityBase;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.OffsetDateTime;

/** One inbox-placement run: a self-score plus optional per-seed placement. */
@Entity
@Table(name = "inbox_test")
@jakarta.persistence.EntityListeners(sh.ravix.entity.OrgStamp.class)
@org.hibernate.annotations.Filter(name = "orgFilter", condition = "org_id = :orgId")
public class InboxTest extends PanacheEntityBase {
    /** Owning tenant (multi-tenant). Stamped on create; the orgFilter scopes reads. */
    @jakarta.persistence.Column(name = "org_id")
    public String orgId;


    @Id
    public String id;

    public String domain;

    @Column(name = "from_addr")
    public String fromAddr;

    public Integer score;
    public String grade;
    public String summary;

    @Column(name = "report_json")
    public String reportJson;

    @Column(name = "seed_json")
    public String seedJson;

    @Column(name = "created_at")
    public OffsetDateTime createdAt;
}
