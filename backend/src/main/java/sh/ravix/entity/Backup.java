package sh.ravix.entity;

import io.quarkus.hibernate.orm.panache.PanacheEntityBase;
import jakarta.persistence.CollectionTable;
import jakarta.persistence.Column;
import jakarta.persistence.ElementCollection;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.Table;
import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.List;

@Entity
@Table(name = "backup")
public class Backup extends PanacheEntityBase {

    @Id
    public String id;

    @Column(name = "created_at")
    public OffsetDateTime createdAt;

    @Column(name = "size_mb")
    public int sizeMb;

    public String type;
    public String status;

    @ElementCollection(fetch = FetchType.EAGER)
    @CollectionTable(name = "backup_content", joinColumns = @JoinColumn(name = "backup_id"))
    @Column(name = "item")
    public List<String> contents = new ArrayList<>();
}
