package sh.ravix.platform;

import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;
import java.time.OffsetDateTime;
import java.time.format.DateTimeFormatter;
import java.util.Locale;
import java.util.UUID;

/**
 * Injects outgoing mail into the host MTA via {@code sendmail}. Builds a
 * minimal but valid RFC 5322 message. Returns false off-Linux (no MTA), so
 * callers keep their in-panel behaviour on a dev machine.
 */
@ApplicationScoped
public class MailSender {

    @Inject
    PlatformService platform;

    public boolean isAvailable() {
        return platform.isLinux();
    }

    /** Build and submit a message; returns true if the MTA accepted it. */
    public boolean send(String from, String to, String subject, String body) {
        if (!platform.isLinux() || to == null || to.isBlank()) {
            return false;
        }
        String message = build(from, to, subject, body);
        // sendmail -t reads recipients from the headers.
        // -f <from> sets the envelope sender so it matches the From: header,
        //   instead of defaulting to the Unix user running Ravix (root@hostname),
        //   which would otherwise trip SPF/DMARC alignment.
        String envelopeFrom = (from != null && from.contains("@")) ? from : "postmaster@" + platform.hostname();
        return platform.runWithStdin(20, message, "sendmail", "-t", "-oi", "-f", envelopeFrom);
    }

    /** Construct the RFC 5322 message (public for testing/inspection). */
    public String build(String from, String to, String subject, String body) {
        String date = OffsetDateTime.now()
                .format(DateTimeFormatter.ofPattern(
                        "EEE, dd MMM yyyy HH:mm:ss Z", Locale.ENGLISH));
        String domain = from != null && from.contains("@")
                ? from.substring(from.indexOf('@') + 1) : "localhost";
        String messageId = "<" + UUID.randomUUID() + "@" + domain + ">";

        StringBuilder sb = new StringBuilder();
        sb.append("From: ").append(from).append("\r\n");
        sb.append("To: ").append(to).append("\r\n");
        sb.append("Subject: ").append(subject == null ? "" : subject).append("\r\n");
        sb.append("Date: ").append(date).append("\r\n");
        sb.append("Message-ID: ").append(messageId).append("\r\n");
        sb.append("MIME-Version: 1.0\r\n");
        sb.append("Content-Type: text/plain; charset=UTF-8\r\n");
        sb.append("Content-Transfer-Encoding: 8bit\r\n");
        sb.append("X-Mailer: Ravix\r\n");
        sb.append("\r\n");
        sb.append(body == null ? "" : body.replace("\n", "\r\n"));
        sb.append("\r\n");
        return sb.toString();
    }
}
