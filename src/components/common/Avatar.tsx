import { cn } from "@/lib/utils";

// Deterministic, pleasant palette — same address always gets the same color.
const PALETTE = [
  "bg-rose-500/20 text-rose-300",
  "bg-orange-500/20 text-orange-300",
  "bg-amber-500/20 text-amber-300",
  "bg-emerald-500/20 text-emerald-300",
  "bg-teal-500/20 text-teal-300",
  "bg-sky-500/20 text-sky-300",
  "bg-indigo-500/20 text-indigo-300",
  "bg-violet-500/20 text-violet-300",
  "bg-fuchsia-500/20 text-fuchsia-300",
  "bg-cyan-500/20 text-cyan-300",
];

function hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

function initials(name: string, email: string): string {
  const src = (name || email || "?").trim();
  const parts = src.split(/[\s@.]+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return src.slice(0, 2).toUpperCase();
}

/** Colored initials avatar keyed off an email address. */
export function Avatar({
  name,
  email,
  size = "md",
  className,
}: {
  name?: string | null;
  email: string;
  size?: "sm" | "md" | "lg";
  className?: string;
}) {
  const color = PALETTE[hash((email || name || "?").toLowerCase()) % PALETTE.length];
  const dim =
    size === "lg" ? "h-10 w-10 text-sm" : size === "sm" ? "h-7 w-7 text-2xs" : "h-9 w-9 text-xs";
  return (
    <span
      className={cn(
        "flex shrink-0 select-none items-center justify-center rounded-full font-semibold",
        dim,
        color,
        className
      )}
      title={email}
    >
      {initials(name || "", email)}
    </span>
  );
}
