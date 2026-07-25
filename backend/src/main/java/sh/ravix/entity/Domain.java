package sh.ravix.entity;

import com.fasterxml.jackson.annotation.JsonIgnore;
import io.quarkus.hibernate.orm.panache.PanacheEntityBase;
import jakarta.persistence.CascadeType;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.Id;
import jakarta.persistence.OneToMany;
import jakarta.persistence.OrderBy;
import jakarta.persistence.Table;
import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.List;

/**
 * A managed mail domain. The flat check_* / ssl_* columns are reshaped into
 * the nested {@code checks} / {@code ssl} objects by the domain DTO mapper.
 */
@Entity
@Table(name = "domain")
@jakarta.persistence.EntityListeners(sh.ravix.entity.OrgStamp.class)
@org.hibernate.annotations.Filter(name = "orgFilter", condition = "org_id = :orgId")
public class Domain extends PanacheEntityBase {
    /** Owning tenant (multi-tenant). Stamped on create; the orgFilter scopes reads. */
    @jakarta.persistence.Column(name = "org_id")
    public String orgId;


    @Id
    public String id;

    public String name;
    public String status;

    @Column(name = "created_at")
    public OffsetDateTime createdAt;

    @Column(name = "check_mx")
    public String checkMx;
    @Column(name = "check_spf")
    public String checkSpf;
    @Column(name = "check_dkim")
    public String checkDkim;
    @Column(name = "check_dmarc")
    public String checkDmarc;
    @Column(name = "check_ssl")
    public String checkSsl;

    @Column(name = "dkim_selector")
    public String dkimSelector;
    @Column(name = "dkim_public_key")
    public String dkimPublicKey;
    @JsonIgnore
    @Column(name = "dkim_private_key")
    public String dkimPrivateKey;

    @Column(name = "ssl_issuer")
    public String sslIssuer;
    @Column(name = "ssl_expires_at")
    public OffsetDateTime sslExpiresAt;
    @Column(name = "ssl_auto_renew")
    public boolean sslAutoRenew;

    @JsonIgnore
    @OneToMany(mappedBy = "domain", cascade = CascadeType.ALL, orphanRemoval = true, fetch = FetchType.LAZY)
    @OrderBy("sortOrder ASC")
    public List<DnsRecord> records = new ArrayList<>();
}
