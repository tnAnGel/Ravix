package sh.ravix.auth;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

/**
 * Unit tests for the login throttle. Config fields are set directly rather than
 * injected so the timing behaviour can be exercised without booting Quarkus.
 */
class LoginRateLimiterTest {

    private LoginRateLimiter limiter;

    @BeforeEach
    void setUp() {
        limiter = new LoginRateLimiter();
        limiter.maxFailures = 3;
        limiter.maxFailuresPerIp = 8;
        limiter.windowSeconds = 300;
        limiter.lockoutSeconds = 900;
    }

    @Test
    void allowsAttemptsBelowTheThreshold() {
        limiter.recordFailure("admin@example.com", "203.0.113.5");
        limiter.recordFailure("admin@example.com", "203.0.113.5");
        assertEquals(0, limiter.retryAfter("admin@example.com", "203.0.113.5"),
                "two failures out of three must not lock the account");
    }

    @Test
    void locksOutOnceTheThresholdIsReached() {
        for (int i = 0; i < 3; i++) {
            limiter.recordFailure("admin@example.com", "203.0.113.5");
        }
        assertTrue(limiter.retryAfter("admin@example.com", "203.0.113.5") > 0,
                "third failure must trip the lockout");
    }

    @Test
    void successClearsTheCounter() {
        limiter.recordFailure("admin@example.com", "203.0.113.5");
        limiter.recordFailure("admin@example.com", "203.0.113.5");
        limiter.recordSuccess("admin@example.com", "203.0.113.5");
        limiter.recordFailure("admin@example.com", "203.0.113.5");
        assertEquals(0, limiter.retryAfter("admin@example.com", "203.0.113.5"),
                "a good sign-in resets the streak");
    }

    /** One host spraying many accounts must still be stopped by the IP bucket. */
    @Test
    void locksTheClientIpEvenWhenTheUsernameVaries() {
        for (int i = 0; i < 8; i++) {
            limiter.recordFailure("user" + i + "@example.com", "203.0.113.9");
        }
        assertTrue(limiter.retryAfter("never-tried@example.com", "203.0.113.9") > 0,
                "the IP bucket must trip regardless of which account was targeted");
    }

    /**
     * One colleague mistyping their password must not lock everyone behind the
     * same office IP out of the panel — the IP budget is much larger than the
     * per-username one precisely so this cannot happen.
     */
    @Test
    void oneLockedAccountDoesNotLockOthersSharingTheSameIp() {
        for (int i = 0; i < 3; i++) {
            limiter.recordFailure("clumsy@example.com", "203.0.113.20");
        }
        assertTrue(limiter.retryAfter("clumsy@example.com", "203.0.113.20") > 0,
                "the mistyping account itself is locked");
        assertEquals(0, limiter.retryAfter("colleague@example.com", "203.0.113.20"),
                "a colleague on the same IP must still be able to sign in");
    }

    /** A distributed guess at one account must be stopped by the username bucket. */
    @Test
    void locksTheUsernameEvenWhenTheIpVaries() {
        limiter.recordFailure("admin@example.com", "203.0.113.1");
        limiter.recordFailure("admin@example.com", "203.0.113.2");
        limiter.recordFailure("admin@example.com", "203.0.113.3");
        assertTrue(limiter.retryAfter("admin@example.com", "198.51.100.7") > 0,
                "the username bucket must trip regardless of source IP");
    }

    @Test
    void unrelatedAccountsAreUnaffected() {
        for (int i = 0; i < 5; i++) {
            limiter.recordFailure("victim@example.com", "203.0.113.5");
        }
        assertEquals(0, limiter.retryAfter("someone-else@example.com", "198.51.100.1"),
                "locking one key must not lock an unrelated one");
    }

    /** Usernames are matched case-insensitively so casing cannot dodge the lock. */
    @Test
    void usernameMatchingIgnoresCaseAndSurroundingSpace() {
        for (int i = 0; i < 3; i++) {
            limiter.recordFailure("Admin@Example.com", null);
        }
        assertTrue(limiter.retryAfter("  admin@example.com  ", null) > 0);
    }

    @Test
    void missingUsernameAndIpAreIgnoredRatherThanShared() {
        limiter.recordFailure(null, null);
        limiter.recordFailure(null, null);
        limiter.recordFailure(null, null);
        assertEquals(0, limiter.retryAfter(null, null),
                "null keys must not collapse into one shared bucket");
    }
}
