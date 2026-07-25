package sh.ravix.platform;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import jakarta.mail.internet.MimeMessage;
import jakarta.mail.internet.MimeMultipart;
import java.util.List;
import org.junit.jupiter.api.Test;

/**
 * Pure unit tests for {@link MailComposer} — no Quarkus, no MTA. {@code build()}
 * only touches jakarta.mail, so a bare {@code new MailComposer()} is enough.
 */
class MailComposerTest {

    private final MailComposer composer = new MailComposer();

    private static MailComposer.Draft draft(String from, String html, String text,
                                            List<MailComposer.Attachment> atts) {
        return new MailComposer.Draft(
                from, "Sender Name", "to@dest.com", null, null,
                "Hello", html, text, null, List.of(), atts);
    }

    @Test
    void messageIdUsesFromDomainNotOsHostname() throws Exception {
        MimeMessage msg = composer.build(draft("alice@example.com", "<p>hi</p>", null, null));
        String id = msg.getMessageID();
        assertTrue(id.endsWith("@example.com>"),
                "Message-ID domain must match the From domain, was: " + id);
    }

    @Test
    void htmlBodyProducesMultipartAlternative() throws Exception {
        MimeMessage msg = composer.build(draft("a@x.io", "<p>rich</p>", null, null));
        assertTrue(msg.getContent() instanceof MimeMultipart);
        MimeMultipart mp = (MimeMultipart) msg.getContent();
        assertTrue(mp.getContentType().contains("alternative"),
                "html + auto text should be multipart/alternative, was: " + mp.getContentType());
        assertEquals(2, mp.getCount(), "text + html parts");
    }

    @Test
    void attachmentsProduceMultipartMixed() throws Exception {
        var att = new MailComposer.Attachment("file.txt", "text/plain", "data".getBytes());
        MimeMessage msg = composer.build(draft("a@x.io", "<p>body</p>", null, List.of(att)));
        MimeMultipart mp = (MimeMultipart) msg.getContent();
        assertTrue(mp.getContentType().contains("mixed"),
                "attachments should yield multipart/mixed, was: " + mp.getContentType());
    }

    @Test
    void subjectAndFromAreSet() throws Exception {
        MimeMessage msg = composer.build(draft("alice@example.com", null, "plain", null));
        assertEquals("Hello", msg.getSubject());
        assertTrue(msg.getFrom()[0].toString().contains("alice@example.com"));
    }

    @Test
    void htmlToTextStripsMarkupAndDecodesEntities() {
        String out = MailComposer.htmlToText("<p>Hello &amp; welcome</p><br>line two");
        assertFalse(out.contains("<"), "no tags should survive: " + out);
        assertTrue(out.contains("Hello & welcome"), "entities decoded: " + out);
        assertTrue(out.contains("line two"));
    }

    @Test
    void htmlToTextDropsScriptAndStyle() {
        String out = MailComposer.htmlToText(
                "<style>.x{color:red}</style><script>alert(1)</script><p>safe</p>");
        assertFalse(out.contains("alert"), "script content removed: " + out);
        assertFalse(out.contains("color:red"), "style content removed: " + out);
        assertTrue(out.contains("safe"));
    }
}
