import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Gauge, Layers, Plus, Send, Trash2, Users } from "lucide-react";
import { PageHeader } from "@/components/common/PageHeader";
import { WriteOnly } from "@/components/common/WriteOnly";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "@/lib/api";
import { useApi } from "@/lib/useApi";
import { useTranslation } from "react-i18next";
import { cn, pct } from "@/lib/utils";
import type { Campaign, CampaignStatus, SegmentType } from "@/types";

const statusVariant: Record<CampaignStatus, "muted" | "info" | "success" | "warning"> = {
  draft: "muted",
  scheduled: "info",
  sending: "warning",
  paused: "muted",
  completed: "success",
};

export function CampaignsPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();

  return (
    <div className="space-y-6">
      <PageHeader
        title={t("campaigns.title")}
        description={t("campaigns.subtitle")}
        icon={<Send />}
        actions={
          <WriteOnly>
            <Button size="sm" onClick={() => navigate("/campaigns/new")}>
              <Plus className="h-4 w-4" /> {t("campaigns.newCampaign")}
            </Button>
          </WriteOnly>
        }
      />

      <Tabs defaultValue="campaigns">
        <TabsList>
          <TabsTrigger value="campaigns">{t("campaigns.tabs.campaigns")}</TabsTrigger>
          <TabsTrigger value="segments">{t("campaigns.tabs.segments")}</TabsTrigger>
          <TabsTrigger value="templates">{t("campaigns.tabs.templates")}</TabsTrigger>
        </TabsList>

        <TabsContent value="campaigns" className="space-y-4">
          <CampaignsTab />
        </TabsContent>
        <TabsContent value="segments" className="space-y-4">
          <SegmentsTab />
        </TabsContent>
        <TabsContent value="templates" className="space-y-4">
          <TemplatesTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function CampaignsTab() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { data, loading, reload } = useApi(() => api.campaigns());

  if (loading) {
    return (
      <>
        {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-36 w-full" />)}
      </>
    );
  }
  if ((data ?? []).length === 0) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center gap-3 py-14 text-center">
          <Send className="h-8 w-8 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">{t("campaigns.empty")}</p>
          <Button size="sm" onClick={() => navigate("/campaigns/new")}>
            <Plus className="h-4 w-4" /> {t("campaigns.newCampaign")}
          </Button>
        </CardContent>
      </Card>
    );
  }
  return (
    <>
      {(data ?? []).map((c) => (
        <CampaignCard key={c.id} campaign={c} onChanged={reload} />
      ))}
    </>
  );
}

function CampaignCard({ campaign, onChanged }: { campaign: Campaign; onChanged: () => void }) {
  const { t } = useTranslation();
  const progress = campaign.recipients ? pct(campaign.sent, campaign.recipients) : 0;

  return (
    <Card className="transition-colors hover:border-primary/40">
      <CardContent className="p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0 space-y-1.5">
            <div className="flex items-center gap-2">
              <Link to={`/campaigns/${campaign.id}`} className="font-semibold text-foreground hover:text-primary">
                {campaign.name}
              </Link>
              <Badge variant={statusVariant[campaign.status]}>{t(`campaigns.statuses.${campaign.status}`)}</Badge>
            </div>
            <p className="truncate text-sm text-muted-foreground">
              <span className="font-mono">{campaign.sender}</span> · {campaign.subject}
            </p>
            <p className="flex items-center gap-1.5 text-2xs text-muted-foreground">
              <Gauge className="h-3.5 w-3.5" /> {t("campaigns.rateLimit", { rate: campaign.ratePerHour })}
              {" · "}
              <Users className="h-3.5 w-3.5" /> {campaign.recipients}
            </p>
          </div>
          <div className="flex shrink-0 gap-2">
            <Button variant="outline" size="sm" asChild>
              <Link to={`/campaigns/${campaign.id}`}>{t("campaigns.detail.open")}</Link>
            </Button>
            {campaign.status === "draft" && (
              <Button size="sm" onClick={() => api.sendCampaign(campaign.id).then(onChanged)}>
                <Send className="h-4 w-4" /> {t("campaigns.composer.sendCampaign")}
              </Button>
            )}
          </div>
        </div>

        {campaign.status !== "draft" && campaign.recipients > 0 && (
          <>
            {(campaign.status === "sending" || campaign.status === "completed") && (
              <div className="mt-4 space-y-1.5">
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>{t("campaigns.sendingProgress", { sent: campaign.sent, total: campaign.recipients })}</span>
                  <span>{progress}%</span>
                </div>
                <Progress value={progress} indicatorClassName={campaign.status === "completed" ? "bg-success" : "bg-warning"} />
              </div>
            )}
            <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-5">
              <Stat label={t("campaigns.recipients")} value={campaign.recipients} />
              <Stat label={t("campaigns.sentLabel")} value={campaign.sent} />
              <Stat label={t("campaigns.delivered")} value={campaign.delivered} tone="success" />
              <Stat label={t("campaigns.bounced")} value={campaign.bounced} tone="warning" />
              <Stat label={t("campaigns.failed")} value={campaign.failed} tone="critical" />
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone?: "success" | "warning" | "critical" }) {
  return (
    <div className="rounded-md border border-border bg-card/40 p-3">
      <span
        className={cn(
          "text-lg font-semibold tabular-nums text-foreground",
          tone === "success" && value > 0 && "text-success",
          tone === "warning" && value > 0 && "text-warning",
          tone === "critical" && value > 0 && "text-destructive"
        )}
      >
        {value.toLocaleString()}
      </span>
      <p className="text-2xs text-muted-foreground">{label}</p>
    </div>
  );
}

// --- Segments ---------------------------------------------------------------

function SegmentsTab() {
  const { t } = useTranslation();
  const { data, loading, reload } = useApi(() => api.segments());
  const { data: domains } = useApi(() => api.domains(), []);
  const [name, setName] = useState("");
  const [type, setType] = useState<SegmentType>("all");
  const [filterValue, setFilterValue] = useState("");

  const create = async () => {
    if (!name.trim()) return;
    await api.createSegment({ name: name.trim(), type, filterValue: filterValue || null });
    setName("");
    setFilterValue("");
    setType("all");
    reload();
  };

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("campaigns.segments.title")}</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="p-5"><Skeleton className="h-16 w-full" /></div>
          ) : (data ?? []).length === 0 ? (
            <p className="px-6 py-8 text-center text-sm text-muted-foreground">{t("campaigns.segments.empty")}</p>
          ) : (
            <div className="divide-y divide-border/60">
              {(data ?? []).map((s) => (
                <div key={s.id} className="flex items-center justify-between px-5 py-3">
                  <div className="flex items-center gap-2.5">
                    <Layers className="h-4 w-4 text-primary" />
                    <div>
                      <p className="text-sm font-medium text-foreground">{s.name}</p>
                      <p className="text-2xs text-muted-foreground">
                        {t(`campaigns.segments.type.${s.type}`)}{s.filterValue ? ` · ${s.filterValue}` : ""}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <Badge variant="muted">{t("campaigns.segments.count", { count: s.count })}</Badge>
                    <Button variant="ghost" size="icon-sm" onClick={() => api.deleteSegment(s.id).then(reload)}>
                      <Trash2 className="h-3.5 w-3.5 text-destructive" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="h-fit">
        <CardHeader>
          <CardTitle className="text-base">{t("campaigns.segments.create")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-1.5">
            <Label>{t("campaigns.segments.name")}</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Active customers" />
          </div>
          <div className="space-y-1.5">
            <Label>{t("campaigns.segments.criterion")}</Label>
            <Select value={type} onValueChange={(v) => setType(v as SegmentType)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("campaigns.segments.type.all")}</SelectItem>
                <SelectItem value="domain">{t("campaigns.segments.type.domain")}</SelectItem>
                <SelectItem value="status">{t("campaigns.segments.type.status")}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {type === "domain" && (
            <div className="space-y-1.5">
              <Label>{t("campaigns.composer.selectDomain")}</Label>
              <Select value={filterValue} onValueChange={setFilterValue}>
                <SelectTrigger><SelectValue placeholder={t("campaigns.composer.selectDomain")} /></SelectTrigger>
                <SelectContent>
                  {(domains ?? []).map((d) => <SelectItem key={d.id} value={d.name}>{d.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          )}
          {type === "status" && (
            <div className="space-y-1.5">
              <Label>{t("campaigns.segments.statusValue")}</Label>
              <Select value={filterValue} onValueChange={setFilterValue}>
                <SelectTrigger><SelectValue placeholder="active" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">active</SelectItem>
                  <SelectItem value="disabled">disabled</SelectItem>
                  <SelectItem value="suspended">suspended</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}
          <Button size="sm" className="w-full" disabled={!name.trim() || (type !== "all" && !filterValue)} onClick={create}>
            <Plus className="h-4 w-4" /> {t("campaigns.segments.create")}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

// --- Templates --------------------------------------------------------------

function TemplatesTab() {
  const { t } = useTranslation();
  const { data, loading, reload } = useApi(() => api.templates());
  const [name, setName] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");

  const create = async () => {
    if (!name.trim()) return;
    await api.createTemplate({ name: name.trim(), subject, body });
    setName("");
    setSubject("");
    setBody("");
    reload();
  };

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("campaigns.templates.title")}</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="p-5"><Skeleton className="h-16 w-full" /></div>
          ) : (data ?? []).length === 0 ? (
            <p className="px-6 py-8 text-center text-sm text-muted-foreground">{t("campaigns.templates.empty")}</p>
          ) : (
            <div className="divide-y divide-border/60">
              {(data ?? []).map((tpl) => (
                <div key={tpl.id} className="flex items-start justify-between gap-4 px-5 py-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-foreground">{tpl.name}</p>
                    <p className="truncate text-xs text-muted-foreground">{tpl.subject || "—"}</p>
                    <p className="mt-1 line-clamp-2 text-2xs text-muted-foreground/80">{tpl.body}</p>
                  </div>
                  <Button variant="ghost" size="icon-sm" onClick={() => api.deleteTemplate(tpl.id).then(reload)}>
                    <Trash2 className="h-3.5 w-3.5 text-destructive" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="h-fit">
        <CardHeader>
          <CardTitle className="text-base">{t("campaigns.templates.create")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-1.5">
            <Label>{t("campaigns.templates.name")}</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Monthly digest" />
          </div>
          <div className="space-y-1.5">
            <Label>{t("campaigns.subject")}</Label>
            <Input value={subject} onChange={(e) => setSubject(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>{t("campaigns.messageBody")}</Label>
            <Textarea rows={6} value={body} onChange={(e) => setBody(e.target.value)} placeholder={t("campaigns.bodyPlaceholder")} />
          </div>
          <Button size="sm" className="w-full" disabled={!name.trim()} onClick={create}>
            <Plus className="h-4 w-4" /> {t("campaigns.templates.create")}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
