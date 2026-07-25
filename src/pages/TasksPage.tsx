import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { CheckCircle2, ChevronDown, ChevronRight, Loader2, ListChecks, XCircle } from "lucide-react";
import { PageHeader } from "@/components/common/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { api } from "@/lib/api";
import { useApi } from "@/lib/useApi";
import { timeAgo } from "@/lib/utils";
import type { BackgroundTask } from "@/types";

export function TasksPage() {
  const { t } = useTranslation();
  const { data, reload } = useApi(() => api.taskList());
  const tasks = data ?? [];
  const hasRunning = useMemo(() => tasks.some((x) => x.status === "running"), [tasks]);

  // Poll while anything is running so imapsync / backups update live.
  useEffect(() => {
    if (!hasRunning) return;
    const h = setInterval(reload, 2500);
    return () => clearInterval(h);
  }, [hasRunning, reload]);

  return (
    <div className="space-y-6">
      <PageHeader
        title={t("tasks.title")}
        description={t("tasks.subtitle")}
        icon={<ListChecks />}
      />
      <Card>
        <CardContent className="space-y-2 p-4">
          {tasks.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">{t("tasks.empty")}</p>
          ) : (
            tasks.map((task) => <TaskRow key={task.id} task={task} />)
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function TaskRow({ task }: { task: BackgroundTask }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const label = [task.kind, task.action, task.target].filter(Boolean).join(" · ");
  return (
    <div className="rounded-md border border-border bg-card/40">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-3 px-3 py-2.5 text-left hover:bg-secondary/40"
      >
        {task.status === "running" ? (
          <Loader2 className="h-4 w-4 shrink-0 animate-spin text-info" />
        ) : task.status === "ok" ? (
          <CheckCircle2 className="h-4 w-4 shrink-0 text-success" />
        ) : (
          <XCircle className="h-4 w-4 shrink-0 text-destructive" />
        )}
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-foreground">{label || task.id}</p>
          <p className="text-2xs text-muted-foreground">
            {timeAgo(task.startedAt)}
            {task.finishedAt ? ` · ${t("tasks.finished")} ${timeAgo(task.finishedAt)}` : ""}
          </p>
        </div>
        <Badge
          variant={
            task.status === "running" ? "info" : task.status === "ok" ? "success" : "critical"
          }
        >
          {t(`tasks.status.${task.status}`)}
        </Badge>
        {open ? (
          <ChevronDown className="h-4 w-4 text-muted-foreground" />
        ) : (
          <ChevronRight className="h-4 w-4 text-muted-foreground" />
        )}
      </button>
      {open && (
        <pre className="scrollbar-thin max-h-72 overflow-auto border-t border-border bg-background px-3 py-2 text-2xs text-muted-foreground">
          {task.log?.trim() || t("tasks.noLog")}
        </pre>
      )}
    </div>
  );
}
