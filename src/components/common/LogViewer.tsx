import { cn } from "@/lib/utils";
import type { LogLevel, LogLine } from "@/types";

const levelMeta: Record<LogLevel, { label: string; class: string; row: string }> = {
  info: { label: "INFO", class: "text-info", row: "" },
  warning: {
    label: "WARN",
    class: "text-warning",
    row: "bg-warning/[0.06] hover:bg-warning/[0.1]",
  },
  error: {
    label: "ERR ",
    class: "text-destructive",
    row: "bg-destructive/[0.07] hover:bg-destructive/[0.12]",
  },
  debug: { label: "DBG ", class: "text-muted-foreground", row: "" },
};

interface LogViewerProps {
  lines: LogLine[];
  className?: string;
}

/** Monospace log viewer with severity highlighting. */
export function LogViewer({ lines, className }: LogViewerProps) {
  return (
    <div
      className={cn(
        "scrollbar-thin overflow-auto rounded-lg border border-border bg-[#0a0d14] font-mono text-xs leading-relaxed",
        className
      )}
    >
      <table className="w-full border-collapse">
        <tbody>
          {lines.map((line) => {
            const meta = levelMeta[line.level];
            return (
              <tr
                key={line.id}
                className={cn(
                  "border-b border-white/[0.03] transition-colors hover:bg-white/[0.03]",
                  meta.row
                )}
              >
                <td className="whitespace-nowrap py-1 pl-3 pr-3 align-top text-muted-foreground/70 select-none">
                  {line.timestamp.replace("T", " ").replace("Z", "")}
                </td>
                <td
                  className={cn(
                    "whitespace-nowrap py-1 pr-3 align-top font-semibold select-none",
                    meta.class
                  )}
                >
                  {meta.label}
                </td>
                <td className="whitespace-nowrap py-1 pr-3 align-top text-primary/80 select-none">
                  {line.process}
                </td>
                <td className="py-1 pr-3 align-top text-foreground/90">
                  {line.message}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
