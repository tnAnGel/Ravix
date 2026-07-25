package sh.ravix.entity;

import com.fasterxml.jackson.annotation.JsonIgnore;
import io.quarkus.hibernate.orm.panache.PanacheEntityBase;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

@Entity
@Table(name = "service_status")
public class ServiceStatus extends PanacheEntityBase {

    @Id
    public String id;

    public String name;
    public String description;
    public String state;
    public String uptime;
    public String version;

    @Column(name = "memory_mb")
    public int memoryMb;

    @JsonIgnore
    @Column(name = "sort_order")
    public int sortOrder;
}
