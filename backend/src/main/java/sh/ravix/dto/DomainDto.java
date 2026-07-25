package sh.ravix.dto;

import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.List;
import sh.ravix.entity.DnsRecord;
import sh.ravix.entity.Domain;

/** Domain payload reshaped to match the frontend's nested contract. */
public record DomainDto(
        String id,
        String name,
        String status,
        OffsetDateTime createdAt,
        int mailboxes,
        int aliases,
        Checks checks,
        String dkimSelector,
        String dkimPublicKey,
        Ssl ssl,
        List<DnsRecord> records) {

    public record Checks(String mx, String spf, String dkim, String dmarc, String ssl) {}

    public record Ssl(String issuer, OffsetDateTime expiresAt, boolean autoRenew) {}

    public static DomainDto from(Domain d, long mailboxCount, long aliasCount) {
        return new DomainDto(
                d.id,
                d.name,
                d.status,
                d.createdAt,
                (int) mailboxCount,
                (int) aliasCount,
                new Checks(d.checkMx, d.checkSpf, d.checkDkim, d.checkDmarc, d.checkSsl),
                d.dkimSelector,
                d.dkimPublicKey,
                new Ssl(d.sslIssuer, d.sslExpiresAt, d.sslAutoRenew),
                // Copy inside the transaction so the lazy collection is
                // initialized before JSON serialization (which runs post-commit).
                new ArrayList<>(d.records));
    }
}
