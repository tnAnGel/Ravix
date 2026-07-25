package sh.ravix.util;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.util.HashSet;
import java.util.Set;
import org.junit.jupiter.api.Test;

class IdsTest {

    @Test
    void generateHasPrefixAndIsReasonablyShaped() {
        String id = Ids.generate("dom");
        assertTrue(id.startsWith("dom_"), "should keep the prefix: " + id);
        assertEquals(14, id.length(), "prefix(3) + '_' + 10 hex chars");
        assertTrue(id.substring(4).matches("[0-9a-f]{10}"), "suffix is 10 hex chars: " + id);
    }

    @Test
    void generateIsUnique() {
        Set<String> seen = new HashSet<>();
        for (int i = 0; i < 10_000; i++) {
            assertTrue(seen.add(Ids.generate("x")), "collision should be vanishingly unlikely");
        }
    }

    @Test
    void timeUidIsMaildirShaped() {
        String uid = Ids.timeUid();
        // <epoch>.M<ms>R<rand>.ravix
        assertTrue(uid.matches("\\d+\\.M\\d+R[0-9a-f]{10}\\.ravix"), "unexpected shape: " + uid);
    }

    @Test
    void timeUidsDiffer() {
        assertNotEquals(Ids.timeUid(), Ids.timeUid());
    }
}
