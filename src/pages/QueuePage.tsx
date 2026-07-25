import { useMemo, useState } from "react";
import {
  Ban,
  Inbox,
  Pause,
  Play,
  RefreshCw,
  Search,
  Trash2,
} from "lucide-react";
import { PageHeader } from "@/components/common/PageHeader";
import { EmptyState } from "@/components/common/EmptyState";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card } from "@/components/ui/card";
import { useTranslation } from "react-i18next";
import { api } from "@/lib/api";
import { useApi } from "@/lib/useApi";
import { cn, timeAgo } from "@/lib/utils";
import type { QueueItem, QueueState } from "@/types";

const stateVariant: Record<
  QueueState,
  "info" | "warning" | "muted" | "critical"
> = {
  active: "info",
  deferred: "warning",
  hold: "muted",
  failed: "critical",
};

const stateKey: Record<QueueState, string> = {
  active: "queue.active",
  deferred: "queue.deferred",
  hold: "queue.hold",
  failed: "queue.failed",
};

export function QueuePage() {
  const { t } = useTranslation();
  const { data, reload } = useApi(() => api.queue());
  const [query, setQuery] = useState("");
  const [stateFilter, setStateFilter] = useState("all");
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const items = data ?? [];
  const queueSummary = {
    active: items.filter((q) => q.state === "active").length,
    deferred: items.filter((q) => q.state === "deferred").length,
    hold: items.filter((q) => q.state === "hold").length,
    failed: items.filter((q) => q.state === "failed").length,
  };

  const rows = useMemo(
    () =>
      items.filter((q) => {
        const matchesQuery =
          q.recipient.toLowerCase().includes(query.toLowerCase()) ||
          q.domain.toLowerCase().includes(query.toLowerCase()) ||
          q.sender.toLowerCase().includes(query.toLowerCase());
        const matchesState = stateFilter === "all" || q.state === stateFilter;
        return matchesQuery && matchesState;
      }),
    [items, query, stateFilter]
  );

  const runAction = (fn: (ids: string[]) => Promise<unknown>) => {
    fn(Array.from(selected)).then(() => {
      setSelected(new Set());
      reload();
    });
  };

  const allSelected = rows.length > 0 && rows.every((r) => selected.has(r.id));
  const toggleAll = () =>
    setSelected(allSelected ? new Set() : new Set(rows.map((r) => r.id)));
  const toggle = (id: string) =>
    setSelected((s) => {
      const next = new Set(s);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  return (
    <div className="space-y-6">
      <PageHeader
        title={t("queue.title")}
        description={t("queue.subtitle")}
        icon={<Inbox />}
        actions={
          <Button
            variant="outline"
            size="sm"
            onClick={() => api.queueFlush().then(reload)}
          >
            <RefreshCw className="h-4 w-4" /> {t("queue.flushQueue")}
          </Button>
        }
      />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <SummaryTile label={t("queue.active")} value={queueSummary.active} tone="info" />
        <SummaryTile
          label={t("queue.deferred")}
          value={queueSummary.deferred}
          tone="warning"
        />
        <SummaryTile label={t("queue.hold")} value={queueSummary.hold} tone="muted" />
        <SummaryTile
          label={t("queue.failed")}
          value={queueSummary.failed}
          tone="critical"
        />
      </div>

      {/* Grouped "why are these stuck?" panel. Folds N messages with the
          same hintCode into one row so the operator sees the cause once
          instead of repeating it on every line. */}
      <ReasonsPanel items={items} t={t} />


      <div className="flex flex-wrap items-center gap-3">
        <div className="relative max-w-xs flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("queue.filterPlaceholder")}
            className="pl-9"
          />
        </div>
        <Select value={stateFilter} onValueChange={setStateFilter}>
          <SelectTrigger className="w-40">
            <SelectValue placeholder={t("queue.state")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("queue.allStates")}</SelectItem>
            <SelectItem value="active">{t("queue.active")}</SelectItem>
            <SelectItem value="deferred">{t("queue.deferred")}</SelectItem>
            <SelectItem value="hold">{t("queue.hold")}</SelectItem>
            <SelectItem value="failed">{t("queue.failed")}</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Bulk action bar */}
      {selected.size > 0 && (
        <div className="flex items-center justify-between rounded-md border border-primary/30 bg-primary/[0.06] px-4 py-2.5">
          <span className="text-sm text-foreground">
            {t("queue.selected", { count: selected.size })}
          </span>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => runAction(api.queueRetry)}
            >
              <RefreshCw className="h-4 w-4" /> {t("common.retry")}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => runAction(api.queueHold)}
            >
              <Pause className="h-4 w-4" /> {t("common.hold")}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => runAction(api.queueDelete)}
            >
              <Trash2 className="h-4 w-4" /> {t("common.delete")}
            </Button>
          </div>
        </div>
      )}

      <Card className="overflow-hidden p-0">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="w-10">
                <input
                  type="checkbox"
                  checked={allSelected}
                  onChange={toggleAll}
                  className="h-4 w-4 rounded border-border accent-[hsl(var(--primary))]"
                />
              </TableHead>
              <TableHead>{t("queue.recipient")}</TableHead>
              <TableHead>{t("queue.sender")}</TableHead>
              <TableHead>{t("queue.subject")}</TableHead>
              <TableHead>{t("queue.state")}</TableHead>
              <TableHead>{t("queue.attempts")}</TableHead>
              <TableHead>{t("queue.queued")}</TableHead>
              <TableHead className="w-10" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 ? (
              <TableRow className="hover:bg-transparent">
                <TableCell colSpan={8} className="p-0">
                  <EmptyState
                    icon={Inbox}
                    title={t("queue.emptyTitle")}
                    description={t("queue.emptyDesc")}
                  />
                </TableCell>
              </TableRow>
            ) : (
              rows.map((q) => {
                const variant = stateVariant[q.state];
                return (
                  <TableRow key={q.id} data-state={selected.has(q.id) && "selected"}>
                    <TableCell>
                      <input
                        type="checkbox"
                        checked={selected.has(q.id)}
                        onChange={() => toggle(q.id)}
                        className="h-4 w-4 rounded border-border accent-[hsl(var(--primary))]"
                      />
                    </TableCell>
                    <TableCell>
                      <p className="font-mono text-sm text-foreground">
                        {q.recipient}
                      </p>
                      {/* Plain-language hint comes first because that's
                          actionable. Raw Postfix line stays underneath. */}
                      {q.hint && (
                        <p
                          className={cn(
                            // Foreground = high-contrast on dark + light;
                            // colored left bar = at-a-glance severity.
                            "mt-1.5 max-w-2xl rounded border-l-2 px-2.5 py-1.5 text-xs leading-snug text-foreground",
                            q.state === "failed"
                              ? "border-l-destructive bg-destructive/10"
                              : "border-l-warning bg-warning/10"
                          )}
                        >
                          {q.hint}
                        </p>
                      )}
                      {q.reason && (
                        <p
                          className="mt-1 font-mono text-2xs text-muted-foreground"
                          title={q.reason}
                        >
                          {q.reason}
                        </p>
                      )}
                    </TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground">
                      {q.sender}
                    </TableCell>
                    <TableCell className="max-w-[180px] truncate text-sm text-muted-foreground">
                      {q.subject}
                    </TableCell>
                    <TableCell>
                      <Badge variant={variant}>{t(stateKey[q.state])}</Badge>
                    </TableCell>
                    <TableCell className="tabular-nums text-sm text-muted-foreground">
                      {q.attempts}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {timeAgo(q.queuedAt)}
                    </TableCell>
                    <TableCell>
                      <div className="flex justify-end gap-0.5">
                        {q.state === "hold" ? (
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            title="Release"
                            onClick={() => api.queueRetry([q.id]).then(reload)}
                          >
                            <Play className="h-3.5 w-3.5" />
                          </Button>
                        ) : (
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            title="Retry"
                            onClick={() => api.queueRetry([q.id]).then(reload)}
                          >
                            <RefreshCw className="h-3.5 w-3.5" />
                          </Button>
                        )}
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          title="Hold"
                          onClick={() => api.queueHold([q.id]).then(reload)}
                        >
                          <Ban className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}

/**
 * Folds queue items by `hintCode` so the operator sees "5 messages stuck
 * for the same reason: provider blocks outbound 25" once, instead of
 * scanning the table to spot the pattern. Only shown when at least one
 * item carries a hint — otherwise we'd render an empty card.
 */
function ReasonsPanel({
  items,
  t,
}: {
  items: QueueItem[];
  t: (k: string, opts?: Record<string, unknown>) => string;
}) {
  const buckets = new Map<string, { hint: string; count: number; sample: QueueItem }>();
  for (const q of items) {
    if (!q.hint || !q.hintCode) continue;
    const cur = buckets.get(q.hintCode);
    if (cur) cur.count++;
    else buckets.set(q.hintCode, { hint: q.hint, count: 1, sample: q });
  }
  if (buckets.size === 0) return null;
  const sorted = Array.from(buckets.entries()).sort((a, b) => b[1].count - a[1].count);

  return (
    <Card className="border-warning/40 bg-warning/5 p-4">
      <p className="mb-3 text-sm font-semibold text-foreground">
        {t("queue.reasonsTitle", { count: items.filter((i) => i.hint).length })}
      </p>
      <div className="space-y-2">
        {sorted.map(([code, b]) => (
          <div
            key={code}
            // Solid card on the page background, with a coloured left bar so
            // the cause severity reads at a glance. Foreground text — full
            // contrast — was the readability complaint before.
            className="flex items-start gap-3 rounded-md border border-border bg-card p-3 shadow-sm"
          >
            <Badge variant="warning" className="shrink-0 font-mono">
              ×{b.count}
            </Badge>
            <div className="min-w-0 flex-1">
              <p className="text-sm leading-snug text-foreground">{b.hint}</p>
              <p className="mt-1.5 break-all font-mono text-2xs text-muted-foreground">
                {t("queue.reasonExample", {
                  recipient: b.sample.recipient,
                  reason: b.sample.reason,
                })}
              </p>
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}

function SummaryTile({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "info" | "warning" | "muted" | "critical";
}) {
  const toneClass = {
    info: "text-info",
    warning: "text-warning",
    muted: "text-muted-foreground",
    critical: "text-destructive",
  }[tone];
  return (
    <Card className="p-4">
      <p className={cn("text-2xl font-semibold tabular-nums", toneClass)}>
        {value}
      </p>
      <p className="text-xs text-muted-foreground">{label}</p>
    </Card>
  );
}
