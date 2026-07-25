package sh.ravix.entity;

import com.fasterxml.jackson.annotation.JsonIgnore;
import io.quarkus.hibernate.orm.panache.PanacheEntityBase;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

/** A server-side mail-handling rule, compiled to Sieve for Dovecot/Pigeonhole.
 *  Applied at delivery time (LMTP), so it works even when webmail is closed. */
@Entity
@Table(name = "mail_filter")
@jakarta.persistence.EntityListeners(sh.ravix.entity.OrgStamp.class)
@org.hibernate.annotations.Filter(name = "orgFilter", condition = "org_id = :orgId")
public class MailFilter extends PanacheEntityBase {
    /** Owning tenant (multi-tenant). Stamped on create; the orgFilter scopes reads. */
    @jakarta.persistence.Column(name = "org_id")
    public String orgId;


    @Id
    public String id;

    @JsonIgnore
    @Column(name = "mailbox_id")
    public String mailboxId;

    public int ord;
    public String name;
    public String field;   // from | to | subject
    public String op;      // contains | is
    public String value;
    public String action;  // fileinto | discard | mark_read | star
    public String target;  // folder for fileinto
    public boolean enabled;
}
