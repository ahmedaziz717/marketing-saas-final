import { useState } from "react";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { Link } from "wouter";
import type { WorkflowValue } from "@shared/creativeWorkflow";
import { activationHref } from "@shared/contentWorkflow";
import { workflowValueText } from "@shared/workflowPlatform";
import { StudioImagePreview } from "./configurator/StudioImagePreview";

/** A compact view of persisted outputs; the Results tab owns the full run review. */
export function WorkflowResultPreview({
  values,
  pending = false,
}: {
  values: WorkflowValue[];
  pending?: boolean;
}) {
  const [selection, setSelection] = useState(0);
  const index = Math.min(selection, Math.max(0, values.length - 1));
  const value = values[index];
  return (
    <div className="wf-result-preview" aria-label="Selected run output preview">
      <div className="wf-result-preview-media">
        {!value ? (
          <p role="status">
            {pending
              ? "Your result will appear here as the run completes."
              : "Run this App to preview its result here."}
          </p>
        ) : value.type === "image" ? (
          <StudioImagePreview url={value.url} title={value.name} />
        ) : value.type === "video" ? (
          <video
            src={value.url}
            controls
            preload="metadata"
            aria-label={value.name}
          />
        ) : value.type === "publication" ? (
          <Link href={activationHref(value.channel, value.id)}>
            {value.name} · Open in Activation Studio →
          </Link>
        ) : value.type === "data" || value.type === "decision" ? (
          <div className="wf-result-data-preview">
            <strong>{value.name}</strong>
            <p>
              Saved {value.type === "decision" ? "decision" : "report"}. Open
              Results for the full evidence and details.
            </p>
          </div>
        ) : (
          <pre>{workflowValueText(value)}</pre>
        )}
      </div>
      {values.length > 1 && (
        <nav
          aria-label="Preview outputs"
          className="wf-result-preview-controls"
        >
          <button
            type="button"
            aria-label="Previous output"
            disabled={index === 0}
            onClick={() => setSelection(index - 1)}
          >
            <ArrowLeft size={15} />
          </button>
          <span>
            Output {index + 1} of {values.length}
          </span>
          <button
            type="button"
            aria-label="Next output"
            disabled={index === values.length - 1}
            onClick={() => setSelection(index + 1)}
          >
            <ArrowRight size={15} />
          </button>
        </nav>
      )}
    </div>
  );
}
