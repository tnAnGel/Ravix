package sh.ravix.auth;

import jakarta.enterprise.context.ApplicationScoped;
import java.time.Duration;
import java.time.Instant;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import org.eclipse.microprofile.config.inject.ConfigProperty;

/**
 * Throttles {@code /api/auth/login} so the panel password cannot be brute-forced.
 *
 * Two independent buckets are tracked per attempt — the submitted username and
 * the client IP — and either one tripping locks the attempt out. The username
 * bucket stops a distributed guess at one account; the IP bucket stops one host
 * spraying many accounts.
 *
 * State is in-memory and per-process on purpose: Ravix runs as a single backend
 * instance next to its mail stack, and a limiter that survives a restart is not
 * worth a database round-trip on every login. A restart clears the counters,
 * which is acceptable — an attacker cannot trigger one.
 */
@ApplicationScoped
public class LoginRateLimiter {

    /** Failures against one username, inside the window, before it is locked. */
    @ConfigProperty(name = "ravix.auth.max-failures", defaultValue = "5")
    int maxFailures;

    /**
     * Failures from one IP before that IP is locked. Deliberately far higher than
     * the per-username budget: admins commonly share an office IP or sit behind
     * one NAT, and a threshold as tight as the username one would let a single
     * colleague fat-fingering their password lock out the whole building. This
     * bucket exists to catch spraying across many accounts, which produces far
     * more failures than honest mistyping ever does.
     */
    @ConfigProperty(name = "ravix.auth.max-failures-per-ip", defaultValue = "20")
    int maxFailuresPerIp;

    /** Sliding window (seconds) over which failures are counted. */
    @ConfigProperty(name = "ravix.auth.window-seconds", defaultValue = "300")
    long windowSeconds;

    /** How long (seconds) a key stays locked once it trips. */
    @ConfigProperty(name = "ravix.auth.lockout-seconds", defaultValue = "900")
    long lockoutSeconds;

    private final Map<String, Attempts> buckets = new ConcurrentHashMap<>();

    private static final class Attempts {
        int failures;
        Instant first;
        Instant lockedUntil;
    }

    /**
     * Seconds the caller must wait, or 0 when the attempt may proceed.
     * Checked before the password is verified, so a locked key costs no BCrypt.
     */
    public long retryAfter(String username, String clientIp) {
        long a = retryAfterKey(userKey(username));
        long b = retryAfterKey(ipKey(clientIp));
        return Math.max(a, b);
    }

    private long retryAfterKey(String key) {
        if (key == null) return 0;
        Attempts at = buckets.get(key);
        if (at == null || at.lockedUntil == null) return 0;
        long left = Duration.between(Instant.now(), at.lockedUntil).getSeconds();
        if (left <= 0) {
            // Lock expired — drop the bucket so the next failure starts fresh.
            buckets.remove(key);
            return 0;
        }
        return left;
    }

    /** Record a failed attempt against both buckets. */
    public void recordFailure(String username, String clientIp) {
        fail(userKey(username), maxFailures);
        fail(ipKey(clientIp), maxFailuresPerIp);
    }

    private void fail(String key, int threshold) {
        if (key == null) return;
        Instant now = Instant.now();
        buckets.compute(key, (k, at) -> {
            if (at == null || at.first == null
                    || Duration.between(at.first, now).getSeconds() > windowSeconds) {
                at = new Attempts();
                at.first = now;
                at.failures = 0;
            }
            at.failures++;
            if (at.failures >= threshold) {
                at.lockedUntil = now.plusSeconds(lockoutSeconds);
            }
            return at;
        });
    }

    /** Clear both buckets after a successful sign-in. */
    public void recordSuccess(String username, String clientIp) {
        String u = userKey(username);
        String i = ipKey(clientIp);
        if (u != null) buckets.remove(u);
        if (i != null) buckets.remove(i);
    }

    /** Test hook — drops all state. */
    public void reset() {
        buckets.clear();
    }

    private static String userKey(String username) {
        if (username == null || username.isBlank()) return null;
        return "u:" + username.trim().toLowerCase();
    }

    private static String ipKey(String clientIp) {
        if (clientIp == null || clientIp.isBlank()) return null;
        return "i:" + clientIp.trim();
    }
}
