import { useTranslation } from "react-i18next";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CopyButton } from "./CopyButton";
import { CheckBadge } from "./StatusBadge";
import { cn } from "@/lib/utils";
import type { DnsRecord } from "@/types";

/** Renders a single required DNS record with expected vs. detected values. */
export function DnsRecordCard({ record }: { record: DnsRecord }) {
  const { t } = useTranslation();
  const mismatch =
    record.status === "fail" || record.status === "warn";
  return (
    <Card className="overflow-hidden">
      <div className="flex items-center justify-between border-b border-border/60 px-4 py-2.5">
        <div className="flex items-center gap-2">
          <Badge variant="secondary" className="font-mono text-2xs">
            {record.type}
          </Badge>
          <code className="text-xs text-muted-foreground">{record.host}</code>
        </div>
        <CheckBadge status={record.status} />
      </div>
      <div className="space-y-2.5 p-4">
        <DnsValueRow
          label={t("dns.expected")}
          value={record.expected}
          tone="expected"
        />
        <DnsValueRow
          label={t("dns.detected")}
          value={record.detected ?? t("dns.notFound")}
          tone={
            record.detected === null
              ? "missing"
              : mismatch
                ? "mismatch"
                : "ok"
          }
        />
        {(record.ttl || record.priority) && (
          <div className="flex gap-4 pt-0.5 text-2xs text-muted-foreground">
            {record.priority !== undefined && (
              <span>{t("dns.priority", { value: record.priority })}</span>
            )}
            {record.ttl !== undefined && (
              <span>{t("dns.ttl", { value: record.ttl })}</span>
            )}
          </div>
        )}
      </div>
    </Card>
  );
}

function DnsValueRow({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: "expected" | "ok" | "mismatch" | "missing";
}) {
  const toneClass = {
    expected: "text-foreground",
    ok: "text-success",
    mismatch: "text-warning",
    missing: "text-destructive",
  }[tone];
  return (
    <div className="group space-y-1">
      <span className="block text-2xs font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </span>
      <div className="flex min-w-0 items-start gap-1.5 rounded-md border border-border/60 bg-background/40 px-2.5 py-1.5">
        <code className={cn("min-w-0 flex-1 break-all font-mono text-xs", toneClass)}>
          {value}
        </code>
        {tone !== "missing" && (
          <CopyButton
            value={value}
            className="shrink-0 opacity-60 transition-opacity hover:opacity-100"
          />
        )}
      </div>
    </div>
  );
}
