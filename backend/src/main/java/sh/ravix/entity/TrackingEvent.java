package sh.ravix.entity;

import io.quarkus.hibernate.orm.panache.PanacheEntityBase;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.OffsetDateTime;

/** A raw open/click event recorded by the tracking endpoints (Band 4). */
@Entity
@Table(name = "tracking_event")
public class TrackingEvent extends PanacheEntityBase {

    @Id
    public String id;

    @Column(name = "campaign_id")
    public String campaignId;

    @Column(name = "recipient_id")
    public Long recipientId;

    public String type;   // open | click
    public String url;

    @Column(name = "user_agent")
    public String userAgent;

    public String ip;
    public OffsetDateTime at;
}
