import { useMemo, useState } from "react";
import {
  ArrowRight,
  MoreHorizontal,
  Plus,
  Search,
  Trash2,
  Users,
} from "lucide-react";
import { PageHeader } from "@/components/common/PageHeader";
import { WriteOnly } from "@/components/common/WriteOnly";
import { DataTable, type Column } from "@/components/common/DataTable";
import { ConfirmDialog } from "@/components/common/ConfirmDialog";
import { EmptyState } from "@/components/common/EmptyState";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useTranslation } from "react-i18next";
import { api } from "@/lib/api";
import { useApi } from "@/lib/useApi";
import type { Alias } from "@/types";

export function AliasesPage() {
  const { t } = useTranslation();
  const { data, loading, reload } = useApi(() => api.aliases());
  const { data: domains } = useApi(() => api.domains(), []);
  const [query, setQuery] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Alias | null>(null);

  const rows = useMemo(
    () =>
      (data ?? []).filter(
        (a) =>
          a.source.toLowerCase().includes(query.toLowerCase()) ||
          a.destinations.join(",").toLowerCase().includes(query.toLowerCase())
      ),
    [data, query]
  );

  const columns: Column<Alias>[] = [
    {
      key: "source",
      header: t("aliases.source"),
      cell: (a) => (
        <div className="flex items-center gap-2">
          <code className="font-mono text-sm text-foreground">{a.source}</code>
          {a.catchAll && <Badge variant="info">{t("aliases.catchAll")}</Badge>}
        </div>
      ),
    },
    {
      key: "arrow",
      header: "",
      headClassName: "w-8",
      cell: () => <ArrowRight className="h-4 w-4 text-muted-foreground" />,
    },
    {
      key: "destinations",
      header: t("aliases.destination"),
      cell: (a) => (
        <div className="flex flex-wrap gap-1.5">
          {a.destinations.map((d) => (
            <code
              key={d}
              className="rounded border border-border bg-card/60 px-1.5 py-0.5 font-mono text-xs text-muted-foreground"
            >
              {d}
            </code>
          ))}
        </div>
      ),
    },
    {
      key: "domain",
      header: t("aliases.domain"),
      cell: (a) => (
        <span className="text-sm text-muted-foreground">{a.domain}</span>
      ),
    },
    {
      key: "status",
      header: t("common.status"),
      cell: (a) => (
        <Badge variant={a.status === "active" ? "success" : "muted"}>
          {t(`common.${a.status}`)}
        </Badge>
      ),
    },
    {
      key: "actions",
      header: "",
      headClassName: "w-10",
      cell: (a) => (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon-sm">
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => api.toggleAlias(a.id).then(reload)}>
              {a.status === "active" ? t("common.disable") : t("common.enable")}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              variant="destructive"
              onClick={() => setDeleteTarget(a)}
            >
              <Trash2 /> {t("aliases.deleteAlias")}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title={t("aliases.title")}
        description={t("aliases.subtitle")}
        icon={<Users />}
        actions={
          <WriteOnly>
            <Button size="sm" onClick={() => setCreateOpen(true)}>
              <Plus className="h-4 w-4" /> {t("aliases.createAlias")}
            </Button>
          </WriteOnly>
        }
      />

      <div className="flex items-center gap-3">
        <div className="relative max-w-xs flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("aliases.searchPlaceholder")}
            className="pl-9"
          />
        </div>
        <Badge variant="muted">{t("aliases.count", { count: rows.length })}</Badge>
      </div>

      <DataTable
        columns={columns}
        rows={rows}
        loading={loading}
        rowKey={(a) => a.id}
        empty={
          <EmptyState
            icon={Users}
            title={t("aliases.noAliasesTitle")}
            description={t("aliases.noAliasesDesc")}
            action={
              <Button size="sm" onClick={() => setCreateOpen(true)}>
                <Plus className="h-4 w-4" /> {t("aliases.createAlias")}
              </Button>
            }
          />
        }
      />

      <CreateAliasDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        domains={(domains ?? []).map((d) => d.name)}
        onCreated={reload}
      />
      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(o) => !o && setDeleteTarget(null)}
        title={t("aliases.deleteTitle", { source: deleteTarget?.source })}
        destructive
        confirmLabel={t("aliases.deleteAlias")}
        description={t("aliases.deleteDesc")}
        onConfirm={() => {
          if (deleteTarget) api.deleteAlias(deleteTarget.id).then(reload);
          setDeleteTarget(null);
        }}
      />
    </div>
  );
}

function CreateAliasDialog({
  open,
  onOpenChange,
  domains,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  domains: string[];
  onCreated: () => void;
}) {
  const { t } = useTranslation();
  const [source, setSource] = useState("");
  const [domain, setDomain] = useState(domains[0] ?? "");
  const [destinations, setDestinations] = useState<string[]>([""]);
  const [catchAll, setCatchAll] = useState(false);
  const [saving, setSaving] = useState(false);

  const effectiveDomain = domain || domains[0] || "";

  const submit = async () => {
    const dests = destinations.map((d) => d.trim()).filter(Boolean);
    if (!effectiveDomain || dests.length === 0) return;
    setSaving(true);
    try {
      await api.createAlias({
        source: catchAll ? `*@${effectiveDomain}` : `${source.trim()}@${effectiveDomain}`,
        domain: effectiveDomain,
        destinations: dests,
        catchAll,
      });
      onCreated();
      onOpenChange(false);
      setSource("");
      setDestinations([""]);
      setCatchAll(false);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("aliases.createAlias")}</DialogTitle>
          <DialogDescription>{t("aliases.createDesc")}</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-1">
          <div className="grid grid-cols-[1fr_auto] items-end gap-2">
            <div className="space-y-1.5">
              <Label>{t("aliases.sourceAddress")}</Label>
              <Input
                value={catchAll ? "*" : source}
                onChange={(e) => setSource(e.target.value)}
                placeholder={catchAll ? "*" : "hello"}
                className="font-mono"
                disabled={catchAll}
              />
            </div>
            <Select value={effectiveDomain} onValueChange={setDomain}>
              <SelectTrigger className="w-44">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {domains.map((d) => (
                  <SelectItem key={d} value={d}>
                    @{d}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <label className="flex items-center gap-2 text-sm text-muted-foreground">
            <input
              type="checkbox"
              checked={catchAll}
              onChange={(e) => setCatchAll(e.target.checked)}
              className="h-4 w-4 rounded border-border accent-[hsl(var(--primary))]"
            />
            {t("aliases.catchAllLabel")}
          </label>

          <div className="space-y-2">
            <Label>{t("aliases.destinations")}</Label>
            {destinations.map((value, i) => (
              <div key={i} className="flex gap-2">
                <Input
                  value={value}
                  onChange={(e) =>
                    setDestinations((d) =>
                      d.map((v, idx) => (idx === i ? e.target.value : v))
                    )
                  }
                  placeholder="user@example.com"
                  className="font-mono"
                />
                {destinations.length > 1 && (
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() =>
                      setDestinations((d) => d.filter((_, idx) => idx !== i))
                    }
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                )}
              </div>
            ))}
            <Button
              variant="outline"
              size="sm"
              onClick={() => setDestinations((d) => [...d, ""])}
            >
              <Plus className="h-4 w-4" /> {t("aliases.addDestination")}
            </Button>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t("common.cancel")}
          </Button>
          <Button onClick={submit} disabled={saving}>
            {saving ? t("common.creating") : t("aliases.createAlias")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
