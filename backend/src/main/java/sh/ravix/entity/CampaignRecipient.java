package sh.ravix.entity;

import io.quarkus.hibernate.orm.panache.PanacheEntityBase;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.OffsetDateTime;

/** One recipient of a campaign, with its per-message delivery status. */
@Entity
@Table(name = "campaign_recipient")
@jakarta.persistence.EntityListeners(sh.ravix.entity.OrgStamp.class)
@org.hibernate.annotations.Filter(name = "orgFilter", condition = "org_id = :orgId")
public class CampaignRecipient extends PanacheEntityBase {
    /** Owning tenant (multi-tenant). Stamped on create; the orgFilter scopes reads. */
    @jakarta.persistence.Column(name = "org_id")
    public String orgId;


    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    public Long id;

    @Column(name = "campaign_id")
    public String campaignId;

    public String email;
    public String name;
    public String status; // pending | sent | delivered | bounced | failed | unsubscribed
    public String error;

    @Column(name = "sent_at")
    public OffsetDateTime sentAt;

    // --- Open/click tracking (Band 4) --------------------------------------
    @Column(name = "tracking_id")
    public String trackingId;

    @Column(name = "opened_at")
    public OffsetDateTime openedAt;

    @Column(name = "open_count")
    public int openCount;

    @Column(name = "click_count")
    public int clickCount;

    @Column(name = "last_clicked_at")
    public OffsetDateTime lastClickedAt;
}
