import { useEffect, useMemo, useState } from "react";
import { Download, Pause, Play, ScrollText, Search } from "lucide-react";
import { PageHeader } from "@/components/common/PageHeader";
import { LogViewer } from "@/components/common/LogViewer";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useTranslation } from "react-i18next";
import { api } from "@/lib/api";
import { useApi } from "@/lib/useApi";
import type { LogSource } from "@/types";

export function LogsPage() {
  const { t } = useTranslation();
  const sources: { id: LogSource | "all"; label: string }[] = [
    { id: "all", label: t("logs.all") },
    { id: "postfix", label: "Postfix" },
    { id: "dovecot", label: "Dovecot" },
    { id: "rspamd", label: "Rspamd" },
    { id: "nginx", label: "Nginx" },
    { id: "ravix", label: "Ravix" },
  ];
  const [source, setSource] = useState<LogSource | "all">("all");
  const [severity, setSeverity] = useState("all");
  const [time, setTime] = useState("1h");
  const [query, setQuery] = useState("");
  const [autoRefresh, setAutoRefresh] = useState(true);
  const { data, reload } = useApi(() => api.logs(source), [source]);

  // Real 5s polling instead of the previous "(заглушка)" caption that
  // promised refresh but never actually polled. Pauses immediately when
  // the operator flips autoRefresh off.
  useEffect(() => {
    if (!autoRefresh) return;
    const h = setInterval(reload, 5000);
    return () => clearInterval(h);
  }, [autoRefresh, reload]);

  const lines = useMemo(
    () =>
      (data ?? []).filter((l) => {
        const matchesSource = source === "all" || l.source === source;
        const matchesSeverity =
          severity === "all" ||
          (severity === "warning"
            ? l.level === "warning" || l.level === "error"
            : l.level === severity);
        const matchesQuery =
          l.message.toLowerCase().includes(query.toLowerCase()) ||
          l.process.toLowerCase().includes(query.toLowerCase());
        return matchesSource && matchesSeverity && matchesQuery;
      }),
    [data, source, severity, query]
  );

  const errorCount = lines.filter((l) => l.level === "error").length;
  const warnCount = lines.filter((l) => l.level === "warning").length;

  return (
    <div className="space-y-6">
      <PageHeader
        title={t("logs.title")}
        description={t("logs.subtitle")}
        icon={<ScrollText />}
        actions={
          <>
            <div className="flex items-center gap-2 rounded-md border border-border bg-card/60 px-3 py-1.5">
              {autoRefresh ? (
                <Play className="h-3.5 w-3.5 text-success" />
              ) : (
                <Pause className="h-3.5 w-3.5 text-muted-foreground" />
              )}
              <span className="text-xs text-muted-foreground">
                {t("logs.autoRefresh")}
              </span>
              <Switch checked={autoRefresh} onCheckedChange={setAutoRefresh} />
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                const text = lines
                  .map(
                    (l) =>
                      `${l.timestamp} [${l.level.toUpperCase()}] ${l.process}: ${l.message}`
                  )
                  .join("\n");
                const url = URL.createObjectURL(
                  new Blob([text], { type: "text/plain" })
                );
                const a = document.createElement("a");
                a.href = url;
                a.download = `ravix-logs-${source}.log`;
                a.click();
                URL.revokeObjectURL(url);
              }}
            >
              <Download className="h-4 w-4" /> {t("logs.export")}
            </Button>
          </>
        }
      />

      <Tabs
        value={source}
        onValueChange={(v) => setSource(v as LogSource | "all")}
      >
        <TabsList>
          {sources.map((s) => (
            <TabsTrigger key={s.id} value={s.id}>
              {s.label}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative max-w-sm flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("logs.searchPlaceholder")}
            className="pl-9 font-mono"
          />
        </div>
        <Select value={severity} onValueChange={setSeverity}>
          <SelectTrigger className="w-36">
            <SelectValue placeholder={t("logs.allLevels")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("logs.allLevels")}</SelectItem>
            <SelectItem value="info">{t("logs.info")}</SelectItem>
            <SelectItem value="warning">{t("logs.warningPlus")}</SelectItem>
            <SelectItem value="error">{t("logs.errorOnly")}</SelectItem>
          </SelectContent>
        </Select>
        <Select value={time} onValueChange={setTime}>
          <SelectTrigger className="w-32">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="15m">{t("logs.last15m")}</SelectItem>
            <SelectItem value="1h">{t("logs.last1h")}</SelectItem>
            <SelectItem value="24h">{t("logs.last24h")}</SelectItem>
            <SelectItem value="7d">{t("logs.last7d")}</SelectItem>
          </SelectContent>
        </Select>
        <div className="ml-auto flex items-center gap-2 text-xs">
          {errorCount > 0 && (
            <Badge variant="critical">{t("logs.errors", { count: errorCount })}</Badge>
          )}
          {warnCount > 0 && (
            <Badge variant="warning">{t("logs.warnings", { count: warnCount })}</Badge>
          )}
          <Badge variant="muted">{t("logs.lines", { count: lines.length })}</Badge>
        </div>
      </div>

      <LogViewer lines={lines} className="max-h-[60vh]" />

      <p className="text-2xs text-muted-foreground">
        {autoRefresh ? t("logs.streaming") : t("logs.paused")}
      </p>
    </div>
  );
}
