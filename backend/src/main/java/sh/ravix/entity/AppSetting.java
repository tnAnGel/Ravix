package sh.ravix.entity;

import io.quarkus.hibernate.orm.panache.PanacheEntityBase;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

/** Simple key/value store for panel settings and system facts. */
@Entity
@Table(name = "app_setting")
public class AppSetting extends PanacheEntityBase {

    @Id
    @Column(name = "skey")
    public String key;

    @Column(name = "sval")
    public String value;
}
