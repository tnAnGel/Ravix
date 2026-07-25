package sh.ravix.entity;

import com.fasterxml.jackson.annotation.JsonIgnore;
import io.quarkus.hibernate.orm.panache.PanacheEntityBase;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.OffsetDateTime;

/** A webmail message within a mailbox folder. */
@Entity
@Table(name = "message")
public class Message extends PanacheEntityBase {

    @Id
    public String id;

    @JsonIgnore
    @Column(name = "mailbox_id")
    public String mailboxId;

    public String folder;

    @Column(name = "from_addr")
    public String fromAddr;

    @Column(name = "from_name")
    public String fromName;

    @Column(name = "to_addr")
    public String toAddr;

    public String subject;
    public String preview;
    public String body;
    public boolean unread;
    public boolean starred;

    @Column(name = "has_attachments")
    public boolean hasAttachments;

    @Column(name = "received_at")
    public OffsetDateTime receivedAt;
}
