import { useState } from "react";
import { AlertTriangle, CheckCircle2, Circle, Cloud, HelpCircle, Lock, ShieldCheck, XCircle } from "lucide-react";
import { useTranslation } from "react-i18next";
import { PageHeader } from "@/components/common/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { CopyButton } from "@/components/common/CopyButton";
import { api } from "@/lib/api";
import { useApi } from "@/lib/useApi";
import { cn } from "@/lib/utils";
import type { DnssecStatus, TlsSecurityItem } from "@/types";

const statusMeta: Record<
  TlsSecurityItem["status"],
  { tone: "success" | "warning" | "critical" | "muted"; Icon: typeof CheckCircle2 }
> = {
  pass: { tone: "success", Icon: CheckCircle2 },
  missing: { tone: "critical", Icon: XCircle },
  warn: { tone: "warning", Icon: AlertTriangle },
  optional: { tone: "muted", Icon: Circle },
  info: { tone: "muted", Icon: HelpCircle },
};

export function TlsSecurityPage() {
  const { t } = useTranslation();
  const { data, loading, reload } = useApi(() => api.tlsSecurity());
  const [pushing, setPushing] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const pushCf = async () => {
    setPushing(true); setToast(null);
    try {
      const r = await api.cloudflareSyncAll();
      setToast(t("tlsSecurity.cfPushed", { count: r.syncedDomains }));
      await reload();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Cloudflare push failed";
      setToast(msg.includes("token") ? t("tlsSecurity.cfTokenMissing") : msg);
    } finally {
      setPushing(false);
      setTimeout(() => setToast(null), 6000);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title={t("tlsSecurity.title")}
        description={t("tlsSecurity.subtitle")}
        icon={<Lock />}
        actions={
          <Button size="sm" onClick={pushCf} disabled={pushing}>
            <Cloud className={cn("h-4 w-4", pushing && "animate-pulse")} />
            {pushing ? t("tlsSecurity.cfPushing") : t("tlsSecurity.cfPush")}
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
            <Lock className="h-8 w-8 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">{t("tlsSecurity.empty")}</p>
          </CardContent>
        </Card>
      ) : (
        (data ?? []).map((p) => (
          <Card key={p.domain}>
            <CardHeader className="flex-row items-center justify-between space-y-0">
              <CardTitle className="text-base">{p.domain}</CardTitle>
              <Badge
                variant={
                  p.status === "healthy" ? "success" : p.status === "warning" ? "warning" : "critical"
                }
              >
                {t(`status.${p.status}`)}
              </Badge>
            </CardHeader>
            <CardContent className="space-y-3">
              {p.items.map((item) => {
                const meta = statusMeta[item.status];
                return (
                  <div
                    key={item.key}
                    className="flex flex-col gap-1.5 rounded-md border border-border bg-card/40 p-3"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <meta.Icon
                          className={cn(
                            "h-4 w-4 shrink-0",
                            meta.tone === "success" && "text-success",
                            meta.tone === "warning" && "text-warning",
                            meta.tone === "critical" && "text-destructive",
                            meta.tone === "muted" && "text-muted-foreground"
                          )}
                        />
                        <span className="text-sm font-medium text-foreground">{item.label}</span>
                      </div>
                      <Badge
                        variant={
                          meta.tone === "success"
                            ? "success"
                            : meta.tone === "warning"
                              ? "warning"
                              : meta.tone === "critical"
                                ? "critical"
                                : "muted"
                        }
                      >
                        {t(`tlsSecurity.statuses.${item.status}`)}
                      </Badge>
                    </div>
                    <p className="text-2xs text-muted-foreground">{item.detail}</p>
                    <div className="flex items-center gap-2 rounded border border-border bg-background px-2.5 py-1.5">
                      <code className="flex-1 break-all font-mono text-2xs text-muted-foreground">
                        <span className="text-foreground/70">{item.host}</span>
                        {"  "}
                        {item.detected ?? item.expected}
                      </code>
                      <CopyButton value={`${item.host}  ${item.detected ?? item.expected}`} />
                    </div>
                  </div>
                );
              })}

              {p.dnssec && p.dnssec.status !== "unknown" && (
                <DnssecCard dnssec={p.dnssec} domain={p.domain} />
              )}

              {/* MTA-STS policy file body */}
              <div className="space-y-1.5 rounded-md border border-primary/30 bg-primary/[0.05] p-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-foreground">
                    {t("tlsSecurity.policyFile")}
                  </span>
                  <CopyButton value={p.policyBody} />
                </div>
                <p className="text-2xs text-muted-foreground">
                  {t("tlsSecurity.policyHint", { domain: p.domain })}
                </p>
                <pre className="overflow-x-auto rounded bg-background p-2.5 font-mono text-2xs text-foreground/90">
                  {p.policyBody}
                </pre>
              </div>
            </CardContent>
          </Card>
        ))
      )}
    </div>
  );
}

/**
 * Dedicated card for the DNSSEC DS record because this is the #1 confusion
 * point for self-hosters: Cloudflare is their DNS *provider* but not their
 * domain *registrar*. The DS record must be pasted at the registrar (where
 * you bought the domain) — only then does the chain of trust complete and
 * DANE/TLSA actually work.
 *
 * We parse the DS string into key tag / algorithm / digest type / digest
 * fields because many registrar UIs ask for them separately, and copy as
 * a single canonical string for those that accept it whole.
 */
function DnssecCard({ dnssec, domain }: { dnssec: DnssecStatus; domain: string }) {
  const { t } = useTranslation();
  // RFC 4034 §5.1: "<owner> <ttl> IN DS <key-tag> <algorithm> <digest-type> <digest>"
  const fields = (() => {
    if (!dnssec.dsRecord) return null;
    const m = dnssec.dsRecord.match(/DS\s+(\d+)\s+(\d+)\s+(\d+)\s+([0-9a-fA-F\s]+)$/);
    if (!m) return null;
    return {
      keyTag: m[1],
      algorithm: m[2],
      digestType: m[3],
      digest: m[4].replace(/\s+/g, ""),
    };
  })();

  // Status-driven copy. We deliberately don't link to specific registrars —
  // every registrar's UI is different and listing them goes stale fast.
  const isActive = dnssec.status === "active";
  const tone = isActive
    ? "border-success/40 bg-success/[0.05]"
    : "border-warning/40 bg-warning/[0.05]";

  // Pull a top-level domain guess from the DS record's owner ("example.com.")
  // so the instructions name the right thing.
  const zoneName = dnssec.dsRecord
    ? dnssec.dsRecord.split(/\s+/)[0].replace(/\.$/, "")
    : domain;

  return (
    <div className={cn("space-y-3 rounded-md border p-4", tone)}>
      <div className="flex items-center justify-between">
        <span className="flex items-center gap-2 text-sm font-medium text-foreground">
          <ShieldCheck className="h-4 w-4" />
          {t("tlsSecurity.dnssec", { status: dnssec.status })}
        </span>
        {dnssec.dsRecord && <CopyButton value={dnssec.dsRecord} />}
      </div>

      <p className="text-xs text-muted-foreground">{dnssec.hint}</p>

      {dnssec.dsRecord && !isActive && (
        <div className="space-y-2 rounded border border-border bg-background/60 p-3">
          <p className="text-xs font-medium text-foreground">
            {t("tlsSecurity.dnssecSteps.title", { zone: zoneName })}
          </p>

          <ol className="space-y-2 text-xs text-muted-foreground">
            <li className="flex gap-2">
              <span className="font-semibold text-foreground">1.</span>
              <span>
                {t("tlsSecurity.dnssecSteps.s1", { zone: zoneName })}
              </span>
            </li>
            <li className="flex gap-2">
              <span className="font-semibold text-foreground">2.</span>
              <span>{t("tlsSecurity.dnssecSteps.s2")}</span>
            </li>
            <li className="flex gap-2">
              <span className="font-semibold text-foreground">3.</span>
              <span>{t("tlsSecurity.dnssecSteps.s3")}</span>
            </li>
            <li className="flex gap-2">
              <span className="font-semibold text-foreground">4.</span>
              <span>{t("tlsSecurity.dnssecSteps.s4")}</span>
            </li>
          </ol>

          {fields && (
            <div className="grid grid-cols-1 gap-2 pt-1 sm:grid-cols-2">
              <FieldBox label={t("tlsSecurity.dnssecFields.keyTag")} value={fields.keyTag} />
              <FieldBox label={t("tlsSecurity.dnssecFields.algorithm")} value={`${fields.algorithm} (ECDSA-P256-SHA256)`} />
              <FieldBox label={t("tlsSecurity.dnssecFields.digestType")} value={`${fields.digestType} (SHA-256)`} />
              <FieldBox label={t("tlsSecurity.dnssecFields.digest")} value={fields.digest} mono />
            </div>
          )}
        </div>
      )}

      {dnssec.dsRecord && (
        <div className="space-y-1">
          <p className="text-2xs uppercase tracking-wide text-muted-foreground">
            {t("tlsSecurity.dnssecFull")}
          </p>
          <pre className="overflow-x-auto rounded bg-background p-2.5 font-mono text-2xs text-foreground/90">
            {dnssec.dsRecord}
          </pre>
        </div>
      )}
    </div>
  );
}

function FieldBox({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex flex-col gap-1 rounded border border-border bg-card/40 p-2">
      <span className="text-2xs uppercase tracking-wide text-muted-foreground">{label}</span>
      <div className="flex items-center gap-1.5">
        <span className={cn("flex-1 break-all text-xs text-foreground", mono && "font-mono")}>
          {value}
        </span>
        <CopyButton value={value} />
      </div>
    </div>
  );
}
