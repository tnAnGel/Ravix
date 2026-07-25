import { useEffect, useState } from "react";
import { Navigate, Outlet } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Eye, Lock } from "lucide-react";
import { TooltipProvider } from "@/components/ui/tooltip";
import { auth } from "@/lib/api";
import { usePermissions } from "@/lib/usePermissions";
import { Sidebar } from "./Sidebar";
import { Topbar } from "./Topbar";
import { CommandPalette } from "./CommandPalette";

export function AppLayout() {
  const [commandOpen, setCommandOpen] = useState(false);

  // Route guard: unauthenticated users are sent to the login screen.
  if (!auth.isAuthenticated()) {
    return <Navigate to="/login" replace />;
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setCommandOpen((v) => !v);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <TooltipProvider delayDuration={200}>
      <div className="flex h-screen overflow-hidden">
        <Sidebar className="hidden lg:flex" />
        <div className="flex min-w-0 flex-1 flex-col">
          <Topbar onOpenCommand={() => setCommandOpen(true)} />
          <ReadOnlyBanner />
          <main className="scrollbar-thin flex-1 overflow-y-auto">
            <div className="mx-auto w-full max-w-[1400px] animate-fade-in px-5 py-6 lg:px-8">
              <Outlet />
            </div>
          </main>
        </div>
      </div>
      <CommandPalette open={commandOpen} onOpenChange={setCommandOpen} />
      <ForbiddenToast />
    </TooltipProvider>
  );
}

/** Persistent slim banner shown to viewers so the read-only state is obvious. */
function ReadOnlyBanner() {
  const { isViewer } = usePermissions();
  const { t } = useTranslation();
  if (!isViewer) return null;
  return (
    <div className="flex items-center justify-center gap-2 border-b border-warning/30 bg-warning/10 px-4 py-1.5 text-2xs font-medium text-warning">
      <Eye className="h-3.5 w-3.5" /> {t("rbac.readOnlyBanner")}
    </div>
  );
}

/** Transient toast when a mutating call is rejected by role/tenant rules. */
function ForbiddenToast() {
  const { t } = useTranslation();
  const [reason, setReason] = useState<string | null>(null);
  useEffect(() => {
    let timer: number | undefined;
    const onForbidden = (e: Event) => {
      setReason((e as CustomEvent).detail || "forbidden");
      window.clearTimeout(timer);
      timer = window.setTimeout(() => setReason(null), 4000);
    };
    window.addEventListener("ravix:forbidden", onForbidden);
    return () => {
      window.removeEventListener("ravix:forbidden", onForbidden);
      window.clearTimeout(timer);
    };
  }, []);
  if (!reason) return null;
  const key =
    reason === "read_only_role"
      ? "rbac.forbiddenReadOnly"
      : reason === "owner_only"
        ? "rbac.forbiddenOwnerOnly"
        : reason === "superadmin_only"
          ? "rbac.forbiddenSuperadmin"
          : "rbac.forbidden";
  return (
    <div className="animate-fade-in fixed bottom-5 right-5 z-50 flex max-w-sm items-start gap-2 rounded-md border border-destructive/40 bg-card px-4 py-3 text-sm shadow-lg">
      <Lock className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
      <p className="text-foreground">{t(key)}</p>
    </div>
  );
}
