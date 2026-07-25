import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  ArrowLeft,
  CalendarClock,
  Cloud,
  Globe,
  KeyRound,
  Mail,
  RefreshCw,
  ShieldCheck,
  Users,
} from "lucide-react";
import { PageHeader } from "@/components/common/PageHeader";
import { StatusBadge, CheckBadge } from "@/components/common/StatusBadge";
import { DnsRecordCard } from "@/components/common/DnsRecordCard";
import { CopyButton } from "@/components/common/CopyButton";
import { EventList } from "@/components/common/EventList";
import { EmptyState } from "@/components/common/EmptyState";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { api } from "@/lib/api";
import { useApi } from "@/lib/useApi";
import { useTranslation } from "react-i18next";
import { formatDate } from "@/lib/utils";

export function DomainDetailsPage() {
  const { t } = useTranslation();
  const { domainId } = useParams();
  const { data: domain, loading, reload } = useApi(
    () => api.domain(domainId!),
    [domainId]
  );
  const { data: allMailboxes } = useApi(() => api.mailboxes(), []);
  const { data: allAliases } = useApi(() => api.aliases(), []);
  const { data: allEvents } = useApi(() => api.events(40), []);
  const { data: certificates } = useApi(() => api.certificates(), []);
  const [rechecking, setRechecking] = useState(false);
  const [pushing, setPushing] = useState(false);
  const [pushMessage, setPushMessage] = useState<string | null>(null);

  const recheck = async () => {
    if (!domain) return;
    setRechecking(true);
    try {
      await api.recheckDomain(domain.id);
      await reload();
    } finally {
      setRechecking(false);
    }
  };

  // "Push to Cloudflare": ask backend to re-apply the current plan to CF
  // right now (deletes _dc-mx.*, publishes A/AAAA/SPF/DKIM/DMARC/MTA-STS/
  // TLS-RPT, etc.), then re-read DNS so the page reflects the new state.
  const pushToCloudflare = async () => {
    if (!domain) return;
    setPushing(true); setPushMessage(null);
    try {
      const r = await api.cloudflareSyncDomain(domain.id);
      setPushMessage(t("domainDetails.cfPushed", { count: r.syncedDomains }));
      await reload();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Cloudflare push failed";
      setPushMessage(msg.includes("cloudflare_token_missing")
        ? t("domainDetails.cfTokenMissing")
        : msg);
    } finally {
      setPushing(false);
      // auto-dismiss the toast after a few seconds
      setTimeout(() => setPushMessage(null), 6000);
    }
  };

  if (loading || !domain) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-24 w-full" />
        <div className="grid grid-cols-5 gap-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-20" />
          ))}
        </div>
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  const domainMailboxes = (allMailboxes ?? []).filter(
    (m) => m.domain === domain.name
  );
  const domainAliases = (allAliases ?? []).filter(
    (a) => a.domain === domain.name
  );
  const domainEvents = (allEvents ?? []).filter(
    (e) => e.message.includes(domain.name) || e.category === "domain"
  );

  const dkimTxt = `${domain.dkimSelector}._domainkey IN TXT "${domain.dkimPublicKey}"`;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Button variant="ghost" size="sm" asChild className="-ml-2 h-7">
          <Link to="/domains">
            <ArrowLeft className="h-4 w-4" /> {t("nav.domains")}
          </Link>
        </Button>
        <span>/</span>
        <span className="font-mono text-foreground">{domain.name}</span>
      </div>

      <PageHeader
        title={domain.name}
        icon={<Globe />}
        description={t("domainDetails.added", {
          date: formatDate(domain.createdAt),
          mailboxes: domainMailboxes.length,
          aliases: domainAliases.length,
        })}
        actions={
          <>
            <StatusBadge status={domain.status} className="mr-1" />
            <Button variant="outline" size="sm" onClick={recheck} disabled={rechecking}>
              <RefreshCw className={`h-4 w-4 ${rechecking ? "animate-spin" : ""}`} />
              {rechecking ? t("domainDetails.rechecking") : t("domainDetails.recheckDns")}
            </Button>
            <Button size="sm" onClick={pushToCloudflare} disabled={pushing}>
              <Cloud className={`h-4 w-4 ${pushing ? "animate-pulse" : ""}`} />
              {pushing ? t("domainDetails.cfPushing") : t("domainDetails.cfPush")}
            </Button>
          </>
        }
      />

      {pushMessage && (
        <div className="rounded-md border border-primary/30 bg-primary/10 px-3 py-2 text-sm text-foreground">
          {pushMessage}
        </div>
      )}

      {/* Summary checks */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {(["mx", "spf", "dkim", "dmarc", "ssl"] as const).map((k) => (
          <Card key={k} className="p-4">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {k}
            </p>
            <div className="mt-2">
              <CheckBadge status={domain.checks[k]} />
            </div>
          </Card>
        ))}
      </div>

      <Tabs defaultValue="dns">
        <TabsList>
          <TabsTrigger value="dns">{t("domainDetails.tabs.dns")}</TabsTrigger>
          <TabsTrigger value="dkim">{t("domainDetails.tabs.dkim")}</TabsTrigger>
          <TabsTrigger value="ssl">{t("domainDetails.tabs.ssl")}</TabsTrigger>
          <TabsTrigger value="mailboxes">
            {t("domainDetails.tabs.mailboxes")}
            <Badge variant="muted" className="ml-1">
              {domainMailboxes.length}
            </Badge>
          </TabsTrigger>
          <TabsTrigger value="aliases">
            {t("domainDetails.tabs.aliases")}
            <Badge variant="muted" className="ml-1">
              {domainAliases.length}
            </Badge>
          </TabsTrigger>
        </TabsList>

        {/* DNS records */}
        <TabsContent value="dns">
          <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-foreground">
                  {t("domainDetails.requiredRecords")}
                </h3>
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-muted-foreground"
                  onClick={recheck}
                  disabled={rechecking}
                >
                  <RefreshCw className={`h-3.5 w-3.5 ${rechecking ? "animate-spin" : ""}`} />
                  {rechecking ? t("domainDetails.rechecking") : t("domainDetails.recheck")}
                </Button>
              </div>
              {domain.records.map((r, i) => (
                <DnsRecordCard key={`${r.type}-${i}`} record={r} />
              ))}
            </div>
            <Card className="h-fit">
              <CardHeader>
                <CardTitle className="text-base">{t("domainDetails.dnsSummary")}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                {domain.records.map((r, i) => (
                  <div
                    key={i}
                    className="flex items-center justify-between border-b border-border/50 pb-2.5 last:border-0 last:pb-0"
                  >
                    <span className="font-mono text-xs text-muted-foreground">
                      {r.type}
                    </span>
                    <CheckBadge status={r.status} />
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* DKIM */}
        <TabsContent value="dkim">
          <Card>
            <CardHeader className="flex-row items-center justify-between space-y-0">
              <div className="flex items-center gap-2">
                <KeyRound className="h-4 w-4 text-primary" />
                <CardTitle className="text-base">{t("domainDetails.dkimTitle")}</CardTitle>
              </div>
              <Badge variant="secondary" className="font-mono">
                {t("domainDetails.selector", { selector: domain.dkimSelector })}
              </Badge>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-sm text-muted-foreground">
                {t("domainDetails.dkimPublishAt")}{" "}
                <code className="font-mono text-foreground">
                  {domain.dkimSelector}._domainkey.{domain.name}
                </code>
              </p>
              <div className="relative rounded-lg border border-border bg-[#0a0d14] p-4">
                <CopyButton
                  value={dkimTxt}
                  label={t("common.copy")}
                  variant="outline"
                  className="absolute right-3 top-3"
                />
                <code className="block break-all pr-20 font-mono text-xs leading-relaxed text-foreground/90">
                  {dkimTxt}
                </code>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* SSL */}
        <TabsContent value="ssl">
          <Card>
            <CardHeader className="flex-row items-center justify-between space-y-0">
              <div className="flex items-center gap-2">
                <ShieldCheck className="h-4 w-4 text-primary" />
                <CardTitle className="text-base">{t("domainDetails.sslTitle")}</CardTitle>
              </div>
              <CheckBadge status={domain.checks.ssl} />
            </CardHeader>
            <CardContent>
              <dl className="grid gap-x-6 gap-y-4 sm:grid-cols-2">
                <Detail label={t("domainDetails.issuer")} value={domain.ssl.issuer ?? "—"} />
                <Detail
                  label={t("domainDetails.expires")}
                  value={domain.ssl.expiresAt ? formatDate(domain.ssl.expiresAt) : "—"}
                />
                <Detail
                  label={t("domainDetails.autoRenewal")}
                  value={domain.ssl.autoRenew ? t("common.enabled") : t("common.disabled")}
                />
                <Detail
                  label={t("domainDetails.sslStatus")}
                  value={domain.checks.ssl === "fail" ? t("domainDetails.expired") : t("domainDetails.valid")}
                />
              </dl>
              <Separator className="my-5" />
              <div className="flex flex-wrap gap-2">
                <Button
                  size="sm"
                  onClick={() => {
                    const cert = (certificates ?? []).find(
                      (c) => c.domain === domain.name
                    );
                    if (cert) api.renewCertificate(cert.id).then(reload);
                  }}
                >
                  <RefreshCw className="h-4 w-4" /> {t("domainDetails.renewNow")}
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Mailboxes */}
        <TabsContent value="mailboxes">
          {domainMailboxes.length === 0 ? (
            <EmptyState
              icon={Mail}
              title={t("domainDetails.noMailboxes")}
              description={t("domainDetails.noMailboxesDesc")}
            />
          ) : (
            <Card>
              <CardContent className="divide-y divide-border/60 p-0">
                {domainMailboxes.map((m) => (
                  <div
                    key={m.id}
                    className="flex items-center justify-between px-5 py-3"
                  >
                    <div className="flex items-center gap-2.5">
                      <Mail className="h-4 w-4 text-muted-foreground" />
                      <div>
                        <p className="text-sm font-medium text-foreground">
                          {m.email}
                        </p>
                        <p className="text-2xs text-muted-foreground">
                          {m.displayName}
                        </p>
                      </div>
                    </div>
                    <Badge variant={m.status === "active" ? "success" : "muted"}>
                      {t(`common.${m.status}`)}
                    </Badge>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* Aliases */}
        <TabsContent value="aliases">
          {domainAliases.length === 0 ? (
            <EmptyState
              icon={Users}
              title={t("domainDetails.noAliases")}
              description={t("domainDetails.noAliasesDesc")}
            />
          ) : (
            <Card>
              <CardContent className="divide-y divide-border/60 p-0">
                {domainAliases.map((a) => (
                  <div
                    key={a.id}
                    className="flex items-center justify-between px-5 py-3"
                  >
                    <div className="flex items-center gap-2 font-mono text-sm">
                      <span className="text-foreground">{a.source}</span>
                      <span className="text-muted-foreground">→</span>
                      <span className="text-muted-foreground">
                        {a.destinations.join(", ")}
                      </span>
                    </div>
                    {a.catchAll && <Badge variant="info">{t("domainDetails.catchAll")}</Badge>}
                  </div>
                ))}
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>

      {/* Recent events */}
      <Card>
        <CardHeader className="flex-row items-center gap-2 space-y-0">
          <CalendarClock className="h-4 w-4 text-muted-foreground" />
          <CardTitle className="text-base">{t("domainDetails.recentEvents")}</CardTitle>
        </CardHeader>
        <CardContent>
          <EventList events={domainEvents} limit={6} />
        </CardContent>
      </Card>
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </dt>
      <dd className="mt-1 text-sm text-foreground">{value}</dd>
    </div>
  );
}
