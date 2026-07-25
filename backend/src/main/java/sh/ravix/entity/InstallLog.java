package sh.ravix.entity;

import com.fasterxml.jackson.annotation.JsonIgnore;
import com.fasterxml.jackson.annotation.JsonProperty;
import io.quarkus.hibernate.orm.panache.PanacheEntityBase;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

@Entity
@Table(name = "install_log")
public class InstallLog extends PanacheEntityBase {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @JsonIgnore
    public Long id;

    /** Exposed to the frontend as "at". */
    @JsonProperty("at")
    @Column(name = "at_offset")
    public String atOffset;

    @JsonProperty("msg")
    public String message;

    public boolean ok;

    @JsonIgnore
    @Column(name = "sort_order")
    public int sortOrder;
}
