package sh.ravix.entity;

import io.quarkus.hibernate.orm.panache.PanacheEntityBase;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.OffsetDateTime;

/** Result of checking one IP against one DNSBL zone. */
@Entity
@Table(name = "rbl_check")
public class RblCheck extends PanacheEntityBase {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    public Long id;

    public String ip;
    public String zone;
    public boolean listed;
    public String result;

    @Column(name = "checked_at")
    public OffsetDateTime checkedAt;
}
