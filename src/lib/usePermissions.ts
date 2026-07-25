import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import type { AuthUser } from "@/lib/api";

/**
 * Lightweight permissions hook (Phase C RBAC). Reads the signed-in user once
 * and exposes role helpers so pages can hide mutating actions for viewers.
 * The backend is the real enforcement boundary; this is UX only.
 */
let cachedMe: AuthUser | null = null;

export function usePermissions() {
  const [me, setMe] = useState<AuthUser | null>(cachedMe);

  useEffect(() => {
    if (cachedMe) return;
    let alive = true;
    api
      .me()
      .then((u) => {
        cachedMe = u;
        if (alive) setMe(u);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  const role = (me?.role ?? "admin").toLowerCase();
  return {
    me,
    role,
    isViewer: role === "viewer",
    isOwner: role === "owner",
    superadmin: !!me?.superadmin,
    /** True when the user may perform mutating actions. */
    canWrite: role !== "viewer",
  };
}
