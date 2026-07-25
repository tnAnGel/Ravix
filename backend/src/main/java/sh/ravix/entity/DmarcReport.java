package sh.ravix.entity;

import io.quarkus.hibernate.orm.panache.PanacheEntityBase;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.OffsetDateTime;

/** A parsed DMARC aggregate (RUA) report from one reporting organization. */
@Entity
@Table(name = "dmarc_report")
public class DmarcReport extends PanacheEntityBase {

    @Id
    public String id;

    public String domain;

    @Column(name = "org_name")
    public String orgName;

    @Column(name = "report_id")
    public String reportId;

    @Column(name = "date_begin")
    public OffsetDateTime dateBegin;

    @Column(name = "date_end")
    public OffsetDateTime dateEnd;

    @Column(name = "received_at")
    public OffsetDateTime receivedAt;

    @Column(name = "total_count")
    public int totalCount;

    @Column(name = "pass_count")
    public int passCount;

    @Column(name = "fail_count")
    public int failCount;
}
