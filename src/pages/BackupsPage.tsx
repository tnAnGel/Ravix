import { useState } from "react";
import {
  Archive,
  CheckCircle2,
  Clock,
  Database,
  Download,
  HardDriveDownload,
  Plus,
  RotateCcw,
  Trash2,
} from "lucide-react";
import { PageHeader } from "@/components/common/PageHeader";
import { ConfirmDialog } from "@/components/common/ConfirmDialog";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { useTranslation } from "react-i18next";
import { api } from "@/lib/api";
import { useApi } from "@/lib/useApi";
import { formatBytes, formatDateTime, timeAgo } from "@/lib/utils";
import type { Backup } from "@/types";

const contentItems = [
  { id: "db", labelKey: "backups.contentDb", icon: Database, required: true },
  { id: "configs", labelKey: "backups.contentConfigs", icon: Archive, required: true },
  { id: "certs", labelKey: "backups.contentCerts", icon: Archive, required: false },
  { id: "dkim", labelKey: "backups.contentDkim", icon: Archive, required: false },
  { id: "mailboxes", labelKey: "backups.contentMailboxes", icon: Archive, required: false },
];

export function BackupsPage() {
  const { t } = useTranslation();
  const { data, loading, reload } = useApi(() => api.backups());
  const [schedule, setSchedule] = useState(true);
  const [restoreTarget, setRestoreTarget] = useState<Backup | null>(null);
  const [creating, setCreating] = useState(false);
  const backups = data ?? [];
  const last = backups[0];

  const createBackup = async () => {
    setCreating(true);
    try {
      await api.createBackup();
      reload();
    } finally {
      setCreating(false);
    }
  };

  // Loading: show skeletons. Empty (no backups yet): show empty-state with
  // a Create button — the previous "loading || !last → skeleton" combined
  // both, so a brand-new install permanently showed skeleton (the bug user
  // saw as "page hangs and never loads").
  if (loading) {
    return (
      <div className="space-y-6">
        <PageHeader
          title={t("backups.title")}
          description={t("backups.subtitle")}
          icon={<Archive />}
        />
        <div className="grid gap-4 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-28" />
          ))}
        </div>
        <Skeleton className="h-72 w-full" />
      </div>
    );
  }

  if (!last) {
    return (
      <div className="space-y-6">
        <PageHeader
          title={t("backups.title")}
          description={t("backups.subtitle")}
          icon={<Archive />}
          actions={
            <Button size="sm" onClick={createBackup} disabled={creating}>
              <Plus className="h-4 w-4" />
              {creating ? t("backups.creating") : t("backups.createBackup")}
            </Button>
          }
        />
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-16 text-center">
            <Archive className="h-10 w-10 text-muted-foreground" />
            <p className="text-base font-medium text-foreground">
              {t("backups.emptyTitle")}
            </p>
            <p className="max-w-md text-sm text-muted-foreground">
              {t("backups.emptyDesc")}
            </p>
            <Button onClick={createBackup} disabled={creating} className="mt-2">
              <Plus className="h-4 w-4" />
              {creating ? t("backups.creating") : t("backups.createFirst")}
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={t("backups.title")}
        description={t("backups.subtitle")}
        icon={<Archive />}
        actions={
          <Button size="sm" onClick={createBackup} disabled={creating}>
            <Plus className="h-4 w-4" />{" "}
            {creating ? t("backups.creating") : t("backups.createBackup")}
          </Button>
        }
      />

      {/* Status row */}
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="p-5">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <CheckCircle2 className="h-4 w-4 text-success" /> {t("backups.backupStatus")}
          </div>
          <p className="mt-2 text-2xl font-semibold text-foreground">
            {t("backups.healthy")}
          </p>
          <p className="text-xs text-muted-foreground">{t("backups.healthyDesc")}</p>
        </Card>
        <Card className="p-5">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Clock className="h-4 w-4" /> {t("backups.lastBackup")}
          </div>
          <p className="mt-2 text-2xl font-semibold text-foreground">
            {timeAgo(last.createdAt)}
          </p>
          <p className="text-xs text-muted-foreground">
            {formatDateTime(last.createdAt)} · {formatBytes(last.sizeMb * 1024 * 1024, 0)}
          </p>
        </Card>
        <Card className="p-5">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <HardDriveDownload className="h-4 w-4" /> {t("backups.totalSize")}
          </div>
          <p className="mt-2 text-2xl font-semibold text-foreground">
            {formatBytes(
              backups.reduce((s, b) => s + b.sizeMb, 0) * 1024 * 1024,
              1
            )}
          </p>
          <p className="text-xs text-muted-foreground">
            {t("backups.retained", { count: backups.length })}
          </p>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_340px]">
        {/* History */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t("backups.history")}</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="divide-y divide-border/60">
              {backups.map((b) => (
                <div
                  key={b.id}
                  className="flex items-center justify-between px-5 py-3.5"
                >
                  <div className="flex items-center gap-3">
                    <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-secondary text-muted-foreground">
                      <Archive className="h-4 w-4" />
                    </span>
                    <div>
                      <p className="text-sm font-medium text-foreground">
                        {formatDateTime(b.createdAt)}
                      </p>
                      <p className="text-2xs text-muted-foreground">
                        {formatBytes(b.sizeMb * 1024 * 1024, 0)} ·{" "}
                        {t("backups.components", { count: b.contents.length })}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant={b.type === "scheduled" ? "muted" : "info"}>
                      {b.type === "scheduled"
                        ? t("backups.typeScheduled")
                        : t("backups.typeManual")}
                    </Badge>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      title={t("common.download")}
                      onClick={() => api.downloadBackup(b.id).catch(
                        (e) => alert((e as Error).message)
                      )}
                    >
                      <Download className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      title={t("common.restore")}
                      onClick={() => setRestoreTarget(b)}
                    >
                      <RotateCcw className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      title={t("common.delete")}
                      onClick={async () => {
                        if (!confirm(t("backups.confirmDelete"))) return;
                        await api.deleteBackup(b.id);
                        reload();
                      }}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Settings */}
        <div className="space-y-4">
          <Card>
            <CardHeader className="flex-row items-center justify-between space-y-0">
              <CardTitle className="text-base">{t("backups.schedule")}</CardTitle>
              <Switch checked={schedule} onCheckedChange={setSchedule} />
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="space-y-1.5">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  {t("backups.frequency")}
                </p>
                <Select defaultValue="daily" disabled={!schedule}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="hourly">{t("backups.hourly")}</SelectItem>
                    <SelectItem value="daily">{t("backups.dailyAt")}</SelectItem>
                    <SelectItem value="weekly">{t("backups.weekly")}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  {t("backups.retention")}
                </p>
                <Select defaultValue="7" disabled={!schedule}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="7">{t("backups.keepLast", { count: 7 })}</SelectItem>
                    <SelectItem value="14">{t("backups.keepLast", { count: 14 })}</SelectItem>
                    <SelectItem value="30">{t("backups.keepLast", { count: 30 })}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">{t("backups.contents")}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {contentItems.map((c) => (
                <label
                  key={c.id}
                  className="flex items-center justify-between gap-2"
                >
                  <span className="flex items-center gap-2 text-sm text-foreground">
                    <c.icon className="h-4 w-4 text-muted-foreground" />
                    {t(c.labelKey)}
                  </span>
                  <Switch
                    defaultChecked={c.required || c.id !== "mailboxes"}
                    disabled={c.required}
                  />
                </label>
              ))}
            </CardContent>
          </Card>
        </div>
      </div>

      <ConfirmDialog
        open={!!restoreTarget}
        onOpenChange={(o) => !o && setRestoreTarget(null)}
        title={t("backups.restoreTitle")}
        confirmLabel={t("common.restore")}
        destructive
        description={
          restoreTarget
            ? t("backups.restoreDesc", {
                date: formatDateTime(restoreTarget.createdAt),
              })
            : ""
        }
        onConfirm={() => {
          if (restoreTarget) api.restoreBackup(restoreTarget.id);
          setRestoreTarget(null);
        }}
      />
    </div>
  );
}
