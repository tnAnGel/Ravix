package sh.ravix.auth;

import sh.ravix.entity.AdminUser;

/**
 * Canonical team roles (Phase C — Team RBAC).
 *
 * <ul>
 *   <li>{@code owner}  — full control, including managing other team members.</li>
 *   <li>{@code admin}  — full control of the mail platform, but cannot manage
 *                        the team (add/remove/role-change other admins).</li>
 *   <li>{@code viewer} — read-only; may only change their own password / 2FA.</li>
 * </ul>
 *
 * Enforcement lives in {@link AuthFilter}. This class only normalises legacy /
 * free-text values into the canonical set so the rest of the code can compare
 * with {@code ==}/equals safely.
 */
public final class Roles {

    public static final String OWNER = "owner";
    public static final String ADMIN = "admin";
    public static final String VIEWER = "viewer";

    private Roles() {}

    /** Normalise any input (legacy "Owner"/"Administrator", null, mixed case)
     *  to one of {@link #OWNER}/{@link #ADMIN}/{@link #VIEWER}. Unknown → admin. */
    public static String normalize(String raw) {
        if (raw == null) return ADMIN;
        String r = raw.trim().toLowerCase();
        return switch (r) {
            case "owner" -> OWNER;
            case "viewer", "read-only", "readonly", "read" -> VIEWER;
            case "admin", "administrator" -> ADMIN;
            default -> ADMIN;
        };
    }

    public static String roleOf(AdminUser u) {
        return u == null ? VIEWER : normalize(u.role);
    }

    public static boolean isOwner(AdminUser u) {
        return OWNER.equals(roleOf(u));
    }

    /** Owner or admin — i.e. allowed to mutate platform resources. */
    public static boolean canWrite(AdminUser u) {
        String r = roleOf(u);
        return OWNER.equals(r) || ADMIN.equals(r);
    }
}
