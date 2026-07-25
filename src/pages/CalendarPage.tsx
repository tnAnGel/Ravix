import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  CalendarDays,
  CheckCircle2,
  Contact,
  Download,
  Loader2,
  Smartphone,
  XCircle,
} from "lucide-react";
import { PageHeader } from "@/components/common/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CopyButton } from "@/components/common/CopyButton";
import { api } from "@/lib/api";
import { useApi } from "@/lib/useApi";

export function CalendarPage() {
  const { t } = useTranslation();
  const { data, loading, reload } = useApi(() => api.radicaleStatus());
  const [busy, setBusy] = useState(false);

  // Poll while a task is running (install takes ~1 min).
  const [polling, setPolling] = useState(false);
  useEffect(() => {
    if (!polling) return;
    const h = setInterval(reload, 4000);
    return () => clearInterval(h);
  }, [polling, reload]);

  // Stop polling once installed state settles.
  useEffect(() => {
    if (data?.installed && polling) setPolling(false);
  }, [data?.installed, polling]);

  const install = async () => {
    setBusy(true);
    try {
      await api.radicaleInstall();
      setPolling(true);
    } finally {
      setBusy(false);
    }
  };

  const uninstall = async () => {
    if (!confirm(t("calendar.confirmUninstall"))) return;
    setBusy(true);
    try {
      await api.radicaleUninstall();
      setTimeout(reload, 3000);
    } finally {
      setBusy(false);
    }
  };

  const base = data?.baseUrl ?? "";

  return (
    <div className="space-y-6">
      <PageHeader
        title={t("calendar.title")}
        description={t("calendar.subtitle")}
        icon={<CalendarDays />}
        actions={
          data?.installed ? (
            <Button variant="outline" size="sm" onClick={uninstall} disabled={busy}>
              {t("calendar.uninstall")}
            </Button>
          ) : (
            <Button size="sm" onClick={install} disabled={busy || polling}>
              {busy || polling ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Download className="h-4 w-4" />
              )}
              {polling ? t("calendar.installing") : t("calendar.install")}
            </Button>
          )
        }
      />

      {/* Status */}
      <Card>
        <CardContent className="p-5">
          {loading ? (
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          ) : data?.installed ? (
            <div className="flex items-center gap-3">
              {data.running ? (
                <CheckCircle2 className="h-7 w-7 text-success" />
              ) : (
                <XCircle className="h-7 w-7 text-warning" />
              )}
              <div className="flex-1">
                <p className="text-sm font-medium text-foreground">
                  {data.running ? t("calendar.running") : t("calendar.stopped")}
                </p>
                <p className="text-2xs text-muted-foreground">
                  {t("calendar.usersLine", { count: data.users })}
                </p>
              </div>
              <Badge variant={data.running ? "success" : "warning"}>
                {data.running ? t("common.active") : t("status.stopped")}
              </Badge>
            </div>
          ) : (
            <div className="flex items-center gap-3">
              <CalendarDays className="h-7 w-7 text-muted-foreground" />
              <div>
                <p className="text-sm font-medium text-foreground">
                  {t("calendar.notInstalled")}
                </p>
                <p className="text-2xs text-muted-foreground">{t("calendar.notInstalledHint")}</p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Client setup */}
      {data?.installed && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Smartphone className="h-4 w-4" /> {t("calendar.setup")}
            </CardTitle>
            <p className="text-sm text-muted-foreground">{t("calendar.setupHint")}</p>
          </CardHeader>
          <CardContent className="space-y-4">
            <SetupRow
              icon={<CalendarDays className="h-4 w-4 text-primary" />}
              label={t("calendar.caldavUrl")}
              value={base}
            />
            <SetupRow
              icon={<Contact className="h-4 w-4 text-primary" />}
              label={t("calendar.carddavUrl")}
              value={base}
            />
            <div className="rounded-md border border-border bg-card/40 p-3 text-xs text-muted-foreground">
              <p className="mb-1 font-medium text-foreground">{t("calendar.credentials")}</p>
              <p>{t("calendar.credentialsHint")}</p>
            </div>
            <div className="rounded-md border border-border bg-card/40 p-3 text-xs">
              <p className="mb-2 font-medium text-foreground">{t("calendar.clients")}</p>
              <ul className="space-y-1 text-muted-foreground">
                <li>{t("calendar.clientApple")}</li>
                <li>{t("calendar.clientThunderbird")}</li>
                <li>{t("calendar.clientAndroid")}</li>
              </ul>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function SetupRow({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-md border border-border bg-background p-3">
      <div className="flex min-w-0 items-center gap-2">
        {icon}
        <div className="min-w-0">
          <p className="text-2xs uppercase tracking-wide text-muted-foreground">{label}</p>
          <code className="break-all font-mono text-xs text-foreground">{value}</code>
        </div>
      </div>
      <CopyButton value={value} />
    </div>
  );
}
