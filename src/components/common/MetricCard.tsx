import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { ArrowDownRight, ArrowUpRight } from "lucide-react";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

interface MetricCardProps {
  label: string;
  value: ReactNode;
  icon?: LucideIcon;
  hint?: string;
  tone?: "default" | "success" | "warning" | "critical" | "info";
  trend?: { direction: "up" | "down"; value: string; positive?: boolean };
  footer?: ReactNode;
  className?: string;
}

const toneIconClass: Record<string, string> = {
  default: "text-primary bg-primary/10",
  success: "text-success bg-success/10",
  warning: "text-warning bg-warning/10",
  critical: "text-destructive bg-destructive/10",
  info: "text-info bg-info/10",
};

export function MetricCard({
  label,
  value,
  icon: Icon,
  hint,
  tone = "default",
  trend,
  footer,
  className,
}: MetricCardProps) {
  return (
    <Card className={cn("p-5", className)}>
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-1.5">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {label}
          </p>
          <div className="text-2xl font-semibold tracking-tight text-foreground">
            {value}
          </div>
          {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
        </div>
        {Icon && (
          <div
            className={cn(
              "flex h-9 w-9 items-center justify-center rounded-lg",
              toneIconClass[tone]
            )}
          >
            <Icon className="h-4.5 w-4.5" />
          </div>
        )}
      </div>
      {(trend || footer) && (
        <div className="mt-3 flex items-center gap-2 text-xs">
          {trend && (
            <span
              className={cn(
                "inline-flex items-center gap-0.5 font-medium",
                trend.positive ? "text-success" : "text-muted-foreground"
              )}
            >
              {trend.direction === "up" ? (
                <ArrowUpRight className="h-3.5 w-3.5" />
              ) : (
                <ArrowDownRight className="h-3.5 w-3.5" />
              )}
              {trend.value}
            </span>
          )}
          {footer}
        </div>
      )}
    </Card>
  );
}
