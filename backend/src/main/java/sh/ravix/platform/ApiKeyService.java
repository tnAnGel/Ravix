package sh.ravix.platform;

import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;
import jakarta.transaction.Transactional;
import java.security.SecureRandom;
import java.time.OffsetDateTime;
import java.util.Base64;
import java.util.Optional;
import sh.ravix.auth.PasswordHasher;
import sh.ravix.entity.ApiKey;
import sh.ravix.util.Ids;

/** Issues and verifies transactional-API keys. Keys look like
 *  {@code rvx_live_<43 url-safe chars>}; only the bcrypt hash is persisted. */
@ApplicationScoped
public class ApiKeyService {

    private static final SecureRandom RNG = new SecureRandom();

    @Inject PasswordHasher hasher;

    public record Issued(ApiKey row, String plaintext) {}

    @Transactional
    public Issued create(String name, String scopes) {
        byte[] raw = new byte[32];
        RNG.nextBytes(raw);
        String secret = "rvx_live_" + Base64.getUrlEncoder().withoutPadding().encodeToString(raw);

        ApiKey k = new ApiKey();
        k.id = Ids.generate("ak");
        k.name = (name == null || name.isBlank()) ? "API key" : name.trim();
        k.keyHash = hasher.hash(secret);
        k.last4 = secret.substring(secret.length() - 4);
        k.scopes = (scopes == null || scopes.isBlank()) ? "send" : scopes;
        k.createdAt = OffsetDateTime.now();
        k.sentCount = 0;
        k.enabled = true;
        k.persist();
        return new Issued(k, secret);
    }

    /** Verify a presented key against all enabled rows. Returns the matching
     *  row (and bumps last_used) or empty. Linear scan — fine for the handful
     *  of keys a single tenant has; bcrypt makes each compare deliberate. */
    @Transactional
    public Optional<ApiKey> verify(String presented) {
        if (presented == null || presented.isBlank()) return Optional.empty();
        for (ApiKey k : ApiKey.<ApiKey>list("enabled", true)) {
            if (hasher.verify(presented, k.keyHash)) {
                k.lastUsed = OffsetDateTime.now();
                return Optional.of(k);
            }
        }
        return Optional.empty();
    }

    @Transactional
    public void recordSend(String id) {
        ApiKey k = ApiKey.findById(id);
        if (k != null) k.sentCount++;
    }
}
