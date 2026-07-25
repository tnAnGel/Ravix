import { useState } from "react";
import { Activity, Flame, Gauge, ShieldX, TrendingUp } from "lucide-react";
import { useTranslation } from "react-i18next";
import { PageHeader } from "@/components/common/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { HealthScore } from "@/components/common/HealthScore";
import { api } from "@/lib/api";
import { useApi } from "@/lib/useApi";
import { cn, timeAgo } from "@/lib/utils";
import type { HealthStatus } from "@/types";

const gradeToStatus: Record<string, HealthStatus> = {
  excellent: "healthy",
  good: "healthy",
  fair: "warning",
  poor: "critical",
};

export function ReputationPage() {
  const { t } = useTranslation();
  const { data, loading, reload } = useApi(() => api.reputation());
  const { data: complaints, reload: reloadComplaints } = useApi(() => api.complaints(), []);

  return (
    <div className="space-y-6">
      <PageHeader
        title={t("reputation.title")}
        description={t("reputation.subtitle")}
        icon={<TrendingUp />}
      />

      {loading || !data ? (
        <Skeleton className="h-48 w-full" />
      ) : (
        <>
          {/* Score + key rates */}
          <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
            <Card className="flex items-center gap-5 p-5">
              <HealthScore
                score={data.reputation.score}
                status={gradeToStatus[data.reputation.grade]}
                label={t("reputation.score")}
                className="shrink-0"
              />
              <div className="min-w-0 space-y-1.5">
                <Badge variant={data.reputation.grade === "poor" ? "critical" : data.reputation.grade === "fair" ? "warning" : "success"}>
                  {t(`reputation.grades.${data.reputation.grade}`)}
                </Badge>
                <p className="text-sm text-muted-foreground">
                  {t("reputation.scoreHint")}
                </p>
              </div>
            </Card>

            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              <Metric icon={Activity} label={t("reputation.sent30d")} value={data.reputation.sent30d.toLocaleString()} />
              <Metric
                icon={TrendingUp}
                label={t("reputation.bounceRate")}
                value={`${data.reputation.bounceRate}%`}
                tone={data.reputation.bounceRate > 5 ? "critical" : data.reputation.bounceRate > 2 ? "warning" : "success"}
              />
              <Metric
                icon={ShieldX}
                label={t("reputation.complaintRate")}
                value={`${data.reputation.complaintRate}%`}
                tone={data.reputation.complaintRate > 0.1 ? "critical" : data.reputation.complaintRate > 0.05 ? "warning" : "success"}
              />
              <Metric icon={ShieldX} label={t("reputation.suppressed")} value={data.reputation.suppressed.toLocaleString()} />
            </div>
          </div>

          <WarmupCard
            enabled={data.warmup.enabled}
            day={data.warmup.day}
            dailyCap={data.warmup.dailyCap}
            targetDaily={data.warmup.targetDaily}
            complete={data.warmup.complete}
            startDate={data.warmup.startDate}
            sentToday={data.sentToday}
            onChanged={reload}
          />

          {/* Postmaster / FBL guidance */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">{t("reputation.guidanceTitle")}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2.5 text-sm text-muted-foreground">
              <Guidance text={t("reputation.guide1")} />
              <Guidance text={t("reputation.guide2")} />
              <Guidance text={t("reputation.guide3")} />
              <Guidance text={t("reputation.guide4")} />
            </CardContent>
          </Card>

          {/* Complaints / suppression list */}
          <Card>
            <CardHeader className="flex-row items-center justify-between space-y-0">
              <CardTitle className="text-base">{t("reputation.complaints")}</CardTitle>
              <AddComplaint onAdded={() => { reloadComplaints(); reload(); }} />
            </CardHeader>
            <CardContent className="p-0">
              {(complaints ?? []).length === 0 ? (
                <p className="px-6 py-8 text-center text-sm text-muted-foreground">
                  {t("reputation.noComplaints")}
                </p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t("reputation.email")}</TableHead>
                      <TableHead>{t("reputation.source")}</TableHead>
                      <TableHead className="text-right">{t("reputation.received")}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(complaints ?? []).map((c) => (
                      <TableRow key={c.id}>
                        <TableCell className="font-mono text-sm">{c.email}</TableCell>
                        <TableCell><Badge variant="muted">{c.source ?? "—"}</Badge></TableCell>
                        <TableCell className="text-right text-xs text-muted-foreground">{timeAgo(c.receivedAt)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

function WarmupCard({
  enabled,
  day,
  dailyCap,
  targetDaily,
  complete,
  startDate,
  sentToday,
  onChanged,
}: {
  enabled: boolean;
  day: number;
  dailyCap: number;
  targetDaily: number;
  complete: boolean;
  startDate: string | null;
  sentToday: number;
  onChanged: () => void;
}) {
  const { t } = useTranslation();
  const [target, setTarget] = useState(targetDaily);
  const [busy, setBusy] = useState(false);

  const toggle = (v: boolean) => {
    setBusy(true);
    api.updateWarmup({ enabled: v }).then(onChanged).finally(() => setBusy(false));
  };
  const saveTarget = () => {
    setBusy(true);
    api.updateWarmup({ targetDaily: target }).then(onChanged).finally(() => setBusy(false));
  };

  const usagePct = dailyCap > 0 ? Math.min(100, Math.round((sentToday / dailyCap) * 100)) : 0;

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0">
        <div className="flex items-center gap-2">
          <Flame className="h-4 w-4 text-primary" />
          <CardTitle className="text-base">{t("reputation.warmupTitle")}</CardTitle>
        </div>
        <Switch checked={enabled} onCheckedChange={toggle} disabled={busy} />
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">{t("reputation.warmupHint")}</p>

        {enabled && (
          <>
            <div className="grid grid-cols-3 gap-3">
              <Mini label={t("reputation.warmupDay")} value={complete ? "✓" : `${day}/30`} />
              <Mini label={t("reputation.todayCap")} value={dailyCap.toLocaleString()} />
              <Mini label={t("reputation.sentToday")} value={sentToday.toLocaleString()} />
            </div>
            <div className="space-y-1.5">
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>{t("reputation.todayUsage")}</span>
                <span>{usagePct}%</span>
              </div>
              <Progress value={usagePct} indicatorClassName={usagePct >= 100 ? "bg-warning" : "bg-primary"} />
            </div>
            {complete && (
              <Badge variant="success">{t("reputation.warmupComplete")}</Badge>
            )}
            {startDate && (
              <p className="text-2xs text-muted-foreground">
                {t("reputation.started", { date: startDate })}
              </p>
            )}
          </>
        )}

        <div className="flex items-end gap-2 border-t border-border pt-4">
          <div className="space-y-1.5">
            <Label>{t("reputation.targetDaily")}</Label>
            <Input
              type="number"
              value={target}
              min={1}
              onChange={(e) => setTarget(Number(e.target.value))}
              className="max-w-[160px] font-mono"
            />
          </div>
          <Button size="sm" variant="outline" disabled={busy || target === targetDaily} onClick={saveTarget}>
            {t("common.save")}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function AddComplaint({ onAdded }: { onAdded: () => void }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const submit = async () => {
    if (!email.includes("@")) return;
    await api.addComplaint(email.trim());
    setEmail("");
    setOpen(false);
    onAdded();
  };
  return open ? (
    <div className="flex gap-2">
      <Input
        autoFocus
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && submit()}
        placeholder="user@example.com"
        className="h-8 w-56 font-mono"
      />
      <Button size="sm" onClick={submit} disabled={!email.includes("@")}>{t("common.add")}</Button>
    </div>
  ) : (
    <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
      <ShieldX className="h-4 w-4" /> {t("reputation.addSuppression")}
    </Button>
  );
}

function Metric({ icon: Icon, label, value, tone }: { icon: typeof Activity; label: string; value: string; tone?: "success" | "warning" | "critical" }) {
  return (
    <Card className="p-4">
      <p className={cn(
        "text-xl font-semibold tabular-nums text-foreground",
        tone === "success" && "text-success",
        tone === "warning" && "text-warning",
        tone === "critical" && "text-destructive"
      )}>{value}</p>
      <p className="mt-0.5 flex items-center gap-1 text-2xs text-muted-foreground">
        <Icon className="h-3 w-3" /> {label}
      </p>
    </Card>
  );
}

function Mini({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-border bg-card/40 p-3">
      <p className="text-lg font-semibold tabular-nums text-foreground">{value}</p>
      <p className="text-2xs text-muted-foreground">{label}</p>
    </div>
  );
}

function Guidance({ text }: { text: string }) {
  return (
    <div className="flex gap-2.5">
      <Gauge className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
      <span>{text}</span>
    </div>
  );
}
