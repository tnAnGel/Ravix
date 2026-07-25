package sh.ravix.platform;

import jakarta.enterprise.context.ApplicationScoped;
import java.io.FileInputStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.security.MessageDigest;
import java.security.cert.CertificateFactory;
import java.security.cert.X509Certificate;
import java.util.Optional;
import org.jboss.logging.Logger;

/**
 * Computes the DANE/TLSA value (usage=3 selector=1 matching_type=1 — DANE-EE
 * over SubjectPublicKeyInfo, hashed SHA-256) for the mail server's TLS cert.
 *
 * The TLSA hash is the SHA-256 of the certificate's SPKI (DER-encoded
 * PublicKey object), formatted as lowercase hex. RFC 7671 §5.1.
 *
 * Returned in two shapes for convenience:
 *   - {@link #hex(Path)} → just the hex string ("a4b9c2…")
 *   - {@link #recordContent(Path)} → "3 1 1 a4b9c2…" — the exact form that
 *     `dig` prints and that Cloudflare echoes back in DNS record `content`.
 */
@ApplicationScoped
public class TlsaService {

    private static final Logger LOG = Logger.getLogger(TlsaService.class);

    /** Compute the SHA-256(SPKI) hex from a PEM cert/chain file. Returns
     *  empty if the file is missing or unparseable — caller decides what
     *  to do (skip TLSA publish, etc.). */
    public Optional<String> hex(Path certPemFile) {
        if (certPemFile == null || !Files.isReadable(certPemFile)) return Optional.empty();
        try (FileInputStream in = new FileInputStream(certPemFile.toFile())) {
            CertificateFactory cf = CertificateFactory.getInstance("X.509");
            // generateCertificate consumes only the FIRST cert in a chain
            // (the leaf), which is exactly what TLSA selector=1 wants.
            X509Certificate cert = (X509Certificate) cf.generateCertificate(in);
            byte[] spki = cert.getPublicKey().getEncoded(); // DER SPKI
            byte[] digest = MessageDigest.getInstance("SHA-256").digest(spki);
            StringBuilder sb = new StringBuilder(digest.length * 2);
            for (byte b : digest) sb.append(String.format("%02x", b & 0xff));
            return Optional.of(sb.toString());
        } catch (Exception e) {
            LOG.warnf("TLSA hash failed for %s: %s", certPemFile, e.getMessage());
            return Optional.empty();
        }
    }

    /** Full TLSA record content: "3 1 1 <hash>". */
    public Optional<String> recordContent(Path certPemFile) {
        return hex(certPemFile).map(h -> "3 1 1 " + h);
    }
}
