import { useTranslation } from "react-i18next";
import { Activity, AlertTriangle, CheckCircle2, Gauge, XCircle } from "lucide-react";
import { PageHeader } from "@/components/common/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CopyButton } from "@/components/common/CopyButton";
import { api } from "@/lib/api";
import { useApi } from "@/lib/useApi";

export function MonitoringPage() {
  const { t } = useTranslation();
  const { data: alerts } = useApi(() => api.monitoringAlerts());
  const scrapeUrl =
    typeof window !== "undefined" ? `${window.location.origin}/api/metrics` : "/api/metrics";
  const list = alerts ?? [];
  const critical = list.filter((a) => a.severity === "critical").length;
  const warning = list.filter((a) => a.severity === "warning").length;

  return (
    <div className="space-y-6">
      <PageHeader
        title={t("monitoring.title")}
        description={t("monitoring.subtitle")}
        icon={<Activity />}
      />

      {/* Active alerts */}
      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <CardTitle className="text-base">{t("monitoring.alerts")}</CardTitle>
          <div className="flex gap-2">
            {critical > 0 && <Badge variant="critical">{critical} critical</Badge>}
            {warning > 0 && <Badge variant="warning">{warning} warning</Badge>}
            {list.length === 0 && <Badge variant="success">{t("monitoring.allClear")}</Badge>}
          </div>
        </CardHeader>
        <CardContent className="space-y-2">
          {list.length === 0 ? (
            <div className="flex items-center gap-2 py-4 text-sm text-muted-foreground">
              <CheckCircle2 className="h-5 w-5 text-success" /> {t("monitoring.noAlerts")}
            </div>
          ) : (
            list.map((a, i) => (
              <div
                key={i}
                className="flex items-start gap-2.5 rounded-md border border-border bg-card/40 p-3"
              >
                {a.severity === "critical" ? (
                  <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
                ) : (
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
                )}
                <div>
                  <p className="text-sm font-medium text-foreground">{a.message}</p>
                  <p className="text-2xs uppercase tracking-wide text-muted-foreground">
                    {a.category}
                  </p>
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      {/* Prometheus exporter */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Gauge className="h-4 w-4" /> {t("monitoring.prometheus")}
          </CardTitle>
          <p className="text-sm text-muted-foreground">{t("monitoring.prometheusHint")}</p>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center justify-between gap-3 rounded-md border border-border bg-background p-3">
            <code className="break-all font-mono text-xs text-foreground">{scrapeUrl}</code>
            <CopyButton value={scrapeUrl} />
          </div>
          <pre className="overflow-x-auto rounded-md border border-border bg-card/40 p-3 text-2xs text-muted-foreground">
{`scrape_configs:
  - job_name: ravix
    metrics_path: /api/metrics
    static_configs:
      - targets: ["${typeof window !== "undefined" ? window.location.host : "your-host"}"]`}
          </pre>
          <p className="text-2xs text-muted-foreground">{t("monitoring.tokenHint")}</p>
        </CardContent>
      </Card>
    </div>
  );
}
