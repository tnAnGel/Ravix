import { useState } from "react";
import { CheckCircle2, RefreshCw, ShieldAlert, XCircle } from "lucide-react";
import { useTranslation } from "react-i18next";
import { PageHeader } from "@/components/common/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "@/lib/api";
import { useApi } from "@/lib/useApi";
import { cn, timeAgo } from "@/lib/utils";

export function RblPage() {
  const { t } = useTranslation();
  const { data, loading, reload } = useApi(() => api.rbl());
  const [scanning, setScanning] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const scan = async () => {
    setScanning(true); setToast(null);
    try {
      const r = await api.rblScan();
      await reload();
      const total = r.reduce((n, ip) => n + ip.listedCount, 0);
      setToast(t("rbl.toastDone", { ips: r.length, listed: total }));
    } catch (e) {
      setToast(e instanceof Error ? e.message : t("rbl.toastFailed"));
    } finally {
      setScanning(false);
      setTimeout(() => setToast(null), 6000);
    }
  };

  const totalListed = (data ?? []).reduce((n, ip) => n + ip.listedCount, 0);

  return (
    <div className="space-y-6">
      <PageHeader
        title={t("rbl.title")}
        description={t("rbl.subtitle")}
        icon={<ShieldAlert />}
        actions={
          <Button size="sm" onClick={scan} disabled={scanning}>
            <RefreshCw className={cn("h-4 w-4", scanning && "animate-spin")} />
            {scanning ? t("rbl.scanning") : t("rbl.rescan")}
          </Button>
        }
      />

      {toast && (
        <div className="rounded-md border border-primary/30 bg-primary/10 px-3 py-2 text-sm text-foreground">
          {toast}
        </div>
      )}

      {loading ? (
        <Skeleton className="h-48 w-full" />
      ) : (data ?? []).length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-14 text-center">
            <ShieldAlert className="h-8 w-8 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">{t("rbl.empty")}</p>
            <p className="max-w-md text-2xs text-muted-foreground">{t("rbl.emptyHint")}</p>
          </CardContent>
        </Card>
      ) : (
        <>
          <Card
            className={cn(
              "p-4",
              totalListed > 0 ? "border-destructive/40 bg-destructive/[0.06]" : "border-success/40 bg-success/[0.06]"
            )}
          >
            <div className="flex items-center gap-3">
              {totalListed > 0 ? (
                <XCircle className="h-5 w-5 text-destructive" />
              ) : (
                <CheckCircle2 className="h-5 w-5 text-success" />
              )}
              <p className="text-sm font-medium text-foreground">
                {totalListed > 0 ? t("rbl.listedBanner", { count: totalListed }) : t("rbl.cleanBanner")}
              </p>
            </div>
          </Card>

          {(data ?? []).map((ip) => (
            <Card key={ip.ip}>
              <CardHeader className="flex-row items-center justify-between space-y-0">
                <CardTitle className="font-mono text-base">{ip.ip}</CardTitle>
                <div className="flex items-center gap-2">
                  <Badge variant={ip.listedCount > 0 ? "critical" : "success"}>
                    {ip.listedCount > 0
                      ? t("rbl.listedOn", { count: ip.listedCount })
                      : t("rbl.notListed")}
                  </Badge>
                  {ip.checkedAt && (
                    <span className="text-2xs text-muted-foreground">{timeAgo(ip.checkedAt)}</span>
                  )}
                </div>
              </CardHeader>
              <CardContent className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {ip.zones.map((z) => (
                  <div
                    key={z.zone}
                    className="flex items-center gap-2 rounded-md border border-border bg-card/40 px-3 py-2"
                  >
                    {z.listed ? (
                      <XCircle className="h-4 w-4 shrink-0 text-destructive" />
                    ) : (
                      <CheckCircle2 className="h-4 w-4 shrink-0 text-success" />
                    )}
                    <span className="flex-1 truncate font-mono text-xs text-foreground">{z.zone}</span>
                    {z.listed && z.result && (
                      <span className="font-mono text-2xs text-destructive">{z.result}</span>
                    )}
                  </div>
                ))}
              </CardContent>
            </Card>
          ))}
        </>
      )}
    </div>
  );
}
