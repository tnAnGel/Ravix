package sh.ravix.entity;

import io.quarkus.hibernate.orm.panache.PanacheEntityBase;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.OffsetDateTime;

/** A long-running action the user kicked off, tracked for live polling. */
@Entity
@Table(name = "background_task")
public class BackgroundTask extends PanacheEntityBase {

    @Id
    public String id;

    public String kind;
    public String target;
    public String action;
    public String status;     // "running" | "ok" | "failed"

    @Column(name = "started_at")
    public OffsetDateTime startedAt;

    @Column(name = "finished_at")
    public OffsetDateTime finishedAt;

    public String log;
}
