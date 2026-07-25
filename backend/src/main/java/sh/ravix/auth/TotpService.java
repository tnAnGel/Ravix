package sh.ravix.auth;

import jakarta.enterprise.context.ApplicationScoped;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.security.SecureRandom;
import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;

/**
 * TOTP (RFC 6238) — secret generation, otpauth URI and code verification.
 * Self-contained (HMAC-SHA1, 6 digits, 30s step) so no external dependency is
 * needed. Compatible with Google Authenticator, Authy, 1Password, etc.
 */
@ApplicationScoped
public class TotpService {

    private static final String BASE32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
    private static final int DIGITS = 6;
    private static final int STEP_SECONDS = 30;
    private static final SecureRandom RANDOM = new SecureRandom();

    /** A fresh base32 secret (160 bits). */
    public String generateSecret() {
        byte[] buf = new byte[20];
        RANDOM.nextBytes(buf);
        StringBuilder sb = new StringBuilder();
        int bits = 0, value = 0;
        for (byte b : buf) {
            value = (value << 8) | (b & 0xff);
            bits += 8;
            while (bits >= 5) {
                sb.append(BASE32.charAt((value >>> (bits - 5)) & 31));
                bits -= 5;
            }
        }
        return sb.toString();
    }

    /** otpauth:// URI for QR enrolment. */
    public String otpauthUri(String issuer, String account, String secret) {
        String label = enc(issuer) + ":" + enc(account);
        return "otpauth://totp/" + label
                + "?secret=" + secret
                + "&issuer=" + enc(issuer)
                + "&algorithm=SHA1&digits=" + DIGITS + "&period=" + STEP_SECONDS;
    }

    /** Verify a code, allowing ±1 time step for clock drift. */
    public boolean verify(String secret, String code) {
        if (secret == null || code == null) return false;
        String trimmed = code.trim().replace(" ", "");
        if (!trimmed.matches("\\d{" + DIGITS + "}")) return false;
        long counter = System.currentTimeMillis() / 1000L / STEP_SECONDS;
        for (long w = -1; w <= 1; w++) {
            if (trimmed.equals(generate(secret, counter + w))) return true;
        }
        return false;
    }

    private String generate(String secret, long counter) {
        byte[] key = base32Decode(secret);
        byte[] data = new byte[8];
        for (int i = 7; i >= 0; i--) {
            data[i] = (byte) (counter & 0xff);
            counter >>>= 8;
        }
        try {
            Mac mac = Mac.getInstance("HmacSHA1");
            mac.init(new SecretKeySpec(key, "HmacSHA1"));
            byte[] hash = mac.doFinal(data);
            int offset = hash[hash.length - 1] & 0xf;
            int binary = ((hash[offset] & 0x7f) << 24)
                    | ((hash[offset + 1] & 0xff) << 16)
                    | ((hash[offset + 2] & 0xff) << 8)
                    | (hash[offset + 3] & 0xff);
            int otp = binary % (int) Math.pow(10, DIGITS);
            return String.format("%0" + DIGITS + "d", otp);
        } catch (Exception e) {
            return "";
        }
    }

    private byte[] base32Decode(String s) {
        s = s.replace("=", "").toUpperCase();
        int bits = 0, value = 0, idx = 0;
        byte[] out = new byte[s.length() * 5 / 8];
        for (int i = 0; i < s.length(); i++) {
            int c = BASE32.indexOf(s.charAt(i));
            if (c < 0) continue;
            value = (value << 5) | c;
            bits += 5;
            if (bits >= 8) {
                out[idx++] = (byte) ((value >>> (bits - 8)) & 0xff);
                bits -= 8;
            }
        }
        return out;
    }

    private static String enc(String s) {
        return URLEncoder.encode(s, StandardCharsets.UTF_8);
    }
}
