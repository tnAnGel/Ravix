package sh.ravix.entity;

import com.fasterxml.jackson.annotation.JsonIgnore;
import io.quarkus.hibernate.orm.panache.PanacheEntityBase;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.OffsetDateTime;

@Entity
@Table(name = "admin_user")
public class AdminUser extends PanacheEntityBase {

    @Id
    public String id;

    public String email;
    public String role;

    /** Operator-level flag: bypasses tenant scoping; may act in any org. */
    public boolean superadmin;

    @JsonIgnore
    @Column(name = "password_hash")
    public String passwordHash;

    @Column(name = "two_factor")
    public boolean twoFactor;

    @JsonIgnore
    @Column(name = "two_factor_secret")
    public String twoFactorSecret;

    @Column(name = "created_at")
    public OffsetDateTime createdAt;
}
