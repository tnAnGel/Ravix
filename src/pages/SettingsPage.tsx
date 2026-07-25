import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  Database,
  HardDrive,
  KeyRound,
  Mail,
  Plus,
  RefreshCw,
  Settings,
  Shield,
  SlidersHorizontal,
  Terminal,
  Trash2,
  UserCircle,
  UserCog,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { PageHeader } from "@/components/common/PageHeader";
import { RoleSelect } from "@/components/common/RoleSelect";
import { CopyButton } from "@/components/common/CopyButton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { api } from "@/lib/api";
import { useApi } from "@/lib/useApi";
import { cn } from "@/lib/utils";
import { useTranslation } from "react-i18next";

const TABS = ["profile", "general", "relay", "security", "updates", "storage", "api", "advanced"];

export function SettingsPage() {
  const { t } = useTranslation();
  const [searchParams, setSearchParams] = useSearchParams();
  const tab = TABS.includes(searchParams.get("tab") ?? "")
    ? (searchParams.get("tab") as string)
    : "general";
  const { data: adminUsers, reload: reloadAdmins } = useApi(() => api.adminUsers());
  const { data: me } = useApi(() => api.me(), []);
  const isOwner = (me?.role ?? "").toLowerCase() === "owner";
  const [addAdminOpen, setAddAdminOpen] = useState(false);
  const { data, loading } = useApi(() => api.settings());
  const s = data ?? {};
  const v = (key: string, fallback = "") => s[key] ?? fallback;

  const [panelUrl, setPanelUrl] = useState("");
  const [timezone, setTimezone] = useState("utc");
  const [hostname, setHostname] = useState("");
  useEffect(() => {
    if (data) {
      setPanelUrl(data.panel_url ?? "https://mail.example.com:8443");
      setTimezone(data.timezone ?? "utc");
      setHostname(data.hostname ?? "");
    }
  }, [data]);

  const saveGeneral = () =>
    api.updateSettings({ panel_url: panelUrl, timezone, hostname });

  if (loading || !data) {
    return (
      <div className="space-y-6">
        <PageHeader
          title={t("settings.title")}
          description={t("settings.subtitle")}
          icon={<Settings />}
        />
        <Skeleton className="h-9 w-96" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={t("settings.title")}
        description={t("settings.subtitle")}
        icon={<Settings />}
      />

      <Tabs
        value={tab}
        onValueChange={(value) => setSearchParams({ tab: value }, { replace: true })}
      >
        <TabsList>
          <TabsTrigger value="profile">{t("settings.tabs.profile")}</TabsTrigger>
          <TabsTrigger value="general">{t("settings.tabs.general")}</TabsTrigger>
          <TabsTrigger value="relay">{t("settings.tabs.relay")}</TabsTrigger>
          <TabsTrigger value="security">{t("settings.tabs.security")}</TabsTrigger>
          <TabsTrigger value="updates">{t("settings.tabs.updates")}</TabsTrigger>
          <TabsTrigger value="storage">{t("settings.tabs.storage")}</TabsTrigger>
          <TabsTrigger value="api">{t("settings.tabs.api")}</TabsTrigger>
          <TabsTrigger value="advanced">{t("settings.tabs.advanced")}</TabsTrigger>
        </TabsList>

        {/* Profile */}
        <TabsContent value="profile" className="space-y-4">
          <SettingsCard
            icon={UserCircle}
            title={t("settings.profile")}
            description={t("settings.profileDesc")}
          >
            <div className="flex items-center gap-3 rounded-md border border-border bg-card/40 px-4 py-3">
              <span className="flex h-11 w-11 items-center justify-center rounded-full bg-gradient-to-br from-primary/80 to-primary text-sm font-semibold text-primary-foreground">
                {(me?.email ?? "—").slice(0, 2).toUpperCase()}
              </span>
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-foreground">
                  {me?.email ?? "—"}
                </p>
                <p className="text-2xs text-muted-foreground">
                  {(() => {
                    const r = (me?.role ?? "admin").toLowerCase();
                    return t(`settings.role${r.charAt(0).toUpperCase()}${r.slice(1)}`, r);
                  })()}
                </p>
              </div>
            </div>
          </SettingsCard>

          <ChangePasswordCard />
        </TabsContent>

        {/* General */}
        <TabsContent value="general" className="space-y-4">
          <SettingsCard
            icon={SlidersHorizontal}
            title={t("settings.general")}
            description={t("settings.generalDesc")}
          >
            <Field label={t("settings.mailHostname")} hint={t("settings.mailHostnameHint")}>
              <Input
                value={hostname}
                onChange={(e) => setHostname(e.target.value)}
                placeholder="mail.example.com"
                className="font-mono"
              />
            </Field>
            <Field label={t("settings.panelUrl")} hint={t("settings.panelUrlHint")}>
              <Input
                value={panelUrl}
                onChange={(e) => setPanelUrl(e.target.value)}
                className="font-mono"
              />
            </Field>
            <Field label={t("settings.timezone")}>
              <Select value={timezone} onValueChange={setTimezone}>
                <SelectTrigger className="max-w-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="utc">UTC</SelectItem>
                  <SelectItem value="berlin">Europe/Berlin</SelectItem>
                  <SelectItem value="ny">America/New_York</SelectItem>
                  <SelectItem value="tokyo">Asia/Tokyo</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <SaveBar onSave={saveGeneral} />
          </SettingsCard>
        </TabsContent>

        {/* Outbound SMTP relay */}
        <TabsContent value="relay" className="space-y-4">
          <RelayCard />
        </TabsContent>

        {/* Security */}
        <TabsContent value="security" className="space-y-4">
          <SettingsCard
            icon={UserCog}
            title={t("settings.adminUsers")}
            description={t("settings.adminUsersDesc")}
            action={
              isOwner ? (
                <Button variant="outline" size="sm" onClick={() => setAddAdminOpen(true)}>
                  <Plus className="h-4 w-4" /> {t("settings.addAdmin")}
                </Button>
              ) : undefined
            }
          >
            {!isOwner && (
              <p className="mb-3 rounded-md border border-border bg-card/40 p-2.5 text-2xs text-muted-foreground">
                {t("settings.ownerOnlyTeam")}
              </p>
            )}
            <div className="divide-y divide-border/60">
              {(adminUsers ?? []).map((u) => {
                const role = (u.role || "admin").toLowerCase();
                const isSelf = me?.id === u.id;
                return (
                  <div
                    key={u.id}
                    className="flex items-center justify-between py-3"
                  >
                    <div className="flex items-center gap-2.5">
                      <span className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
                        {u.email.slice(0, 2).toUpperCase()}
                      </span>
                      <div>
                        <p className="text-sm font-medium text-foreground">
                          {u.email}
                          {isSelf && (
                            <span className="ml-1 text-2xs text-muted-foreground">
                              ({t("settings.you")})
                            </span>
                          )}
                        </p>
                        {isOwner && !isSelf ? (
                          <RoleSelect
                            value={role}
                            onChange={(v) => api.changeAdminRole(u.id, v).then(reloadAdmins)}
                            className="mt-0.5 h-7 w-auto gap-1 text-2xs"
                          />
                        ) : (
                          <p className="text-2xs text-muted-foreground">
                            {t(`settings.role${role.charAt(0).toUpperCase()}${role.slice(1)}`, role)}
                          </p>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        disabled={!isOwner && !isSelf}
                        onClick={() =>
                          api.toggleAdminTwoFactor(u.id).then(reloadAdmins)
                        }
                      >
                        {u.twoFactor ? (
                          <Badge variant="success">{t("settings.twoFaOn")}</Badge>
                        ) : (
                          <Badge variant="muted">{t("settings.twoFaOff")}</Badge>
                        )}
                      </button>
                      {isOwner && !isSelf && (
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          onClick={() =>
                            api.deleteAdminUser(u.id).then(reloadAdmins)
                          }
                        >
                          <Trash2 className="h-3.5 w-3.5 text-destructive" />
                        </Button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </SettingsCard>

          <TwoFactorCard enabled={!!me?.twoFactor} onChanged={() => window.location.reload()} />

          <SettingsCard
            icon={Shield}
            title={t("settings.twoFa")}
            description={t("settings.twoFaDesc")}
          >
            <ToggleRow
              label={t("settings.require2fa")}
              description={t("settings.require2faDesc")}
              defaultChecked={false}
            />
            <ToggleRow
              label={t("settings.loginRateLimit")}
              description={t("settings.loginRateLimitDesc")}
              defaultChecked
            />
          </SettingsCard>
        </TabsContent>

        {/* Updates */}
        <TabsContent value="updates" className="space-y-4">
          <SettingsCard
            icon={RefreshCw}
            title={t("settings.updates")}
            description={t("settings.updatesDesc")}
          >
            <div className="flex items-center justify-between rounded-md border border-border bg-card/40 px-4 py-3">
              <div>
                <p className="text-sm font-medium text-foreground">
                  {t("settings.currentVersion")}
                </p>
                <p className="text-2xs text-muted-foreground">
                  {t("settings.upToDate", { version: v("version", "0.1.0") })}
                </p>
              </div>
              <Button variant="outline" size="sm">
                <RefreshCw className="h-4 w-4" /> {t("settings.checkUpdates")}
              </Button>
            </div>
            <Field label={t("settings.updateChannel")}>
              <Select defaultValue={v("update_channel", "stable")}>
                <SelectTrigger className="max-w-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="stable">{t("settings.stable")}</SelectItem>
                  <SelectItem value="beta">{t("settings.beta")}</SelectItem>
                  <SelectItem value="edge">{t("settings.edge")}</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <ToggleRow
              label={t("settings.autoSecurity")}
              description={t("settings.autoSecurityDesc")}
              defaultChecked
            />
          </SettingsCard>
        </TabsContent>

        {/* Storage — real paths read from the running backend, not the
            previous SQLite placeholder (we use PostgreSQL). */}
        <TabsContent value="storage" className="space-y-4">
          <SettingsCard
            icon={HardDrive}
            title={t("settings.storage")}
            description={t("settings.storageDesc")}
          >
            <PathField label={t("settings.storagePath")} value={v("path_data", "/var/lib/ravix")} />
            <PathField label={t("settings.configPath")} value={v("path_config", "/etc/ravix")} />
            <PathField label={t("settings.logPath")} value={v("path_logs", "/var/log/ravix")} />
            <div className="rounded-md border border-border bg-card/40 p-4 font-mono text-xs">
              <div className="mb-2 flex items-center gap-2 text-muted-foreground">
                <Database className="h-3.5 w-3.5" /> PostgreSQL
              </div>
              <div className="flex items-center justify-between">
                <code className="text-foreground/90">
                  {v("db_url", "jdbc:postgresql://localhost:5432/ravix")}
                </code>
                <CopyButton value={v("db_url", "jdbc:postgresql://localhost:5432/ravix")} />
              </div>
              <p className="mt-2 text-2xs text-muted-foreground">
                {t("settings.dbHint")}
              </p>
            </div>
          </SettingsCard>
        </TabsContent>

        {/* Advanced — real runtime info, not the previous sudo/agent mock
            select (we always run as a single systemd unit as root). */}
        <TabsContent value="api" className="space-y-4">
          <ApiKeysSection />
        </TabsContent>

        <TabsContent value="advanced" className="space-y-4">
          <SettingsCard
            icon={Terminal}
            title={t("settings.advanced")}
            description={t("settings.advancedDesc")}
          >
            <Field
              label={t("settings.runtimeUser")}
              hint={t("settings.runtimeUserHint")}
            >
              <code className="inline-block rounded border border-border bg-card/40 px-2 py-1 font-mono text-xs">
                root (systemd unit ravix.service)
              </code>
            </Field>
            <Field label={t("settings.runtimeBinary")}>
              <code className="inline-block break-all rounded border border-border bg-card/40 px-2 py-1 font-mono text-xs">
                {v("path_app", "/opt/ravix/quarkus-app/quarkus-run.jar")}
              </code>
            </Field>
            <Field label={t("settings.envFile")}>
              <code className="inline-block rounded border border-border bg-card/40 px-2 py-1 font-mono text-xs">
                /etc/ravix/ravix.env
              </code>
            </Field>
          </SettingsCard>
        </TabsContent>
      </Tabs>

      <AddAdminDialog
        open={addAdminOpen}
        onOpenChange={setAddAdminOpen}
        onCreated={reloadAdmins}
      />
    </div>
  );
}

function SettingsCard({
  icon: Icon,
  title,
  description,
  action,
  children,
}: {
  icon: typeof Settings;
  title: string;
  description: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <Card>
      <CardHeader className="flex-row items-start justify-between space-y-0">
        <div className="flex items-start gap-3">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Icon className="h-4.5 w-4.5" />
          </span>
          <div>
            <CardTitle className="text-base">{title}</CardTitle>
            <CardDescription>{description}</CardDescription>
          </div>
        </div>
        {action}
      </CardHeader>
      <CardContent className="space-y-4">{children}</CardContent>
    </Card>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      {children}
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

function PathField({ label, value }: { label: string; value: string }) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <div className="flex max-w-lg items-center gap-2 rounded-md border border-border bg-card/40 px-3 py-1.5">
        <code className="flex-1 font-mono text-sm text-foreground">{value}</code>
        <CopyButton value={value} />
      </div>
    </div>
  );
}

function ToggleRow({
  label,
  description,
  defaultChecked,
}: {
  label: string;
  description: string;
  defaultChecked?: boolean;
}) {
  return (
    <label className="flex cursor-pointer items-center justify-between rounded-md border border-border bg-card/40 px-4 py-3">
      <div className="pr-4">
        <p className="text-sm font-medium text-foreground">{label}</p>
        <p className="text-xs text-muted-foreground">{description}</p>
      </div>
      <Switch defaultChecked={defaultChecked} />
    </label>
  );
}

function SaveBar({ onSave }: { onSave: () => Promise<unknown> }) {
  const { t } = useTranslation();
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const save = async () => {
    setSaving(true);
    try {
      await onSave();
      setSaved(true);
      window.setTimeout(() => setSaved(false), 1500);
    } finally {
      setSaving(false);
    }
  };
  return (
    <div className="flex items-center justify-end gap-2 border-t border-border pt-4">
      {saved && (
        <span className="text-xs text-success">{t("common.copied")}</span>
      )}
      <Button size="sm" onClick={save} disabled={saving}>
        {t("common.saveChanges")}
      </Button>
    </div>
  );
}

function TwoFactorCard({ enabled, onChanged }: { enabled: boolean; onChanged: () => void }) {
  const { t } = useTranslation();
  const [setup, setSetup] = useState<{ secret: string; otpauthUri: string } | null>(null);
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [disabling, setDisabling] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const begin = async () => {
    setError("");
    setBusy(true);
    try {
      setSetup(await api.twoFactorSetup());
    } finally {
      setBusy(false);
    }
  };

  const confirm = async () => {
    setError("");
    setBusy(true);
    try {
      await api.twoFactorEnable(code);
      onChanged();
    } catch {
      setError(t("settings.twoFaError"));
    } finally {
      setBusy(false);
    }
  };

  const disable = async () => {
    setError("");
    setBusy(true);
    try {
      await api.twoFactorDisable(password);
      onChanged();
    } catch {
      setError(t("settings.passwordError"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <SettingsCard
      icon={Shield}
      title={t("settings.twoFa")}
      description={t("settings.twoFaDesc")}
    >
      <div className="flex items-center gap-2">
        <Badge variant={enabled ? "success" : "muted"}>
          {enabled ? t("settings.twoFaStatusOn") : t("settings.twoFaStatusOff")}
        </Badge>
      </div>

      {/* Not enabled — enrolment flow */}
      {!enabled && !setup && (
        <Button size="sm" disabled={busy} onClick={begin}>
          <Shield className="h-4 w-4" /> {t("settings.twoFaEnable")}
        </Button>
      )}

      {!enabled && setup && (
        <div className="space-y-3 rounded-md border border-border bg-card/40 p-4">
          <p className="text-sm text-muted-foreground">{t("settings.twoFaScan")}</p>
          <div className="space-y-1.5">
            <Label>{t("settings.twoFaSecret")}</Label>
            <div className="flex items-center gap-2 rounded-md border border-border bg-background px-3 py-1.5">
              <code className="flex-1 break-all font-mono text-sm text-foreground">{setup.secret}</code>
              <CopyButton value={setup.secret} />
            </div>
            <div className="flex items-center gap-2 rounded-md border border-border bg-background px-3 py-1.5">
              <code className="flex-1 break-all font-mono text-2xs text-muted-foreground">{setup.otpauthUri}</code>
              <CopyButton value={setup.otpauthUri} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>{t("settings.twoFaCode")}</Label>
            <Input
              inputMode="numeric"
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
              placeholder="000000"
              className="max-w-[140px] text-center font-mono text-lg tracking-[0.3em]"
            />
          </div>
          {error && <p className="text-xs text-destructive">{error}</p>}
          <Button size="sm" disabled={busy || code.length !== 6} onClick={confirm}>
            {t("settings.twoFaConfirm")}
          </Button>
        </div>
      )}

      {/* Enabled — disable flow */}
      {enabled && !disabling && (
        <Button variant="outline" size="sm" onClick={() => setDisabling(true)}>
          {t("settings.twoFaDisable")}
        </Button>
      )}
      {enabled && disabling && (
        <div className="space-y-3 rounded-md border border-border bg-card/40 p-4">
          <p className="text-sm text-muted-foreground">{t("settings.twoFaDisablePrompt")}</p>
          <Input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="max-w-sm"
            autoComplete="current-password"
          />
          {error && <p className="text-xs text-destructive">{error}</p>}
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => { setDisabling(false); setPassword(""); }}>
              {t("settings.cancel")}
            </Button>
            <Button variant="destructive" size="sm" disabled={busy || !password} onClick={disable}>
              {t("settings.twoFaDisable")}
            </Button>
          </div>
        </div>
      )}
    </SettingsCard>
  );
}

function RelayCard() {
  const { t } = useTranslation();
  const { data, reload } = useApi(() => api.relay());
  const [host, setHost] = useState("");
  const [port, setPort] = useState(587);
  const [user, setUser] = useState("");
  const [password, setPassword] = useState("");
  const [testTo, setTestTo] = useState("");
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [status, setStatus] = useState<string>("");
  const [statusOk, setStatusOk] = useState(false);

  useEffect(() => {
    if (data) {
      setHost(data.host ?? "");
      setPort(data.port ?? 587);
      setUser(data.user ?? "");
    }
  }, [data]);

  const save = async () => {
    setSaving(true);
    setStatus("");
    try {
      await api.saveRelay({ host: host.trim(), port, user: user.trim(), password });
      setPassword("");
      setStatusOk(true);
      setStatus(t("settings.relay.savedOk"));
      reload();
    } catch (e) {
      setStatusOk(false);
      setStatus(e instanceof Error ? e.message : t("settings.relay.saveError"));
    } finally {
      setSaving(false);
    }
  };

  const clearAll = async () => {
    if (!confirm(t("settings.relay.confirmClear"))) return;
    await api.clearRelay();
    setHost(""); setPort(587); setUser(""); setPassword("");
    reload();
  };

  const sendTest = async () => {
    if (!testTo.includes("@")) return;
    setTesting(true);
    setStatus("");
    try {
      const r = await api.testRelay(testTo.trim());
      setStatusOk(r.ok);
      setStatus(r.ok ? t("settings.relay.testQueued", { to: testTo }) : t("settings.relay.testFailed"));
    } finally {
      setTesting(false);
    }
  };

  return (
    <SettingsCard
      icon={Mail}
      title={t("settings.relay.title")}
      description={t("settings.relay.desc")}
    >
      {!data?.host && (
        <div className="rounded-md border border-info/30 bg-info/[0.06] p-3 text-sm text-foreground/90">
          <p>{t("settings.relay.whyHint")}</p>
        </div>
      )}

      <Field label={t("settings.relay.host")} hint={t("settings.relay.hostHint")}>
        <Input
          value={host}
          onChange={(e) => setHost(e.target.value)}
          placeholder="smtp.sendgrid.net"
          className="max-w-md font-mono"
        />
      </Field>
      <Field label={t("settings.relay.port")} hint={t("settings.relay.portHint")}>
        <Input
          type="number"
          value={port}
          onChange={(e) => setPort(Number(e.target.value))}
          className="max-w-[160px] font-mono"
        />
      </Field>
      <Field label={t("settings.relay.user")}>
        <Input
          value={user}
          onChange={(e) => setUser(e.target.value)}
          placeholder="apikey"
          className="max-w-md font-mono"
        />
      </Field>
      <Field label={t("settings.relay.password")} hint={data?.hasPassword ? t("settings.relay.passwordSavedHint") : ""}>
        <Input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder={data?.hasPassword ? "•••••••• (saved — leave blank to keep)" : ""}
          className="max-w-md font-mono"
        />
      </Field>

      {status && (
        <p className={cn("text-xs", statusOk ? "text-success" : "text-destructive")}>{status}</p>
      )}

      <div className="flex items-center justify-end gap-2 border-t border-border pt-4">
        {data?.host && (
          <Button variant="ghost" size="sm" onClick={clearAll}>
            {t("settings.relay.disable")}
          </Button>
        )}
        <Button size="sm" onClick={save} disabled={saving || !host.trim() || (!data?.hasPassword && !password)}>
          {saving ? t("common.saveChanges") + "…" : t("common.saveChanges")}
        </Button>
      </div>

      {data?.host && (
        <div className="space-y-2 border-t border-border pt-4">
          <p className="text-sm font-medium text-foreground">{t("settings.relay.sendTestTitle")}</p>
          <div className="flex gap-2">
            <Input
              type="email"
              value={testTo}
              onChange={(e) => setTestTo(e.target.value)}
              placeholder="you@gmail.com"
              className="max-w-sm font-mono"
            />
            <Button size="sm" variant="outline" onClick={sendTest} disabled={testing || !testTo.includes("@")}>
              {testing ? t("settings.relay.testing") : t("settings.relay.sendTest")}
            </Button>
          </div>
          <p className="text-2xs text-muted-foreground">{t("settings.relay.sendTestHint")}</p>
        </div>
      )}
    </SettingsCard>
  );
}

function ChangePasswordCard() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const valid = current.length >= 1 && next.length >= 8 && next === confirm;

  const submit = async () => {
    setError("");
    if (!valid) return;
    setSaving(true);
    try {
      await api.changePassword(current, next);
      // Backend invalidates sessions — clear the local token and re-login.
      await api.logout();
      navigate("/login");
    } catch {
      setError(t("settings.passwordError"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <SettingsCard
      icon={KeyRound}
      title={t("settings.changePassword")}
      description={t("settings.changePasswordDesc")}
    >
      <Field label={t("settings.currentPassword")}>
        <Input
          type="password"
          value={current}
          onChange={(e) => setCurrent(e.target.value)}
          className="max-w-sm"
          autoComplete="current-password"
        />
      </Field>
      <Field label={t("settings.newPassword")} hint={t("settings.newPasswordHint")}>
        <Input
          type="password"
          value={next}
          onChange={(e) => setNext(e.target.value)}
          className="max-w-sm"
          autoComplete="new-password"
        />
      </Field>
      <Field label={t("settings.confirmPassword")}>
        <Input
          type="password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          className="max-w-sm"
          autoComplete="new-password"
        />
      </Field>
      {confirm.length > 0 && next !== confirm && (
        <p className="text-xs text-destructive">{t("settings.passwordMismatch")}</p>
      )}
      {error && <p className="text-xs text-destructive">{error}</p>}
      <div className="flex items-center justify-end gap-2 border-t border-border pt-4">
        <Button size="sm" onClick={submit} disabled={!valid || saving}>
          {t("settings.updatePassword")}
        </Button>
      </div>
    </SettingsCard>
  );
}

function AddAdminDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onCreated: () => void;
}) {
  const { t } = useTranslation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState("admin");
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (!email.includes("@") || password.length < 8) return;
    setSaving(true);
    try {
      await api.createAdminUser({ email: email.trim(), password, role });
      onCreated();
      onOpenChange(false);
      setEmail("");
      setPassword("");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{t("settings.addAdmin")}</DialogTitle>
          <DialogDescription>{t("settings.adminUsersDesc")}</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-1">
          <div className="space-y-1.5">
            <Label>{t("setup.admin.email")}</Label>
            <Input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="ops@example.com"
              className="font-mono"
            />
          </div>
          <div className="space-y-1.5">
            <Label>{t("login.password")}</Label>
            <Input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••••••"
            />
          </div>
          <div className="space-y-1.5">
            <Label>{t("settings.role")}</Label>
            <RoleSelect value={role} onChange={setRole} className="w-full" />
            <p className="text-2xs text-muted-foreground">{t("settings.roleHint")}</p>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t("common.cancel")}
          </Button>
          <Button
            onClick={submit}
            disabled={saving || !email.includes("@") || password.length < 8}
          >
            {t("common.create")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Transactional API keys — issue/revoke keys for the SendGrid-compatible
 * POST /api/v3/mail/send endpoint. The plaintext secret is shown exactly
 * once, right after creation.
 */
function ApiKeysSection() {
  const { t } = useTranslation();
  const { data, reload } = useApi(() => api.apiKeys());
  const [name, setName] = useState("");
  const [creating, setCreating] = useState(false);
  const [newSecret, setNewSecret] = useState<string | null>(null);

  const keys = data ?? [];
  const base = `${window.location.origin}/api`;

  const create = async () => {
    setCreating(true);
    try {
      const r = await api.createApiKey(name.trim() || "API key");
      setNewSecret(r.secret);
      setName("");
      reload();
    } finally {
      setCreating(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <KeyRound className="h-4 w-4" /> {t("settings.api.title")}
        </CardTitle>
        <p className="text-sm text-muted-foreground">{t("settings.api.subtitle")}</p>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Endpoint hint */}
        <div className="rounded-md border border-border bg-card/40 p-3 text-xs">
          <p className="mb-1 text-muted-foreground">{t("settings.api.endpoint")}</p>
          <div className="flex items-center justify-between gap-2">
            <code className="break-all font-mono text-foreground">POST {base}/v3/mail/send</code>
            <CopyButton value={`${base}/v3/mail/send`} />
          </div>
          <p className="mt-2 text-muted-foreground">{t("settings.api.compat")}</p>
        </div>

        {/* Freshly created secret — shown once */}
        {newSecret && (
          <div className="rounded-md border border-warning/40 bg-warning/[0.06] p-3">
            <p className="mb-1 text-xs font-medium text-foreground">{t("settings.api.copyNow")}</p>
            <div className="flex items-center justify-between gap-2">
              <code className="break-all font-mono text-xs text-foreground">{newSecret}</code>
              <CopyButton value={newSecret} />
            </div>
          </div>
        )}

        {/* Create */}
        <div className="flex gap-2">
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t("settings.api.namePlaceholder")}
            className="h-9"
          />
          <Button onClick={create} disabled={creating}>
            <Plus className="h-4 w-4" /> {t("settings.api.create")}
          </Button>
        </div>

        {/* List */}
        <div className="space-y-2">
          {keys.length === 0 ? (
            <p className="py-4 text-center text-sm text-muted-foreground">
              {t("settings.api.empty")}
            </p>
          ) : (
            keys.map((k) => (
              <div
                key={k.id}
                className="flex items-center justify-between gap-3 rounded-md border border-border bg-card/40 p-3"
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium text-foreground">
                    {k.name}{" "}
                    <code className="ml-1 font-mono text-2xs text-muted-foreground">
                      …{k.last4}
                    </code>
                  </p>
                  <p className="text-2xs text-muted-foreground">
                    {t("settings.api.sentCount", { count: k.sentCount })}
                    {k.lastUsed ? ` · ${t("settings.api.lastUsed")} ${k.lastUsed.slice(0, 10)}` : ""}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant={k.enabled ? "success" : "muted"}>
                    {k.enabled ? t("common.active") : t("common.disabled")}
                  </Badge>
                  <Switch
                    checked={k.enabled}
                    onCheckedChange={async () => {
                      await api.toggleApiKey(k.id);
                      reload();
                    }}
                  />
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    onClick={async () => {
                      if (!confirm(t("settings.api.confirmRevoke"))) return;
                      await api.deleteApiKey(k.id);
                      reload();
                    }}
                  >
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              </div>
            ))
          )}
        </div>
      </CardContent>
    </Card>
  );
}
