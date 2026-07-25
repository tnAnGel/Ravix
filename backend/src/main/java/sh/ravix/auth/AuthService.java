package sh.ravix.auth;

import io.quarkus.runtime.StartupEvent;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.enterprise.event.Observes;
import jakarta.inject.Inject;
import jakarta.transaction.Transactional;
import java.security.SecureRandom;
import java.time.OffsetDateTime;
import java.util.Base64;
import java.util.Optional;
import org.eclipse.microprofile.config.inject.ConfigProperty;
import org.jboss.logging.Logger;
import sh.ravix.entity.AdminUser;
import sh.ravix.entity.AuthSession;
import sh.ravix.util.Ids;

/** Authentication: credential checks, session tokens and first-run admin seeding. */
@ApplicationScoped
public class AuthService {

    private static final Logger LOG = Logger.getLogger(AuthService.class);
    private static final SecureRandom RANDOM = new SecureRandom();
    private static final long SESSION_DAYS = 30;

    @Inject
    PasswordHasher hasher;

    @Inject
    TotpService totp;

    /** Outcome of a login attempt: either a session, or a 2FA challenge, or failure. */
    public enum LoginResult { OK, INVALID, TWO_FACTOR_REQUIRED }

    @ConfigProperty(name = "ravix.admin.email", defaultValue = "admin@example.com")
    String defaultAdminEmail;

    /**
     * Empty by default — and deliberately so. A shipped default password is a
     * published password: every install that forgets to set one would answer to
     * the same string. When this is blank we mint a random password instead and
     * print it once at startup, so a forgotten config yields an account nobody
     * can guess rather than an account everybody can.
     */
    @ConfigProperty(name = "ravix.admin.password", defaultValue = "")
    String defaultAdminPassword;

    /** Create a default admin on first run if no admin accounts exist. */
    @Transactional
    void onStart(@Observes StartupEvent ev) {
        if (AdminUser.count() == 0) {
            String password = defaultAdminPassword;
            boolean generated = password == null || password.isBlank();
            if (generated) password = randomPassword();

            AdminUser admin = new AdminUser();
            admin.id = Ids.generate("usr");
            admin.email = defaultAdminEmail;
            admin.role = Roles.OWNER;
            admin.superadmin = true;     // the operator of this install
            admin.passwordHash = hasher.hash(password);
            admin.twoFactor = false;
            admin.createdAt = OffsetDateTime.now();
            admin.persist();

            // Ensure a default org exists and make the operator its owner so
            // tenant-scoped data has a home from first boot.
            sh.ravix.entity.Organization def =
                    sh.ravix.entity.Organization.findById("org_default");
            if (def == null) {
                def = new sh.ravix.entity.Organization();
                def.id = "org_default";
                def.name = "Default";
                def.slug = "default";
                def.status = "active";
                def.createdAt = OffsetDateTime.now();
                def.persist();
            }
            sh.ravix.entity.OrgMembership mb = new sh.ravix.entity.OrgMembership();
            mb.id = Ids.generate("mbr");
            mb.orgId = def.id;
            mb.adminUserId = admin.id;
            mb.role = Roles.OWNER;
            mb.createdAt = OffsetDateTime.now();
            mb.persist();

            if (generated) {
                // Printed once, never stored in clear. If this scrolls past, use
                // `ravixctl reset-admin <email> <password>` to set a known one.
                LOG.warnf("%n"
                        + "==================================================================%n"
                        + "  Ravix created the first admin account.%n"
                        + "    email:    %s%n"
                        + "    password: %s%n"
                        + "  This password was generated because ravix.admin.password was not%n"
                        + "  set, and it is shown only this once. Change it after signing in.%n"
                        + "==================================================================",
                        defaultAdminEmail, password);
            } else {
                LOG.infof("Created default admin account '%s' from ravix.admin.password",
                        defaultAdminEmail);
            }
        }
    }

    /** A random, human-transcribable first-run password. */
    private static String randomPassword() {
        // Excludes look-alike glyphs (0/O, 1/l/I) so the printed value can be
        // retyped from a console without ambiguity.
        final String alphabet = "abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";
        StringBuilder sb = new StringBuilder(20);
        for (int i = 0; i < 20; i++) {
            sb.append(alphabet.charAt(RANDOM.nextInt(alphabet.length())));
        }
        return sb.toString();
    }

    /** A login attempt result carrying the session token when successful. */
    public record LoginOutcome(LoginResult result, String token) {}

    @Transactional
    public LoginOutcome login(String email, String password, String code) {
        AdminUser user = AdminUser.find("email", email == null ? "" : email.trim()).firstResult();
        if (user == null || !hasher.verify(password, user.passwordHash)) {
            return new LoginOutcome(LoginResult.INVALID, null);
        }
        // Enforce TOTP when the account has 2FA enabled.
        if (user.twoFactor && user.twoFactorSecret != null) {
            if (code == null || code.isBlank()) {
                return new LoginOutcome(LoginResult.TWO_FACTOR_REQUIRED, null);
            }
            if (!totp.verify(user.twoFactorSecret, code)) {
                return new LoginOutcome(LoginResult.INVALID, null);
            }
        }
        AuthSession session = new AuthSession();
        session.token = newToken();
        session.adminUserId = user.id;
        session.createdAt = OffsetDateTime.now();
        session.expiresAt = session.createdAt.plusDays(SESSION_DAYS);
        session.persist();
        return new LoginOutcome(LoginResult.OK, session.token);
    }

    /** Begin 2FA enrolment: store a fresh secret (not yet enabled) and return it. */
    @Transactional
    public String beginTwoFactorSetup(String userId) {
        AdminUser user = AdminUser.findById(userId);
        if (user == null) return null;
        String secret = totp.generateSecret();
        user.twoFactorSecret = secret;
        return secret;
    }

    /** Confirm enrolment: verify a code against the pending secret, then enable. */
    @Transactional
    public boolean enableTwoFactor(String userId, String code) {
        AdminUser user = AdminUser.findById(userId);
        if (user == null || user.twoFactorSecret == null) return false;
        if (!totp.verify(user.twoFactorSecret, code)) return false;
        user.twoFactor = true;
        return true;
    }

    /** Disable 2FA after verifying the account password. */
    @Transactional
    public boolean disableTwoFactor(String userId, String password) {
        AdminUser user = AdminUser.findById(userId);
        if (user == null || !hasher.verify(password == null ? "" : password, user.passwordHash)) {
            return false;
        }
        user.twoFactor = false;
        user.twoFactorSecret = null;
        return true;
    }

    /** Change the password of the given admin after verifying the current one. */
    @Transactional
    public boolean changePassword(String userId, String currentPassword, String newPassword) {
        AdminUser user = AdminUser.findById(userId);
        if (user == null || newPassword == null || newPassword.length() < 8) {
            return false;
        }
        if (!hasher.verify(currentPassword == null ? "" : currentPassword, user.passwordHash)) {
            return false;
        }
        user.passwordHash = hasher.hash(newPassword);
        // Invalidate other sessions for safety.
        AuthSession.delete("adminUserId", user.id);
        return true;
    }

    @Transactional
    public void logout(String token) {
        if (token != null) {
            AuthSession.deleteById(token);
        }
    }

    /** Resolve the admin user behind a session token, if valid and unexpired. */
    public Optional<AdminUser> resolve(String token) {
        if (token == null || token.isBlank()) return Optional.empty();
        AuthSession session = AuthSession.findById(token);
        if (session == null || session.expiresAt.isBefore(OffsetDateTime.now())) {
            return Optional.empty();
        }
        AdminUser user = AdminUser.findById(session.adminUserId);
        return Optional.ofNullable(user);
    }

    private static String newToken() {
        byte[] bytes = new byte[32];
        RANDOM.nextBytes(bytes);
        return Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
    }
}
