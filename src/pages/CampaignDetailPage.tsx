import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { ArrowLeft, Pause, Play, Send, Trash2, Users } from "lucide-react";
import { PageHeader } from "@/components/common/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { api } from "@/lib/api";
import { useApi } from "@/lib/useApi";
import { cn, pct, timeAgo } from "@/lib/utils";
import type { Campaign, CampaignStatus, RecipientStatus } from "@/types";

const statusVariant: Record<CampaignStatus, "muted" | "info" | "success" | "warning"> = {
  draft: "muted",
  scheduled: "info",
  sending: "warning",
  paused: "muted",
  completed: "success",
};

const rcptTone: Record<RecipientStatus, string> = {
  pending: "text-muted-foreground",
  sent: "text-info",
  delivered: "text-success",
  bounced: "text-warning",
  failed: "text-destructive",
  unsubscribed: "text-muted-foreground",
};

export function CampaignDetailPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { id = "" } = useParams();
  const { data: campaign, loading, reload } = useApi(() => api.campaign(id), [id]);
  const { data: recipients, reload: reloadRcpts } = useApi(
    () => api.campaignRecipients(id),
    [id]
  );
  const { data: links } = useApi(() => api.campaignLinks(id), [id]);

  // Auto-refresh while a campaign is actively sending.
  useEffect(() => {
    if (campaign?.status !== "sending") return;
    const iv = window.setInterval(() => {
      reload();
      reloadRcpts();
    }, 4000);
    return () => window.clearInterval(iv);
  }, [campaign?.status]);

  if (loading || !campaign) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-9 w-64" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={campaign.name}
        description={`${campaign.sender} · ${campaign.subject}`}
        icon={<Send />}
        actions={
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => navigate("/campaigns")}>
              <ArrowLeft className="h-4 w-4" /> {t("campaigns.composer.backToList")}
            </Button>
            <CampaignControls campaign={campaign} onChanged={reload} onDeleted={() => navigate("/campaigns")} />
          </div>
        }
      />

      <div className="flex items-center gap-2">
        <Badge variant={statusVariant[campaign.status]}>
          {t(`campaigns.statuses.${campaign.status}`)}
        </Badge>
        {campaign.scheduledAt && (
          <span className="text-xs text-muted-foreground">
            {t("campaigns.scheduled", { time: timeAgo(campaign.scheduledAt) })}
          </span>
        )}
      </div>

      {/* Progress */}
      {campaign.recipients > 0 && (
        <Card>
          <CardContent className="space-y-2 p-5">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">
                {t("campaigns.sendingProgress", { sent: campaign.sent, total: campaign.recipients })}
              </span>
              <span className="font-medium text-foreground">{pct(campaign.sent, campaign.recipients)}%</span>
            </div>
            <Progress
              value={pct(campaign.sent, campaign.recipients)}
              indicatorClassName={campaign.status === "completed" ? "bg-success" : "bg-warning"}
            />
          </CardContent>
        </Card>
      )}

      {/* Stats */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4 xl:grid-cols-7">
        <Stat label={t("campaigns.recipients")} value={campaign.recipients} icon={Users} />
        <Stat label={t("campaigns.sentLabel")} value={campaign.sent} />
        <Stat label={t("campaigns.delivered")} value={campaign.delivered} hint={`${campaign.sent ? pct(campaign.delivered, campaign.sent) : 0}%`} tone="success" />
        <Stat label={t("campaigns.bounced")} value={campaign.bounced} tone="warning" />
        <Stat label={t("campaigns.failed")} value={campaign.failed} tone="critical" />
        <Stat label={t("campaigns.opens")} value={campaign.opens} hint={`${campaign.sent ? pct(campaign.opens, campaign.sent) : 0}%`} tone="success" />
        <Stat label={t("campaigns.clicks")} value={campaign.clicks} hint={`${campaign.opens ? pct(campaign.clicks, campaign.opens) : 0}%`} tone="success" />
      </div>

      {/* Top links (click analytics) */}
      {(links ?? []).length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t("campaigns.topLinks")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1.5">
            {(links ?? []).map((l) => (
              <div
                key={l.url}
                className="flex items-center justify-between gap-3 rounded-md border border-border bg-card/40 px-3 py-2"
              >
                <a
                  href={l.url}
                  target="_blank"
                  rel="noreferrer"
                  className="truncate font-mono text-xs text-primary hover:underline"
                >
                  {l.url}
                </a>
                <span className="shrink-0 text-sm font-medium text-foreground">
                  {l.clicks} {t("campaigns.clicks").toLowerCase()}
                </span>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Recipients */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("campaigns.detail.recipients")}</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {(recipients ?? []).length === 0 ? (
            <p className="px-6 py-8 text-center text-sm text-muted-foreground">
              {t("campaigns.detail.noRecipients")}
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("campaigns.detail.email")}</TableHead>
                  <TableHead>{t("campaigns.detail.status")}</TableHead>
                  <TableHead className="text-right">{t("campaigns.detail.sentAt")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(recipients ?? []).slice(0, 200).map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="font-mono text-sm">{r.email}</TableCell>
                    <TableCell>
                      <span className={cn("text-sm font-medium", rcptTone[r.status])}>
                        {t(`campaigns.recipientStatus.${r.status}`)}
                      </span>
                      {r.error && <span className="ml-2 text-2xs text-muted-foreground">{r.error}</span>}
                    </TableCell>
                    <TableCell className="text-right text-xs text-muted-foreground">
                      {r.sentAt ? timeAgo(r.sentAt) : "—"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function CampaignControls({
  campaign,
  onChanged,
  onDeleted,
}: {
  campaign: Campaign;
  onChanged: () => void;
  onDeleted: () => void;
}) {
  const { t } = useTranslation();
  const [busy, setBusy] = useState(false);
  const run = (p: Promise<unknown>, after: () => void) => {
    setBusy(true);
    p.then(after).finally(() => setBusy(false));
  };

  return (
    <>
      {campaign.status === "draft" && (
        <Button size="sm" disabled={busy} onClick={() => run(api.sendCampaign(campaign.id), onChanged)}>
          <Send className="h-4 w-4" /> {t("campaigns.composer.sendCampaign")}
        </Button>
      )}
      {campaign.status === "sending" && (
        <Button variant="outline" size="sm" disabled={busy} onClick={() => run(api.pauseCampaign(campaign.id), onChanged)}>
          <Pause className="h-4 w-4" /> {t("campaigns.pause")}
        </Button>
      )}
      {campaign.status === "paused" && (
        <Button variant="outline" size="sm" disabled={busy} onClick={() => run(api.resumeCampaign(campaign.id), onChanged)}>
          <Play className="h-4 w-4" /> {t("campaigns.resume")}
        </Button>
      )}
      <Button variant="ghost" size="icon-sm" disabled={busy} onClick={() => run(api.deleteCampaign(campaign.id), onDeleted)}>
        <Trash2 className="h-4 w-4 text-destructive" />
      </Button>
    </>
  );
}

function Stat({
  label,
  value,
  hint,
  tone,
  icon: Icon,
}: {
  label: string;
  value: number;
  hint?: string;
  tone?: "success" | "warning" | "critical";
  icon?: typeof Users;
}) {
  return (
    <Card className="p-4">
      <div className="flex items-baseline gap-1.5">
        <span
          className={cn(
            "text-xl font-semibold tabular-nums text-foreground",
            tone === "success" && value > 0 && "text-success",
            tone === "warning" && value > 0 && "text-warning",
            tone === "critical" && value > 0 && "text-destructive"
          )}
        >
          {value.toLocaleString()}
        </span>
        {hint && <span className="text-2xs text-muted-foreground">{hint}</span>}
      </div>
      <p className="mt-0.5 flex items-center gap-1 text-2xs text-muted-foreground">
        {Icon && <Icon className="h-3 w-3" />} {label}
      </p>
    </Card>
  );
}
