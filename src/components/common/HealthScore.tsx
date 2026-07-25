import { cn } from "@/lib/utils";
import type { HealthStatus } from "@/types";

interface HealthScoreProps {
  score: number; // 0-100
  status: HealthStatus;
  label?: string;
  size?: number;
  className?: string;
}

const statusColor: Record<HealthStatus, string> = {
  healthy: "hsl(var(--success))",
  warning: "hsl(var(--warning))",
  critical: "hsl(var(--destructive))",
};

/** Radial gauge summarizing overall server health. */
export function HealthScore({
  score,
  status,
  label,
  size = 132,
  className,
}: HealthScoreProps) {
  const stroke = 10;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (score / 100) * circumference;
  const color = statusColor[status];

  return (
    <div
      className={cn("relative inline-flex items-center justify-center", className)}
      style={{ width: size, height: size }}
    >
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          strokeWidth={stroke}
          className="stroke-secondary"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          strokeWidth={stroke}
          strokeLinecap="round"
          stroke={color}
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          style={{ transition: "stroke-dashoffset 0.6s ease" }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-3xl font-semibold tracking-tight text-foreground">
          {score}
        </span>
        <span className="text-2xs font-medium uppercase tracking-wide text-muted-foreground">
          {label ?? "Health"}
        </span>
      </div>
    </div>
  );
}
