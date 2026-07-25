import {
  Activity,
  Archive,
  ListChecks,
  Boxes,
  CalendarDays,
  ClipboardList,
  Gauge,
  Globe,
  Inbox,
  MailCheck,
  Lock,
  Mail,
  PackagePlus,
  ScrollText,
  Send,
  Settings,
  Shield,
  ShieldAlert,
  ShieldCheck,
  TrendingUp,
  Users,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

export interface NavItem {
  to: string;
  /** i18n key under "nav". */
  labelKey: string;
  icon: LucideIcon;
  /** Optional badge count or status indicator. */
  badge?: string;
  badgeTone?: "warning" | "critical" | "info";
}

export interface NavSection {
  /** i18n key under "nav.sections". */
  labelKey: string;
  items: NavItem[];
}

export const navSections: NavSection[] = [
  {
    labelKey: "overview",
    items: [
      { to: "/", labelKey: "dashboard", icon: Gauge },
      { to: "/doctor", labelKey: "doctor", icon: Activity },
    ],
  },
  {
    labelKey: "mail",
    items: [
      { to: "/domains", labelKey: "domains", icon: Globe },
      { to: "/mailboxes", labelKey: "mailboxes", icon: Mail },
      { to: "/calendar", labelKey: "calendar", icon: CalendarDays },
      { to: "/aliases", labelKey: "aliases", icon: Users },
      { to: "/anti-spam", labelKey: "antiSpam", icon: Shield },
      { to: "/ssl", labelKey: "ssl", icon: ShieldCheck },
      { to: "/dmarc", labelKey: "dmarc", icon: ShieldCheck },
      { to: "/tls-security", labelKey: "tlsSecurity", icon: Lock },
      { to: "/rbl", labelKey: "rbl", icon: ShieldAlert },
      { to: "/reputation", labelKey: "reputation", icon: TrendingUp },
      { to: "/inbox-test", labelKey: "inboxTest", icon: MailCheck },
      { to: "/campaigns", labelKey: "campaigns", icon: Send },
    ],
  },
  {
    labelKey: "operations",
    items: [
      { to: "/queue", labelKey: "queue", icon: Inbox },
      { to: "/logs", labelKey: "logs", icon: ScrollText },
      { to: "/monitoring", labelKey: "monitoring", icon: Activity },
      { to: "/tasks", labelKey: "tasks", icon: ListChecks },
      { to: "/backups", labelKey: "backups", icon: Archive },
    ],
  },
  {
    labelKey: "platform",
    items: [
      { to: "/software", labelKey: "software", icon: PackagePlus },
      { to: "/audit", labelKey: "audit", icon: ClipboardList },
      { to: "/settings", labelKey: "settings", icon: Settings },
      { to: "/system", labelKey: "system", icon: Boxes },
    ],
  },
];
