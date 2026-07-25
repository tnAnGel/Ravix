package sh.ravix.entity;

import io.quarkus.hibernate.orm.panache.PanacheEntityBase;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.OffsetDateTime;

@Entity
@Table(name = "campaign")
@jakarta.persistence.EntityListeners(sh.ravix.entity.OrgStamp.class)
@org.hibernate.annotations.Filter(name = "orgFilter", condition = "org_id = :orgId")
public class Campaign extends PanacheEntityBase {
    /** Owning tenant (multi-tenant). Stamped on create; the orgFilter scopes reads. */
    @jakarta.persistence.Column(name = "org_id")
    public String orgId;


    @Id
    public String id;

    public String name;
    public String status;
    public String sender;
    public String subject;
    public String body;
    public String preheader;

    @Column(name = "reply_to")
    public String replyTo;

    @Column(name = "audience_type")
    public String audienceType;

    @Column(name = "audience_ref")
    public String audienceRef;

    @Column(name = "template_id")
    public String templateId;

    public int recipients;
    public int sent;
    public int delivered;
    public int bounced;
    public int failed;
    public int opens;   // unique recipients who opened (Band 4 tracking)
    public int clicks;  // unique recipients who clicked
    public boolean unsubscribe;

    @Column(name = "rate_per_hour")
    public int ratePerHour;

    @Column(name = "scheduled_at")
    public OffsetDateTime scheduledAt;

    @Column(name = "sent_at")
    public OffsetDateTime sentAt;

    @Column(name = "updated_at")
    public OffsetDateTime updatedAt;
}
