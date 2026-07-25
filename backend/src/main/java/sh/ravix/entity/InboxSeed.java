package sh.ravix.entity;

import com.fasterxml.jackson.annotation.JsonIgnore;
import io.quarkus.hibernate.orm.panache.PanacheEntityBase;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

/** An operator-owned mailbox used as an inbox-placement seed (read over IMAP). */
@Entity
@Table(name = "inbox_seed")
@jakarta.persistence.EntityListeners(sh.ravix.entity.OrgStamp.class)
@org.hibernate.annotations.Filter(name = "orgFilter", condition = "org_id = :orgId")
public class InboxSeed extends PanacheEntityBase {
    /** Owning tenant (multi-tenant). Stamped on create; the orgFilter scopes reads. */
    @jakarta.persistence.Column(name = "org_id")
    public String orgId;


    @Id
    public String id;

    public String label;
    public String email;

    @Column(name = "imap_host")
    public String imapHost;

    @Column(name = "imap_port")
    public int imapPort;

    @Column(name = "imap_user")
    public String imapUser;

    /** App password — never serialised to the client. */
    @JsonIgnore
    @Column(name = "imap_pass")
    public String imapPass;

    public boolean enabled;
}
