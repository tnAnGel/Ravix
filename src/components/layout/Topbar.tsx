import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  Bell,
  Building2,
  Check,
  ChevronDown,
  Globe,
  LogOut,
  Search,
  Settings,
  ShieldCheck,
  User,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { timeAgo } from "@/lib/utils";
import { healthMeta } from "@/components/common/status";
import { LanguageSwitcher } from "./LanguageSwitcher";
import { api, auth } from "@/lib/api";
import { useApi } from "@/lib/useApi";
import type { HealthStatus } from "@/types";

interface TopbarProps {
  onOpenCommand: () => void;
}

export function Topbar({ onOpenCommand }: TopbarProps) {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { data: dashboard } = useApi(() => api.dashboard());
  const { data: events } = useApi(() => api.events(6), []);
  const { data: me } = useApi(() => api.me(), []);

  const email = me?.email ?? "—";
  const initials = email.replace(/@.*/, "").slice(0, 2).toUpperCase();
  const signOut = () => api.logout().finally(() => navigate("/login"));

  const healthScore = dashboard?.health ?? {
    score: 0,
    status: "warning" as HealthStatus,
  };
  const health = healthMeta[healthScore.status];
  const notifications = (events ?? [])
    .filter((e) => e.severity === "critical" || e.severity === "warning")
    .map((e) => ({
      id: e.id,
      severity: e.severity as "critical" | "warning" | "info",
      title: e.category,
      body: e.message,
      at: e.at,
    }));

  // Track which notifications the user has already seen (persisted locally).
  const SEEN_KEY = "ravix.notifications.seenAt";
  const [seenAt, setSeenAt] = useState<number>(() =>
    Number(localStorage.getItem(SEEN_KEY) || 0)
  );
  const unread = notifications.filter(
    (n) => new Date(n.at).getTime() > seenAt
  ).length;
  const markAllSeen = () => {
    const latest = notifications.reduce(
      (max, n) => Math.max(max, new Date(n.at).getTime()),
      seenAt
    );
    localStorage.setItem(SEEN_KEY, String(latest));
    setSeenAt(latest);
  };

  return (
    <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-border bg-background/80 px-5 backdrop-blur">
      {/* Command palette trigger */}
      <button
        type="button"
        onClick={onOpenCommand}
        className="group flex h-9 w-full max-w-sm items-center gap-2 rounded-md border border-border bg-card/60 px-3 text-sm text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground"
      >
        <Search className="h-4 w-4" />
        <span className="flex-1 text-left">{t("topbar.searchPlaceholder")}</span>
        <kbd className="hidden items-center gap-0.5 rounded border border-border bg-secondary px-1.5 py-0.5 font-mono text-2xs text-muted-foreground sm:inline-flex">
          ⌘K
        </kbd>
      </button>

      <div className="ml-auto flex items-center gap-2">
        {/* Server health badge */}
        <div className="hidden items-center gap-2 rounded-md border border-border bg-card/60 px-3 py-1.5 md:flex">
          <span
            className={cn("h-2 w-2 rounded-full", health.dot, "animate-pulse-soft")}
          />
          <span className="text-xs font-medium text-foreground">
            {t("topbar.serverHealth", { status: t(`status.${healthScore.status}`) })}
          </span>
          <span className="text-2xs text-muted-foreground">
            · {healthScore.score}/100
          </span>
        </div>

        {/* Organization switcher (multi-tenant) */}
        {((me?.orgs?.length ?? 0) > 1 || me?.superadmin) && (
          <OrgSwitcher
            orgs={me?.orgs ?? []}
            superadmin={!!me?.superadmin}
            active={auth.getOrg()}
          />
        )}

        {/* Language switcher */}
        <LanguageSwitcher />

        {/* Notifications */}
        <DropdownMenu onOpenChange={(open) => open && unread > 0 && markAllSeen()}>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="relative">
              <Bell className="h-4.5 w-4.5" style={{ width: 18, height: 18 }} />
              {unread > 0 && (
                <span className="absolute right-1.5 top-1.5 flex h-2 w-2">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-destructive opacity-75" />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-destructive" />
                </span>
              )}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-80">
            <DropdownMenuLabel className="flex items-center justify-between">
              <span>{t("topbar.notifications")}</span>
              <Badge variant="muted">{t("topbar.newCount", { count: unread })}</Badge>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            {notifications.length === 0 ? (
              <p className="px-2 py-6 text-center text-sm text-muted-foreground">
                {t("topbar.noNotifications")}
              </p>
            ) : (
              notifications.map((n) => (
                <button
                  type="button"
                  key={n.id}
                  onClick={() => navigate("/logs")}
                  className="flex w-full gap-2.5 rounded-sm px-2 py-2 text-left hover:bg-secondary/60"
                >
                  <span
                    className={cn(
                      "mt-1 h-2 w-2 shrink-0 rounded-full",
                      n.severity === "critical" && "bg-destructive",
                      n.severity === "warning" && "bg-warning",
                      n.severity === "info" && "bg-info"
                    )}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium leading-tight text-foreground">
                      {t(`status.${n.severity}`)}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">
                      {n.body}
                    </p>
                    <p className="mt-0.5 text-2xs text-muted-foreground/70">
                      {timeAgo(n.at)}
                    </p>
                  </div>
                </button>
              ))
            )}
            <DropdownMenuSeparator />
            <DropdownMenuItem
              className="justify-center text-sm text-muted-foreground"
              onClick={() => navigate("/logs")}
            >
              {t("topbar.viewAllActivity")}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        <Separator orientation="vertical" className="h-6" />

        {/* User menu */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="flex items-center gap-2 rounded-md px-1.5 py-1 transition-colors hover:bg-secondary/60">
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-primary/80 to-primary text-xs font-semibold text-primary-foreground">
                {initials}
              </span>
              <div className="hidden text-left lg:block">
                <p className="text-xs font-medium leading-tight text-foreground">
                  {email}
                </p>
                <p className="text-2xs text-muted-foreground">
                  {me?.role ?? t("topbar.administrator")}
                </p>
              </div>
              <ChevronDown className="h-4 w-4 text-muted-foreground" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel>
              {t("topbar.signedInAs", { name: email })}
            </DropdownMenuLabel>
            {me?.superadmin && (
              <DropdownMenuItem onClick={() => navigate("/organizations")}>
                <Building2 /> {t("topbar.organizations")}
              </DropdownMenuItem>
            )}
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => navigate("/settings?tab=profile")}>
              <User /> {t("topbar.profile")}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => navigate("/settings?tab=general")}>
              <Settings /> {t("topbar.settings")}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => navigate("/settings?tab=security")}>
              <ShieldCheck /> {t("topbar.security")}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem variant="destructive" onClick={signOut}>
              <LogOut /> {t("topbar.signOut")}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}

function OrgSwitcher({
  orgs,
  superadmin,
  active,
}: {
  orgs: { id: string; name: string; role: string }[];
  superadmin: boolean;
  active: string | null;
}) {
  const { t } = useTranslation();
  const current = orgs.find((o) => o.id === active);
  const label = current ? current.name : superadmin ? t("topbar.allOrgs") : orgs[0]?.name ?? "—";
  const pick = (id: string | null) => {
    if (id) auth.setOrg(id);
    else auth.clearOrg();
    window.location.reload();
  };
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button className="hidden items-center gap-2 rounded-md border border-border bg-card/60 px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:border-primary/40 md:flex">
          <Building2 className="h-4 w-4 text-muted-foreground" />
          <span className="max-w-[12ch] truncate">{label}</span>
          <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel>{t("topbar.organization")}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {superadmin && (
          <DropdownMenuItem onClick={() => pick(null)}>
            <Globe /> {t("topbar.allOrgs")}
            {!active && <Check className="ml-auto h-4 w-4" />}
          </DropdownMenuItem>
        )}
        {orgs.map((o) => (
          <DropdownMenuItem key={o.id} onClick={() => pick(o.id)}>
            <Building2 /> <span className="truncate">{o.name}</span>
            {active === o.id && <Check className="ml-auto h-4 w-4" />}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
