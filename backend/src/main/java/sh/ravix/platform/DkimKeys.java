package sh.ravix.platform;

import java.security.KeyPair;
import java.security.KeyPairGenerator;
import java.util.Base64;

/** Generates real RSA DKIM key pairs. */
public final class DkimKeys {

    private DkimKeys() {}

    public record Pair(String publicKeyBase64, String privatePem) {}

    public static Pair generate() {
        try {
            KeyPairGenerator gen = KeyPairGenerator.getInstance("RSA");
            gen.initialize(2048);
            KeyPair kp = gen.generateKeyPair();

            String publicB64 = Base64.getEncoder().encodeToString(kp.getPublic().getEncoded());

            String privateB64 = Base64.getEncoder().encodeToString(kp.getPrivate().getEncoded());
            StringBuilder pem = new StringBuilder("-----BEGIN PRIVATE KEY-----\n");
            for (int i = 0; i < privateB64.length(); i += 64) {
                pem.append(privateB64, i, Math.min(i + 64, privateB64.length())).append('\n');
            }
            pem.append("-----END PRIVATE KEY-----\n");

            return new Pair(publicB64, pem.toString());
        } catch (Exception e) {
            throw new RuntimeException("Failed to generate DKIM key pair", e);
        }
    }

    /** Build the DKIM TXT record value from a public key. */
    public static String txtValue(String publicKeyBase64) {
        return "v=DKIM1; k=rsa; p=" + publicKeyBase64;
    }
}
