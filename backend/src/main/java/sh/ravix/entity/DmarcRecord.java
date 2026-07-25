package sh.ravix.entity;

import io.quarkus.hibernate.orm.panache.PanacheEntityBase;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

/** One source-IP row within a DMARC aggregate report. */
@Entity
@Table(name = "dmarc_record")
public class DmarcRecord extends PanacheEntityBase {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    public Long id;

    @Column(name = "report_id")
    public String reportId;

    @Column(name = "source_ip")
    public String sourceIp;

    public int count;
    public String disposition;

    @Column(name = "dkim_result")
    public String dkimResult;

    @Column(name = "spf_result")
    public String spfResult;

    @Column(name = "header_from")
    public String headerFrom;

    public boolean aligned;
}
