import {
  AlertTriangle,
  CheckCircle2,
  CircleDashed,
  HelpCircle,
  XCircle,
} from "lucide-react";
import type { CheckStatus, HealthStatus } from "@/types";
import type { BadgeProps } from "@/components/ui/badge";

type Tone = "success" | "warning" | "critical" | "info" | "muted";

export const toneToBadgeVariant: Record<Tone, BadgeProps["variant"]> = {
  success: "success",
  warning: "warning",
  critical: "critical",
  info: "info",
  muted: "muted",
};

export const healthMeta: Record<
  HealthStatus,
  { tone: Tone; label: string; dot: string }
> = {
  healthy: { tone: "success", label: "Healthy", dot: "bg-success" },
  warning: { tone: "warning", label: "Warning", dot: "bg-warning" },
  critical: { tone: "critical", label: "Critical", dot: "bg-destructive" },
};

export const checkMeta: Record<
  CheckStatus,
  { tone: Tone; label: string; Icon: typeof CheckCircle2 }
> = {
  pass: { tone: "success", label: "Pass", Icon: CheckCircle2 },
  warn: { tone: "warning", label: "Warning", Icon: AlertTriangle },
  fail: { tone: "critical", label: "Fail", Icon: XCircle },
  pending: { tone: "info", label: "Pending", Icon: CircleDashed },
  unknown: { tone: "muted", label: "Unknown", Icon: HelpCircle },
};
