import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { Button, type ButtonProps } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface CopyButtonProps extends Omit<ButtonProps, "onClick"> {
  value: string;
  label?: string;
}

/**
 * Writes {@code text} to the clipboard. The async Clipboard API only works in
 * a "secure context" (HTTPS or localhost) — when the panel is served over
 * plain HTTP we fall back to {@code document.execCommand('copy')} on a hidden
 * textarea so copy keeps working without HTTPS.
 */
async function copyToClipboard(text: string): Promise<boolean> {
  if (
    typeof navigator !== "undefined" &&
    navigator.clipboard &&
    window.isSecureContext
  ) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // fall through to legacy path
    }
  }
  try {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.setAttribute("readonly", "");
    ta.style.position = "fixed";
    ta.style.top = "0";
    ta.style.left = "0";
    ta.style.opacity = "0";
    ta.style.pointerEvents = "none";
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    ta.setSelectionRange(0, text.length);
    const ok = document.execCommand("copy");
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}

/** Copy-to-clipboard button with transient success / failure feedback. */
export function CopyButton({
  value,
  label,
  className,
  variant = "ghost",
  size = label ? "sm" : "icon-sm",
  ...props
}: CopyButtonProps) {
  const [state, setState] = useState<"idle" | "ok" | "fail">("idle");

  const copy = async () => {
    const ok = await copyToClipboard(value);
    setState(ok ? "ok" : "fail");
    window.setTimeout(() => setState("idle"), 1400);
  };

  return (
    <Button
      type="button"
      variant={variant}
      size={size}
      onClick={copy}
      className={cn(className)}
      aria-label="Copy to clipboard"
      title={state === "fail" ? "Copy failed — select the text manually" : "Copy"}
      {...props}
    >
      {state === "ok" ? (
        <Check className="text-success" />
      ) : (
        <Copy />
      )}
      {label ? <span>{state === "ok" ? "Copied" : label}</span> : null}
    </Button>
  );
}
