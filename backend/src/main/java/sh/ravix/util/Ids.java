package sh.ravix.util;

import java.util.UUID;

/** Generates short, prefixed identifiers (e.g. "dom_a1b2c3d4"). */
public final class Ids {

    private Ids() {}

    public static String generate(String prefix) {
        return prefix + "_" + UUID.randomUUID().toString().replace("-", "").substring(0, 10);
    }

    /** A Maildir-style unique name: {@code <epoch>.M<ms>R<rand>.<host>}.
     *  Used when Ravix writes a message into a Maildir (drafts, Sent, moves).
     *  The leading epoch seconds keep newest-first sorting cheap. */
    public static String timeUid() {
        long now = System.currentTimeMillis();
        String rand = UUID.randomUUID().toString().replace("-", "").substring(0, 10);
        return (now / 1000) + ".M" + (now % 1000) + "R" + rand + ".ravix";
    }
}
