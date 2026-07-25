package sh.ravix.entity;

import com.fasterxml.jackson.annotation.JsonIgnore;
import io.quarkus.hibernate.orm.panache.PanacheEntityBase;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.OffsetDateTime;

@Entity
@Table(name = "certificate")
public class Certificate extends PanacheEntityBase {

    @Id
    public String id;

    public String domain;
    public String issuer;
    public String type;
    public String status;

    @Column(name = "issued_at")
    public OffsetDateTime issuedAt;

    @Column(name = "expires_at")
    public OffsetDateTime expiresAt;

    @Column(name = "auto_renew")
    public boolean autoRenew;

    @JsonIgnore
    @Column(name = "last_renewal_at")
    public OffsetDateTime lastRenewalAt;

    @JsonIgnore
    @Column(name = "last_renewal_status")
    public String lastRenewalStatus;

    @JsonIgnore
    @Column(name = "last_renewal_detail")
    public String lastRenewalDetail;
}
