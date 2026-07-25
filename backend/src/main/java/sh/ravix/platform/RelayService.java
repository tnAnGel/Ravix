package sh.ravix.platform;

import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;
import jakarta.transaction.Transactional;
import org.jboss.logging.Logger;
import sh.ravix.entity.AppSetting;
import sh.ravix.entity.Event;

/**
 * Wires Postfix to send all outbound mail through an external SMTP relay
 * (SendGrid / Mailgun / Resend / Amazon SES / any host:port + creds). This is
 * the standard workaround when the hosting provider blocks outbound port 25.
 *
 * On apply we write SASL credentials to /etc/postfix/sasl_passwd, postmap it,
 * and set the relayhost / smtp_sasl_* options on main.cf via postconf, then
 * reload Postfix.
 */
@ApplicationScoped
public class RelayService {

    private static final Logger LOG = Logger.getLogger(RelayService.class);

    @Inject
    PlatformService platform;

    public record Config(String host, int port, String user, boolean hasPassword) {}

    /** Current relay config (with the password masked). */
    public Config current() {
        String host = read("relay_host");
        String port = read("relay_port");
        String user = read("relay_user");
        String pass = read("relay_password");
        return new Config(host, parsePort(port), user, pass != null && !pass.isEmpty());
    }

    /** Save the config and (if on Linux) apply it to Postfix immediately. */
    @Transactional
    public Config saveAndApply(String host, int port, String user, String password) {
        write("relay_host", host == null ? "" : host.trim());
        write("relay_port", String.valueOf(port <= 0 ? 587 : port));
        write("relay_user", user == null ? "" : user.trim());
        // Empty password means "keep the existing one" — UI sends "" when untouched.
        if (password != null && !password.isEmpty()) {
            write("relay_password", password);
        }
        if (platform.isLinux()) {
            applyToPostfix();
        }
        Event.persist(sh.ravix.rest.DomainResource.event("system", "info",
                host == null || host.isBlank()
                    ? "Outbound SMTP relay cleared"
                    : "Outbound SMTP relay set to " + host + ":" + port));
        return current();
    }

    /** Remove the relay (Postfix sends directly again). */
    @Transactional
    public void clear() {
        AppSetting.delete("key in ?1", java.util.List.of(
                "relay_host", "relay_port", "relay_user", "relay_password"));
        if (platform.isLinux()) {
            // Disable relayhost; leave the SASL file in place but unreferenced.
            platform.exec(10, "postconf", "-e", "relayhost=");
            platform.exec(10, "postconf", "-e", "smtp_sasl_auth_enable=no");
            platform.exec(10, "postfix", "reload");
        }
        Event.persist(sh.ravix.rest.DomainResource.event("system", "info",
                "Outbound SMTP relay disabled"));
    }

    // --- Apply to Postfix --------------------------------------------------

    private void applyToPostfix() {
        Config c = current();
        String pass = read("relay_password");
        if (c.host() == null || c.host().isBlank() || pass == null || pass.isEmpty()) {
            LOG.warn("Relay config incomplete — not applied");
            return;
        }
        String relayLine = "[" + c.host() + "]:" + c.port();
        String passwdContent = relayLine + " " + (c.user() == null ? "" : c.user()) + ":" + pass + "\n";

        // /etc/postfix/sasl_passwd (chmod 600, then postmap)
        platform.writeFile("/etc/postfix/sasl_passwd", passwdContent);
        platform.exec(5, "chmod", "600", "/etc/postfix/sasl_passwd");
        platform.exec(10, "postmap", "/etc/postfix/sasl_passwd");

        // main.cf via postconf -e (idempotent)
        platform.exec(10, "postconf", "-e", "relayhost=" + relayLine);
        platform.exec(10, "postconf", "-e", "smtp_sasl_auth_enable=yes");
        platform.exec(10, "postconf", "-e",
                "smtp_sasl_password_maps=hash:/etc/postfix/sasl_passwd");
        platform.exec(10, "postconf", "-e", "smtp_sasl_security_options=noanonymous");
        platform.exec(10, "postconf", "-e", "smtp_tls_security_level=encrypt");
        platform.exec(10, "postconf", "-e",
                "smtp_tls_CAfile=/etc/ssl/certs/ca-certificates.crt");

        platform.exec(10, "postfix", "reload");
    }

    /** Send a real test message through the configured relay. */
    public boolean sendTest(String to, String fromOverride) {
        if (!platform.isLinux() || to == null || to.isBlank()) return false;
        String from = fromOverride != null && !fromOverride.isBlank()
                ? fromOverride : "postmaster@" + platform.hostname();
        String body = "Subject: Ravix relay test\r\n"
                + "From: " + from + "\r\n"
                + "To: " + to + "\r\n"
                + "MIME-Version: 1.0\r\n"
                + "Content-Type: text/plain; charset=UTF-8\r\n"
                + "\r\n"
                + "This is a test message sent from Ravix through the configured SMTP relay.\r\n";
        // -f sets the envelope sender so the relay doesn't reject "root@<host>".
        return platform.runWithStdin(20, body, "sendmail", "-t", "-oi", "-f", from);
    }

    // --- helpers -----------------------------------------------------------

    private String read(String k) {
        AppSetting s = AppSetting.findById(k);
        return s == null ? null : s.value;
    }

    private void write(String k, String v) {
        AppSetting s = AppSetting.findById(k);
        if (s == null) {
            s = new AppSetting();
            s.key = k;
        }
        s.value = v;
        s.persist();
    }

    private int parsePort(String s) {
        try { return s == null || s.isBlank() ? 587 : Integer.parseInt(s.trim()); }
        catch (NumberFormatException e) { return 587; }
    }
}
