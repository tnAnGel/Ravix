package sh.ravix.entity;

import io.quarkus.hibernate.orm.panache.PanacheEntityBase;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.LocalDate;

/** Singleton (id=1) warm-up plan: ramps the daily send cap over ~30 days. */
@Entity
@Table(name = "warmup_config")
public class WarmupConfig extends PanacheEntityBase {

    @Id
    public Integer id;

    public boolean enabled;

    @Column(name = "start_date")
    public LocalDate startDate;

    @Column(name = "target_daily")
    public int targetDaily;
}
