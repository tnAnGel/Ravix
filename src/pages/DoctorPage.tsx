import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Copy,
  HelpCircle,
  Loader2,
  Server,
  Wrench,
  XCircle,
} from "lucide-react";
import { PageHeader } from "@/components/common/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { api } from "@/lib/api";
import type {
  DoctorCheck,
  DoctorReport,
  DoctorSeverity,
  ProviderPlaybook,
} from "@/types";

const SEV_META: Record<
  DoctorSeverity,
  { Icon: typeof CheckCircle2; tone: string; ring: string }
> = {
  PASS: { Icon: CheckCircle2, tone: "text-success", ring: "border-success/30 bg-success/[0.05]" },
  WARN: { Icon: AlertTriangle, tone: "text-warning", ring: "border-warning/30 bg-warning/[0.05]" },
  FAIL: { Icon: XCircle, tone: "text-destructive", ring: "border-destructive/30 bg-destructive/[0.05]" },
  INFO: { Icon: HelpCircle, tone: "text-muted-foreground", ring: "border-border bg-card/40" },
};

export function DoctorPage() {
  const { t } = useTranslation();
  const [report, setReport] = useState<DoctorReport | null>(null);
  const [running, setRunning] = useState(false);
  const [fixing, setFixing] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [playbook, setPlaybook] = useState<ProviderPlaybook | null>(null);

  const run = async () => {
    setRunning(true);
    setToast(null);
    try {
      const r = await api.doctorRun();
      setReport(r);
      // If outbound 25 is anything but a clean PASS, fetch the provider
      // playbook so we can show a ready-to-send support ticket.
      const out25 = r.checks.find((c) => c.key === "out25");
      if (out25 && out25.severity !== "PASS") {
        api.providerPlaybook().then(setPlaybook).catch(() => setPlaybook(null));
      } else {
        setPlaybook(null);
      }
    } catch (e) {
      setToast(e instanceof Error ? e.message : "diagnosis failed");
    } finally {
      setRunning(false);
    }
  };

  // Run once on mount.
  useEffect(() => {
    run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const applyFix = async (fix: string) => {
    setFixing(fix);
    setToast(null);
    try {
      const r = await api.doctorFix(fix);
      setToast(r.detail);
      // Re-run so the operator sees the new state.
      await run();
    } catch (e) {
      setToast(e instanceof Error ? e.message : "fix failed");
    } finally {
      setFixing(null);
    }
  };

  const overallTone =
    report?.overall === "healthy"
      ? "success"
      : report?.overall === "degraded"
        ? "warning"
        : "critical";

  // Group checks by category for readability.
  const byCategory = (report?.checks ?? []).reduce<Record<string, DoctorCheck[]>>(
    (acc, c) => {
      (acc[c.category] ??= []).push(c);
      return acc;
    },
    {}
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title={t("doctor.title")}
        description={t("doctor.subtitle")}
        icon={<Activity />}
        actions={
          <Button size="sm" onClick={run} disabled={running}>
            {running ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Activity className="h-4 w-4" />
            )}
            {running ? t("doctor.running") : t("doctor.rerun")}
          </Button>
        }
      />

      {toast && (
        <div className="rounded-md border border-primary/30 bg-primary/10 px-3 py-2 text-sm text-foreground">
          {toast}
        </div>
      )}

      {/* Overall verdict */}
      {report && (
        <Card className={cn("p-5", SEV_META[report.failures > 0 ? "FAIL" : report.warnings > 0 ? "WARN" : "PASS"].ring)}>
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              {report.overall === "healthy" ? (
                <CheckCircle2 className="h-8 w-8 text-success" />
              ) : report.overall === "degraded" ? (
                <AlertTriangle className="h-8 w-8 text-warning" />
              ) : (
                <XCircle className="h-8 w-8 text-destructive" />
              )}
              <div>
                <p className="text-lg font-semibold text-foreground">
                  {t(`doctor.overall.${report.overall}`)}
                </p>
                <p className="text-sm text-muted-foreground">
                  {t("doctor.summary", {
                    pass: report.passed,
                    warn: report.warnings,
                    fail: report.failures,
                  })}
                </p>
              </div>
            </div>
            <Badge variant={overallTone}>{report.checks.length} {t("doctor.checks")}</Badge>
          </div>
        </Card>
      )}

      {/* Provider playbook — shown when outbound 25 is blocked/asymmetric */}
      {playbook && (
        <Card className="border-warning/30 bg-warning/[0.04]">
          <CardContent className="space-y-3 p-5">
            <div className="flex items-center gap-2">
              <Server className="h-5 w-5 text-warning" />
              <span className="text-sm font-semibold text-foreground">
                {t("doctor.playbook.title", { provider: playbook.org })}
              </span>
            </div>
            <p className="text-xs leading-relaxed text-muted-foreground">
              {playbook.policyNote}
            </p>
            <div className="grid grid-cols-2 gap-2 text-2xs sm:grid-cols-4">
              <PlaybookStat label="ASN" value={playbook.asn} />
              <PlaybookStat label="IPv4" value={playbook.ip || "—"} />
              <PlaybookStat label="IPv6" value={playbook.ipv6 || "—"} />
              <PlaybookStat
                label={t("doctor.playbook.port25")}
                value={`v4 ${playbook.port25v4 ? "✓" : "✗"} · v6 ${playbook.port25v6 ? "✓" : "✗"}`}
              />
            </div>
            <div className="rounded-md border border-border bg-background p-3">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-xs font-medium text-foreground">
                  {t("doctor.playbook.ticket")}
                </span>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    navigator.clipboard.writeText(
                      `Subject: ${playbook.ticketSubject}\n\n${playbook.ticketBody}`
                    );
                    setToast(t("doctor.playbook.copied"));
                  }}
                >
                  <Copy className="h-3.5 w-3.5" /> {t("common.copy")}
                </Button>
              </div>
              <p className="mb-1 font-mono text-2xs text-muted-foreground">
                {playbook.ticketSubject}
              </p>
              <pre className="max-h-56 overflow-y-auto whitespace-pre-wrap break-words font-mono text-2xs text-foreground/90">
                {playbook.ticketBody}
              </pre>
            </div>
          </CardContent>
        </Card>
      )}

      {running && !report ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-16 text-muted-foreground">
            <Loader2 className="h-8 w-8 animate-spin" />
            <p className="text-sm">{t("doctor.running")}</p>
          </CardContent>
        </Card>
      ) : (
        Object.entries(byCategory).map(([category, checks]) => (
          <div key={category} className="space-y-2">
            <h3 className="text-2xs font-medium uppercase tracking-wider text-muted-foreground">
              {t(`doctor.category.${category}`, category)}
            </h3>
            {checks.map((c) => {
              const meta = SEV_META[c.severity];
              return (
                <Card key={c.key} className={cn("border", meta.ring)}>
                  <CardContent className="flex items-start justify-between gap-4 p-4">
                    <div className="flex min-w-0 items-start gap-3">
                      <meta.Icon className={cn("mt-0.5 h-5 w-5 shrink-0", meta.tone)} />
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-foreground">{c.label}</p>
                        <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
                          {c.detail}
                        </p>
                      </div>
                    </div>
                    {c.fix && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="shrink-0"
                        disabled={fixing === c.fix}
                        onClick={() => applyFix(c.fix!)}
                      >
                        {fixing === c.fix ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Wrench className="h-4 w-4" />
                        )}
                        {c.fixLabel ?? t("doctor.fix")}
                      </Button>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        ))
      )}
    </div>
  );
}

function PlaybookStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded border border-border bg-card/40 px-2 py-1.5">
      <p className="uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-0.5 break-all font-mono text-foreground">{value}</p>
    </div>
  );
}
