import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  AlertTriangle,
  Download,
  FileCog,
  Loader2,
  Package,
  PackagePlus,
  Play,
  RefreshCw,
  RotateCw,
  Square,
  Terminal,
  Trash2,
  X,
} from "lucide-react";
import { PageHeader } from "@/components/common/PageHeader";
import { ConfirmDialog } from "@/components/common/ConfirmDialog";
import { EmptyState } from "@/components/common/EmptyState";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { api, type SoftwareAction, type SoftwareComponent } from "@/lib/api";
import { useApi } from "@/lib/useApi";
import { cn } from "@/lib/utils";

const serviceTone: Record<string, string> = {
  running: "bg-success",
  degraded: "bg-warning",
  stopped: "bg-destructive",
  unknown: "bg-muted-foreground",
};

export function SoftwarePage() {
  const { t } = useTranslation();
  const { data, loading, reload } = useApi(() => api.softwareComponents());
  const [busy, setBusy] = useState<{ id: string; action: string } | null>(null);
  const [output, setOutput] = useState<{ ok: boolean; text: string; title: string } | null>(null);
  const [editor, setEditor] = useState<{ path: string; label: string } | null>(null);
  const [uninstall, setUninstall] = useState<SoftwareComponent | null>(null);

  const components = data ?? [];
  const missing = components.filter((c) => !c.installed);

  // Active background tasks keyed by component id (or "*" for apply-config).
  // Each entry tracks the task id + a tailing log so the UI can render
  // progress while the worker thread runs server-side.
  const [running, setRunning] = useState<
    Record<string, { taskId: string; action: string; title: string; log: string }>
  >({});
  const pollers = useRef<Record<string, ReturnType<typeof setInterval>>>({});

  const stopPolling = (key: string) => {
    const handle = pollers.current[key];
    if (handle) {
      clearInterval(handle);
      delete pollers.current[key];
    }
  };

  const pollTask = (key: string, taskId: string, title: string) => {
    stopPolling(key);
    pollers.current[key] = setInterval(async () => {
      try {
        const task = await api.task(taskId);
        setRunning((r) =>
          r[key] ? { ...r, [key]: { ...r[key], log: task.log } } : r
        );
        if (task.status !== "running") {
          stopPolling(key);
          setRunning((r) => {
            const { [key]: _gone, ...rest } = r;
            return rest;
          });
          setOutput({
            ok: task.status === "ok",
            text: task.log || "(no output)",
            title,
          });
          reload();
        }
      } catch {
        // Network blip — keep polling; the next tick will retry.
      }
    }, 1500);
  };

  // On mount: pick up any tasks already running server-side so refreshing
  // the page doesn't lose the "install in progress" indicator.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const active = await api.taskList("software", true);
        const apply = await api.taskList("apply", true);
        if (cancelled) return;
        [...active, ...apply].forEach((task) => {
          const key = task.kind === "apply" ? "*" : task.target ?? task.id;
          const title =
            task.kind === "apply"
              ? t("software.apply")
              : `${t(`software.${task.action}`)} · ${task.target}`;
          setRunning((r) => ({
            ...r,
            [key]: { taskId: task.id, action: task.action ?? "", title, log: task.log },
          }));
          pollTask(key, task.id, title);
        });
      } catch {
        /* nothing in flight — fine */
      }
    })();
    return () => {
      cancelled = true;
      Object.keys(pollers.current).forEach(stopPolling);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const runAction = async (c: SoftwareComponent, action: SoftwareAction) => {
    const title = `${t(`software.${action}`)} · ${c.name}`;
    setBusy({ id: c.id, action });
    try {
      const res = await api.softwareAction(c.id, action);
      if (res.taskId) {
        // Async — server returned 202. Track the task and poll for log/status.
        setRunning((r) => ({
          ...r,
          [c.id]: { taskId: res.taskId!, action, title, log: "" },
        }));
        pollTask(c.id, res.taskId, title);
      } else {
        // Sync — start/stop/restart returns the result inline.
        setOutput({
          ok: !!res.ok,
          text: res.output ?? "",
          title,
        });
        reload();
      }
    } finally {
      setBusy(null);
    }
  };

  const installMissing = async () => {
    // Kick them all off in parallel — the backend serialises via the executor
    // and per-component polling shows individual progress.
    await Promise.all(missing.map((c) => runAction(c, "install")));
  };

  const applyConfig = async () => {
    const title = t("software.apply");
    setBusy({ id: "*", action: "apply" });
    try {
      const res = await api.applyConfig();
      setRunning((r) => ({
        ...r,
        ["*"]: { taskId: res.taskId, action: "apply", title, log: "" },
      }));
      pollTask("*", res.taskId, title);
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title={t("software.title")}
        description={t("software.subtitle")}
        icon={<PackagePlus />}
        actions={
          <>
            <Button variant="outline" size="sm" onClick={() => reload()}>
              <RefreshCw className="h-4 w-4" /> {t("software.refresh")}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={applyConfig}
              disabled={!!busy}
            >
              <FileCog className="h-4 w-4" /> {t("software.apply")}
            </Button>
            <Button size="sm" onClick={installMissing} disabled={missing.length === 0 || !!busy}>
              <Download className="h-4 w-4" /> {t("software.installAll")}
              {missing.length > 0 && (
                <Badge variant="secondary" className="ml-1">
                  {missing.length}
                </Badge>
              )}
            </Button>
          </>
        }
      />

      {Object.entries(running).length > 0 && (
        <div className="space-y-2">
          {Object.entries(running).map(([key, r]) => (
            <Card key={key} className="border-primary/40">
              <CardContent className="space-y-2 p-4">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <Loader2 className="h-4 w-4 animate-spin text-primary" />
                  {r.title}
                </div>
                <pre className="max-h-48 overflow-auto whitespace-pre-wrap rounded bg-muted/40 p-2 font-mono text-2xs text-muted-foreground">
                  {r.log ? r.log.slice(-4000) : t("software.starting")}
                </pre>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-28 w-full" />
          ))}
        </div>
      ) : components.length === 0 ? (
        <EmptyState
          icon={Package}
          title={t("software.emptyTitle")}
          description={t("software.emptyDesc")}
        />
      ) : (
        <div className="space-y-3">
          {components.map((c) => (
            <ComponentCard
              key={c.id}
              c={c}
              busyAction={busy?.id === c.id ? busy.action : null}
              onAction={(a) => runAction(c, a)}
              onUninstall={() => setUninstall(c)}
              onEditConfig={(path, label) => setEditor({ path, label })}
            />
          ))}
        </div>
      )}

      <OutputPanel output={output} onClose={() => setOutput(null)} />

      {editor && (
        <ConfigEditor
          path={editor.path}
          label={editor.label}
          onClose={() => setEditor(null)}
        />
      )}

      <ConfirmDialog
        open={!!uninstall}
        onOpenChange={(o) => !o && setUninstall(null)}
        title={t("software.confirmUninstallTitle", { name: uninstall?.name })}
        description={t("software.confirmUninstallDesc", {
          name: uninstall?.name,
          pkg: uninstall?.pkg,
        })}
        destructive
        confirmLabel={t("software.uninstall")}
        onConfirm={() => {
          if (uninstall) runAction(uninstall, "uninstall");
          setUninstall(null);
        }}
      />
    </div>
  );
}

function ComponentCard({
  c,
  busyAction,
  onAction,
  onUninstall,
  onEditConfig,
}: {
  c: SoftwareComponent;
  busyAction: string | null;
  onAction: (a: SoftwareAction) => void;
  onUninstall: () => void;
  onEditConfig: (path: string, label: string) => void;
}) {
  const { t } = useTranslation();
  const busy = !!busyAction;

  return (
    <Card>
      <CardContent className="flex flex-col gap-4 p-5 lg:flex-row lg:items-start lg:justify-between">
        {/* Identity + status */}
        <div className="flex items-start gap-3">
          <span
            className={cn(
              "flex h-10 w-10 items-center justify-center rounded-lg",
              c.installed ? "bg-primary/10 text-primary" : "bg-secondary text-muted-foreground"
            )}
          >
            <Package className="h-5 w-5" />
          </span>
          <div className="space-y-1.5">
            <div className="flex flex-wrap items-center gap-2">
              <p className="font-medium text-foreground">{c.name}</p>
              <code className="rounded border border-border bg-card/60 px-1.5 py-0.5 font-mono text-2xs text-muted-foreground">
                {c.pkg}
              </code>
              {c.installed ? (
                <Badge variant="success">
                  {c.version
                    ? t("software.installedVersion", { version: c.version })
                    : t("software.installed")}
                </Badge>
              ) : (
                <Badge variant="muted">{t("software.notInstalled")}</Badge>
              )}
              {c.hasService && c.installed && (
                <span className="inline-flex items-center gap-1.5 text-2xs text-muted-foreground">
                  <span className={cn("h-1.5 w-1.5 rounded-full", serviceTone[c.serviceState])} />
                  {t(`status.${c.serviceState === "unknown" ? "unknown" : c.serviceState}`)}
                </span>
              )}
            </div>
            <p className="text-sm text-muted-foreground">{c.description}</p>

            {/* Config files */}
            {c.configs.length > 0 && (
              <div className="flex flex-wrap items-center gap-1.5 pt-1">
                <span className="text-2xs uppercase tracking-wide text-muted-foreground">
                  {t("software.configs")}:
                </span>
                {c.configs.map((f) => (
                  <Button
                    key={f.path}
                    variant="outline"
                    size="sm"
                    className="h-7 gap-1.5"
                    onClick={() => onEditConfig(f.path, f.label)}
                    title={f.path}
                  >
                    <FileCog className="h-3.5 w-3.5" />
                    {f.label}
                    <span
                      className={cn(
                        "h-1.5 w-1.5 rounded-full",
                        f.exists ? "bg-success" : "bg-muted-foreground/40"
                      )}
                    />
                  </Button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Actions */}
        <div className="flex shrink-0 flex-col items-stretch gap-2 lg:items-end">
          {busy && (
            <span className="inline-flex items-center gap-1.5 text-2xs text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              {t("software.workingOn", {
                action: t(`software.${busyAction}`),
                name: c.name,
              })}
            </span>
          )}
          <div className="flex flex-wrap justify-end gap-2">
            {!c.installed ? (
              <Button size="sm" disabled={busy} onClick={() => onAction("install")}>
                <Download className="h-4 w-4" /> {t("software.install")}
              </Button>
            ) : (
              <>
                {c.hasService &&
                  (c.serviceState === "running" ? (
                    <>
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={busy}
                        onClick={() => onAction("restart")}
                      >
                        <RotateCw className="h-4 w-4" /> {t("software.restart")}
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={busy}
                        onClick={() => onAction("stop")}
                      >
                        <Square className="h-4 w-4" /> {t("software.stop")}
                      </Button>
                    </>
                  ) : (
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={busy}
                      onClick={() => onAction("start")}
                    >
                      <Play className="h-4 w-4" /> {t("software.start")}
                    </Button>
                  ))}
                <Button
                  variant="outline"
                  size="sm"
                  disabled={busy}
                  onClick={() => onAction("reinstall")}
                >
                  <RefreshCw className="h-4 w-4" /> {t("software.reinstall")}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={busy}
                  className="text-destructive hover:text-destructive"
                  onClick={onUninstall}
                >
                  <Trash2 className="h-4 w-4" /> {t("software.uninstall")}
                </Button>
              </>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function OutputPanel({
  output,
  onClose,
}: {
  output: { ok: boolean; text: string; title: string } | null;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  if (!output) return null;
  return (
    <Card className="overflow-hidden">
      <div
        className={cn(
          "flex items-center justify-between border-b border-border px-4 py-2.5",
          output.ok ? "bg-success/[0.06]" : "bg-warning/[0.08]"
        )}
      >
        <div className="flex items-center gap-2 text-sm">
          <Terminal className="h-4 w-4 text-muted-foreground" />
          <span className="font-medium text-foreground">{output.title}</span>
          {!output.ok && (
            <span className="inline-flex items-center gap-1 text-xs text-warning">
              <AlertTriangle className="h-3.5 w-3.5" />
              {t("software.actionFailed")}
            </span>
          )}
        </div>
        <Button variant="ghost" size="icon-sm" onClick={onClose}>
          <X className="h-4 w-4" />
        </Button>
      </div>
      <pre className="scrollbar-thin max-h-64 overflow-auto bg-[#0a0d14] p-4 font-mono text-xs leading-relaxed text-foreground/90">
        {output.text || "—"}
      </pre>
    </Card>
  );
}

function ConfigEditor({
  path,
  label,
  onClose,
}: {
  path: string;
  label: string;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const { data, loading } = useApi(() => api.readConfig(path), [path]);
  const [content, setContent] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const value = content ?? data?.content ?? "";

  const save = async () => {
    setSaving(true);
    try {
      await api.saveConfig(path, value);
      setSaved(true);
      window.setTimeout(() => setSaved(false), 1500);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileCog className="h-4 w-4 text-primary" />
            {t("software.editorTitle", { label })}
          </DialogTitle>
          <DialogDescription className="font-mono">{path}</DialogDescription>
        </DialogHeader>
        {loading ? (
          <Skeleton className="h-72 w-full" />
        ) : (
          <>
            {data && !data.exists && (
              <div className="rounded-md border border-warning/30 bg-warning/10 p-2.5 text-xs text-foreground/90">
                {t("software.editorMissing")}
              </div>
            )}
            <Textarea
              value={value}
              onChange={(e) => setContent(e.target.value)}
              spellCheck={false}
              className="scrollbar-thin h-[55vh] resize-none bg-[#0a0d14] font-mono text-xs leading-relaxed"
            />
            <p className="text-2xs text-muted-foreground">
              {t("software.editorBackupNote")}
            </p>
          </>
        )}
        <DialogFooter className="sm:justify-between">
          <Button variant="outline" onClick={onClose}>
            {t("common.cancel")}
          </Button>
          <div className="flex items-center gap-2">
            {saved && <span className="text-xs text-success">{t("software.saved")}</span>}
            <Button onClick={save} disabled={saving || loading}>
              {saving ? t("software.saving") : t("software.save")}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
