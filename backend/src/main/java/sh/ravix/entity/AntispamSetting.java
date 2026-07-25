package sh.ravix.entity;

import com.fasterxml.jackson.annotation.JsonIgnore;
import io.quarkus.hibernate.orm.panache.PanacheEntityBase;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.math.BigDecimal;

/** Singleton anti-spam configuration (id is always 1). */
@Entity
@Table(name = "antispam_setting")
public class AntispamSetting extends PanacheEntityBase {

    @Id
    @JsonIgnore
    public Integer id;

    public String status;

    @Column(name = "spam_threshold")
    public BigDecimal spamThreshold;

    @Column(name = "reject_threshold")
    public BigDecimal rejectThreshold;

    public boolean greylisting;

    @Column(name = "dkim_signing")
    public boolean dkimSigning;

    @Column(name = "bayes_learned")
    public int bayesLearned;
}
