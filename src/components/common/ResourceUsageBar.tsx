import { cn } from "@/lib/utils";

interface ResourceUsageBarProps {
  value: number; // 0-100
  className?: string;
  /** Override automatic threshold coloring. */
  tone?: "success" | "warning" | "critical" | "primary";
  size?: "sm" | "md";
}

function toneForValue(value: number) {
  if (value >= 90) return "critical";
  if (value >= 75) return "warning";
  return "success";
}

const toneClass: Record<string, string> = {
  success: "bg-success",
  warning: "bg-warning",
  critical: "bg-destructive",
  primary: "bg-primary",
};

/** A compact usage bar with threshold-aware coloring. */
export function ResourceUsageBar({
  value,
  className,
  tone,
  size = "md",
}: ResourceUsageBarProps) {
  const resolved = tone ?? toneForValue(value);
  return (
    <div
      className={cn(
        "w-full overflow-hidden rounded-full bg-secondary",
        size === "sm" ? "h-1.5" : "h-2",
        className
      )}
    >
      <div
        className={cn("h-full rounded-full transition-all", toneClass[resolved])}
        style={{ width: `${Math.min(100, Math.max(0, value))}%` }}
      />
    </div>
  );
}
