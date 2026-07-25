import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Clock,
  FileText,
  Gauge,
  Globe,
  Layers,
  Send,
  Upload,
  Users,
} from "lucide-react";
import { PageHeader } from "@/components/common/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
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
import type { AudienceType } from "@/types";

const STEPS = ["details", "audience", "content", "delivery", "review"] as const;
type Step = (typeof STEPS)[number];

export function CampaignComposerPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { data: mailboxes } = useApi(() => api.mailboxes(), []);
  const { data: domains } = useApi(() => api.domains(), []);
  const { data: segments } = useApi(() => api.segments(), []);
  const { data: templates } = useApi(() => api.templates(), []);

  const activeMailboxes = useMemo(
    () => (mailboxes ?? []).filter((m) => m.status === "active"),
    [mailboxes]
  );

  const [step, setStep] = useState<Step>("details");
  const [name, setName] = useState("");
  const [sender, setSender] = useState("");
  const [replyTo, setReplyTo] = useState("");
  const [subject, setSubject] = useState("");
  const [preheader, setPreheader] = useState("");
  const [body, setBody] = useState("");
  const [templateId, setTemplateId] = useState("");
  const [audienceType, setAudienceType] = useState<AudienceType>("all");
  const [audienceRef, setAudienceRef] = useState("");
  const [listText, setListText] = useState("");
  const [rate, setRate] = useState(500);
  const [unsubscribe, setUnsubscribe] = useState(true);
  const [scheduleMode, setScheduleMode] = useState<"now" | "schedule">("now");
  const [scheduledAt, setScheduledAt] = useState("");
  const [saving, setSaving] = useState(false);

  const effectiveSender = sender || activeMailboxes[0]?.email || "";

  // Live audience count.
  const [audienceCount, setAudienceCount] = useState<number | null>(null);
  const listEmails = useMemo(
    () =>
      listText
        .split(/[\s,;]+/)
        .map((e) => e.trim())
        .filter((e) => e.includes("@")),
    [listText]
  );
  useEffect(() => {
    if (audienceType === "list") {
      setAudienceCount(listEmails.length);
      return;
    }
    let active = true;
    api
      .previewAudience(audienceType, audienceRef || null)
      .then((r) => active && setAudienceCount(r.count))
      .catch(() => active && setAudienceCount(null));
    return () => {
      active = false;
    };
  }, [audienceType, audienceRef, listEmails.length]);

  const applyTemplate = (id: string) => {
    setTemplateId(id);
    const tpl = (templates ?? []).find((x) => x.id === id);
    if (tpl) {
      if (tpl.subject) setSubject(tpl.subject);
      if (tpl.body) setBody(tpl.body);
    }
  };

  const stepIndex = STEPS.indexOf(step);
  const canNext = {
    details: name.trim().length > 0 && effectiveSender && subject.trim().length > 0,
    audience:
      audienceType === "list"
        ? listEmails.length > 0
        : audienceType === "all" || audienceRef.length > 0,
    content: body.trim().length > 0,
    delivery: scheduleMode === "now" || scheduledAt.length > 0,
    review: true,
  }[step];

  const go = (dir: 1 | -1) => {
    const next = STEPS[stepIndex + dir];
    if (next) setStep(next);
  };

  const finish = async (mode: "draft" | "schedule" | "send") => {
    setSaving(true);
    try {
      const campaign = await api.createCampaign({
        name: name.trim(),
        sender: effectiveSender,
        replyTo: replyTo || null,
        subject: subject.trim(),
        preheader: preheader || null,
        body,
        templateId: templateId || null,
        audienceType,
        audienceRef: audienceType === "domain" || audienceType === "segment" ? audienceRef : null,
        ratePerHour: rate,
        unsubscribe,
        scheduledAt:
          mode === "schedule" && scheduledAt
            ? new Date(scheduledAt).toISOString()
            : null,
      });
      if (audienceType === "list" && listEmails.length) {
        await api.importRecipients(campaign.id, listEmails);
      }
      if (mode === "send") {
        await api.sendCampaign(campaign.id);
      }
      navigate(`/campaigns/${campaign.id}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title={t("campaigns.composer.title")}
        description={t("campaigns.composer.subtitle")}
        icon={<Send />}
        actions={
          <Button variant="outline" size="sm" onClick={() => navigate("/campaigns")}>
            <ArrowLeft className="h-4 w-4" /> {t("campaigns.composer.backToList")}
          </Button>
        }
      />

      <Stepper current={stepIndex} />

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <Card>
          <CardContent className="p-6">
            {step === "details" && (
              <div className="space-y-4">
                <SectionTitle icon={FileText} title={t("campaigns.composer.detailsTitle")} />
                <Field label={t("campaigns.campaignName")}>
                  <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="June Newsletter" />
                </Field>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label={t("campaigns.senderMailbox")}>
                    <Select value={effectiveSender} onValueChange={setSender}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {activeMailboxes.map((m) => (
                          <SelectItem key={m.id} value={m.email}>{m.email}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </Field>
                  <Field label={t("campaigns.composer.replyTo")} hint={t("campaigns.composer.optional")}>
                    <Input value={replyTo} onChange={(e) => setReplyTo(e.target.value)} placeholder="support@example.com" className="font-mono" />
                  </Field>
                </div>
                <Field label={t("campaigns.subject")}>
                  <Input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Your June digest" />
                </Field>
                <Field label={t("campaigns.composer.preheader")} hint={t("campaigns.composer.preheaderHint")}>
                  <Input value={preheader} onChange={(e) => setPreheader(e.target.value)} />
                </Field>
              </div>
            )}

            {step === "audience" && (
              <div className="space-y-4">
                <SectionTitle icon={Users} title={t("campaigns.composer.audienceTitle")} />
                <div className="grid gap-3 sm:grid-cols-3">
                  <AudienceOption icon={Users} label={t("campaigns.composer.audAll")} active={audienceType === "all"} onClick={() => setAudienceType("all")} />
                  <AudienceOption icon={Globe} label={t("campaigns.composer.audDomain")} active={audienceType === "domain"} onClick={() => setAudienceType("domain")} />
                  <AudienceOption icon={Layers} label={t("campaigns.composer.audSegment")} active={audienceType === "segment"} onClick={() => setAudienceType("segment")} />
                </div>
                <AudienceOption icon={Upload} label={t("campaigns.composer.audList")} active={audienceType === "list"} onClick={() => setAudienceType("list")} wide />

                {audienceType === "domain" && (
                  <Field label={t("campaigns.composer.selectDomain")}>
                    <Select value={audienceRef} onValueChange={setAudienceRef}>
                      <SelectTrigger><SelectValue placeholder={t("campaigns.composer.selectDomain")} /></SelectTrigger>
                      <SelectContent>
                        {(domains ?? []).map((d) => (
                          <SelectItem key={d.id} value={d.name}>{d.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </Field>
                )}
                {audienceType === "segment" && (
                  <Field label={t("campaigns.composer.selectSegment")}>
                    {(segments ?? []).length === 0 ? (
                      <p className="text-sm text-muted-foreground">{t("campaigns.composer.noSegments")}</p>
                    ) : (
                      <Select value={audienceRef} onValueChange={setAudienceRef}>
                        <SelectTrigger><SelectValue placeholder={t("campaigns.composer.selectSegment")} /></SelectTrigger>
                        <SelectContent>
                          {(segments ?? []).map((s) => (
                            <SelectItem key={s.id} value={s.id}>{s.name} · {s.count}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  </Field>
                )}
                {audienceType === "list" && (
                  <Field label={t("campaigns.composer.pasteEmails")} hint={t("campaigns.composer.pasteHint")}>
                    <Textarea rows={6} value={listText} onChange={(e) => setListText(e.target.value)} className="font-mono text-sm" placeholder="a@example.com, b@example.com" />
                  </Field>
                )}

                <div className="flex items-center gap-2 rounded-md border border-primary/30 bg-primary/[0.06] px-4 py-3">
                  <Users className="h-4 w-4 text-primary" />
                  <span className="text-sm text-foreground">
                    {t("campaigns.composer.audienceCount", { count: audienceCount ?? 0 })}
                  </span>
                </div>
              </div>
            )}

            {step === "content" && (
              <div className="space-y-4">
                <SectionTitle icon={FileText} title={t("campaigns.composer.contentTitle")} />
                {(templates ?? []).length > 0 && (
                  <Field label={t("campaigns.composer.startFromTemplate")} hint={t("campaigns.composer.optional")}>
                    <Select value={templateId} onValueChange={applyTemplate}>
                      <SelectTrigger><SelectValue placeholder={t("campaigns.composer.chooseTemplate")} /></SelectTrigger>
                      <SelectContent>
                        {(templates ?? []).map((tpl) => (
                          <SelectItem key={tpl.id} value={tpl.id}>{tpl.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </Field>
                )}
                <Field label={t("campaigns.messageBody")} hint={t("campaigns.composer.bodyVars")}>
                  <Textarea rows={12} value={body} onChange={(e) => setBody(e.target.value)} placeholder={t("campaigns.bodyPlaceholder")} />
                </Field>
              </div>
            )}

            {step === "delivery" && (
              <div className="space-y-4">
                <SectionTitle icon={Clock} title={t("campaigns.composer.deliveryTitle")} />
                <div className="grid gap-3 sm:grid-cols-2">
                  <AudienceOption icon={Send} label={t("campaigns.composer.sendNow")} active={scheduleMode === "now"} onClick={() => setScheduleMode("now")} />
                  <AudienceOption icon={Clock} label={t("campaigns.composer.scheduleFor")} active={scheduleMode === "schedule"} onClick={() => setScheduleMode("schedule")} />
                </div>
                {scheduleMode === "schedule" && (
                  <Field label={t("campaigns.composer.scheduleFor")}>
                    <Input type="datetime-local" value={scheduledAt} onChange={(e) => setScheduledAt(e.target.value)} className="max-w-xs" />
                  </Field>
                )}
                <Field label={t("campaigns.rateLimitPerHour")} hint={t("campaigns.composer.rateHint")}>
                  <Input type="number" value={rate} min={1} onChange={(e) => setRate(Number(e.target.value))} className="max-w-xs font-mono" />
                </Field>
                <label className="flex items-center justify-between rounded-md border border-border bg-card/40 px-4 py-3">
                  <div className="pr-4">
                    <p className="text-sm font-medium text-foreground">{t("campaigns.unsubscribeFooter")}</p>
                    <p className="text-2xs text-muted-foreground">{t("campaigns.unsubscribeRequired")}</p>
                  </div>
                  <Switch checked={unsubscribe} onCheckedChange={setUnsubscribe} />
                </label>
              </div>
            )}

            {step === "review" && (
              <div className="space-y-4">
                <SectionTitle icon={Check} title={t("campaigns.composer.reviewTitle")} />
                <dl className="divide-y divide-border/60 rounded-md border border-border">
                  <ReviewRow label={t("campaigns.campaignName")} value={name} />
                  <ReviewRow label={t("campaigns.senderMailbox")} value={effectiveSender} mono />
                  <ReviewRow label={t("campaigns.subject")} value={subject} />
                  <ReviewRow label={t("campaigns.recipients")} value={String(audienceCount ?? 0)} />
                  <ReviewRow label={t("campaigns.rateLimitPerHour")} value={`${rate}/h`} />
                  <ReviewRow
                    label={t("campaigns.composer.deliveryTitle")}
                    value={scheduleMode === "now" ? t("campaigns.composer.sendNow") : scheduledAt}
                  />
                </dl>
                <div className="rounded-md border border-warning/30 bg-warning/10 p-3.5 text-sm text-foreground/90">
                  {t("campaigns.responsibleWarning")}
                </div>
              </div>
            )}

            {/* Nav */}
            <div className="mt-6 flex items-center justify-between border-t border-border pt-4">
              <Button variant="ghost" size="sm" disabled={stepIndex === 0} onClick={() => go(-1)}>
                <ArrowLeft className="h-4 w-4" /> {t("campaigns.composer.back")}
              </Button>
              {step !== "review" ? (
                <Button size="sm" disabled={!canNext} onClick={() => go(1)}>
                  {t("campaigns.composer.next")} <ArrowRight className="h-4 w-4" />
                </Button>
              ) : (
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" disabled={saving} onClick={() => finish("draft")}>
                    {t("campaigns.saveDraft")}
                  </Button>
                  {scheduleMode === "schedule" ? (
                    <Button size="sm" disabled={saving || !scheduledAt} onClick={() => finish("schedule")}>
                      <Clock className="h-4 w-4" /> {t("campaigns.scheduleCampaign")}
                    </Button>
                  ) : (
                    <Button size="sm" disabled={saving} onClick={() => finish("send")}>
                      <Send className="h-4 w-4" /> {t("campaigns.composer.sendCampaign")}
                    </Button>
                  )}
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Live preview */}
        <Card className="h-fit lg:sticky lg:top-20">
          <CardContent className="p-5">
            <p className="mb-3 text-2xs font-medium uppercase tracking-wide text-muted-foreground">
              {t("campaigns.composer.preview")}
            </p>
            <div className="space-y-2 rounded-md border border-border bg-card/40 p-4">
              <p className="text-xs text-muted-foreground">
                {t("campaigns.composer.from")}: <span className="font-mono text-foreground">{effectiveSender || "—"}</span>
              </p>
              <p className="font-semibold text-foreground">{subject || t("campaigns.composer.noSubject")}</p>
              {preheader && <p className="text-xs text-muted-foreground">{preheader}</p>}
              <Separator />
              <p className="whitespace-pre-wrap text-sm leading-relaxed text-foreground/90">
                {(body || t("campaigns.composer.noBody")).replace(/\{\{name\}\}/g, "Anna").replace(/\{\{email\}\}/g, "anna@example.com")}
              </p>
            </div>
            <div className="mt-3 flex items-center gap-2 text-2xs text-muted-foreground">
              <Gauge className="h-3.5 w-3.5" /> {rate}/h · <Users className="h-3.5 w-3.5" /> {audienceCount ?? 0}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function Stepper({ current }: { current: number }) {
  const { t } = useTranslation();
  return (
    <div className="flex items-center gap-1.5 overflow-x-auto">
      {STEPS.map((s, i) => (
        <div key={s} className="flex items-center gap-1.5">
          <div
            className={cn(
              "flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-medium transition-colors",
              i === current
                ? "bg-primary text-primary-foreground"
                : i < current
                  ? "bg-primary/15 text-primary"
                  : "bg-secondary text-muted-foreground"
            )}
          >
            <span className={cn(
              "flex h-5 w-5 items-center justify-center rounded-full text-2xs",
              i === current ? "bg-primary-foreground/20" : i < current ? "bg-primary/20" : "bg-background/40"
            )}>
              {i < current ? <Check className="h-3 w-3" /> : i + 1}
            </span>
            {t(`campaigns.composer.steps.${s}`)}
          </div>
          {i < STEPS.length - 1 && <div className="h-px w-4 bg-border" />}
        </div>
      ))}
    </div>
  );
}

function SectionTitle({ icon: Icon, title }: { icon: typeof Users; title: string }) {
  return (
    <div className="flex items-center gap-2">
      <Icon className="h-4 w-4 text-primary" />
      <h3 className="text-base font-semibold text-foreground">{title}</h3>
    </div>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      {children}
      {hint && <p className="text-2xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

function AudienceOption({
  icon: Icon,
  label,
  active,
  onClick,
  wide,
}: {
  icon: typeof Users;
  label: string;
  active: boolean;
  onClick: () => void;
  wide?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex items-center gap-2.5 rounded-md border px-4 py-3 text-left text-sm transition-colors",
        wide && "w-full",
        active
          ? "border-primary bg-primary/[0.08] text-foreground"
          : "border-border bg-card/40 text-muted-foreground hover:border-primary/40"
      )}
    >
      <Icon className={cn("h-4 w-4", active ? "text-primary" : "")} />
      <span className="font-medium">{label}</span>
    </button>
  );
}

function ReviewRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-4 px-4 py-2.5">
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className={cn("truncate text-sm font-medium text-foreground", mono && "font-mono")}>{value || "—"}</dd>
    </div>
  );
}

function Separator() {
  return <div className="my-2 h-px w-full bg-border/60" />;
}
