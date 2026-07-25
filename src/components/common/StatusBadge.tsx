import { useTranslation } from "react-i18next";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { CheckStatus, HealthStatus } from "@/types";
import { checkMeta, healthMeta, toneToBadgeVariant } from "./status";

interface HealthBadgeProps {
  status: HealthStatus;
  className?: string;
  withDot?: boolean;
}

/** Badge for the high-level Healthy / Warning / Critical status. */
export function StatusBadge({
  status,
  className,
  withDot = true,
}: HealthBadgeProps) {
  const { t } = useTranslation();
  const meta = healthMeta[status] ?? healthMeta.warning;
  return (
    <Badge variant={toneToBadgeVariant[meta.tone]} className={className}>
      {withDot && (
        <span className={cn("h-1.5 w-1.5 rounded-full", meta.dot)} />
      )}
      {t(`status.${status}`)}
    </Badge>
  );
}

interface CheckBadgeProps {
  status: CheckStatus;
  label?: string;
  showIcon?: boolean;
  className?: string;
}

/** Badge for granular DNS / deliverability checks (pass / warn / fail …). */
export function CheckBadge({
  status,
  label,
  showIcon = true,
  className,
}: CheckBadgeProps) {
  const { t } = useTranslation();
  const meta = checkMeta[status] ?? checkMeta.unknown;
  const Icon = meta.Icon;
  return (
    <Badge variant={toneToBadgeVariant[meta.tone]} className={className}>
      {showIcon && <Icon className="h-3 w-3" />}
      {label ?? t(`status.${status}`)}
    </Badge>
  );
}
