import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import i18n from "@/i18n";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Locale for date formatting based on the active UI language. */
function activeLocale(): string {
  return i18n.language?.startsWith("ru") ? "ru-RU" : "en-US";
}

/** Format a byte count into a human-readable string. */
export function formatBytes(bytes: number, decimals = 1): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(decimals))} ${sizes[i]}`;
}

/** Format an ISO timestamp as a compact, locale-aware date string. */
export function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString(activeLocale(), {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export function formatDateTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString(activeLocale(), {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

/**
 * Compact absolute timestamp, e.g. "31 May 19:32" / "31 мая 19:32".
 * Used to live here as a relative "N minutes ago" formatter, but it was
 * computed against a HARDCODED reference date in 2026, so every call after
 * that date showed nonsense like "-104835 с назад". Absolute timestamps are
 * unambiguous, never go stale, and the same string is meaningful whether
 * the operator looks at the page now or in a week.
 *
 * Kept the `timeAgo` name (and re-exported alongside) so existing callsites
 * don't need touching.
 */
export function timeAgo(iso: string): string {
  return formatDateTime(iso);
}

export function pct(used: number, total: number): number {
  if (total <= 0) return 0;
  return Math.min(100, Math.round((used / total) * 100));
}
