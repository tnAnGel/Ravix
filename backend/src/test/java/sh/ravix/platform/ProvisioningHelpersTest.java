package sh.ravix.platform;

import static org.junit.jupiter.api.Assertions.assertEquals;

import org.junit.jupiter.api.Test;

/** Pure unit test for the address-local-part helper used across rendering. */
class ProvisioningHelpersTest {

    @Test
    void extractsLocalPartBeforeAt() {
        assertEquals("test", ProvisioningService.localPart("test@example.com"));
        assertEquals("john.doe", ProvisioningService.localPart("john.doe@a.io"));
        assertEquals("user+tag", ProvisioningService.localPart("user+tag@x.io"));
    }

    @Test
    void returnsWholeStringWhenNoAt() {
        assertEquals("nodomain", ProvisioningService.localPart("nodomain"));
    }
}
