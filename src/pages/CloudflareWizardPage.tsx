import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  ChevronRight,
  Cloud,
  Globe,
  KeyRound,
  Loader2,
  Network,
  XCircle,
  ListChecks,
} from "lucide-react";
import { PageHeader } from "@/components/common/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "@/lib/api";
import { useApi } from "@/lib/useApi";
import { cn } from "@/lib/utils";
import type { CloudflareApplyResult, CloudflarePlan, CloudflareZone } from "@/types";

type Step = "token" | "zone" | "hostname" | "review" | "done";
const STEPS: Step[] = ["token", "zone", "hostname", "review", "done"];

export function CloudflareWizardPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { data: status, reload: reloadStatus } = useApi(() => api.cloudflareStatus());

  // Skip the token step if we already have one that verifies.
  const initialStep: Step =
    status?.configured && status?.valid ? "zone" : "token";
  const [step, setStep] = useState<Step>(initialStep);
  useEffect(() => {
    if (status?.configured && status?.valid && step === "token") setStep("zone");
  }, [status, step]);

  // Wizard state.
  const [token, setToken] = useState("");
  const [tokenError, setTokenError] = useState("");
  const [zone, setZone] = useState<CloudflareZone | null>(null);
  const [subdomain, setSubdomain] = useState("mail");
  const [ip, setIp] = useState("");
  const [ipv6, setIpv6] = useState("");
  const [plan, setPlan] = useState<CloudflarePlan | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [applied, setApplied] = useState<CloudflareApplyResult[] | null>(null);

  // Pre-fill the public IPs once we know them. IPv6 is best-effort — many
  // servers don't have it; planner skips AAAA when ipv6 is blank.
  const { data: ipData } = useApi(() => api.cloudflarePublicIp(), []);
  useEffect(() => {
    if (ipData?.ip && !ip) setIp(ipData.ip);
    if (ipData?.ipv6 && !ipv6) setIpv6(ipData.ipv6);
  }, [ipData]);

  const hostname = useMemo(
    () => (subdomain && zone ? `${subdomain}.${zone.name}` : ""),
    [subdomain, zone]
  );

  const goto = (s: Step) => { setError(""); setStep(s); };

  const stepIndex = STEPS.indexOf(step);

  return (
    <div className="space-y-6">
      <PageHeader
        title={t("cloudflare.title")}
        description={t("cloudflare.subtitle")}
        icon={<Cloud />}
        actions={
          <Button variant="outline" size="sm" asChild>
            <Link to="/domains"><ArrowLeft className="h-4 w-4" /> {t("cloudflare.backToDomains")}</Link>
          </Button>
        }
      />

      <Stepper current={stepIndex} />

      <Card>
        <CardContent className="space-y-5 p-6">
          {step === "token" && (
            <TokenStep
              token={token}
              setToken={setToken}
              busy={busy}
              error={tokenError}
              onSave={async () => {
                setBusy(true); setTokenError("");
                try {
                  await api.cloudflareSaveToken(token.trim());
                  await reloadStatus();
                  setToken("");
                  goto("zone");
                } catch (e) {
                  setTokenError(e instanceof Error ? e.message : t("cloudflare.tokenError"));
                } finally { setBusy(false); }
              }}
              hint={
                status?.configured && !status?.valid
                  ? t("cloudflare.tokenInvalidExisting")
                  : undefined
              }
            />
          )}

          {step === "zone" && (
            <ZoneStep
              picked={zone}
              onPick={(z) => { setZone(z); goto("hostname"); }}
            />
          )}

          {step === "hostname" && zone && (
            <HostnameStep
              zone={zone}
              subdomain={subdomain}
              setSubdomain={setSubdomain}
              ip={ip}
              setIp={setIp}
              onBack={() => goto("zone")}
              busy={busy}
              error={error}
              onNext={async () => {
                setBusy(true); setError("");
                try {
                  const p = await api.cloudflarePlan(zone.id, hostname, ip, ipv6 || undefined);
                  setPlan(p);
                  goto("review");
                } catch (e) {
                  setError(e instanceof Error ? e.message : t("cloudflare.planError"));
                } finally { setBusy(false); }
              }}
            />
          )}

          {step === "review" && plan && (
            <ReviewStep
              plan={plan}
              busy={busy}
              error={error}
              onBack={() => goto("hostname")}
              onApply={async () => {
                setBusy(true); setError("");
                try {
                  const r = await api.cloudflareApply(plan.zone ? zone!.id : "", plan.hostname, plan.ip, ipv6 || undefined);
                  setApplied(r.results);
                  goto("done");
                } catch (e) {
                  setError(e instanceof Error ? e.message : t("cloudflare.applyError"));
                } finally { setBusy(false); }
              }}
            />
          )}

          {step === "done" && applied && plan && (
            <DoneStep
              hostname={plan.hostname}
              results={applied}
              onFinish={() => navigate("/domains")}
            />
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// --- Steps ------------------------------------------------------------------

function Stepper({ current }: { current: number }) {
  const { t } = useTranslation();
  return (
    <div className="flex items-center gap-1.5 overflow-x-auto">
      {STEPS.map((s, i) => (
        <div key={s} className="flex items-center gap-1.5">
          <div
            className={cn(
              "flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-medium transition-colors",
              i === current
                ? "bg-primary text-primary-foreground"
                : i < current
                  ? "bg-primary/15 text-primary"
                  : "bg-secondary text-muted-foreground"
            )}
          >
            <span className={cn(
              "flex h-5 w-5 items-center justify-center rounded-full text-2xs",
              i === current ? "bg-primary-foreground/20" : i < current ? "bg-primary/20" : "bg-background/40"
            )}>
              {i < current ? <CheckCircle2 className="h-3 w-3" /> : i + 1}
            </span>
            {t(`cloudflare.steps.${s}`)}
          </div>
          {i < STEPS.length - 1 && <div className="h-px w-4 bg-border" />}
        </div>
      ))}
    </div>
  );
}

function TokenStep({
  token, setToken, busy, error, onSave, hint,
}: {
  token: string; setToken: (s: string) => void; busy: boolean; error: string;
  onSave: () => void; hint?: string;
}) {
  const { t } = useTranslation();
  return (
    <>
      <SectionTitle icon={KeyRound} title={t("cloudflare.tokenTitle")} />
      <p className="text-sm text-muted-foreground">{t("cloudflare.tokenHint")}</p>
      <a
        href="https://dash.cloudflare.com/profile/api-tokens"
        target="_blank" rel="noreferrer"
        className="inline-flex items-center gap-1 text-sm text-primary hover:underline"
      >
        {t("cloudflare.openCfTokens")} <ChevronRight className="h-3.5 w-3.5" />
      </a>
      <div className="space-y-1.5 rounded-md border border-border bg-card/40 p-3 text-xs text-muted-foreground">
        <p className="font-medium text-foreground">{t("cloudflare.tokenScopeTitle")}</p>
        <ul className="list-disc space-y-0.5 pl-5">
          <li><span className="font-mono">Zone → Zone → Read</span></li>
          <li><span className="font-mono">Zone → DNS → Edit</span></li>
        </ul>
      </div>
      {hint && <p className="text-xs text-warning">{hint}</p>}
      <div className="space-y-1.5">
        <Label>{t("cloudflare.token")}</Label>
        <Input
          type="password"
          value={token}
          onChange={(e) => setToken(e.target.value)}
          placeholder="cf_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
          className="font-mono"
        />
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
      <div className="flex justify-end">
        <Button onClick={onSave} disabled={busy || token.trim().length < 20}>
          {busy && <Loader2 className="h-4 w-4 animate-spin" />}
          {t("cloudflare.connect")}
        </Button>
      </div>
    </>
  );
}

function ZoneStep({ picked, onPick }: { picked: CloudflareZone | null; onPick: (z: CloudflareZone) => void }) {
  const { t } = useTranslation();
  const { data, loading, error } = useApi(() => api.cloudflareZones(), []);

  if (loading) return <Skeleton className="h-32 w-full" />;
  if (error) return <p className="text-sm text-destructive">{t("cloudflare.zonesError")}: {String(error)}</p>;

  const zones = data ?? [];
  if (zones.length === 0) {
    return <p className="text-sm text-muted-foreground">{t("cloudflare.noZones")}</p>;
  }
  return (
    <>
      <SectionTitle icon={Globe} title={t("cloudflare.zoneTitle")} />
      <p className="text-sm text-muted-foreground">{t("cloudflare.zoneHint")}</p>
      <ul className="space-y-2">
        {zones.map((z) => (
          <li key={z.id}>
            <button
              type="button"
              onClick={() => onPick(z)}
              className={cn(
                "flex w-full items-center justify-between rounded-md border px-4 py-3 text-left transition-colors",
                picked?.id === z.id
                  ? "border-primary bg-primary/[0.08]"
                  : "border-border bg-card/40 hover:border-primary/40"
              )}
            >
              <div>
                <p className="font-medium text-foreground">{z.name}</p>
                <p className="text-2xs text-muted-foreground">
                  <Badge variant={z.status === "active" ? "success" : "warning"} className="mr-2">{z.status}</Badge>
                  <span className="font-mono">{z.id.slice(0, 12)}…</span>
                </p>
              </div>
              <ChevronRight className="h-4 w-4 text-muted-foreground" />
            </button>
          </li>
        ))}
      </ul>
    </>
  );
}

function HostnameStep({
  zone, subdomain, setSubdomain, ip, setIp, onBack, onNext, busy, error,
}: {
  zone: CloudflareZone;
  subdomain: string; setSubdomain: (s: string) => void;
  ip: string; setIp: (s: string) => void;
  onBack: () => void; onNext: () => void; busy: boolean; error: string;
}) {
  const { t } = useTranslation();
  const fqdn = `${subdomain || "@"}.${zone.name}`.replace(/^@\./, "");
  const ipValid = /^\d{1,3}(\.\d{1,3}){3}$/.test(ip.trim());

  return (
    <>
      <SectionTitle icon={Network} title={t("cloudflare.hostnameTitle")} />
      <p className="text-sm text-muted-foreground">{t("cloudflare.hostnameHint")}</p>

      <div className="space-y-1.5">
        <Label>{t("cloudflare.subdomain")}</Label>
        <div className="flex items-center gap-2">
          <Input
            value={subdomain}
            onChange={(e) => setSubdomain(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""))}
            placeholder="mail"
            className="max-w-[180px] font-mono"
          />
          <span className="font-mono text-sm text-muted-foreground">.{zone.name}</span>
        </div>
        <p className="text-2xs text-muted-foreground">
          {t("cloudflare.subdomainHint", { fqdn })}
        </p>
      </div>

      <div className="space-y-1.5">
        <Label>{t("cloudflare.ip")}</Label>
        <Input
          value={ip}
          onChange={(e) => setIp(e.target.value.trim())}
          placeholder="1.2.3.4"
          className="max-w-xs font-mono"
        />
        <p className="text-2xs text-muted-foreground">{t("cloudflare.ipHint")}</p>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <div className="flex items-center justify-between">
        <Button variant="ghost" size="sm" onClick={onBack}>
          <ArrowLeft className="h-4 w-4" /> {t("common.back")}
        </Button>
        <Button onClick={onNext} disabled={busy || !subdomain || !ipValid}>
          {busy && <Loader2 className="h-4 w-4 animate-spin" />}
          {t("cloudflare.previewPlan")} <ArrowRight className="h-4 w-4" />
        </Button>
      </div>
    </>
  );
}

function ReviewStep({
  plan, busy, error, onBack, onApply,
}: {
  plan: CloudflarePlan; busy: boolean; error: string;
  onBack: () => void; onApply: () => void;
}) {
  const { t } = useTranslation();
  const toCreate = plan.records.filter((r) => r.action === "CREATE").length;
  const toUpdate = plan.records.filter((r) => r.action === "UPDATE").length;
  const unchanged = plan.records.filter((r) => r.action === "UNCHANGED").length;
  return (
    <>
      <SectionTitle icon={ListChecks} title={t("cloudflare.reviewTitle")} />
      <p className="text-sm text-muted-foreground">
        {t("cloudflare.reviewIntro", { hostname: plan.hostname, zone: plan.zone })}
      </p>
      <div className="flex gap-2">
        <Badge variant={toCreate ? "info" : "muted"}>{t("cloudflare.toCreate", { count: toCreate })}</Badge>
        <Badge variant={toUpdate ? "warning" : "muted"}>{t("cloudflare.toUpdate", { count: toUpdate })}</Badge>
        <Badge variant={unchanged ? "success" : "muted"}>{t("cloudflare.unchanged", { count: unchanged })}</Badge>
      </div>
      <ul className="space-y-2">
        {plan.records.map((r, i) => (
          <li key={i} className="rounded-md border border-border bg-card/40 p-3">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Badge variant="secondary" className="font-mono">{r.label}</Badge>
                <code className="text-xs text-muted-foreground">{r.name}</code>
              </div>
              <ActionBadge action={r.action} />
            </div>
            <div className="mt-2 grid gap-1 text-2xs font-mono">
              <Row label={t("cloudflare.expected")} value={r.expected} tone="primary" />
              {r.current && r.current !== r.expected && (
                <Row label={t("cloudflare.current")} value={r.current} tone="muted" />
              )}
            </div>
            {r.note && <p className="mt-1.5 text-2xs text-muted-foreground">{r.note}</p>}
          </li>
        ))}
      </ul>
      {error && <p className="text-sm text-destructive">{error}</p>}
      <div className="flex items-center justify-between border-t border-border pt-4">
        <Button variant="ghost" size="sm" onClick={onBack}>
          <ArrowLeft className="h-4 w-4" /> {t("common.back")}
        </Button>
        <Button onClick={onApply} disabled={busy || (toCreate + toUpdate === 0)}>
          {busy && <Loader2 className="h-4 w-4 animate-spin" />}
          {t("cloudflare.apply")}
        </Button>
      </div>
    </>
  );
}

function DoneStep({
  hostname, results, onFinish,
}: {
  hostname: string;
  results: CloudflareApplyResult[];
  onFinish: () => void;
}) {
  const { t } = useTranslation();
  const ok = results.every((r) => r.ok);
  return (
    <>
      <SectionTitle
        icon={ok ? CheckCircle2 : XCircle}
        title={ok ? t("cloudflare.doneTitle") : t("cloudflare.doneTitleErr")}
      />
      <p className="text-sm text-muted-foreground">
        {ok ? t("cloudflare.doneIntro", { hostname }) : t("cloudflare.doneIntroErr")}
      </p>
      <ul className="space-y-2">
        {results.map((r, i) => (
          <li key={i} className="flex items-center justify-between rounded-md border border-border bg-card/40 px-3 py-2">
            <div className="flex items-center gap-2">
              {r.ok
                ? <CheckCircle2 className="h-4 w-4 text-success" />
                : <XCircle className="h-4 w-4 text-destructive" />}
              <Badge variant="secondary" className="font-mono">{r.label}</Badge>
              <code className="text-xs text-muted-foreground">{r.name}</code>
            </div>
            <span className="text-2xs text-muted-foreground">{r.detail}</span>
          </li>
        ))}
      </ul>
      <p className="rounded-md border border-info/30 bg-info/[0.06] p-3 text-xs text-foreground/90">
        {t("cloudflare.propagationHint")}
      </p>
      <div className="flex justify-end">
        <Button onClick={onFinish}>{t("cloudflare.openDomain")}</Button>
      </div>
    </>
  );
}

// --- Small helpers ---------------------------------------------------------

function SectionTitle({ icon: Icon, title }: { icon: typeof Cloud; title: string }) {
  return (
    <div className="flex items-center gap-2">
      <Icon className="h-4 w-4 text-primary" />
      <h3 className="text-base font-semibold text-foreground">{title}</h3>
    </div>
  );
}

function ActionBadge({ action }: { action: CloudflarePlan["records"][number]["action"] }) {
  const { t } = useTranslation();
  const map = {
    CREATE:    ["info" as const, "cloudflare.action.create"],
    UPDATE:    ["warning" as const, "cloudflare.action.update"],
    UNCHANGED: ["success" as const, "cloudflare.action.unchanged"],
    SKIP:      ["muted" as const, "cloudflare.action.skip"],
  } as const;
  const [variant, key] = map[action];
  return <Badge variant={variant}>{t(key)}</Badge>;
}

function Row({ label, value, tone }: { label: string; value: string; tone: "primary" | "muted" }) {
  return (
    <div className="flex items-start gap-2">
      <span className="w-16 shrink-0 uppercase tracking-wide text-muted-foreground">{label}</span>
      <code className={cn("break-all", tone === "primary" ? "text-foreground" : "text-muted-foreground")}>
        {value}
      </code>
    </div>
  );
}
