import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import {
  fieldChoices,
  isChoiceField,
  selectionValues,
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
  const [search, setSearch] = useState("");
  const [proposals, setProposals] = useState<InputChoice[]>([]);
  const products = trpc.catalog.overview.useQuery(
    { organizationId, search },
    { enabled: field.kind === "product" }
  );
  const assets = trpc.assetLibrary.studioList.useQuery(
    { organizationId },
    { enabled: field.kind === "asset" }
  );
  const assist = trpc.workflows.assistInput.useMutation();
  const disabled = field.locked;
  const options = fieldChoices(field);
  return (
    <div className="wf-input-control">
      {field.help && <p className="wf-field-help">{field.help}</p>}
      {isChoiceField(field) ? (
        <>
          {field.multiple ? (
            <div className="wf-choice-list">
              {options.map(o => (
                <label key={o.id}>
                  <input
                    type="checkbox"
                    disabled={disabled}
                    checked={selectionValues(value, true).includes(o.id)}
                    onChange={e => {
                      const v = selectionValues(value, true);
                      if (e.target.checked && v.length >= field.maxSelections) {
                        toast.error(`Choose up to ${field.maxSelections}.`);
                        return;
                      }
                      onChange(
                        JSON.stringify(
                          e.target.checked
                            ? [...v, o.id]
                            : v.filter(id => id !== o.id)
                        )
                      );
                    }}
                  />
                  {o.label}
                </label>
              ))}
            </div>
          ) : (
            <select
              aria-label={title}
              disabled={disabled}
              value={value}
              onChange={e => onChange(e.target.value)}
            >
              <option value="">Choose {title.toLowerCase()}</option>
              {options.map(o => (
                <option key={o.id} value={o.id}>
                  {o.label}
                </option>
              ))}
            </select>
          )}
          {field.multiple && (
            <small>
              Choose up to {field.maxSelections}. Selections guide one run; they
              do not create separate batches.
            </small>
          )}
        </>
      ) : field.kind === "product" ? (
        <>
          <input
            aria-label="Search catalog"
            placeholder="Search products, services or plans…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
          <select
            aria-label={title}
            disabled={disabled}
            value={value}
            onChange={e => onChange(e.target.value)}
          >
            <option value="">Choose a catalog item</option>
            {value &&
              !products.data?.products.some(p => String(p.id) === value) && (
                <option value={value}>Selected catalog item #{value}</option>
              )}
            {products.data?.products.map(p => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          {products.error && (
            <small role="alert">{products.error.message}</small>
          )}
          {products.data?.hasMore && (
            <small>Refine your search to find more items.</small>
          )}
        </>
      ) : field.kind === "asset" ? (
        <>
          <select
            aria-label={title}
            disabled={disabled}
            value={value}
            onChange={e => onChange(e.target.value)}
          >
            <option value="">Choose a reference image</option>
            {assets.data
              ?.filter(a => a.mediaType === "image")
              .map(a => (
                <option value={a.key} key={a.key}>
                  {a.name}
                  {a.width && a.height ? ` · ${a.width} × ${a.height}` : ""}
                </option>
              ))}
          </select>
          {assets.error && <small role="alert">{assets.error.message}</small>}
        </>
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
        !["asset", "product", "number", "url"].includes(field.kind) && (
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
