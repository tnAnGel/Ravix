package sh.ravix.entity;

import io.quarkus.hibernate.orm.panache.PanacheEntityBase;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.OffsetDateTime;

@Entity
@Table(name = "event")
public class Event extends PanacheEntityBase {

    @Id
    public String id;

    public String category;
    public String severity;
    public String message;
    public OffsetDateTime at;
}
