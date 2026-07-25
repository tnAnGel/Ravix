import { useState } from "react";
import {
  ExternalLink,
  Plus,
  Shield,
  ShieldAlert,
  ShieldCheck,
  Sliders,
  X,
} from "lucide-react";
import { PageHeader } from "@/components/common/PageHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useTranslation } from "react-i18next";
import { cn, timeAgo } from "@/lib/utils";
import { api, type AntiSpamData } from "@/lib/api";
import { useApi } from "@/lib/useApi";

const actionTone: Record<string, string> = {
  "no action": "text-success",
  greylist: "text-info",
  "add header": "text-warning",
  reject: "text-destructive",
};

export function AntiSpamPage() {
  const { t } = useTranslation();
  const { data, loading, reload } = useApi(() => api.antiSpam());

  return (
    <div className="space-y-6">
      <PageHeader
        title={t("antiSpam.title")}
        description={t("antiSpam.subtitle")}
        icon={<Shield />}
        actions={
          <Button
            variant="outline"
            size="sm"
            onClick={() =>
              window.open(`https://${window.location.hostname}:11334`, "_blank")
            }
          >
            <ExternalLink className="h-4 w-4" /> {t("antiSpam.openRspamd")}
          </Button>
        }
      />
      {loading || !data ? (
        <div className="space-y-4">
          <Skeleton className="h-20 w-full" />
          <div className="grid gap-4 lg:grid-cols-3">
            <Skeleton className="h-80 lg:col-span-2" />
            <Skeleton className="h-80" />
          </div>
        </div>
      ) : (
        <AntiSpamView data={data} reload={reload} />
      )}
    </div>
  );
}

function AntiSpamView({
  data,
  reload,
}: {
  data: AntiSpamData;
  reload: () => void;
}) {
  const { t } = useTranslation();
  const [greylisting, setGreylisting] = useState(data.greylisting);
  const [dkimSigning, setDkimSigning] = useState(data.dkimSigning);

  const update = (patch: Partial<AntiSpamData>) =>
    api.updateAntiSpam(patch).then(reload);

  return (
    <div className="space-y-6">
      {/* Status banner — driven by the real live rspamd / redis state */}
      <StatusBanner data={data} reload={reload} />

      <div className="grid gap-4 lg:grid-cols-3">
        {/* Policy */}
        <Card className="lg:col-span-2">
          <CardHeader className="flex-row items-center gap-2 space-y-0">
            <Sliders className="h-4 w-4 text-primary" />
            <CardTitle className="text-base">{t("antiSpam.scorePolicy")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            <ScoreScale spam={data.spamThreshold} reject={data.rejectThreshold} />
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>{t("antiSpam.addHeaderAt")}</Label>
                <Input
                  type="number"
                  step="0.1"
                  defaultValue={data.spamThreshold}
                  onBlur={(e) => update({ spamThreshold: Number(e.target.value) })}
                  className="font-mono"
                />
                <p className="text-2xs text-muted-foreground">
                  {t("antiSpam.addHeaderHint")}
                </p>
              </div>
              <div className="space-y-1.5">
                <Label>{t("antiSpam.rejectAt")}</Label>
                <Input
                  type="number"
                  step="0.1"
                  defaultValue={data.rejectThreshold}
                  onBlur={(e) => update({ rejectThreshold: Number(e.target.value) })}
                  className="font-mono"
                />
                <p className="text-2xs text-muted-foreground">
                  {t("antiSpam.rejectHint")}
                </p>
              </div>
            </div>
            <div className="space-y-2 border-t border-border pt-4">
              <ToggleRow
                label={t("antiSpam.greylisting")}
                description={t("antiSpam.greylistingDesc")}
                checked={greylisting}
                onCheckedChange={(v) => {
                  setGreylisting(v);
                  update({ greylisting: v });
                }}
              />
              <ToggleRow
                label={t("antiSpam.dkimSigning")}
                description={t("antiSpam.dkimSigningDesc")}
                checked={dkimSigning}
                onCheckedChange={(v) => {
                  setDkimSigning(v);
                  update({ dkimSigning: v });
                }}
              />
            </div>
          </CardContent>
        </Card>

        {/* Stats */}
        <div className="space-y-4">
          <Card className="p-5">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <ShieldCheck className="h-4 w-4 text-success" /> {t("antiSpam.dkimSigning")}
            </div>
            <p className="mt-2 text-2xl font-semibold text-foreground">
              {dkimSigning ? t("antiSpam.dkimActive") : t("antiSpam.dkimOff")}
            </p>
            <p className="text-xs text-muted-foreground">
              {t("antiSpam.dkimDomains", {
                signed: data.dkimSignedDomains,
                total: data.totalDomains,
              })}
            </p>
          </Card>
          <Card className="p-5">
            <p className="text-sm text-muted-foreground">{t("antiSpam.bayesTokens")}</p>
            <p className="mt-2 text-2xl font-semibold tabular-nums text-foreground">
              {data.bayesLearned.toLocaleString()}
            </p>
            <p className={cn("text-xs", data.redisConnected ? "text-success" : "text-warning")}>
              {data.redisConnected ? t("antiSpam.bayesActive") : t("antiSpam.bayesPaused")}
            </p>
          </Card>
        </div>
      </div>

      {/* Lists */}
      <div className="grid gap-4 md:grid-cols-2">
        <SenderListCard
          title={t("antiSpam.whitelist")}
          description={t("antiSpam.whitelistDesc")}
          tone="success"
          listType="whitelist"
          items={data.whitelist}
          onChange={reload}
        />
        <SenderListCard
          title={t("antiSpam.blacklist")}
          description={t("antiSpam.blacklistDesc")}
          tone="critical"
          listType="blacklist"
          items={data.blacklist}
          onChange={reload}
        />
      </div>

      {/* Recent decisions */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("antiSpam.recentDecisions")}</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="divide-y divide-border/60">
            {data.recentDecisions.map((d) => (
              <div
                key={d.id}
                className="flex items-center justify-between gap-4 px-5 py-3"
              >
                <div className="min-w-0">
                  <p className="truncate font-mono text-sm text-foreground">
                    {d.from}
                  </p>
                  <div className="mt-1 flex flex-wrap gap-1">
                    {d.symbols.map((s) => (
                      <code
                        key={s}
                        className="rounded bg-secondary px-1.5 py-0.5 text-2xs text-muted-foreground"
                      >
                        {s}
                      </code>
                    ))}
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-4 text-right">
                  <div>
                    <p
                      className={cn(
                        "text-sm font-semibold tabular-nums",
                        d.score > 8
                          ? "text-destructive"
                          : d.score > 4
                            ? "text-warning"
                            : "text-success"
                      )}
                    >
                      {d.score > 0 ? "+" : ""}
                      {d.score.toFixed(1)}
                    </p>
                    <p className="text-2xs text-muted-foreground">
                      {timeAgo(d.time)}
                    </p>
                  </div>
                  <Badge
                    variant="outline"
                    className={cn("w-24 justify-center", actionTone[d.action])}
                  >
                    {d.action}
                  </Badge>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function StatusBanner({
  data,
  reload,
}: {
  data: AntiSpamData;
  reload: () => void;
}) {
  const { t } = useTranslation();
  const [restarting, setRestarting] = useState(false);
  const healthy = data.status === "healthy";

  const restart = () => {
    setRestarting(true);
    api.restartRspamd().then(reload).finally(() => setRestarting(false));
  };

  const { title, body, badge, tone, Icon } = healthy
    ? {
        title: t("antiSpam.activeTitle"),
        body: t("antiSpam.activeBody"),
        badge: t("status.healthy"),
        tone: "success" as const,
        Icon: ShieldCheck,
      }
    : !data.rspamdRunning
      ? {
          title: t("antiSpam.rspamdDownTitle"),
          body: t("antiSpam.rspamdDownBody"),
          badge: t("status.actionNeeded"),
          tone: "critical" as const,
          Icon: ShieldAlert,
        }
      : {
          title: t("antiSpam.degradedTitle"),
          body: t("antiSpam.degradedBody"),
          badge: t("status.actionNeeded"),
          tone: "warning" as const,
          Icon: ShieldAlert,
        };

  const toneClasses = {
    success: "border-success/40 bg-success/[0.06] text-success",
    warning: "border-warning/40 bg-warning/[0.06] text-warning",
    critical: "border-destructive/40 bg-destructive/[0.06] text-destructive",
  }[tone];

  return (
    <Card className={cn("p-4", toneClasses.split(" ").slice(0, 2).join(" "))}>
      <div className="flex items-start gap-3">
        <span
          className={cn(
            "flex h-9 w-9 items-center justify-center rounded-lg",
            tone === "success" && "bg-success/15 text-success",
            tone === "warning" && "bg-warning/15 text-warning",
            tone === "critical" && "bg-destructive/15 text-destructive"
          )}
        >
          <Icon className="h-5 w-5" />
        </span>
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <p className="font-semibold text-foreground">{title}</p>
            <Badge variant={tone === "success" ? "success" : tone === "critical" ? "critical" : "warning"}>
              {badge}
            </Badge>
          </div>
          <p className="mt-0.5 text-sm text-muted-foreground">{body}</p>
        </div>
        {!healthy && (
          <Button size="sm" variant="outline" onClick={restart} disabled={restarting}>
            {restarting ? t("antiSpam.restarting") : t("antiSpam.restart")}
          </Button>
        )}
      </div>
    </Card>
  );
}

function ScoreScale({ spam, reject }: { spam: number; reject: number }) {
  const { t } = useTranslation();
  const max = 20;
  return (
    <div className="space-y-2">
      <div className="relative h-2.5 w-full overflow-hidden rounded-full">
        <div
          className="absolute inset-0"
          style={{
            background:
              "linear-gradient(90deg, hsl(var(--success)) 0%, hsl(var(--success)) 25%, hsl(var(--warning)) 50%, hsl(var(--destructive)) 100%)",
          }}
        />
        <Marker pos={(spam / max) * 100} />
        <Marker pos={(reject / max) * 100} />
      </div>
      <div className="flex justify-between text-2xs text-muted-foreground">
        <span>{t("antiSpam.scaleHam")}</span>
        <span className="text-warning">{t("antiSpam.scaleSpam", { value: spam })}</span>
        <span className="text-destructive">{t("antiSpam.scaleReject", { value: reject })}</span>
        <span>{max}</span>
      </div>
    </div>
  );
}

function Marker({ pos }: { pos: number }) {
  return (
    <div
      className="absolute top-1/2 h-4 w-1 -translate-y-1/2 rounded-full bg-foreground shadow ring-2 ring-background"
      style={{ left: `calc(${pos}% - 2px)` }}
    />
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
    <label className="flex cursor-pointer items-center justify-between py-1.5">
      <div className="pr-4">
        <p className="text-sm font-medium text-foreground">{label}</p>
        <p className="text-xs text-muted-foreground">{description}</p>
      </div>
      <Switch checked={checked} onCheckedChange={onCheckedChange} />
    </label>
  );
}

function SenderListCard({
  title,
  description,
  tone,
  listType,
  items,
  onChange,
}: {
  title: string;
  description: string;
  tone: "success" | "critical";
  listType: "whitelist" | "blacklist";
  items: string[];
  onChange: () => void;
}) {
  const { t } = useTranslation();
  const [adding, setAdding] = useState(false);
  const [value, setValue] = useState("");

  const submit = async () => {
    if (!value.trim()) return;
    await api.addSenderListEntry(listType, value.trim());
    setValue("");
    setAdding(false);
    onChange();
  };

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0">
        <div>
          <CardTitle className="text-base">{title}</CardTitle>
          <p className="text-xs text-muted-foreground">{description}</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => setAdding((v) => !v)}>
          <Plus className="h-4 w-4" /> {t("common.add")}
        </Button>
      </CardHeader>
      <CardContent className="space-y-1.5">
        {adding && (
          <div className="flex gap-2">
            <Input
              autoFocus
              value={value}
              onChange={(e) => setValue(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && submit()}
              placeholder="example.com / 1.2.3.4 / user@host"
              className="h-8 font-mono"
            />
            <Button size="sm" onClick={submit} disabled={!value.trim()}>
              {t("common.add")}
            </Button>
          </div>
        )}
        {items.map((item) => (
          <div
            key={item}
            className="group flex items-center justify-between rounded-md border border-border bg-card/40 px-3 py-2"
          >
            <div className="flex items-center gap-2">
              <span
                className={cn(
                  "h-1.5 w-1.5 rounded-full",
                  tone === "success" ? "bg-success" : "bg-destructive"
                )}
              />
              <code className="font-mono text-sm text-foreground">{item}</code>
            </div>
            <Button
              variant="ghost"
              size="icon-sm"
              className="opacity-0 transition-opacity group-hover:opacity-100"
              onClick={() =>
                api.removeSenderListEntry(listType, item).then(onChange)
              }
            >
              <X className="h-3.5 w-3.5" />
            </Button>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
