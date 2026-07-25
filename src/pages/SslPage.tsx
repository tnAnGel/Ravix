import { useState } from "react";
import {
  CalendarClock,
  FileBadge,
  Plus,
  RefreshCw,
  ShieldCheck,
  Upload,
} from "lucide-react";
import { PageHeader } from "@/components/common/PageHeader";
import { StatusBadge } from "@/components/common/StatusBadge";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { useTranslation } from "react-i18next";
import { api } from "@/lib/api";
import { useApi } from "@/lib/useApi";
import { cn, formatDate } from "@/lib/utils";
import type { Certificate } from "@/types";

// Days remaining computed against the fixed "today" (2026-05-30).
function daysLeft(iso: string) {
  const now = new Date("2026-05-30T12:00:00Z").getTime();
  return Math.round((new Date(iso).getTime() - now) / 86_400_000);
}

export function SslPage() {
  const { t } = useTranslation();
  const { data, loading, reload } = useApi(() => api.certificates());
  const [uploadOpen, setUploadOpen] = useState(false);
  const [issueOpen, setIssueOpen] = useState(false);
  const certificates = data ?? [];
  const expiringSoon = certificates.filter(
    (c) => daysLeft(c.expiresAt) <= 30
  ).length;

  return (
    <div className="space-y-6">
      <PageHeader
        title={t("ssl.title")}
        description={t("ssl.subtitle")}
        icon={<ShieldCheck />}
        actions={
          <>
            <Button variant="outline" size="sm" onClick={() => setUploadOpen(true)}>
              <Upload className="h-4 w-4" /> {t("ssl.uploadCertificate")}
            </Button>
            <Button variant="outline" size="sm" onClick={() => api.renewAllCertificates().then(reload)}>
              <RefreshCw className="h-4 w-4" /> {t("ssl.renewAll")}
            </Button>
            <Button size="sm" onClick={() => setIssueOpen(true)}>
              <Plus className="h-4 w-4" /> {t("ssl.issue")}
            </Button>
          </>
        }
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <SummaryCard
          label={t("ssl.activeCertificates")}
          value={`${certificates.length}`}
          tone="default"
        />
        <SummaryCard
          label={t("ssl.expiringSoon")}
          value={`${expiringSoon}`}
          tone={expiringSoon > 0 ? "critical" : "success"}
        />
        <SummaryCard
          label={t("ssl.autoRenewalEnabled")}
          value={`${certificates.filter((c) => c.autoRenew).length}/${certificates.length}`}
          tone="default"
        />
      </div>

      <div className="space-y-4">
        {loading
          ? Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-28 w-full" />
            ))
          : certificates.map((cert) => (
              <CertificateCard
                key={cert.id}
                cert={cert}
                onRenew={() => api.renewCertificate(cert.id).then(reload)}
                onAutoRenew={(enabled) =>
                  api.setCertAutoRenew(cert.id, enabled).then(reload)
                }
              />
            ))}
      </div>

      <UploadDialog open={uploadOpen} onOpenChange={setUploadOpen} onUploaded={reload} />
      <IssueDialog open={issueOpen} onOpenChange={setIssueOpen} onIssued={reload} />
    </div>
  );
}

function SummaryCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: "default" | "critical" | "success";
}) {
  return (
    <Card className="p-5">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <p
        className={cn(
          "mt-1.5 text-2xl font-semibold tabular-nums",
          tone === "critical" && "text-destructive",
          tone === "success" && "text-success",
          tone === "default" && "text-foreground"
        )}
      >
        {value}
      </p>
    </Card>
  );
}

function CertificateCard({
  cert,
  onRenew,
  onAutoRenew,
}: {
  cert: Certificate;
  onRenew: () => void;
  onAutoRenew: (enabled: boolean) => void;
}) {
  const { t } = useTranslation();
  const days = daysLeft(cert.expiresAt);
  const expired = days < 0;
  return (
    <Card>
      <CardContent className="flex flex-col gap-4 p-5 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-start gap-3">
          <span
            className={cn(
              "flex h-10 w-10 items-center justify-center rounded-lg",
              expired
                ? "bg-destructive/10 text-destructive"
                : days <= 30
                  ? "bg-warning/10 text-warning"
                  : "bg-success/10 text-success"
            )}
          >
            <FileBadge className="h-5 w-5" />
          </span>
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <p className="font-mono font-medium text-foreground">
                {cert.domain}
              </p>
              <StatusBadge status={cert.status} withDot={false} />
              {cert.type === "lets-encrypt" && (
                <Badge variant="secondary">Let's Encrypt</Badge>
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              {t("ssl.issuedBy", {
                issuer: cert.issuer,
                date: formatDate(cert.issuedAt),
              })}
            </p>
            <p
              className={cn(
                "flex items-center gap-1.5 text-xs",
                expired
                  ? "text-destructive"
                  : days <= 30
                    ? "text-warning"
                    : "text-muted-foreground"
              )}
            >
              <CalendarClock className="h-3.5 w-3.5" />
              {expired
                ? t("ssl.expiredAgo", { count: Math.abs(days) })
                : t("ssl.expiresIn", {
                    date: formatDate(cert.expiresAt),
                    count: days,
                  })}
            </p>
          </div>
        </div>

        <div className="flex flex-col gap-3 lg:items-end">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span>{t("ssl.autoRenewal")}</span>
            <Switch checked={cert.autoRenew} onCheckedChange={onAutoRenew} />
          </div>
          <div className="flex items-center gap-3 text-2xs text-muted-foreground">
            <span
              className={cn(
                "inline-flex items-center gap-1",
                cert.lastRenewal.status === "failed"
                  ? "text-destructive"
                  : "text-muted-foreground"
              )}
            >
              {t("ssl.lastRenewal", {
                status: cert.lastRenewal.status,
                date: formatDate(cert.lastRenewal.at),
              })}
            </span>
          </div>
          <div className="flex gap-2">
            <Button
              size="sm"
              variant={expired ? "default" : "outline"}
              onClick={onRenew}
            >
              <RefreshCw className="h-4 w-4" /> {t("common.renew")}
            </Button>
          </div>
        </div>
      </CardContent>
      {cert.lastRenewal.status === "failed" && (
        <div className="border-t border-destructive/30 bg-destructive/[0.06] px-5 py-2.5 text-xs text-destructive">
          {cert.lastRenewal.detail}
        </div>
      )}
    </Card>
  );
}

function IssueDialog({
  open,
  onOpenChange,
  onIssued,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onIssued: () => void;
}) {
  const { t } = useTranslation();
  const [domain, setDomain] = useState("");
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const submit = async () => {
    setError("");
    setBusy(true);
    try {
      const { taskId } = await api.issueCertificate(domain.trim(), email.trim() || undefined);
      // Issuance runs in the background (certbot reloads nginx, which would drop
      // a synchronous request). Poll the task — tolerating the brief reload that
      // can make a poll fail — until it finishes.
      const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
      let finished: { status: string; log?: string } | null = null;
      for (let i = 0; i < 150 && !finished; i++) {
        await sleep(2000);
        try {
          const task = await api.task(taskId);
          if (task.status !== "running") finished = task;
        } catch {
          /* nginx reload during issuance may drop a poll — keep trying */
        }
      }
      if (finished && finished.status === "failed") {
        const tail = (finished.log ?? "").trim().split("\n").slice(-3).join(" ");
        setError(tail || t("ssl.issueError"));
        return;
      }
      // ok (or timed out — optimistically refresh; cert usually issued by now)
      onIssued();
      onOpenChange(false);
      setDomain("");
      setEmail("");
    } catch (e) {
      setError(e instanceof Error ? e.message : t("ssl.issueError"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{t("ssl.issueTitle")}</DialogTitle>
          <DialogDescription>{t("ssl.issueDesc")}</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-1">
          <div className="space-y-1.5">
            <Label>{t("ssl.issueDomain")}</Label>
            <Input
              value={domain}
              onChange={(e) => setDomain(e.target.value)}
              placeholder="mail.example.com"
              className="font-mono"
            />
            <p className="text-2xs text-muted-foreground">{t("ssl.issueDomainHint")}</p>
          </div>
          <div className="space-y-1.5">
            <Label>
              {t("ssl.issueEmail")} <span className="text-muted-foreground">({t("common.optional")})</span>
            </Label>
            <Input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="admin@example.com"
              className="font-mono"
            />
            <p className="text-2xs text-muted-foreground">{t("ssl.issueEmailHint")}</p>
          </div>
          {error && (
            <p className="rounded-md border border-destructive/40 bg-destructive/[0.06] px-3 py-2 text-xs text-destructive">
              {error}
            </p>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
            {t("common.cancel")}
          </Button>
          <Button onClick={submit} disabled={busy || !domain.trim()}>
            {busy ? t("ssl.issueWorking") : t("ssl.issue")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function UploadDialog({
  open,
  onOpenChange,
  onUploaded,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onUploaded: () => void;
}) {
  const { t } = useTranslation();
  const [domain, setDomain] = useState("");
  const [certificate, setCertificate] = useState("");
  const [privateKey, setPrivateKey] = useState("");
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (!domain.trim()) return;
    setSaving(true);
    try {
      await api.uploadCertificate({ domain: domain.trim(), certificate, privateKey });
      onUploaded();
      onOpenChange(false);
      setDomain("");
      setCertificate("");
      setPrivateKey("");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{t("ssl.uploadTitle")}</DialogTitle>
          <DialogDescription>{t("ssl.uploadDesc")}</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-1">
          <div className="space-y-1.5">
            <Label>{t("aliases.domain")}</Label>
            <Input
              value={domain}
              onChange={(e) => setDomain(e.target.value)}
              placeholder="mail.example.com"
              className="font-mono"
            />
          </div>
          <div className="space-y-1.5">
            <Label>{t("ssl.certPem")}</Label>
            <Textarea
              rows={4}
              value={certificate}
              onChange={(e) => setCertificate(e.target.value)}
              placeholder="-----BEGIN CERTIFICATE-----"
              className="font-mono text-xs"
            />
          </div>
          <div className="space-y-1.5">
            <Label>{t("ssl.keyPem")}</Label>
            <Textarea
              rows={4}
              value={privateKey}
              onChange={(e) => setPrivateKey(e.target.value)}
              placeholder="-----BEGIN PRIVATE KEY-----"
              className="font-mono text-xs"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t("common.cancel")}
          </Button>
          <Button onClick={submit} disabled={saving || !domain.trim()}>
            {t("ssl.uploadInstall")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
