package sh.ravix.entity;

import com.fasterxml.jackson.annotation.JsonProperty;
import io.quarkus.hibernate.orm.panache.PanacheEntityBase;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.OffsetDateTime;

@Entity
@Table(name = "log_line")
public class LogLine extends PanacheEntityBase {

    @Id
    public String id;

    public String source;
    public String level;

    /** Serialized as "timestamp" for the frontend; stored in column "ts". */
    @Column(name = "ts")
    @JsonProperty("timestamp")
    public OffsetDateTime timestamp;

    public String process;
    public String message;
}
