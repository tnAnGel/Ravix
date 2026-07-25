import type { ReactNode } from "react";
import { usePermissions } from "@/lib/usePermissions";

/**
 * Renders its children only for users who may make changes (Phase C RBAC).
 * Viewers see nothing — used to hide create/edit/delete controls. The backend
 * is still the real enforcement boundary; this just declutters the UI.
 */
export function WriteOnly({ children }: { children: ReactNode }) {
  const { canWrite } = usePermissions();
  return canWrite ? <>{children}</> : null;
}
