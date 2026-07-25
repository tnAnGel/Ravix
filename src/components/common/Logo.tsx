import { cn } from "@/lib/utils";

interface LogoProps {
  className?: string;
  size?: number;
}

/** Ravix brand mark — a stylized "R" inside a rounded, gradient-bordered tile. */
export function LogoMark({ className, size = 32 }: LogoProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      className={className}
      aria-hidden
    >
      <defs>
        <linearGradient
          id="ravix-mark"
          x1="4"
          y1="4"
          x2="28"
          y2="28"
          gradientUnits="userSpaceOnUse"
        >
          <stop stopColor="hsl(244 90% 76%)" />
          <stop offset="1" stopColor="hsl(245 72% 56%)" />
        </linearGradient>
      </defs>
      <rect x="2" y="2" width="28" height="28" rx="8" fill="hsl(224 32% 8%)" />
      <rect
        x="2.5"
        y="2.5"
        width="27"
        height="27"
        rx="7.5"
        stroke="url(#ravix-mark)"
        strokeOpacity="0.5"
      />
      <path
        d="M11 23V9h6.2c2.7 0 4.4 1.6 4.4 4.1 0 1.9-1 3.3-2.7 3.8L22 23h-3l-2.7-5.6H14V23h-3z"
        fill="url(#ravix-mark)"
      />
      <path
        d="M14 11.6v3.4h2.9c1.2 0 2-.7 2-1.7s-.8-1.7-2-1.7H14z"
        fill="hsl(224 32% 8%)"
      />
    </svg>
  );
}

export function LogoWordmark({
  className,
  showBadge = true,
}: {
  className?: string;
  showBadge?: boolean;
}) {
  return (
    <div className={cn("flex items-center gap-2.5", className)}>
      <LogoMark size={30} />
      <div className="flex items-center gap-2">
        <span className="text-base font-semibold tracking-tight text-foreground">
          Ravix
        </span>
        {showBadge && (
          <span className="rounded border border-border bg-secondary/60 px-1.5 py-0.5 text-2xs font-medium text-muted-foreground">
            Control Panel
          </span>
        )}
      </div>
    </div>
  );
}
