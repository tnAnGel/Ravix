import {
  AlertTriangle,
  CheckCircle2,
  Globe,
  Inbox,
  Info,
  Mail,
  Send,
  Server,
  Shield,
  ShieldCheck,
  XCircle,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import type { EventCategory, EventSeverity, RavixEvent } from "@/types";
import { timeAgo } from "@/lib/utils";
import { cn } from "@/lib/utils";

const categoryIcon: Record<EventCategory, typeof Globe> = {
  domain: Globe,
  mailbox: Mail,
  ssl: ShieldCheck,
  spam: Shield,
  system: Server,
  queue: Inbox,
  campaign: Send,
};

const severityMeta: Record<
  EventSeverity,
  { class: string; Icon: typeof Info }
> = {
  info: { class: "text-info bg-info/10", Icon: Info },
  success: { class: "text-success bg-success/10", Icon: CheckCircle2 },
  warning: { class: "text-warning bg-warning/10", Icon: AlertTriangle },
  critical: { class: "text-destructive bg-destructive/10", Icon: XCircle },
};

export function EventList({
  events,
  limit,
}: {
  events: RavixEvent[];
  limit?: number;
}) {
  const { t } = useTranslation();
  const shown = limit ? events.slice(0, limit) : events;
  return (
    <ul className="divide-y divide-border/60">
      {shown.map((ev) => {
        // Be defensive: the backend may emit categories/severities not in our
        // maps (auth, tls, rbl, backup, …). Falling back avoids rendering an
        // undefined component — React error #130.
        const sev = severityMeta[ev.severity] ?? severityMeta.info;
        const Cat = categoryIcon[ev.category] ?? Info;
        return (
          <li key={ev.id} className="flex items-start gap-3 py-2.5">
            <span
              className={cn(
                "mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md",
                sev.class
              )}
            >
              <Cat className="h-3.5 w-3.5" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm leading-snug text-foreground">
                {ev.message}
              </p>
              <p className="mt-0.5 flex items-center gap-1.5 text-2xs text-muted-foreground">
                <span>{t(`category.${ev.category}`)}</span>
                <span>·</span>
                <span>{timeAgo(ev.at)}</span>
              </p>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
