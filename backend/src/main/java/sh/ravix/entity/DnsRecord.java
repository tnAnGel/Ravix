package sh.ravix.entity;

import com.fasterxml.jackson.annotation.JsonIgnore;
import io.quarkus.hibernate.orm.panache.PanacheEntityBase;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;

/**
 * A required DNS record for a domain. Serialized inside the domain payload,
 * so internal columns (id, ordering, owning domain) are hidden from JSON.
 */
@Entity
@Table(name = "dns_record")
public class DnsRecord extends PanacheEntityBase {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @JsonIgnore
    public Long id;

    @ManyToOne
    @JoinColumn(name = "domain_id")
    @JsonIgnore
    public Domain domain;

    @JsonIgnore
    @Column(name = "sort_order")
    public int sortOrder;

    public String type;
    public String host;
    public String expected;
    public String detected;
    public String status;
    public Integer ttl;
    public Integer priority;
}
