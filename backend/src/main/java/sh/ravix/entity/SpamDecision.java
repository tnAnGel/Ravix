package sh.ravix.entity;

import com.fasterxml.jackson.annotation.JsonProperty;
import io.quarkus.hibernate.orm.panache.PanacheEntityBase;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.math.BigDecimal;
import java.time.OffsetDateTime;

@Entity
@Table(name = "spam_decision")
public class SpamDecision extends PanacheEntityBase {

    @Id
    public String id;

    /** Stored in column "ts"; exposed to the frontend as "time". */
    @JsonProperty("time")
    public OffsetDateTime ts;

    /** Stored in column "sender"; exposed as "from". */
    @JsonProperty("from")
    public String sender;

    public String action;
    public BigDecimal score;

    /** Comma-separated in the DB; expanded to a string array by the DTO mapper. */
    @JsonProperty("symbols")
    public String symbols;
}
