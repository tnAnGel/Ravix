import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Cloud,
  Globe,
  MoreHorizontal,
  Plus,
  RefreshCw,
  Search,
  Trash2,
} from "lucide-react";
import { Link } from "react-router-dom";
import { PageHeader } from "@/components/common/PageHeader";
import { WriteOnly } from "@/components/common/WriteOnly";
import { DataTable, type Column } from "@/components/common/DataTable";
import { StatusBadge, CheckBadge } from "@/components/common/StatusBadge";
import { ConfirmDialog } from "@/components/common/ConfirmDialog";
import { EmptyState } from "@/components/common/EmptyState";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
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
import type { CheckStatus, Domain } from "@/types";

const checkLabels: { key: keyof Domain["checks"]; label: string }[] = [
  { key: "mx", label: "MX" },
  { key: "spf", label: "SPF" },
  { key: "dkim", label: "DKIM" },
  { key: "dmarc", label: "DMARC" },
  { key: "ssl", label: "SSL" },
];

export function DomainsPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { data, loading, reload } = useApi(() => api.domains());
  const [query, setQuery] = useState("");
  const [addOpen, setAddOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Domain | null>(null);

  const rows = useMemo(
    () =>
      (data ?? []).filter((d) =>
        d.name.toLowerCase().includes(query.toLowerCase())
      ),
    [data, query]
  );

  const columns: Column<Domain>[] = [
    {
      key: "name",
      header: t("domains.columnDomain"),
      cell: (d) => (
        <div className="flex items-center gap-2.5">
          <span className="flex h-8 w-8 items-center justify-center rounded-md border border-border bg-card text-muted-foreground">
            <Globe className="h-4 w-4" />
          </span>
          <div>
            <p className="font-medium text-foreground">{d.name}</p>
            <p className="text-2xs text-muted-foreground">
              {t("domains.mailboxesAliases", {
                mailboxes: d.mailboxes,
                aliases: d.aliases,
              })}
            </p>
          </div>
        </div>
      ),
    },
    ...checkLabels.map((c) => ({
      key: c.key,
      header: c.label,
      headClassName: "text-center",
      className: "text-center",
      cell: (d: Domain) => <DnsDot status={d.checks[c.key]} />,
    })),
    {
      key: "status",
      header: t("common.status"),
      cell: (d) => <StatusBadge status={d.status} />,
    },
    {
      key: "actions",
      header: "",
      headClassName: "w-10",
      cell: (d) => (
        <DropdownMenu>
          <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
            <Button variant="ghost" size="icon-sm">
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
            <DropdownMenuItem onClick={() => navigate(`/domains/${d.id}`)}>
              {t("domains.viewDetails")}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => api.recheckDomain(d.id).then(reload)}>
              <RefreshCw /> {t("domains.recheckDns")}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              variant="destructive"
              onClick={() => setDeleteTarget(d)}
            >
              <Trash2 /> {t("domains.removeDomain")}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title={t("domains.title")}
        description={t("domains.subtitle")}
        icon={<Globe />}
        actions={
          <>
            <Button variant="outline" size="sm" onClick={() => reload()}>
              <RefreshCw className="h-4 w-4" /> {t("domains.recheckAll")}
            </Button>
            <WriteOnly>
              <Button variant="outline" size="sm" asChild>
                <Link to="/domains/cloudflare">
                  <Cloud className="h-4 w-4" /> {t("domains.cloudflareQuickAdd")}
                </Link>
              </Button>
            </WriteOnly>
            <WriteOnly>
              <Button size="sm" onClick={() => setAddOpen(true)}>
                <Plus className="h-4 w-4" /> {t("domains.addDomain")}
              </Button>
            </WriteOnly>
          </>
        }
      />

      <div className="flex items-center gap-3">
        <div className="relative max-w-xs flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("domains.searchPlaceholder")}
            className="pl-9"
          />
        </div>
        <Badge variant="muted">{t("domains.count", { count: rows.length })}</Badge>
      </div>

      <DataTable
        columns={columns}
        rows={rows}
        loading={loading}
        rowKey={(d) => d.id}
        onRowClick={(d) => navigate(`/domains/${d.id}`)}
        empty={
          <EmptyState
            icon={Globe}
            title={t("domains.noDomainsTitle")}
            description={t("domains.noDomainsDesc")}
            action={
              <Button size="sm" onClick={() => setAddOpen(true)}>
                <Plus className="h-4 w-4" /> {t("domains.addDomain")}
              </Button>
            }
          />
        }
      />

      <AddDomainDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        onCreated={reload}
      />
      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(o) => !o && setDeleteTarget(null)}
        title={t("domains.removeTitle", { name: deleteTarget?.name })}
        destructive
        confirmLabel={t("domains.removeDomain")}
        description={t("domains.removeDesc")}
        onConfirm={() => {
          if (deleteTarget) api.deleteDomain(deleteTarget.id).then(reload);
          setDeleteTarget(null);
        }}
      />
    </div>
  );
}

function DnsDot({ status }: { status: CheckStatus }) {
  return (
    <div className="flex justify-center">
      <CheckBadge status={status} label="" showIcon className="px-1.5" />
    </div>
  );
}

function AddDomainDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onCreated: () => void;
}) {
  const { t } = useTranslation();
  const [name, setName] = useState("");
  const [selector, setSelector] = useState("ravix2026");
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (!name.trim()) return;
    setSaving(true);
    try {
      await api.createDomain({ name: name.trim(), dkimSelector: selector });
      onCreated();
      onOpenChange(false);
      setName("");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("domains.addDomain")}</DialogTitle>
          <DialogDescription>{t("domains.addDialogDesc")}</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-1">
          <div className="space-y-1.5">
            <Label htmlFor="domain">{t("domains.domainName")}</Label>
            <Input
              id="domain"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="example.org"
              className="font-mono"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="dkim">{t("domains.dkimSelector")}</Label>
            <Input
              id="dkim"
              value={selector}
              onChange={(e) => setSelector(e.target.value)}
              className="font-mono"
            />
            <p className="text-xs text-muted-foreground">
              {t("domains.dkimSelectorHint")}
            </p>
          </div>
          <div className="rounded-md border border-info/30 bg-info/10 p-3 text-sm text-foreground/90">
            {t("domains.addInfo")}
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t("common.cancel")}
          </Button>
          <Button onClick={submit} disabled={saving || !name.trim()}>
            {saving ? t("domains.adding") : t("domains.addDomain")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
