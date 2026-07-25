import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  CheckCircle2,
  Gauge,
  Inbox,
  Loader2,
  Mail,
  Plus,
  RefreshCw,
  ShieldAlert,
  Trash2,
  XCircle,
} from "lucide-react";
import { PageHeader } from "@/components/common/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { api } from "@/lib/api";
import { useApi } from "@/lib/useApi";
import type { InboxSeed, InboxTestResult } from "@/types";

const GRADE_TONE: Record<string, string> = {
  excellent: "text-success",
  good: "text-success",
  fair: "text-warning",
  poor: "text-destructive",
};

export function InboxTestPage() {
  const { t } = useTranslation();
  const [result, setResult] = useState<InboxTestResult | null>(null);
  const [running, setRunning] = useState(false);
  const [checking, setChecking] = useState(false);
  const { data: seeds, reload: reloadSeeds } = useApi(() => api.inboxSeeds());

  // Load last result on mount.
  useEffect(() => {
    api.inboxTestLatest().then(setResult).catch(() => {});
  }, []);

  const run = async (withSeeds: boolean) => {
    setRunning(true);
    try {
      setResult(await api.inboxTestRun(withSeeds));
    } finally {
      setRunning(false);
    }
  };

  const checkSeeds = async () => {
    setChecking(true);
    try {
      setResult(await api.inboxTestCheckSeeds());
    } finally {
      setChecking(false);
    }
  };

  const hasSeeds = (seeds ?? []).some((s) => s.enabled);

  return (
    <div className="space-y-6">
      <PageHeader
        title={t("inboxTest.title")}
        description={t("inboxTest.subtitle")}
        icon={<Inbox />}
        actions={
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => run(false)} disabled={running}>
              {running ? <Loader2 className="h-4 w-4 animate-spin" /> : <Gauge className="h-4 w-4" />}
              {t("inboxTest.scoreOnly")}
            </Button>
            <Button size="sm" onClick={() => run(true)} disabled={running || !hasSeeds}>
              {running ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mail className="h-4 w-4" />}
              {t("inboxTest.runWithSeeds")}
            </Button>
          </div>
        }
      />

      {/* Score card */}
      {result && (
        <Card>
          <CardContent className="p-5">
            <div className="flex items-center gap-5">
              <div className="text-center">
                <p className={cn("text-4xl font-bold tabular-nums", GRADE_TONE[result.grade])}>
                  {result.score}
                  <span className="text-lg text-muted-foreground">/10</span>
                </p>
                <p className={cn("text-xs font-medium uppercase", GRADE_TONE[result.grade])}>
                  {t(`inboxTest.grade.${result.grade}`)}
                </p>
              </div>
              <div className="flex-1">
                <p className="text-sm text-foreground">{result.summary}</p>
                <p className="mt-1 text-2xs text-muted-foreground">
                  {t("inboxTest.from")}: {result.fromAddr}
                </p>
              </div>
            </div>

            {/* Findings */}
            <div className="mt-4 space-y-1.5">
              {result.findings.map((f) => {
                const full = f.points >= f.max;
                const partial = f.points > 0 && f.points < f.max;
                return (
                  <div
                    key={f.key}
                    className="flex items-start justify-between gap-3 rounded-md border border-border bg-card/40 p-2.5"
                  >
                    <div className="flex items-start gap-2">
                      {full ? (
                        <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-success" />
                      ) : partial ? (
                        <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
                      ) : (
                        <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
                      )}
                      <div>
                        <p className="text-sm font-medium text-foreground">{f.label}</p>
                        <p className="text-2xs text-muted-foreground">{f.detail}</p>
                      </div>
                    </div>
                    <span className="shrink-0 font-mono text-2xs text-muted-foreground">
                      {f.points}/{f.max}
                    </span>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Seed placement results */}
      {result && (result.seedsPending || result.seeds.length > 0) && (
        <Card>
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <CardTitle className="text-base">{t("inboxTest.placement")}</CardTitle>
            {result.seedsPending && (
              <Button size="sm" variant="outline" onClick={checkSeeds} disabled={checking}>
                {checking ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                {t("inboxTest.checkNow")}
              </Button>
            )}
          </CardHeader>
          <CardContent className="space-y-2">
            {result.seedsPending ? (
              <p className="py-3 text-center text-sm text-muted-foreground">
                {t("inboxTest.pendingHint")}
              </p>
            ) : (
              result.seeds.map((s) => (
                <div
                  key={s.email}
                  className="flex items-center justify-between gap-3 rounded-md border border-border bg-card/40 p-3"
                >
                  <div>
                    <p className="text-sm font-medium text-foreground">{s.label}</p>
                    <p className="text-2xs text-muted-foreground">{s.email}</p>
                  </div>
                  <div className="text-right">
                    <Badge
                      variant={
                        s.placement === "inbox"
                          ? "success"
                          : s.placement === "spam"
                            ? "critical"
                            : "warning"
                      }
                    >
                      {t(`inboxTest.place.${s.placement}`, s.placement)}
                    </Badge>
                    <p className="mt-1 text-2xs text-muted-foreground">{s.detail}</p>
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      )}

      {/* Seed mailbox management */}
      <SeedManager seeds={seeds ?? []} reload={reloadSeeds} />
    </div>
  );
}

function SeedManager({ seeds, reload }: { seeds: InboxSeed[]; reload: () => void }) {
  const { t } = useTranslation();
  const [form, setForm] = useState({
    email: "",
    imapHost: "",
    imapPort: 993,
    imapUser: "",
    imapPass: "",
  });
  const [adding, setAdding] = useState(false);

  // Autofill common IMAP hosts from the email domain.
  const onEmail = (email: string) => {
    const d = email.split("@")[1] ?? "";
    let host = form.imapHost;
    if (d.includes("gmail")) host = "imap.gmail.com";
    else if (d.includes("yandex")) host = "imap.yandex.com";
    else if (d.includes("mail.ru")) host = "imap.mail.ru";
    else if (d.includes("outlook") || d.includes("hotmail")) host = "outlook.office365.com";
    else if (d.includes("yahoo")) host = "imap.mail.yahoo.com";
    setForm((f) => ({ ...f, email, imapUser: email, imapHost: host || f.imapHost }));
  };

  const add = async () => {
    setAdding(true);
    try {
      await api.addInboxSeed(form);
      setForm({ email: "", imapHost: "", imapPort: 993, imapUser: "", imapPass: "" });
      reload();
    } finally {
      setAdding(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{t("inboxTest.seeds")}</CardTitle>
        <p className="text-sm text-muted-foreground">{t("inboxTest.seedsHint")}</p>
      </CardHeader>
      <CardContent className="space-y-4">
        {seeds.length > 0 && (
          <div className="space-y-2">
            {seeds.map((s) => (
              <div
                key={s.id}
                className="flex items-center justify-between gap-3 rounded-md border border-border bg-card/40 p-3"
              >
                <div>
                  <p className="text-sm font-medium text-foreground">
                    {s.label}{" "}
                    <span className="font-mono text-2xs text-muted-foreground">{s.email}</span>
                  </p>
                  <p className="text-2xs text-muted-foreground">
                    {s.imapHost}:{s.imapPort}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Switch
                    checked={s.enabled}
                    onCheckedChange={async () => {
                      await api.toggleInboxSeed(s.id);
                      reload();
                    }}
                  />
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    onClick={async () => {
                      await api.deleteInboxSeed(s.id);
                      reload();
                    }}
                  >
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Add seed form */}
        <div className="grid gap-2 sm:grid-cols-2">
          <Input
            value={form.email}
            onChange={(e) => onEmail(e.target.value)}
            placeholder={t("inboxTest.seedEmail")}
            className="h-9"
          />
          <Input
            value={form.imapHost}
            onChange={(e) => setForm((f) => ({ ...f, imapHost: e.target.value }))}
            placeholder="imap.gmail.com"
            className="h-9 font-mono"
          />
          <Input
            value={form.imapUser}
            onChange={(e) => setForm((f) => ({ ...f, imapUser: e.target.value }))}
            placeholder={t("inboxTest.seedUser")}
            className="h-9"
          />
          <Input
            type="password"
            value={form.imapPass}
            onChange={(e) => setForm((f) => ({ ...f, imapPass: e.target.value }))}
            placeholder={t("inboxTest.seedPass")}
            className="h-9"
          />
        </div>
        <p className="text-2xs text-muted-foreground">{t("inboxTest.appPasswordHint")}</p>
        <Button
          onClick={add}
          disabled={adding || !form.email || !form.imapHost || !form.imapPass}
        >
          <Plus className="h-4 w-4" /> {t("inboxTest.addSeed")}
        </Button>
      </CardContent>
    </Card>
  );
}
