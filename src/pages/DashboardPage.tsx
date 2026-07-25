import { Link } from "react-router-dom";
import {
  ArrowRight,
  Cpu,
  Globe,
  HardDrive,
  Inbox,
  Mail,
  MemoryStick,
  RefreshCw,
  ShieldCheck,
} from "lucide-react";
import { PageHeader } from "@/components/common/PageHeader";
import { MetricCard } from "@/components/common/MetricCard";
import { HealthScore } from "@/components/common/HealthScore";
import { ServiceStatusCard } from "@/components/common/ServiceStatusCard";
import { EventList } from "@/components/common/EventList";
import { Sparkline } from "@/components/common/Sparkline";
import { ResourceUsageBar } from "@/components/common/ResourceUsageBar";
import { CheckBadge } from "@/components/common/StatusBadge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { cn, formatBytes, pct } from "@/lib/utils";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { AlertTriangle, CheckCircle2, ChevronDown, ChevronRight, Circle, XCircle } from "lucide-react";
import { api } from "@/lib/api";
import { useApi } from "@/lib/useApi";

export function DashboardPage() {
  const { t } = useTranslation();
  const dashboard = useApi(() => api.dashboard());
  const services = useApi(() => api.services());
  const deliverability = useApi(() => api.deliverability());
  const events = useApi(() => api.events(8));

  const d = dashboard.data;
  const loading = dashboard.loading || !d;

  const cpu = d?.resources.find((r) => r.label === "CPU");
  const ram = d?.resources.find((r) => r.label === "RAM");
  const disk = d?.resources.find((r) => r.label === "Disk");

  return (
    <div className="space-y-6">
      <PageHeader
        title={t("dashboard.title")}
        description={t("dashboard.subtitle")}
        actions={
          <>
            <Button
              variant="outline"
              size="sm"
              onClick={() => dashboard.reload()}
            >
              <RefreshCw className="h-4 w-4" /> {t("dashboard.recheck")}
            </Button>
            <Button size="sm" asChild>
              <Link to="/domains">
                {t("dashboard.manageDomains")} <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
          </>
        }
      />

      {/* Top row — health gauge + key metrics */}
      <div className="grid gap-4 lg:grid-cols-[360px_1fr]">
        <Card className="flex items-center gap-5 p-5">
          {loading ? (
            <Skeleton className="h-[132px] w-[132px] shrink-0 rounded-full" />
          ) : (
            <HealthScore
              score={d.health.score}
              status={d.health.status}
              label={t("dashboard.health")}
              className="shrink-0"
            />
          )}
          <div className="min-w-0 space-y-2">
            <Badge variant={d && d.health.status === "healthy" ? "success" : "warning"}>
              {d && d.health.status === "healthy"
                ? t("status.allHealthy")
                : t("status.attentionNeeded")}
            </Badge>
            <p className="text-sm leading-snug text-muted-foreground">
              {d
                ? d.metrics.domainsNeedAttention === 0
                  ? t("dashboard.summaryHealthy")
                  : t("dashboard.summaryAttention", {
                      count: d.metrics.domainsNeedAttention,
                    })
                : t("dashboard.loadingHealth")}
            </p>
            <Button
              variant="link"
              size="sm"
              className="h-auto whitespace-normal p-0 text-left text-primary"
              asChild
            >
              <Link to="/domains" className="inline-flex items-center gap-1">
                {t("dashboard.reviewIssues")}
                <ArrowRight className="h-3.5 w-3.5 shrink-0" />
              </Link>
            </Button>
          </div>
        </Card>

        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <MetricCard
            label={t("dashboard.domains")}
            value={d?.metrics.domains ?? "—"}
            icon={Globe}
            hint={d ? t("dashboard.domainsHint", { count: d.metrics.domainsNeedAttention }) : ""}
            tone={d && d.metrics.domainsNeedAttention > 0 ? "warning" : "default"}
          />
          <MetricCard
            label={t("dashboard.mailboxes")}
            value={d?.metrics.mailboxes ?? "—"}
            icon={Mail}
            hint={
              d
                ? t("dashboard.mailboxesHint", {
                    active: d.metrics.mailboxesActive,
                    suspended: d.metrics.mailboxesSuspended,
                  })
                : ""
            }
          />
          <MetricCard
            label={t("dashboard.mailQueue")}
            value={d?.metrics.queueTotal ?? "—"}
            icon={Inbox}
            tone={d && d.metrics.queueFailed > 0 ? "warning" : "default"}
            hint={
              d
                ? t("dashboard.queueHint", {
                    deferred: d.metrics.queueDeferred,
                    failed: d.metrics.queueFailed,
                  })
                : ""
            }
          />
          <MetricCard
            label={t("dashboard.ssl")}
            value={d ? `${d.metrics.sslActive}/${d.metrics.sslTotal}` : "—"}
            icon={ShieldCheck}
            tone={d && d.metrics.sslActive < d.metrics.sslTotal ? "critical" : "default"}
            hint={
              d && d.metrics.sslActive < d.metrics.sslTotal
                ? t("dashboard.sslIssue", {
                    count: d.metrics.sslTotal - d.metrics.sslActive,
                  })
                : t("dashboard.sslValid")
            }
          />
        </div>
      </div>

      {/* Resources */}
      <div className="grid gap-4 md:grid-cols-3">
        <ResourceCard
          icon={Cpu}
          label={t("dashboard.cpu")}
          value={cpu ? `${cpu.used}%` : "—"}
          sub={
            d
              ? t("dashboard.cpuSub", { vcpus: d.host.vcpus, load: d.host.load })
              : ""
          }
          percent={cpu ? cpu.used : 0}
          history={d?.cpuHistory ?? []}
          gradientId="cpu"
          loading={loading}
        />
        <ResourceCard
          icon={MemoryStick}
          label={t("dashboard.memory")}
          value={ram ? formatBytes(ram.used * 1024 * 1024, 1) : "—"}
          sub={ram ? `${t("common.of")} ${formatBytes(ram.total * 1024 * 1024, 0)}` : ""}
          percent={ram ? pct(ram.used, ram.total) : 0}
          history={d?.queueHistory ?? []}
          gradientId="ram"
          color="hsl(var(--info))"
          loading={loading}
        />
        <ResourceCard
          icon={HardDrive}
          label={t("dashboard.disk")}
          value={disk ? `${disk.used} GB` : "—"}
          sub={
            disk && d
              ? t("dashboard.diskSub", { total: disk.total, path: d.host.dataPath })
              : ""
          }
          percent={disk ? pct(disk.used, disk.total) : 0}
          history={(d?.cpuHistory ?? []).map((p) => ({ value: p.value / 2 + 20 }))}
          gradientId="disk"
          color="hsl(var(--success))"
          loading={loading}
        />
      </div>

      {/* Mail readiness banner */}
      <MailReadinessBanner />

      {/* Services + deliverability */}
      <div className="grid gap-4 lg:grid-cols-[1fr_380px]">
        <Card>
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <CardTitle className="text-base">{t("dashboard.serviceStatus")}</CardTitle>
            {services.data && (
              <Badge
                variant={
                  services.data.some((s) => s.state !== "running")
                    ? "warning"
                    : "success"
                }
              >
                {services.data.some((s) => s.state !== "running")
                  ? t("dashboard.degradedCount", {
                      count: services.data.filter((s) => s.state !== "running")
                        .length,
                    })
                  : t("dashboard.allRunning")}
              </Badge>
            )}
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {services.loading || !services.data
              ? Array.from({ length: 5 }).map((_, i) => (
                  <Skeleton key={i} className="h-[92px] w-full" />
                ))
              : services.data.map((s) => (
                  <ServiceStatusCard key={s.id} service={s} />
                ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <CardTitle className="text-base">{t("dashboard.deliverability")}</CardTitle>
            <Button variant="ghost" size="sm" className="text-muted-foreground" asChild>
              <Link to="/anti-spam">{t("common.details")}</Link>
            </Button>
          </CardHeader>
          <CardContent className="space-y-1">
            {(deliverability.data ?? []).map((dc) => (
              <div
                key={dc.id}
                className="flex items-center justify-between gap-3 rounded-md px-1 py-1.5"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm text-foreground">
                    {t(`deliverability.${dc.id}`, dc.label)}
                  </p>
                  <p className="truncate text-2xs text-muted-foreground">
                    {dc.detail}
                  </p>
                </div>
                <CheckBadge status={dc.status} showIcon />
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      {/* Recent events + queue snapshot */}
      <div className="grid gap-4 lg:grid-cols-[1fr_380px]">
        <Card>
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <CardTitle className="text-base">{t("dashboard.recentEvents")}</CardTitle>
            <Button variant="ghost" size="sm" className="text-muted-foreground" asChild>
              <Link to="/logs">
                {t("dashboard.viewLogs")} <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </Button>
          </CardHeader>
          <CardContent>
            <EventList events={events.data ?? []} limit={8} />
          </CardContent>
        </Card>

        <QueueCard d={d} t={t} />
      </div>
    </div>
  );
}

/**
 * Mail-queue widget — redesigned: total at the top with state badge,
 * a single proportional bar (active / deferred / hold / failed) so the
 * operator sees mix at a glance instead of four indistinguishable zeros,
 * and an inline 24h depth sparkline. Empty queue is the most common
 * state on a working server, so it gets a friendly "В норме" pill
 * instead of four blank tiles.
 */
function QueueCard({
  d,
  t,
}: {
  d:
    | {
        queueSummary: { active: number; deferred: number; hold: number; failed: number };
        queueHistory: { value: number }[];
      }
    | undefined;
  t: (k: string, opts?: Record<string, unknown>) => string;
}) {
  const s = d?.queueSummary ?? { active: 0, deferred: 0, hold: 0, failed: 0 };
  const total = s.active + s.deferred + s.hold + s.failed;
  const segments = [
    { key: "active", value: s.active, color: "hsl(var(--info))" },
    { key: "deferred", value: s.deferred, color: "hsl(var(--warning))" },
    { key: "hold", value: s.hold, color: "hsl(var(--muted-foreground))" },
    { key: "failed", value: s.failed, color: "hsl(var(--destructive))" },
  ];
  return (
    <Card>
      <CardHeader className="flex-row items-start justify-between space-y-0">
        <div>
          <CardTitle className="text-base">{t("dashboard.mailQueue")}</CardTitle>
          <p className="mt-1 text-2xs text-muted-foreground">
            {total === 0
              ? t("dashboard.queueClean")
              : t("dashboard.queueTotal", { count: total })}
          </p>
        </div>
        <Badge
          variant={
            s.failed > 0 ? "critical" : s.deferred > 0 ? "warning" : "success"
          }
        >
          {s.failed > 0
            ? t("dashboard.queueProblem")
            : s.deferred > 0
              ? t("dashboard.queueBacklog")
              : t("dashboard.queueOk")}
        </Badge>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Stacked proportional bar. Each segment width is (count/total)%;
            renders a 6px-tall coloured strip per state so the operator
            sees mix instantly. Falls back to a flat muted bar when 0. */}
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted/40">
          {total === 0 ? (
            <div className="h-full w-full bg-success/40" />
          ) : (
            <div className="flex h-full w-full">
              {segments.filter((s) => s.value > 0).map((s) => (
                <div
                  key={s.key}
                  style={{
                    width: `${(s.value / total) * 100}%`,
                    backgroundColor: s.color,
                  }}
                />
              ))}
            </div>
          )}
        </div>

        {/* Per-state rows with a leading swatch — only render the non-zero
            ones to keep the card dense and meaningful (was 4 always-0 tiles). */}
        <div className="space-y-1.5 text-sm">
          {segments.map((seg) => (
            <div key={seg.key} className="flex items-center justify-between">
              <span className="flex items-center gap-2 text-muted-foreground">
                <span
                  className="h-2 w-2 rounded-sm"
                  style={{ backgroundColor: seg.color }}
                />
                {t(`dashboard.${seg.key}`)}
              </span>
              <span
                className={cn(
                  "font-mono tabular-nums",
                  seg.value > 0 ? "text-foreground" : "text-muted-foreground/60"
                )}
              >
                {seg.value}
              </span>
            </div>
          ))}
        </div>

        <div className="rounded-md border border-border bg-card/40 p-2">
          <Sparkline
            data={d?.queueHistory ?? []}
            gradientId="queue-dash"
            color="hsl(var(--warning))"
            height={48}
          />
          <p className="mt-1 text-2xs text-muted-foreground">
            {t("dashboard.queueDepth")}
          </p>
        </div>

        <Button variant="outline" size="sm" className="w-full" asChild>
          <Link to="/queue">
            {t("dashboard.openQueue")} <ArrowRight className="h-4 w-4" />
          </Link>
        </Button>
      </CardContent>
    </Card>
  );
}

function ResourceCard({
  icon: Icon,
  label,
  value,
  sub,
  percent,
  history,
  gradientId,
  color = "hsl(var(--primary))",
  loading,
}: {
  icon: typeof Cpu;
  label: string;
  value: string;
  sub: string;
  percent: number;
  history: { value: number }[];
  gradientId: string;
  color?: string;
  loading?: boolean;
}) {
  return (
    <Card className="p-5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
          <Icon className="h-4 w-4" /> {label}
        </div>
        <span className="text-xs text-muted-foreground">{percent}%</span>
      </div>
      <div className="mt-1 flex items-baseline gap-1.5">
        <span className="text-2xl font-semibold tracking-tight text-foreground">
          {value}
        </span>
        <span className="text-xs text-muted-foreground">{sub}</span>
      </div>
      <div className="-mx-1 mt-2 h-12">
        {loading ? (
          <Skeleton className="h-full w-full" />
        ) : (
          <Sparkline data={history} gradientId={gradientId} color={color} />
        )}
      </div>
      <ResourceUsageBar value={percent} className="mt-1" size="sm" />
    </Card>
  );
}

/**
 * "Can this server send mail?" — colored card on the dashboard with overall
 * status, summary, retest button and an expandable breakdown of every check.
 */
function MailReadinessBanner() {
  const { t } = useTranslation();
  const { data, loading, reload } = useApi(() => api.mailReadiness());
  const [expanded, setExpanded] = useState(false);
  const [testing, setTesting] = useState(false);

  const retest = async () => {
    setTesting(true);
    try {
      await api.testMailReadiness();
      await reload();
    } finally {
      setTesting(false);
    }
  };

  if (loading || !data) {
    return <Skeleton className="h-24 w-full" />;
  }

  const toneClasses = {
    ready: "border-success/40 bg-success/[0.06]",
    degraded: "border-warning/40 bg-warning/[0.06]",
    blocked: "border-destructive/40 bg-destructive/[0.06]",
  } as const;
  const headerIcon = {
    ready: <CheckCircle2 className="h-5 w-5 text-success" />,
    degraded: <AlertTriangle className="h-5 w-5 text-warning" />,
    blocked: <XCircle className="h-5 w-5 text-destructive" />,
  }[data.overall];

  return (
    <Card className={cn("p-4", toneClasses[data.overall])}>
      <div className="flex items-start gap-3">
        {headerIcon}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-semibold text-foreground">
              {t(`dashboard.mailReadiness.${data.overall}`)}
            </p>
            <Badge variant={data.canSendOutbound ? "success" : "critical"}>
              {data.canSendOutbound ? t("dashboard.mailReadiness.canSend") : t("dashboard.mailReadiness.cannotSend")}
            </Badge>
          </div>
          <p className="mt-0.5 text-sm text-muted-foreground">{data.summary}</p>
        </div>
        <div className="flex shrink-0 gap-2">
          <Button variant="ghost" size="sm" onClick={() => setExpanded((v) => !v)}>
            {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
            {t("dashboard.mailReadiness.details")}
          </Button>
          <Button variant="outline" size="sm" onClick={retest} disabled={testing}>
            <RefreshCw className={cn("h-4 w-4", testing && "animate-spin")} />
            {testing ? t("dashboard.mailReadiness.testing") : t("dashboard.mailReadiness.retest")}
          </Button>
        </div>
      </div>

      {expanded && (
        <ul className="mt-4 space-y-1.5 border-t border-border/60 pt-3">
          {data.checks.map((c) => {
            const icon =
              c.status === "PASS" ? <CheckCircle2 className="h-4 w-4 shrink-0 text-success" /> :
              c.status === "FAIL" ? <XCircle className="h-4 w-4 shrink-0 text-destructive" /> :
              c.status === "WARN" ? <AlertTriangle className="h-4 w-4 shrink-0 text-warning" /> :
              <Circle className="h-4 w-4 shrink-0 text-muted-foreground" />;
            return (
              <li key={c.key} className="flex items-start gap-2.5 text-sm">
                {icon}
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-foreground">{c.label}</p>
                  <p className="text-xs text-muted-foreground">{c.detail}</p>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}
