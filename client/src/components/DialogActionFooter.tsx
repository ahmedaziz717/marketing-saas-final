import type { ReactNode } from "react";
import { Button } from "./ui/button";

/** Place outside the scrolling body so errors and actions stay together. */
export function DialogActionFooter({
  children,
  message,
  tone = "error",
  onGoToField,
}: {
  children: ReactNode;
  message?: string;
  tone?: "error" | "warning" | "info";
  onGoToField?: () => void;
}) {
  return (
    <div
      data-dialog-actions
      className="shrink-0 min-w-0 border-t bg-card p-4 space-y-3"
    >
      {message && (
        <div
          data-dialog-validation
          role={tone === "error" ? "alert" : "status"}
          aria-live={tone === "error" ? "assertive" : "polite"}
          aria-atomic="true"
          className={`min-w-0 rounded-xl p-3 text-sm ${tone === "error" ? "bg-destructive/10 text-destructive" : tone === "warning" ? "bg-amber-50 text-amber-950 dark:bg-amber-950/30 dark:text-amber-100" : "bg-muted text-muted-foreground"}`}
        >
          <p className="max-h-24 overflow-y-auto break-words">{message}</p>
          {onGoToField && (
            <Button
              type="button"
              variant="link"
              className="h-auto p-0 mt-1 text-current"
              onClick={onGoToField}
            >
              Go to the field
            </Button>
          )}
        </div>
      )}
      <div className="flex flex-wrap justify-end gap-3 [&_button]:whitespace-normal [&_button]:h-auto [&_button]:min-h-10">
        {children}
      </div>
    </div>
  );
}

export function readableFormError(
  error: unknown,
  fallback = "Check the settings."
) {
  const message = error instanceof Error ? error.message : fallback;
  try {
    const issues = JSON.parse(message);
    if (Array.isArray(issues) && typeof issues[0]?.message === "string")
      return `${issues[0].path?.at(-1) ? `${issues[0].path.at(-1)}: ` : ""}${issues[0].message}`;
  } catch {
    /* Provider errors already contain plain, sanitized text. */
  }
  return message;
}
