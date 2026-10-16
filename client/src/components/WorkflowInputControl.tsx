import { WorkflowChoiceInput } from "./WorkflowChoiceInput";
import { WorkflowMediaControl } from "./WorkflowMediaControl";
import { WorkflowConnectionInput } from "./WorkflowConnectionInput";
import { WorkflowPerformanceInput } from "./WorkflowPerformanceInput";
import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import {
  isChoiceField,
  type AppField,
  type InputChoice,
} from "@shared/workflowInputs";
import { Button } from "./ui/button";

export function WorkflowInputControl({
  field,
  title,
  value,
  onChange,
  organizationId,
  context = "",
  preview = false,
  productIds = [],
  imageKeys = [],
}: {
  field: AppField;
  title: string;
  value: string;
  onChange: (v: string) => void;
  organizationId: number;
  context?: string;
  preview?: boolean;
  productIds?: number[];
  imageKeys?: string[];
}) {
  const [proposals, setProposals] = useState<InputChoice[]>([]);
  const assist = trpc.workflows.assistInput.useMutation();
  const disabled = field.locked;
  return (
    <div className="wf-input-control">
      {field.help && <p className="wf-field-help">{field.help}</p>}
      {field.kind === "connection" ? (
        <WorkflowConnectionInput
          organizationId={organizationId}
          value={value}
          onChange={onChange}
          channel={field.connectionChannel}
          disabled={disabled}
          title={title}
        />
      ) : field.kind === "performance_data" ? (
        <WorkflowPerformanceInput
          value={value}
          onChange={onChange}
          organizationId={organizationId}
          disabled={disabled}
        />
      ) : isChoiceField(field) ? (
        <>
          <WorkflowChoiceInput
            field={field}
            title={title}
            value={value}
            onChange={onChange}
          />
          {field.multiple && (
            <small>
              Selections guide one run; they do not create separate batches.
            </small>
          )}
        </>
      ) : field.kind === "product" || field.kind === "asset" ? (
        <WorkflowMediaControl
          field={field}
          value={value}
          onChange={onChange}
          organizationId={organizationId}
          preview={preview}
        />
      ) : field.kind === "number" || field.kind === "url" ? (
        <input
          aria-label={title}
          type={field.kind === "number" ? "number" : "url"}
          disabled={disabled}
          value={value}
          onChange={e => onChange(e.target.value)}
        />
      ) : (
        <textarea
          aria-label={title}
          rows={field.kind === "headline" || field.kind === "cta" ? 2 : 4}
          maxLength={10000}
          disabled={disabled}
          value={value}
          onChange={e => onChange(e.target.value)}
        />
      )}
      {field.locked && <small>Set by the App creator</small>}
      {field.ai &&
        !field.locked &&
        !isChoiceField(field) &&
        ![
          "asset",
          "product",
          "number",
          "url",
          "performance_data",
          "connection",
        ].includes(field.kind) && (
          <>
            <Button
              type="button"
              variant="outline"
              disabled={assist.isPending || preview}
              onClick={async () => {
                try {
                  const r = await assist.mutateAsync({
                    organizationId,
                    productIds,
                    imageKeys,
                    field,
                    title,
                    direction: "Generate fresh alternatives for review.",
                    context: JSON.stringify({
                      inputs: context,
                      current: value,
                    }),
                    count: 5,
                    mode: "copy",
                  });
                  setProposals(r.options);
                } catch (e) {
                  toast.error((e as Error).message);
                }
              }}
            >
              {assist.isPending ? "Generating…" : "✨ Generate 5 alternatives"}
            </Button>
            <small>
              {preview
                ? "AI generation is disabled in preview."
                : "Uses AI credits. Review an alternative before applying it."}
            </small>
            {proposals.map(o => (
              <div className="wf-copy-proposal" key={o.id}>
                <p>{o.direction}</p>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    onChange(o.direction);
                    setProposals([]);
                  }}
                >
                  Use this
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  disabled={assist.isPending}
                  onClick={async () => {
                    try {
                      const r = await assist.mutateAsync({
                        organizationId,
                        productIds,
                        imageKeys,
                        field,
                        title,
                        direction:
                          "Regenerate only this alternative. Give different wording with the same verified meaning.",
                        context: JSON.stringify({
                          inputs: context,
                          previous: o.direction,
                        }),
                        count: 1,
                        mode: "copy",
                      });
                      setProposals(old =>
                        old.map(x =>
                          x.id === o.id ? { ...r.options[0], id: o.id } : x
                        )
                      );
                    } catch (e) {
                      toast.error((e as Error).message);
                    }
                  }}
                >
                  Regenerate
                </Button>
              </div>
            ))}
          </>
        )}
    </div>
  );
}
