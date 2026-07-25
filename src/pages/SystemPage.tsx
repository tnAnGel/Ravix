import {
  Boxes,
  CheckCircle2,
  Cpu,
  FolderTree,
  Package,
  Server,
  Terminal,
} from "lucide-react";
import { PageHeader } from "@/components/common/PageHeader";
import { CopyButton } from "@/components/common/CopyButton";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { useTranslation } from "react-i18next";
import { api } from "@/lib/api";
import { useApi } from "@/lib/useApi";
import { cn } from "@/lib/utils";

export function SystemPage() {
  const { t } = useTranslation();
  const { data: system, loading } = useApi(() => api.system());
  const { data: services } = useApi(() => api.services(), []);

  if (loading || !system) {
    return (
      <div className="space-y-6">
        <PageHeader
          title={t("system.title")}
          description={t("system.subtitle")}
          icon={<Boxes />}
        />
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-24" />
          ))}
        </div>
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  const pathEntries = [
    { label: t("system.pathApp"), value: system.paths.app },
    { label: t("system.pathConfig"), value: system.paths.config },
    { label: t("system.pathData"), value: system.paths.data },
    { label: t("system.pathLogs"), value: system.paths.logs },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title={t("system.title")}
        description={t("system.subtitle")}
        icon={<Boxes />}
      />

      {/* Overview */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <InfoTile
          icon={Server}
          label={t("system.os")}
          value={system.os}
          sub={t("system.kernel", { kernel: system.kernel })}
        />
        <InfoTile
          icon={Boxes}
          label={t("system.version")}
          value={`v${system.version}`}
          sub={t("system.upToDate")}
        />
        <InfoTile
          icon={Package}
          label={t("system.installMode")}
          value={system.installMode === "bare-metal" ? t("system.bareMetal") : system.installMode}
          sub={t("system.noDocker")}
        />
        <InfoTile
          icon={Cpu}
          label={t("system.architecture")}
          value={system.arch}
          sub={t("system.uptime", { uptime: system.uptime })}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Paths */}
        <Card>
          <CardHeader className="flex-row items-center gap-2 space-y-0">
            <FolderTree className="h-4 w-4 text-primary" />
            <CardTitle className="text-base">{t("system.paths")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {pathEntries.map((p) => (
              <div
                key={p.value}
                className="flex items-center justify-between rounded-md border border-border bg-card/40 px-3 py-2"
              >
                <div>
                  <p className="text-2xs uppercase tracking-wide text-muted-foreground">
                    {p.label}
                  </p>
                  <code className="font-mono text-sm text-foreground">
                    {p.value}
                  </code>
                </div>
                <CopyButton value={p.value} />
              </div>
            ))}
          </CardContent>
        </Card>

        {/* Packages */}
        <Card>
          <CardHeader className="flex-row items-center gap-2 space-y-0">
            <Package className="h-4 w-4 text-primary" />
            <CardTitle className="text-base">{t("system.packageStatus")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1.5">
            {system.packages.map((pkg) => (
              <div
                key={pkg.name}
                className="flex items-center justify-between py-1"
              >
                <code className="font-mono text-sm text-foreground">
                  {pkg.name}
                </code>
                <div className="flex items-center gap-3">
                  <span className="font-mono text-2xs text-muted-foreground">
                    {pkg.version}
                  </span>
                  <Badge variant="success">
                    <CheckCircle2 className="h-3 w-3" /> {pkg.status}
                  </Badge>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      {/* Managed services + command checks */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t("system.managedServices")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1.5">
            {(services ?? []).map((s) => (
              <div
                key={s.id}
                className="flex items-center justify-between py-1.5"
              >
                <div className="flex items-center gap-2.5">
                  <span
                    className={cn(
                      "h-2 w-2 rounded-full",
                      s.state === "running"
                        ? "bg-success"
                        : s.state === "degraded"
                          ? "bg-warning"
                          : "bg-destructive"
                    )}
                  />
                  <span className="text-sm text-foreground">{s.name}</span>
                </div>
                <span className="font-mono text-2xs text-muted-foreground">
                  systemd · {s.state}
                </span>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex-row items-center gap-2 space-y-0">
            <Terminal className="h-4 w-4 text-primary" />
            <CardTitle className="text-base">{t("system.commandChecks")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1.5 font-mono text-xs">
            {system.commandChecks.map((c) => (
              <div
                key={c.cmd}
                className="rounded-md border border-border bg-[#0a0d14] px-3 py-2"
              >
                <div className="flex items-center gap-2 text-muted-foreground">
                  <span className="text-success">$</span>
                  <span className="text-foreground/90">{c.cmd}</span>
                </div>
                <div
                  className={cn(
                    "mt-0.5 pl-4",
                    c.ok ? "text-muted-foreground" : "text-destructive"
                  )}
                >
                  {c.ok ? "→ " : "✗ "}
                  {c.result}
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      {/* Installer log timeline */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("system.installerLog")}</CardTitle>
        </CardHeader>
        <CardContent>
          <ol className="relative space-y-0">
            {system.installLog.map((entry, i) => (
              <li key={i} className="relative flex gap-4 pb-5 last:pb-0">
                {i < system.installLog.length - 1 && (
                  <span className="absolute left-[7px] top-4 h-full w-px bg-border" />
                )}
                <span className="relative z-10 mt-1 flex h-3.5 w-3.5 shrink-0 items-center justify-center">
                  <span className="h-3.5 w-3.5 rounded-full border-2 border-success/50 bg-success/20" />
                </span>
                <div className="flex flex-1 items-baseline justify-between gap-3">
                  <p className="text-sm text-foreground">{entry.msg}</p>
                  <span className="shrink-0 font-mono text-2xs text-muted-foreground">
                    +{entry.at}
                  </span>
                </div>
              </li>
            ))}
          </ol>
          <Separator className="my-4" />
          <div className="flex items-center gap-2 text-sm text-success">
            <CheckCircle2 className="h-4 w-4" />
            {t("system.installComplete")}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function InfoTile({
  icon: Icon,
  label,
  value,
  sub,
}: {
  icon: typeof Server;
  label: string;
  value: string;
  sub: string;
}) {
  return (
    <Card className="p-5">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Icon className="h-4 w-4" /> {label}
      </div>
      <p className="mt-2 text-lg font-semibold text-foreground">{value}</p>
      <p className="text-2xs text-muted-foreground">{sub}</p>
    </Card>
  );
}
