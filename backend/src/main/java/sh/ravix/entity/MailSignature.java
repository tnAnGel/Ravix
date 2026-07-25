package sh.ravix.entity;

import com.fasterxml.jackson.annotation.JsonIgnore;
import io.quarkus.hibernate.orm.panache.PanacheEntityBase;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

/** A per-mailbox HTML signature appended in the composer. */
@Entity
@Table(name = "mail_signature")
@jakarta.persistence.EntityListeners(sh.ravix.entity.OrgStamp.class)
@org.hibernate.annotations.Filter(name = "orgFilter", condition = "org_id = :orgId")
public class MailSignature extends PanacheEntityBase {
    /** Owning tenant (multi-tenant). Stamped on create; the orgFilter scopes reads. */
    @jakarta.persistence.Column(name = "org_id")
    public String orgId;


    @Id
    public String id;

    @JsonIgnore
    @Column(name = "mailbox_id")
    public String mailboxId;

    public String html;
    public boolean enabled;
}
