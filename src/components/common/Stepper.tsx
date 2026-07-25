import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

export interface Step {
  id: string;
  title: string;
  description?: string;
}

interface StepperProps {
  steps: Step[];
  current: number; // index of active step
  className?: string;
}

/** Vertical progress stepper used by the first-run setup wizard. */
export function Stepper({ steps, current, className }: StepperProps) {
  return (
    <ol className={cn("space-y-1", className)}>
      {steps.map((step, i) => {
        const state =
          i < current ? "done" : i === current ? "active" : "upcoming";
        return (
          <li key={step.id} className="relative flex gap-3 pb-5 last:pb-0">
            {i < steps.length - 1 && (
              <span
                className={cn(
                  "absolute left-[15px] top-8 h-[calc(100%-1.5rem)] w-px",
                  state === "done" ? "bg-primary/60" : "bg-border"
                )}
              />
            )}
            <span
              className={cn(
                "relative z-10 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border text-sm font-medium transition-colors",
                state === "done" &&
                  "border-primary bg-primary text-primary-foreground",
                state === "active" &&
                  "border-primary bg-primary/15 text-primary ring-4 ring-primary/10",
                state === "upcoming" &&
                  "border-border bg-card text-muted-foreground"
              )}
            >
              {state === "done" ? <Check className="h-4 w-4" /> : i + 1}
            </span>
            <div className="pt-1">
              <p
                className={cn(
                  "text-sm font-medium leading-tight",
                  state === "upcoming"
                    ? "text-muted-foreground"
                    : "text-foreground"
                )}
              >
                {step.title}
              </p>
              {step.description && (
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {step.description}
                </p>
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
