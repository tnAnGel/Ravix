import { useRef } from "react";
import { ShieldCheck, Upload } from "lucide-react";
import { useTranslation } from "react-i18next";
import { PageHeader } from "@/components/common/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
import { api } from "@/lib/api";
import { useApi } from "@/lib/useApi";
import { cn, timeAgo } from "@/lib/utils";

export function DmarcPage() {
  const { t } = useTranslation();
  const { data: summary, loading, reload } = useApi(() => api.dmarcSummary());
  const { data: sources, reload: reloadSources } = useApi(() => api.dmarcSources(), []);
  const { data: reports, reload: reloadReports } = useApi(() => api.dmarcReports(), []);
  const fileInput = useRef<HTMLInputElement>(null);

  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const buf = await file.arrayBuffer();
    let binary = "";
    const bytes = new Uint8Array(buf);
    for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
    const b64 = btoa(binary);
    try {
      await api.dmarcIngest(file.name, b64);
      reload();
      reloadSources();
      reloadReports();
    } catch {
      // duplicate / parse error — ignored; UI just won't change
    }
    if (fileInput.current) fileInput.current.value = "";
  };

  const totals = (summary ?? []).reduce(
    (acc, s) => ({ total: acc.total + s.total, pass: acc.pass + s.pass, fail: acc.fail + s.fail }),
    { total: 0, pass: 0, fail: 0 }
  );
  const overallRate = totals.total ? Math.round((totals.pass / totals.total) * 100) : 100;

  return (
    <div className="space-y-6">
      <PageHeader
        title={t("dmarc.title")}
        description={t("dmarc.subtitle")}
        icon={<ShieldCheck />}
        actions={
          <>
            <input ref={fileInput} type="file" accept=".xml,.gz,.zip" hidden onChange={onFile} />
            <Button size="sm" onClick={() => fileInput.current?.click()}>
              <Upload className="h-4 w-4" /> {t("dmarc.upload")}
            </Button>
          </>
        }
      />

      {loading ? (
        <Skeleton className="h-40 w-full" />
      ) : (summary ?? []).length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-14 text-center">
            <ShieldCheck className="h-8 w-8 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">{t("dmarc.empty")}</p>
            <p className="max-w-md text-2xs text-muted-foreground">{t("dmarc.emptyHint")}</p>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Overall */}
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <Stat label={t("dmarc.passRate")} value={`${overallRate}%`} tone={overallRate >= 95 ? "success" : overallRate >= 80 ? "warning" : "critical"} />
            <Stat label={t("dmarc.totalMessages")} value={totals.total.toLocaleString()} />
            <Stat label={t("dmarc.aligned")} value={totals.pass.toLocaleString()} tone="success" />
            <Stat label={t("dmarc.unaligned")} value={totals.fail.toLocaleString()} tone={totals.fail ? "critical" : undefined} />
          </div>

          {/* Per-domain */}
          <Card>
            <CardHeader><CardTitle className="text-base">{t("dmarc.byDomain")}</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              {(summary ?? []).map((s) => (
                <div key={s.domain} className="space-y-1.5">
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-medium text-foreground">{s.domain}</span>
                    <span className="text-muted-foreground">
                      {t("dmarc.passOfTotal", { pass: s.pass, total: s.total })} ·{" "}
                      <span className={cn(s.passRate >= 95 ? "text-success" : s.passRate >= 80 ? "text-warning" : "text-destructive")}>
                        {s.passRate}%
                      </span>
                    </span>
                  </div>
                  <Progress
                    value={s.passRate}
                    indicatorClassName={s.passRate >= 95 ? "bg-success" : s.passRate >= 80 ? "bg-warning" : "bg-destructive"}
                  />
                </div>
              ))}
            </CardContent>
          </Card>

          {/* Sources */}
          <Card>
            <CardHeader><CardTitle className="text-base">{t("dmarc.topSources")}</CardTitle></CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("dmarc.sourceIp")}</TableHead>
                    <TableHead className="text-right">{t("dmarc.messages")}</TableHead>
                    <TableHead className="text-right">{t("dmarc.aligned")}</TableHead>
                    <TableHead className="text-right">{t("dmarc.unaligned")}</TableHead>
                    <TableHead className="text-right">{t("dmarc.passRate")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(sources ?? []).map((s) => {
                    const rate = s.count ? Math.round((s.pass / s.count) * 100) : 0;
                    return (
                      <TableRow key={s.sourceIp}>
                        <TableCell className="font-mono text-sm">{s.sourceIp}</TableCell>
                        <TableCell className="text-right tabular-nums">{s.count.toLocaleString()}</TableCell>
                        <TableCell className="text-right tabular-nums text-success">{s.pass.toLocaleString()}</TableCell>
                        <TableCell className={cn("text-right tabular-nums", s.fail ? "text-destructive" : "text-muted-foreground")}>
                          {s.fail.toLocaleString()}
                        </TableCell>
                        <TableCell className="text-right">
                          <Badge variant={rate >= 95 ? "success" : rate >= 80 ? "warning" : "critical"}>{rate}%</Badge>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          {/* Recent reports */}
          <Card>
            <CardHeader><CardTitle className="text-base">{t("dmarc.recentReports")}</CardTitle></CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("dmarc.reporter")}</TableHead>
                    <TableHead>{t("dmarc.domain")}</TableHead>
                    <TableHead className="text-right">{t("dmarc.messages")}</TableHead>
                    <TableHead className="text-right">{t("dmarc.received")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(reports ?? []).slice(0, 50).map((r) => (
                    <TableRow key={r.id}>
                      <TableCell className="text-sm">{r.orgName ?? "—"}</TableCell>
                      <TableCell className="font-mono text-sm">{r.domain}</TableCell>
                      <TableCell className="text-right tabular-nums">{r.totalCount.toLocaleString()}</TableCell>
                      <TableCell className="text-right text-xs text-muted-foreground">{timeAgo(r.receivedAt)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: "success" | "warning" | "critical" }) {
  return (
    <Card className="p-4">
      <p className={cn(
        "text-2xl font-semibold tabular-nums text-foreground",
        tone === "success" && "text-success",
        tone === "warning" && "text-warning",
        tone === "critical" && "text-destructive"
      )}>
        {value}
      </p>
      <p className="mt-0.5 text-2xs text-muted-foreground">{label}</p>
    </Card>
  );
}
