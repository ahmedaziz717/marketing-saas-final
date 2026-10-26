import { Loader2, Sparkles } from "lucide-react";
import type { ReactNode } from "react";

/** Shared creation action for Creative Studio and published workflow Apps. */
export function StudioRunBar({
  quoteLabel,
  detail,
  busy = false,
  remaining = 0,
  disabled = false,
  label,
  onRun,
}: {
  quoteLabel: ReactNode;
  detail: ReactNode;
  busy?: boolean;
  remaining?: number;
  disabled?: boolean;
  label: string;
  onRun: () => void;
}) {
  return (
    <div className="cfg-bottom cfg-run-bar">
      <div aria-live="polite">
        <strong>{quoteLabel}</strong>
        <span>
          {busy ? (
            "Working…"
          ) : (
            <span className="cfg-credit-detail">{detail}</span>
          )}
          {remaining > 0 && (
            <span className="cfg-completion-hint">
              {remaining} {remaining === 1 ? "item" : "items"} to complete
            </span>
          )}
        </span>
      </div>
      <div className="cfg-actions">
        <button
          type="button"
          className="cfg-primary"
          disabled={disabled}
          onClick={onRun}
        >
          {busy ? (
            <Loader2 className="animate-spin" size={16} />
          ) : (
            <Sparkles size={16} />
          )}{" "}
          {label}
        </button>
      </div>
    </div>
  );
}
