import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Loader2,
  Lock,
  Mail,
  PartyPopper,
  Server,
  ShieldCheck,
} from "lucide-react";
import { LogoMark } from "@/components/common/Logo";
import { Stepper, type Step } from "@/components/common/Stepper";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

function buildSteps(t: TFunction): Step[] {
  return [
    { id: "welcome", title: t("setup.steps.welcome"), description: t("setup.steps.welcomeDesc") },
    { id: "hostname", title: t("setup.steps.hostname"), description: t("setup.steps.hostnameDesc") },
    { id: "admin", title: t("setup.steps.admin"), description: t("setup.steps.adminDesc") },
    { id: "ssl", title: t("setup.steps.ssl"), description: t("setup.steps.sslDesc") },
    { id: "stack", title: t("setup.steps.stack"), description: t("setup.steps.stackDesc") },
    { id: "finish", title: t("setup.steps.finish"), description: t("setup.steps.finishDesc") },
  ];
}

function buildStackChecks(t: TFunction) {
  return [
    { id: "postfix", label: t("setup.stack.checks.postfix"), detail: t("setup.stack.checks.postfixDetail") },
    { id: "dovecot", label: t("setup.stack.checks.dovecot"), detail: t("setup.stack.checks.dovecotDetail") },
    { id: "rspamd", label: t("setup.stack.checks.rspamd"), detail: t("setup.stack.checks.rspamdDetail") },
    { id: "ports", label: t("setup.stack.checks.ports"), detail: t("setup.stack.checks.portsDetail") },
    { id: "dns", label: t("setup.stack.checks.dns"), detail: t("setup.stack.checks.dnsDetail") },
  ];
}

export function SetupWizard() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const steps = buildSteps(t);
  const [step, setStep] = useState(0);
  const [form, setForm] = useState({
    mailHostname: "mail.example.com",
    primaryDomain: "example.com",
    adminEmail: "admin@example.com",
    adminPassword: "",
    sslProvider: "lets-encrypt",
    enableRspamd: true,
    enableWebmail: true,
    enableCampaigns: false,
  });

  const update = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  const passwordWeak = form.adminPassword.length > 0 && form.adminPassword.length < 10;
  const canContinue =
    step !== 2 || (form.adminEmail.includes("@") && form.adminPassword.length >= 10);

  const next = () => setStep((s) => Math.min(steps.length - 1, s + 1));
  const back = () => setStep((s) => Math.max(0, s - 1));

  return (
    <div className="min-h-screen">
      <header className="flex h-16 items-center justify-between border-b border-border px-6">
        <div className="flex items-center gap-2.5">
          <LogoMark size={28} />
          <span className="font-semibold tracking-tight">Ravix</span>
          <Badge variant="muted" className="ml-1">
            {t("setup.firstRunSetup")}
          </Badge>
        </div>
        <span className="text-xs text-muted-foreground">
          {t("setup.stepOf", { current: step + 1, total: steps.length })}
        </span>
      </header>

      <div className="mx-auto grid max-w-5xl gap-8 px-6 py-10 lg:grid-cols-[240px_1fr]">
        <aside className="hidden lg:block">
          <Stepper steps={steps} current={step} />
        </aside>

        <div className="min-w-0">
          <Card className="p-7">
            {step === 0 && <WelcomeStep />}
            {step === 1 && <HostnameStep form={form} update={update} />}
            {step === 2 && (
              <AdminStep
                form={form}
                update={update}
                passwordWeak={passwordWeak}
              />
            )}
            {step === 3 && <SslStep form={form} update={update} />}
            {step === 4 && <StackStep form={form} update={update} />}
            {step === 5 && <FinishStep form={form} />}

            <div className="mt-8 flex items-center justify-between border-t border-border pt-5">
              <Button
                variant="ghost"
                onClick={step === 0 ? () => navigate("/login") : back}
              >
                <ArrowLeft className="h-4 w-4" />
                {step === 0 ? t("setup.backToLogin") : t("common.back")}
              </Button>
              {step < steps.length - 1 ? (
                <Button onClick={next} disabled={!canContinue}>
                  {t("common.continue")} <ArrowRight className="h-4 w-4" />
                </Button>
              ) : (
                <Button onClick={() => navigate("/")}>
                  {t("setup.launch")} <ArrowRight className="h-4 w-4" />
                </Button>
              )}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}

type FormShape = SetupForm;
interface SetupForm {
  mailHostname: string;
  primaryDomain: string;
  adminEmail: string;
  adminPassword: string;
  sslProvider: string;
  enableRspamd: boolean;
  enableWebmail: boolean;
  enableCampaigns: boolean;
}
type UpdateFn = <K extends keyof SetupForm>(k: K, v: SetupForm[K]) => void;

function StepHeading({
  icon: Icon,
  title,
  description,
}: {
  icon: typeof Server;
  title: string;
  description: string;
}) {
  return (
    <div className="mb-6 flex items-start gap-3">
      <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
        <Icon className="h-5 w-5" />
      </span>
      <div>
        <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
    </div>
  );
}

function WelcomeStep() {
  const { t } = useTranslation();
  return (
    <div>
      <StepHeading
        icon={PartyPopper}
        title={t("setup.welcome.title")}
        description={t("setup.welcome.subtitle")}
      />
      <div className="space-y-3 text-sm leading-relaxed text-muted-foreground">
        <p>{t("setup.welcome.body")}</p>
        <div className="rounded-md border border-info/30 bg-info/10 p-3.5 text-info-foreground">
          <div className="flex gap-2.5">
            <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-info" />
            <p className="text-sm text-foreground/90">
              {t("setup.welcome.dnsNote")}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

function HostnameStep({ form, update }: { form: FormShape; update: UpdateFn }) {
  const { t } = useTranslation();
  return (
    <div>
      <StepHeading
        icon={Server}
        title={t("setup.host.title")}
        description={t("setup.host.subtitle")}
      />
      <div className="space-y-5">
        <Field
          label={t("setup.host.mailHostname")}
          hint={t("setup.host.mailHostnameHint")}
        >
          <Input
            value={form.mailHostname}
            onChange={(e) => update("mailHostname", e.target.value)}
            placeholder="mail.example.com"
            className="font-mono"
          />
        </Field>
        <Field
          label={t("setup.host.primaryDomain")}
          hint={t("setup.host.primaryDomainHint")}
        >
          <Input
            value={form.primaryDomain}
            onChange={(e) => update("primaryDomain", e.target.value)}
            placeholder="example.com"
            className="font-mono"
          />
        </Field>
        <div className="rounded-md border border-warning/30 bg-warning/10 p-3.5">
          <div className="flex gap-2.5">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
            <p className="text-sm text-foreground/90">
              {t("setup.host.ptrWarning")}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

function AdminStep({
  form,
  update,
  passwordWeak,
}: {
  form: FormShape;
  update: UpdateFn;
  passwordWeak: boolean;
}) {
  const { t } = useTranslation();
  const valid = form.adminEmail.includes("@");
  return (
    <div>
      <StepHeading
        icon={Lock}
        title={t("setup.admin.title")}
        description={t("setup.admin.subtitle")}
      />
      <div className="space-y-5">
        <Field label={t("setup.admin.email")}>
          <Input
            type="email"
            value={form.adminEmail}
            onChange={(e) => update("adminEmail", e.target.value)}
            placeholder="admin@example.com"
            className={cn(
              "font-mono",
              !valid && form.adminEmail && "border-destructive"
            )}
          />
          {!valid && form.adminEmail && (
            <p className="text-xs text-destructive">
              {t("setup.admin.invalidEmail")}
            </p>
          )}
        </Field>
        <Field
          label={t("setup.admin.password")}
          hint={t("setup.admin.passwordHint")}
        >
          <Input
            type="password"
            value={form.adminPassword}
            onChange={(e) => update("adminPassword", e.target.value)}
            placeholder="••••••••••••"
            className={cn(passwordWeak && "border-warning")}
          />
          <PasswordStrength value={form.adminPassword} />
        </Field>
      </div>
    </div>
  );
}

function PasswordStrength({ value }: { value: string }) {
  const { t } = useTranslation();
  const score = Math.min(
    4,
    (value.length >= 10 ? 1 : 0) +
      (/[A-Z]/.test(value) ? 1 : 0) +
      (/[0-9]/.test(value) ? 1 : 0) +
      (/[^A-Za-z0-9]/.test(value) ? 1 : 0)
  );
  const labels = t("setup.admin.strength", { returnObjects: true }) as string[];
  const colors = [
    "bg-destructive",
    "bg-destructive",
    "bg-warning",
    "bg-info",
    "bg-success",
  ];
  if (!value) return null;
  return (
    <div className="space-y-1.5 pt-1">
      <div className="flex gap-1">
        {[0, 1, 2, 3].map((i) => (
          <span
            key={i}
            className={cn(
              "h-1 flex-1 rounded-full transition-colors",
              i < score ? colors[score] : "bg-secondary"
            )}
          />
        ))}
      </div>
      <p className="text-xs text-muted-foreground">{labels[score]}</p>
    </div>
  );
}

function SslStep({ form, update }: { form: FormShape; update: UpdateFn }) {
  const { t } = useTranslation();
  const options = [
    {
      id: "lets-encrypt",
      title: t("setup.ssl.letsEncrypt"),
      desc: t("setup.ssl.letsEncryptDesc"),
      badge: t("setup.ssl.recommended"),
    },
    {
      id: "custom",
      title: t("setup.ssl.custom"),
      desc: t("setup.ssl.customDesc"),
    },
    {
      id: "skip",
      title: t("setup.ssl.skip"),
      desc: t("setup.ssl.skipDesc"),
    },
  ];
  return (
    <div>
      <StepHeading
        icon={ShieldCheck}
        title={t("setup.ssl.title")}
        description={t("setup.ssl.subtitle")}
      />
      <div className="space-y-3">
        {options.map((opt) => {
          const active = form.sslProvider === opt.id;
          return (
            <button
              key={opt.id}
              type="button"
              onClick={() => update("sslProvider", opt.id)}
              className={cn(
                "flex w-full items-start gap-3 rounded-lg border p-4 text-left transition-colors",
                active
                  ? "border-primary bg-primary/5 ring-1 ring-primary/30"
                  : "border-border hover:border-primary/40 hover:bg-secondary/40"
              )}
            >
              <span
                className={cn(
                  "mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-2",
                  active ? "border-primary" : "border-muted-foreground/40"
                )}
              >
                {active && <span className="h-2 w-2 rounded-full bg-primary" />}
              </span>
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-foreground">
                    {opt.title}
                  </span>
                  {opt.badge && <Badge variant="success">{opt.badge}</Badge>}
                </div>
                <p className="mt-0.5 text-sm text-muted-foreground">
                  {opt.desc}
                </p>
              </div>
            </button>
          );
        })}
        {form.sslProvider === "skip" && (
          <div className="rounded-md border border-warning/30 bg-warning/10 p-3.5">
            <div className="flex gap-2.5">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
              <p className="text-sm text-foreground/90">
                {t("setup.ssl.skipWarning")}
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function StackStep({ form, update }: { form: FormShape; update: UpdateFn }) {
  const { t } = useTranslation();
  const stackChecks = buildStackChecks(t);
  return (
    <div>
      <StepHeading
        icon={Mail}
        title={t("setup.stack.title")}
        description={t("setup.stack.subtitle")}
      />
      <div className="space-y-2.5">
        {stackChecks.map((c, i) => (
          <div
            key={c.id}
            className="flex items-center justify-between rounded-md border border-border bg-card/40 px-3.5 py-2.5"
          >
            <div className="flex items-center gap-2.5">
              {i === 2 ? (
                <Loader2 className="h-4 w-4 animate-spin text-info" />
              ) : (
                <CheckCircle2 className="h-4 w-4 text-success" />
              )}
              <span className="text-sm text-foreground">{c.label}</span>
            </div>
            <span className="text-xs text-muted-foreground">{c.detail}</span>
          </div>
        ))}
      </div>

      <div className="mt-6 space-y-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {t("setup.stack.optionalModules")}
        </p>
        <ToggleRow
          label={t("setup.stack.enableRspamd")}
          description={t("setup.stack.enableRspamdDesc")}
          checked={form.enableRspamd}
          onCheckedChange={(v) => update("enableRspamd", v)}
        />
        <ToggleRow
          label={t("setup.stack.enableWebmail")}
          description={t("setup.stack.enableWebmailDesc")}
          checked={form.enableWebmail}
          onCheckedChange={(v) => update("enableWebmail", v)}
        />
        <ToggleRow
          label={t("setup.stack.enableCampaigns")}
          description={t("setup.stack.enableCampaignsDesc")}
          checked={form.enableCampaigns}
          onCheckedChange={(v) => update("enableCampaigns", v)}
        />
      </div>
    </div>
  );
}

function FinishStep({ form }: { form: FormShape }) {
  const { t } = useTranslation();
  const rows = [
    { label: t("setup.finish.mailHostname"), value: form.mailHostname },
    { label: t("setup.finish.primaryDomain"), value: form.primaryDomain },
    { label: t("setup.finish.adminEmail"), value: form.adminEmail },
    {
      label: t("setup.finish.sslProvider"),
      value:
        form.sslProvider === "lets-encrypt"
          ? t("setup.finish.sslLetsEncrypt")
          : form.sslProvider === "custom"
            ? t("setup.finish.sslCustom")
            : t("setup.finish.sslSkipped"),
    },
    {
      label: t("setup.finish.modules"),
      value: [
        form.enableRspamd && "Rspamd",
        form.enableWebmail && "Webmail",
        form.enableCampaigns && "Campaigns",
      ]
        .filter(Boolean)
        .join(", "),
    },
  ];
  return (
    <div>
      <StepHeading
        icon={CheckCircle2}
        title={t("setup.finish.title")}
        description={t("setup.finish.subtitle")}
      />
      <dl className="divide-y divide-border overflow-hidden rounded-lg border border-border">
        {rows.map((r) => (
          <div
            key={r.label}
            className="flex items-center justify-between px-4 py-3 text-sm"
          >
            <dt className="text-muted-foreground">{r.label}</dt>
            <dd className="font-mono text-foreground">{r.value || "—"}</dd>
          </div>
        ))}
      </dl>
      <div className="mt-5 rounded-md border border-success/30 bg-success/10 p-3.5">
        <div className="flex gap-2.5">
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-success" />
          <p className="text-sm text-foreground/90">
            {t("setup.finish.ready")}
          </p>
        </div>
      </div>
    </div>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      {children}
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

function ToggleRow({
  label,
  description,
  checked,
  onCheckedChange,
}: {
  label: string;
  description: string;
  checked: boolean;
  onCheckedChange: (v: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-center justify-between rounded-md border border-border bg-card/40 px-3.5 py-3">
      <div className="pr-4">
        <p className="text-sm font-medium text-foreground">{label}</p>
        <p className="text-xs text-muted-foreground">{description}</p>
      </div>
      <Switch checked={checked} onCheckedChange={onCheckedChange} />
    </label>
  );
}
