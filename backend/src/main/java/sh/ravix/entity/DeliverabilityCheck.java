package sh.ravix.entity;

import com.fasterxml.jackson.annotation.JsonIgnore;
import io.quarkus.hibernate.orm.panache.PanacheEntityBase;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

@Entity
@Table(name = "deliverability_check")
public class DeliverabilityCheck extends PanacheEntityBase {

    @Id
    public String id;

    public String label;
    public String status;
    public String detail;

    @JsonIgnore
    @Column(name = "sort_order")
    public int sortOrder;
}
