import { NavLink } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { LogoWordmark } from "@/components/common/Logo";
import { cn } from "@/lib/utils";
import { navSections } from "./nav";
import { api } from "@/lib/api";
import { useApi } from "@/lib/useApi";

const badgeToneClass: Record<string, string> = {
  warning: "bg-warning/20 text-warning",
  critical: "bg-destructive/20 text-destructive",
  info: "bg-info/20 text-info",
};

export function Sidebar({ className }: { className?: string }) {
  const { t } = useTranslation();
  const { data: settings } = useApi(() => api.settings());
  const hostname = settings?.hostname ?? "mail.example.com";
  const version = settings?.version ?? "0.1.0";
  return (
    <aside
      className={cn(
        "flex h-full w-64 shrink-0 flex-col border-r border-border bg-card/60",
        className
      )}
    >
      <div className="flex h-16 items-center border-b border-border px-5">
        <LogoWordmark />
      </div>

      <nav className="scrollbar-thin flex-1 space-y-6 overflow-y-auto px-3 py-5">
        {navSections.map((section) => (
          <div key={section.labelKey}>
            <p className="px-3 pb-2 text-2xs font-semibold uppercase tracking-wider text-muted-foreground/70">
              {t(`nav.sections.${section.labelKey}`)}
            </p>
            <ul className="space-y-0.5">
              {section.items.map((item) => (
                <li key={item.to}>
                  <NavLink
                    to={item.to}
                    end={item.to === "/"}
                    className={({ isActive }) =>
                      cn(
                        "group flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                        isActive
                          ? "bg-secondary text-foreground"
                          : "text-muted-foreground hover:bg-secondary/50 hover:text-foreground"
                      )
                    }
                  >
                    {({ isActive }) => (
                      <>
                        <item.icon
                          className={cn(
                            "h-4.5 w-4.5 shrink-0 transition-colors",
                            isActive
                              ? "text-primary"
                              : "text-muted-foreground group-hover:text-foreground"
                          )}
                          style={{ width: 18, height: 18 }}
                        />
                        <span className="flex-1">{t(`nav.${item.labelKey}`)}</span>
                        {item.badge && (
                          <span
                            className={cn(
                              "flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-2xs font-semibold",
                              badgeToneClass[item.badgeTone ?? "info"]
                            )}
                          >
                            {item.badge}
                          </span>
                        )}
                      </>
                    )}
                  </NavLink>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </nav>

      <div className="border-t border-border px-5 py-3">
        <div className="flex items-center justify-between text-2xs text-muted-foreground">
          <span className="font-mono">{hostname}</span>
          <span className="rounded border border-border bg-secondary/50 px-1.5 py-0.5">
            v{version}
          </span>
        </div>
      </div>
    </aside>
  );
}
