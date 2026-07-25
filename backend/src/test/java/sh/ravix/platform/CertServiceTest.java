package sh.ravix.platform;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertSame;

import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import org.junit.jupiter.api.Test;

/** Pure unit test for openssl date parsing used to read cert validity. */
class CertServiceTest {

    private static final OffsetDateTime FALLBACK =
            OffsetDateTime.of(2000, 1, 1, 0, 0, 0, 0, ZoneOffset.UTC);

    @Test
    void parsesStandardOpensslDate() {
        OffsetDateTime d = CertService.parseDate("Aug 12 00:00:00 2026 GMT", FALLBACK);
        assertEquals(2026, d.getYear());
        assertEquals(8, d.getMonthValue());
        assertEquals(12, d.getDayOfMonth());
    }

    @Test
    void parsesDoubleSpacedSingleDigitDay() {
        // openssl pads single-digit days with an extra space: "Jun  2".
        OffsetDateTime d = CertService.parseDate("Jun  2 11:46:00 2025 GMT", FALLBACK);
        assertEquals(2025, d.getYear());
        assertEquals(6, d.getMonthValue());
        assertEquals(2, d.getDayOfMonth());
        assertEquals(11, d.getHour());
    }

    @Test
    void returnsFallbackOnGarbage() {
        assertSame(FALLBACK, CertService.parseDate("not a date", FALLBACK));
        assertSame(FALLBACK, CertService.parseDate("", FALLBACK));
    }
}
