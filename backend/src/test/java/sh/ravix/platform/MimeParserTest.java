package sh.ravix.platform;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.nio.file.Files;
import java.nio.file.Path;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

/** Pure unit tests for {@link MimeParser} against real RFC822 bytes on disk. */
class MimeParserTest {

    private final MimeParser parser = new MimeParser();

    @Test
    void parsesHeadersAndPlainBody(@TempDir Path dir) throws Exception {
        String raw = """
                From: Alice <alice@example.com>
                To: bob@dest.com
                Subject: Test subject
                Message-ID: <abc123@example.com>
                Date: Mon, 2 Jun 2025 11:46:00 +0000
                Content-Type: text/plain; charset=UTF-8

                Hello body text
                """;
        Path eml = dir.resolve("m.eml");
        Files.writeString(eml, raw);

        MimeParser.Parsed p = parser.parse(eml);
        assertNotNull(p);
        assertEquals("Test subject", p.headers().subject());
        assertEquals("alice@example.com", p.headers().fromAddr());
        assertEquals("Alice", p.headers().fromName());
        assertTrue(p.text() != null && p.text().contains("Hello body text"),
                "plain body should be captured, was: " + p.text());
    }

    @Test
    void parsesMultipartAlternativeHtml(@TempDir Path dir) throws Exception {
        String raw = """
                From: c@x.io
                To: d@y.io
                Subject: HTML mail
                MIME-Version: 1.0
                Content-Type: multipart/alternative; boundary="BOUND"

                --BOUND
                Content-Type: text/plain; charset=UTF-8

                plain part
                --BOUND
                Content-Type: text/html; charset=UTF-8

                <p>html part</p>
                --BOUND--
                """;
        Path eml = dir.resolve("h.eml");
        Files.writeString(eml, raw);

        MimeParser.Parsed p = parser.parse(eml);
        assertTrue(p.html() != null && p.html().contains("html part"),
                "html alternative should be captured, was: " + p.html());
    }

    @Test
    void headerOnlyParseIsCheapAndCorrect(@TempDir Path dir) throws Exception {
        String raw = "From: \"Z\" <z@z.io>\nTo: a@a.io\nSubject: Hi\n\nbody\n";
        Path eml = dir.resolve("ho.eml");
        Files.writeString(eml, raw);

        MimeParser.Headers h = parser.headers(eml);
        assertEquals("Hi", h.subject());
        assertEquals("z@z.io", h.fromAddr());
    }
}
