import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  DownloadCloud,
  Inbox,
  KeyRound,
  Loader2,
  Mail,
  MoreHorizontal,
  Plus,
  Power,
  Search,
  SlidersHorizontal,
  Trash2,
} from "lucide-react";
import { PageHeader } from "@/components/common/PageHeader";
import { WriteOnly } from "@/components/common/WriteOnly";
import { DataTable, type Column } from "@/components/common/DataTable";
import { ResourceUsageBar } from "@/components/common/ResourceUsageBar";
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
import { api } from "@/lib/api";
import { useApi } from "@/lib/useApi";
import { formatBytes, pct, timeAgo } from "@/lib/utils";
import type { Mailbox, MailboxStatus } from "@/types";

const statusVariant: Record<MailboxStatus, "success" | "muted" | "warning"> = {
  active: "success",
  disabled: "muted",
  suspended: "warning",
};

export function MailboxesPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { data, loading, reload } = useApi(() => api.mailboxes());
  const { data: domains } = useApi(() => api.domains(), []);
  const [query, setQuery] = useState("");
  const [domainFilter, setDomainFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [createOpen, setCreateOpen] = useState(false);
  const [resetTarget, setResetTarget] = useState<Mailbox | null>(null);
  const [quotaTarget, setQuotaTarget] = useState<Mailbox | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Mailbox | null>(null);
  const [importTarget, setImportTarget] = useState<Mailbox | null>(null);

  const all = data ?? [];
  const rows = useMemo(
    () =>
      all.filter((m) => {
        const matchesQuery =
          m.email.toLowerCase().includes(query.toLowerCase()) ||
          m.displayName.toLowerCase().includes(query.toLowerCase());
        const matchesDomain = domainFilter === "all" || m.domain === domainFilter;
        const matchesStatus = statusFilter === "all" || m.status === statusFilter;
        return matchesQuery && matchesDomain && matchesStatus;
      }),
    [all, query, domainFilter, statusFilter]
  );

  const openMail = (m: Mailbox) => navigate(`/mailboxes/${m.id}/mail`);

  const columns: Column<Mailbox>[] = [
    {
      key: "email",
      header: t("mailboxes.columnMailbox"),
      cell: (m) => (
        <button
          type="button"
          onClick={() => openMail(m)}
          className="flex items-center gap-2.5 text-left"
        >
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
            {m.displayName.slice(0, 2).toUpperCase()}
          </span>
          <div>
            <p className="font-medium text-foreground hover:text-primary">
              {m.email}
            </p>
            <p className="text-2xs text-muted-foreground">{m.displayName}</p>
          </div>
        </button>
      ),
    },
    {
      key: "quota",
      header: t("mailboxes.usage"),
      className: "w-52",
      cell: (m) => {
        const percent = pct(m.usedMb, m.quotaMb);
        return (
          <div className="space-y-1">
            <div className="flex justify-between text-2xs text-muted-foreground">
              <span>
                {formatBytes(m.usedMb * 1024 * 1024, 1)} /{" "}
                {formatBytes(m.quotaMb * 1024 * 1024, 0)}
              </span>
              <span>{percent}%</span>
            </div>
            <ResourceUsageBar value={percent} size="sm" />
          </div>
        );
      },
    },
    {
      key: "status",
      header: t("common.status"),
      cell: (m) => (
        <Badge variant={statusVariant[m.status]}>
          {t(`common.${m.status}`)}
        </Badge>
      ),
    },
    {
      key: "lastLogin",
      header: t("mailboxes.lastLogin"),
      cell: (m) => (
        <span className="text-sm text-muted-foreground">
          {m.lastLogin ? timeAgo(m.lastLogin) : t("common.never")}
        </span>
      ),
    },
    {
      key: "actions",
      header: "",
      headClassName: "w-10",
      cell: (m) => (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon-sm">
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => openMail(m)}>
              <Inbox /> {t("mailboxes.openMail")}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => setResetTarget(m)}>
              <KeyRound /> {t("mailboxes.resetPassword")}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setQuotaTarget(m)}>
              <SlidersHorizontal /> {t("mailboxes.editQuota")}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setImportTarget(m)}>
              <DownloadCloud /> {t("mailboxes.importMail")}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => api.toggleMailbox(m.id).then(reload)}>
              <Power />{" "}
              {m.status === "active"
                ? t("mailboxes.disableMailbox")
                : t("mailboxes.enableMailbox")}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              variant="destructive"
              onClick={() => setDeleteTarget(m)}
            >
              <Trash2 /> {t("mailboxes.deleteMailbox")}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title={t("mailboxes.title")}
        description={t("mailboxes.subtitle")}
        icon={<Mail />}
        actions={
          <WriteOnly>
            <Button size="sm" onClick={() => setCreateOpen(true)}>
              <Plus className="h-4 w-4" /> {t("mailboxes.createMailbox")}
            </Button>
          </WriteOnly>
        }
      />

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative max-w-xs flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("mailboxes.searchPlaceholder")}
            className="pl-9"
          />
        </div>
        <Select value={domainFilter} onValueChange={setDomainFilter}>
          <SelectTrigger className="w-44">
            <SelectValue placeholder={t("aliases.domain")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("mailboxes.allDomains")}</SelectItem>
            {(domains ?? []).map((d) => (
              <SelectItem key={d.id} value={d.name}>
                {d.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-36">
            <SelectValue placeholder={t("common.status")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("mailboxes.allStatuses")}</SelectItem>
            <SelectItem value="active">{t("common.active")}</SelectItem>
            <SelectItem value="disabled">{t("common.disabled")}</SelectItem>
            <SelectItem value="suspended">{t("common.suspended")}</SelectItem>
          </SelectContent>
        </Select>
        <Badge variant="muted" className="ml-auto">
          {t("mailboxes.countOf", { shown: rows.length, total: all.length })}
        </Badge>
      </div>

      <DataTable
        columns={columns}
        rows={rows}
        loading={loading}
        rowKey={(m) => m.id}
        empty={
          <EmptyState
            icon={Mail}
            title={t("mailboxes.noMatchTitle")}
            description={t("mailboxes.noMatchDesc")}
          />
        }
      />

      <CreateMailboxDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        domains={(domains ?? []).map((d) => d.name)}
        onCreated={reload}
      />
      <ResetPasswordDialog
        mailbox={resetTarget}
        onClose={() => setResetTarget(null)}
      />
      <QuotaDialog
        mailbox={quotaTarget}
        onClose={() => setQuotaTarget(null)}
        onSaved={reload}
      />
      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(o) => !o && setDeleteTarget(null)}
        title={t("mailboxes.deleteTitle", { email: deleteTarget?.email })}
        destructive
        confirmLabel={t("mailboxes.deleteMailbox")}
        description={t("mailboxes.deleteDesc")}
        onConfirm={() => {
          if (deleteTarget) api.deleteMailbox(deleteTarget.id).then(reload);
          setDeleteTarget(null);
        }}
      />
      <ImportDialog mailbox={importTarget} onClose={() => setImportTarget(null)} />
    </div>
  );
}

function ImportDialog({
  mailbox,
  onClose,
}: {
  mailbox: Mailbox | null;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const [host, setHost] = useState("");
  const [port, setPort] = useState(993);
  const [user, setUser] = useState("");
  const [password, setPassword] = useState("");
  const [ssl, setSsl] = useState(true);
  const [localPassword, setLocalPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [started, setStarted] = useState(false);

  useEffect(() => {
    if (mailbox) {
      setHost("");
      setUser(mailbox.email);
      setPassword("");
      setLocalPassword("");
      setStarted(false);
    }
  }, [mailbox]);

  const submit = async () => {
    if (!mailbox || !host || !user || !password || !localPassword) return;
    setBusy(true);
    try {
      await api.importMail(mailbox.id, { host, port, user, password, ssl, localPassword });
      setStarted(true);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={!!mailbox} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{t("mailboxes.importMail")}</DialogTitle>
          <DialogDescription>
            {t("mailboxes.importDesc", { email: mailbox?.email })}
          </DialogDescription>
        </DialogHeader>
        {started ? (
          <div className="space-y-3 py-2">
            <p className="text-sm text-foreground">{t("mailboxes.importStarted")}</p>
            <p className="text-2xs text-muted-foreground">{t("mailboxes.importStartedHint")}</p>
          </div>
        ) : (
          <div className="space-y-3 py-1">
            <div className="grid grid-cols-3 gap-2">
              <div className="col-span-2 space-y-1.5">
                <Label>{t("mailboxes.importHost")}</Label>
                <Input
                  value={host}
                  onChange={(e) => setHost(e.target.value)}
                  placeholder="imap.gmail.com"
                  className="font-mono"
                />
              </div>
              <div className="space-y-1.5">
                <Label>{t("mailboxes.importPort")}</Label>
                <Input
                  type="number"
                  value={port}
                  onChange={(e) => setPort(Number(e.target.value))}
                  className="font-mono"
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>{t("mailboxes.importUser")}</Label>
              <Input value={user} onChange={(e) => setUser(e.target.value)} className="font-mono" />
            </div>
            <div className="space-y-1.5">
              <Label>{t("mailboxes.importPassword")}</Label>
              <Input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
              />
            </div>
            <label className="flex items-center gap-2 text-sm text-foreground">
              <input type="checkbox" checked={ssl} onChange={(e) => setSsl(e.target.checked)} />
              {t("mailboxes.importSsl")}
            </label>
            <div className="space-y-1.5">
              <Label>{t("mailboxes.importLocalPassword")}</Label>
              <Input
                type="password"
                value={localPassword}
                onChange={(e) => setLocalPassword(e.target.value)}
                placeholder="••••••••"
              />
              <p className="text-2xs text-muted-foreground">{t("mailboxes.importLocalHint")}</p>
            </div>
          </div>
        )}
        <DialogFooter>
          {started ? (
            <Button onClick={onClose}>{t("common.close")}</Button>
          ) : (
            <>
              <Button variant="outline" onClick={onClose}>
                {t("common.cancel")}
              </Button>
              <Button
                onClick={submit}
                disabled={busy || !host || !user || !password || !localPassword}
              >
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <DownloadCloud className="h-4 w-4" />}
                {t("mailboxes.importStart")}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CreateMailboxDialog({
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
  const [local, setLocal] = useState("");
  const [domain, setDomain] = useState(domains[0] ?? "");
  const [displayName, setDisplayName] = useState("");
  const [password, setPassword] = useState("");
  const [quota, setQuota] = useState(2048);
  const [saving, setSaving] = useState(false);

  const effectiveDomain = domain || domains[0] || "";

  const submit = async () => {
    if (!local.trim() || !effectiveDomain) return;
    setSaving(true);
    try {
      await api.createMailbox({
        email: `${local.trim()}@${effectiveDomain}`,
        displayName: displayName || local.trim(),
        domain: effectiveDomain,
        quotaMb: quota,
        password: password || undefined,
      });
      onCreated();
      onOpenChange(false);
      setLocal("");
      setDisplayName("");
      setPassword("");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("mailboxes.createMailbox")}</DialogTitle>
          <DialogDescription>{t("mailboxes.createDesc")}</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-1">
          <div className="grid grid-cols-[1fr_auto] items-end gap-2">
            <div className="space-y-1.5">
              <Label>{t("mailboxes.localPart")}</Label>
              <Input
                value={local}
                onChange={(e) => setLocal(e.target.value)}
                placeholder="jane.doe"
                className="font-mono"
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
          <div className="space-y-1.5">
            <Label>{t("mailboxes.displayName")}</Label>
            <Input
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="Jane Doe"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>{t("login.password")}</Label>
              <Input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
              />
            </div>
            <div className="space-y-1.5">
              <Label>{t("mailboxes.quotaMb")}</Label>
              <Input
                type="number"
                value={quota}
                onChange={(e) => setQuota(Number(e.target.value))}
              />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t("common.cancel")}
          </Button>
          <Button onClick={submit} disabled={saving || !local.trim()}>
            {saving ? t("common.creating") : t("mailboxes.createMailbox")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ResetPasswordDialog({
  mailbox,
  onClose,
}: {
  mailbox: Mailbox | null;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const mismatch = confirm.length > 0 && password !== confirm;

  // Reset fields whenever a different mailbox is opened.
  useEffect(() => {
    setPassword("");
    setConfirm("");
  }, [mailbox]);

  const submit = async () => {
    if (!password || mismatch || !mailbox) return;
    await api.resetMailboxPassword(mailbox.id, password);
    onClose();
  };
  return (
    <Dialog open={!!mailbox} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{t("mailboxes.resetPassword")}</DialogTitle>
          <DialogDescription>
            {t("mailboxes.resetFor")}{" "}
            <span className="font-mono text-foreground">{mailbox?.email}</span>.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-1">
          <div className="space-y-1.5">
            <Label>{t("mailboxes.newPassword")}</Label>
            <Input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••••••"
            />
          </div>
          <div className="space-y-1.5">
            <Label>{t("mailboxes.confirmPassword")}</Label>
            <Input
              type="password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              placeholder="••••••••••••"
              className={mismatch ? "border-destructive" : undefined}
            />
          </div>
          <p className="text-xs text-muted-foreground">
            {t("mailboxes.resetHint")}
          </p>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            {t("common.cancel")}
          </Button>
          <Button onClick={submit} disabled={!password || mismatch}>
            {t("mailboxes.resetPassword")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function QuotaDialog({
  mailbox,
  onClose,
  onSaved,
}: {
  mailbox: Mailbox | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { t } = useTranslation();
  const [quota, setQuota] = useState(mailbox?.quotaMb ?? 2048);
  // Reset the editor value whenever a different mailbox is opened.
  useEffect(() => {
    if (mailbox) setQuota(mailbox.quotaMb);
  }, [mailbox]);
  const submit = async () => {
    if (mailbox) await api.setMailboxQuota(mailbox.id, quota);
    onSaved();
    onClose();
  };
  return (
    <Dialog open={!!mailbox} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{t("mailboxes.editQuota")}</DialogTitle>
          <DialogDescription>
            {t("mailboxes.editQuotaFor")}{" "}
            <span className="font-mono text-foreground">{mailbox?.email}</span>.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3 py-1">
          <div className="space-y-1.5">
            <Label>{t("mailboxes.quotaMb")}</Label>
            <Input
              type="number"
              value={quota}
              onChange={(e) => setQuota(Number(e.target.value))}
            />
          </div>
          {mailbox && (
            <p className="text-xs text-muted-foreground">
              {t("mailboxes.currentlyUsing", {
                used: formatBytes(mailbox.usedMb * 1024 * 1024, 1),
                percent: pct(mailbox.usedMb, mailbox.quotaMb),
              })}
            </p>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            {t("common.cancel")}
          </Button>
          <Button onClick={submit}>{t("mailboxes.saveQuota")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
