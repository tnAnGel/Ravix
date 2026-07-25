package sh.ravix.entity;

import com.fasterxml.jackson.annotation.JsonIgnore;
import io.quarkus.hibernate.orm.panache.PanacheEntityBase;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.OffsetDateTime;

/** An address the mailbox has corresponded with — feeds compose autocomplete.
 *  Upserted lazily as folders are read (see MaildirService.harvestContacts). */
@Entity
@Table(name = "contact")
@jakarta.persistence.EntityListeners(sh.ravix.entity.OrgStamp.class)
@org.hibernate.annotations.Filter(name = "orgFilter", condition = "org_id = :orgId")
public class Contact extends PanacheEntityBase {
    /** Owning tenant (multi-tenant). Stamped on create; the orgFilter scopes reads. */
    @jakarta.persistence.Column(name = "org_id")
    public String orgId;


    @Id
    public String id;

    @JsonIgnore
    @Column(name = "mailbox_id")
    public String mailboxId;

    public String email;
    public String name;

    @Column(name = "seen_count")
    public int seenCount;

    @JsonIgnore
    @Column(name = "last_seen")
    public OffsetDateTime lastSeen;
}
