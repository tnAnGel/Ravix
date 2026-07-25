package sh.ravix.dto;

import java.time.OffsetDateTime;
import sh.ravix.entity.Certificate;

public record CertificateDto(
        String id,
        String domain,
        String issuer,
        String type,
        String status,
        OffsetDateTime issuedAt,
        OffsetDateTime expiresAt,
        boolean autoRenew,
        LastRenewal lastRenewal) {

    public record LastRenewal(OffsetDateTime at, String status, String detail) {}

    public static CertificateDto from(Certificate c) {
        return new CertificateDto(
                c.id, c.domain, c.issuer, c.type, c.status, c.issuedAt, c.expiresAt, c.autoRenew,
                new LastRenewal(c.lastRenewalAt, c.lastRenewalStatus, c.lastRenewalDetail));
    }
}
