import { Activity, AlertTriangle, CircleDashed, CircleSlash } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { ServiceState, ServiceStatus } from "@/types";

const stateMeta: Record<
  ServiceState,
  { dot: string; ring: string; text: string; Icon: typeof Activity }
> = {
  running: {
    dot: "bg-success",
    ring: "ring-success/30",
    text: "text-success",
    Icon: Activity,
  },
  degraded: {
    dot: "bg-warning",
    ring: "ring-warning/30",
    text: "text-warning",
    Icon: AlertTriangle,
  },
  stopped: {
    dot: "bg-destructive",
    ring: "ring-destructive/30",
    text: "text-destructive",
    Icon: CircleSlash,
  },
  unknown: {
    dot: "bg-muted-foreground",
    ring: "ring-muted-foreground/20",
    text: "text-muted-foreground",
    Icon: CircleDashed,
  },
};

export function ServiceStatusCard({ service }: { service: ServiceStatus }) {
  const { t } = useTranslation();
  const meta = stateMeta[service.state];
  return (
    <Card className="p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2.5">
          <span
            className={cn(
              "relative flex h-2.5 w-2.5 items-center justify-center rounded-full ring-4",
              meta.dot,
              meta.ring
            )}
          >
            {service.state === "running" && (
              <span
                className={cn(
                  "absolute inline-flex h-full w-full animate-pulse-soft rounded-full",
                  meta.dot
                )}
              />
            )}
          </span>
          <div>
            <p className="text-sm font-semibold leading-tight text-foreground">
              {service.name}
            </p>
            <p className="text-xs text-muted-foreground">
              {service.description}
            </p>
          </div>
        </div>
        <span className={cn("text-xs font-medium", meta.text)}>
          {t(`status.${service.state}`)}
        </span>
      </div>
      {(service.version || service.uptime || service.memoryMb > 0) && (
        <div className="mt-3 flex items-center justify-between border-t border-border/60 pt-2.5 text-2xs text-muted-foreground">
          <span>{service.version ? `v${service.version}` : "—"}</span>
          {service.uptime && <span>{t("service.up", { time: service.uptime })}</span>}
          {service.memoryMb > 0 && <span>{service.memoryMb} MB</span>}
        </div>
      )}
    </Card>
  );
}
