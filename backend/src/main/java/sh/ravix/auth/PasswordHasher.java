package sh.ravix.auth;

import at.favre.lib.crypto.bcrypt.BCrypt;
import jakarta.enterprise.context.ApplicationScoped;

/** BCrypt password hashing / verification. */
@ApplicationScoped
public class PasswordHasher {

    private static final int COST = 12;

    public String hash(String plain) {
        return BCrypt.withDefaults().hashToString(COST, plain.toCharArray());
    }

    public boolean verify(String plain, String hash) {
        if (plain == null || hash == null) return false;
        try {
            return BCrypt.verifyer().verify(plain.toCharArray(), hash).verified;
        } catch (Exception e) {
            return false;
        }
    }
}
