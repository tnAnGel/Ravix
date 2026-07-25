import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Building2, Loader2, Plus, Trash2, UserPlus, Users } from "lucide-react";
import { PageHeader } from "@/components/common/PageHeader";
import { RoleSelect } from "@/components/common/RoleSelect";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { api } from "@/lib/api";
import { useApi } from "@/lib/useApi";
import type { OrgMember, Organization } from "@/lib/api";

export function OrganizationsPage() {
  const { t } = useTranslation();
  const { data: orgs, loading, reload } = useApi(() => api.organizations());
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);

  const create = async () => {
    if (!name.trim()) return;
    setBusy(true);
    try {
      await api.createOrganization({ name: name.trim() });
      setName("");
      setCreating(false);
      reload();
    } finally {
      setBusy(false);
    }
  };

  const remove = async (id: string) => {
    if (!confirm(t("organizations.confirmDelete"))) return;
    try {
      await api.deleteOrganization(id);
      reload();
    } catch {
      alert(t("organizations.deleteFailed"));
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title={t("organizations.title")}
        description={t("organizations.subtitle")}
        icon={<Building2 />}
        actions={
          <Button size="sm" onClick={() => setCreating((v) => !v)}>
            <Plus className="h-4 w-4" /> {t("organizations.create")}
          </Button>
        }
      />

      {creating && (
        <Card>
          <CardContent className="flex flex-wrap items-end gap-3 p-4">
            <div className="flex-1 space-y-1.5">
              <label className="text-2xs uppercase tracking-wide text-muted-foreground">
                {t("organizations.name")}
              </label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Acme Inc."
                onKeyDown={(e) => e.key === "Enter" && create()}
              />
            </div>
            <Button onClick={create} disabled={busy || !name.trim()}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {t("common.create")}
            </Button>
          </CardContent>
        </Card>
      )}

      {loading ? (
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {(orgs ?? []).map((o) => (
            <OrgCard
              key={o.id}
              org={o}
              expanded={selected === o.id}
              onToggle={() => setSelected(selected === o.id ? null : o.id)}
              onDelete={() => remove(o.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function OrgCard({
  org,
  expanded,
  onToggle,
  onDelete,
}: {
  org: Organization;
  expanded: boolean;
  onToggle: () => void;
  onDelete: () => void;
}) {
  const { t } = useTranslation();
  return (
    <Card>
      <CardHeader className="flex-row items-start justify-between space-y-0">
        <div>
          <CardTitle className="flex items-center gap-2 text-base">
            <Building2 className="h-4 w-4 text-primary" /> {org.name}
            {org.id === "org_default" && (
              <Badge variant="muted">{t("organizations.default")}</Badge>
            )}
          </CardTitle>
          <p className="mt-1 font-mono text-2xs text-muted-foreground">{org.slug}</p>
        </div>
        <Badge variant={org.status === "active" ? "success" : "warning"}>{org.status}</Badge>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-2 gap-2 text-sm">
          <Stat label={t("organizations.domains")} value={`${org.domains}${org.quotaDomains ? " / " + org.quotaDomains : ""}`} />
          <Stat label={t("organizations.mailboxes")} value={`${org.mailboxes}${org.quotaMailboxes ? " / " + org.quotaMailboxes : ""}`} />
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={onToggle}>
            <Users className="h-4 w-4" /> {t("organizations.members")}
          </Button>
          {org.id !== "org_default" && (
            <Button variant="ghost" size="sm" onClick={onDelete}>
              <Trash2 className="h-4 w-4 text-destructive" />
            </Button>
          )}
        </div>
        {expanded && <Members orgId={org.id} />}
      </CardContent>
    </Card>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-border bg-card/40 p-2">
      <p className="text-2xs uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="font-mono text-sm text-foreground">{value}</p>
    </div>
  );
}

function Members({ orgId }: { orgId: string }) {
  const { t } = useTranslation();
  const [members, setMembers] = useState<OrgMember[]>([]);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("admin");
  const [busy, setBusy] = useState(false);

  const load = () => api.orgMembers(orgId).then(setMembers).catch(() => {});
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgId]);

  const add = async () => {
    if (!email.includes("@")) return;
    setBusy(true);
    try {
      await api.addOrgMember(orgId, email.trim(), role);
      setEmail("");
      load();
    } catch {
      alert(t("organizations.memberFailed"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mt-2 space-y-2 rounded-md border border-border bg-background p-3">
      {members.map((m) => (
        <div key={m.membershipId} className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <p className="truncate text-sm text-foreground">{m.email}</p>
            <p className="text-2xs text-muted-foreground">{t(`settings.role${cap(m.role)}`, m.role)}</p>
          </div>
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => api.removeOrgMember(orgId, m.membershipId).then(load)}
          >
            <Trash2 className="h-3.5 w-3.5 text-destructive" />
          </Button>
        </div>
      ))}
      <div className="flex flex-wrap items-end gap-2 pt-1">
        <Input
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder={t("organizations.memberEmail")}
          className="h-8 flex-1 text-sm"
        />
        <RoleSelect value={role} onChange={setRole} className="h-8 w-auto gap-1 text-xs" />
        <Button size="sm" onClick={add} disabled={busy || !email.includes("@")}>
          <UserPlus className="h-4 w-4" /> {t("organizations.addMember")}
        </Button>
      </div>
    </div>
  );
}

function cap(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
