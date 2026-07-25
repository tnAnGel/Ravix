package sh.ravix.entity;

import io.quarkus.hibernate.orm.panache.PanacheEntityBase;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.OffsetDateTime;

@Entity
@Table(name = "queue_item")
public class QueueItem extends PanacheEntityBase {

    @Id
    public String id;

    public String sender;
    public String recipient;
    public String domain;
    public String subject;

    @Column(name = "size_kb")
    public int sizeKb;

    public int attempts;
    public String state;
    public String reason;

    @Column(name = "queued_at")
    public OffsetDateTime queuedAt;

    /** Plain-language explanation derived from {@link #reason}. Not stored —
     *  computed on every read so a code update changes the wording for
     *  existing queue items too. Null when state is active or the reason
     *  doesn't match any known pattern. */
    @jakarta.persistence.Transient
    public String hint;

    /** Short tag for grouping ("timeout-25", "spam", "dnssec", …) so the UI
     *  can fold N identical-reason items into one summary row. */
    @jakarta.persistence.Transient
    public String hintCode;
}
