package sh.ravix.platform;

import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;
import jakarta.mail.Message;
import jakarta.mail.Session;
import jakarta.mail.Transport;
import jakarta.mail.internet.InternetAddress;
import jakarta.mail.internet.MimeBodyPart;
import jakarta.mail.internet.MimeMessage;
import jakarta.mail.internet.MimeMultipart;
import java.io.ByteArrayOutputStream;
import java.util.List;
import java.util.Properties;
import org.jboss.logging.Logger;

/**
 * Builds outgoing mail (HTML + plain alternative + attachments) as a proper
 * MIME message and submits it through the local Postfix on 127.0.0.1:25, so it
 * passes the smtpd milter chain (OpenDKIM signs it). Also serialises messages
 * to bytes for storing drafts / Sent copies in the Maildir.
 */
@ApplicationScoped
public class MailComposer {

    private static final Logger LOG = Logger.getLogger(MailComposer.class);

    @Inject PlatformService platform;

    public record Attachment(String filename, String contentType, byte[] data) {}

    public record Draft(
            String fromAddr, String fromName,
            String to, String cc, String bcc,
            String subject, String html, String text,
            String inReplyTo, List<String> references,
            List<Attachment> attachments) {}

    private Session session(String heloName) {
        Properties p = new Properties();
        p.put("mail.smtp.host", "127.0.0.1");
        p.put("mail.smtp.port", "25");
        p.put("mail.smtp.connectiontimeout", "10000");
        p.put("mail.smtp.timeout", "20000");
        p.put("mail.mime.allowutf8", "true");
        // EHLO/HELO name jakarta.mail uses when handing the message to the local
        // MTA — match the sender's domain instead of the OS hostname so the
        // internal Received header reads "from <domain>" too.
        if (heloName != null && !heloName.isBlank()) p.put("mail.smtp.localhost", heloName);
        return Session.getInstance(p);
    }

    /** Build the MIME message (no send) — used for drafts and serialisation. */
    public MimeMessage build(Draft d) throws Exception {
        // Message-ID domain must match the From address, NOT the OS hostname.
        // jakarta.mail's default updateMessageID() (run by saveChanges /
        // Transport.send) uses the local hostname (e.g. msk-1-vm-qwt1), which
        // hurts deliverability — receivers flag the Message-ID/From mismatch.
        final String fromDomain = (d.fromAddr() != null && d.fromAddr().contains("@"))
                ? d.fromAddr().substring(d.fromAddr().indexOf('@') + 1) : "localhost";
        MimeMessage msg = new MimeMessage(session(fromDomain)) {
            @Override
            protected void updateMessageID() throws jakarta.mail.MessagingException {
                setHeader("Message-ID", "<" + java.util.UUID.randomUUID() + "@" + fromDomain + ">");
            }
        };
        msg.setFrom(d.fromName() != null && !d.fromName().isBlank()
                ? new InternetAddress(d.fromAddr(), d.fromName(), "UTF-8")
                : new InternetAddress(d.fromAddr()));
        if (notBlank(d.to()))  msg.setRecipients(Message.RecipientType.TO,  InternetAddress.parse(d.to()));
        if (notBlank(d.cc()))  msg.setRecipients(Message.RecipientType.CC,  InternetAddress.parse(d.cc()));
        if (notBlank(d.bcc())) msg.setRecipients(Message.RecipientType.BCC, InternetAddress.parse(d.bcc()));
        msg.setSubject(d.subject() == null ? "" : d.subject(), "UTF-8");
        msg.setSentDate(new java.util.Date());
        msg.setHeader("X-Mailer", "Ravix");
        if (notBlank(d.inReplyTo())) msg.setHeader("In-Reply-To", d.inReplyTo());
        if (d.references() != null && !d.references().isEmpty()) {
            msg.setHeader("References", String.join(" ", d.references()));
        }

        String html = d.html();
        String text = d.text() != null ? d.text()
                : (html != null ? htmlToText(html) : "");

        // body part: multipart/alternative (text + html) when html present.
        MimeBodyPart bodyPart = new MimeBodyPart();
        if (html != null && !html.isBlank()) {
            MimeMultipart alt = new MimeMultipart("alternative");
            MimeBodyPart tp = new MimeBodyPart();
            tp.setText(text, "UTF-8");
            MimeBodyPart hp = new MimeBodyPart();
            hp.setContent(html, "text/html; charset=UTF-8");
            alt.addBodyPart(tp);
            alt.addBodyPart(hp);
            bodyPart.setContent(alt);
        } else {
            bodyPart.setText(text, "UTF-8");
        }

        if (d.attachments() == null || d.attachments().isEmpty()) {
            if (bodyPart.getContent() instanceof MimeMultipart mm) {
                msg.setContent(mm);
            } else {
                msg.setText(text, "UTF-8");
            }
        } else {
            MimeMultipart mixed = new MimeMultipart("mixed");
            mixed.addBodyPart(bodyPart);
            for (Attachment a : d.attachments()) {
                MimeBodyPart att = new MimeBodyPart();
                String fname = a.filename() == null ? "attachment" : a.filename();
                String type = a.contentType() == null ? "application/octet-stream" : a.contentType();
                // Hand the bytes off as octet-stream (the mail impl always has a
                // content handler for that), then declare the real media type +
                // filename via headers — avoids a hard jakarta.activation
                // DataHandler dependency.
                att.setContent(a.data(), "application/octet-stream");
                att.setHeader("Content-Type", type + "; name=\"" + fname.replace("\"", "") + "\"");
                att.setHeader("Content-Transfer-Encoding", "base64");
                att.setFileName(fname);
                att.setDisposition(jakarta.mail.Part.ATTACHMENT);
                mixed.addBodyPart(att);
            }
            msg.setContent(mixed);
        }
        msg.saveChanges();
        return msg;
    }

    /** Build + send. Returns true on acceptance by the local MTA. */
    public boolean send(Draft d) {
        if (!platform.isLinux()) {
            LOG.info("send skipped — not on Linux (no local MTA)");
            return false;
        }
        try {
            MimeMessage msg = build(d);
            Transport.send(msg);
            return true;
        } catch (Exception e) {
            LOG.warnf("send failed: %s", e.getMessage());
            return false;
        }
    }

    public byte[] toBytes(MimeMessage msg) {
        try {
            ByteArrayOutputStream bos = new ByteArrayOutputStream();
            msg.writeTo(bos);
            return bos.toByteArray();
        } catch (Exception e) {
            LOG.warnf("serialise failed: %s", e.getMessage());
            return new byte[0];
        }
    }

    private static boolean notBlank(String s) {
        return s != null && !s.isBlank();
    }

    /** Very small HTML→text fallback for the plain alternative. */
    static String htmlToText(String html) {
        return html.replaceAll("(?s)<style.*?</style>", "")
                   .replaceAll("(?s)<script.*?</script>", "")
                   .replaceAll("(?i)<br\\s*/?>", "\n")
                   .replaceAll("(?i)</p>", "\n\n")
                   .replaceAll("<[^>]+>", "")
                   .replaceAll("&nbsp;", " ")
                   .replaceAll("&amp;", "&")
                   .replaceAll("&lt;", "<")
                   .replaceAll("&gt;", ">")
                   .replaceAll("&quot;", "\"")
                   .trim();
    }
}
