import type { GoogleAssetInput } from "@shared/googleCampaigns";
import {
  emptyGoogleCopy,
  googleCopyFields,
  googleCopyCapabilities,
  type GoogleCopyAdType,
} from "@shared/googleCopy";
import { Button } from "@/components/ui/button";
import { Field } from "./GoogleCampaignFields";
import { GooglePmaxAi } from "./GooglePmaxAi";
import { useGoogleFieldValidation } from "./GoogleValidation";

export function GoogleCopyEditor({
  adType = "PERFORMANCE_MAX",
  organizationId,
  connectionId,
  assets,
  onChange,
  existing = [],
  onReplaceExisting,
}: {
  adType?: GoogleCopyAdType;
  organizationId: number;
  connectionId: string;
  assets: GoogleAssetInput[];
  onChange: (assets: GoogleAssetInput[]) => void;
  existing?: Array<{ assetId?: string; field: string; text?: string }>;
  onReplaceExisting?: (
    target: { assetId: string; field: GoogleAssetInput["field"] },
    replacement: GoogleAssetInput
  ) => void;
}) {
  const googleCopySpecs = googleCopyCapabilities(adType).specs;
  const validation = {
    headlines: useGoogleFieldValidation("ad.headlines"),
    longHeadlines: useGoogleFieldValidation("ad.longHeadline"),
    descriptions: useGoogleFieldValidation("ad.descriptions"),
  };
  const occupied = [
    ...existing.map(a => a.field),
    ...assets
      .filter(a => a.source.kind !== "text" || a.source.text.trim())
      .map(a => a.field),
  ];
  const copy = emptyGoogleCopy();
  for (const key of googleCopyFields) {
    const field = googleCopySpecs[key].field;
    copy[key] = [
      ...existing.filter(a => a.field === field).map(a => a.text ?? ""),
      ...assets
        .filter(a => a.field === field)
        .map(a => (a.source.kind === "text" ? a.source.text : "")),
    ]
      .filter(Boolean)
      .slice(0, googleCopySpecs[key].maximum);
  }
  const replacements = googleCopyFields.flatMap(key => {
    const field = googleCopySpecs[key].field;
    return [
      ...assets.flatMap((asset, index) =>
        asset.field === field &&
        asset.source.kind === "text" &&
        asset.source.text.trim()
          ? [
              {
                id: JSON.stringify(["draft", index, asset]),
                field: key,
                label: `Draft: ${asset.source.text}`,
                index,
                existing: undefined,
              },
            ]
          : []
      ),
      ...existing.flatMap(asset =>
        onReplaceExisting && asset.assetId && asset.field === field
          ? [
              {
                id: JSON.stringify(["existing", asset]),
                field: key,
                label: `Google: ${asset.text || `Asset ${asset.assetId}`}`,
                index: undefined,
                existing: { assetId: asset.assetId, field },
              },
            ]
          : []
      ),
    ];
  });
  function replace(id: string, item: GoogleAssetInput) {
    const target = replacements.find(option => option.id === id);
    if (!target || item.source.kind !== "text") return;
    const spec = googleCopySpecs[target.field];
    const text = item.source.text.trim();
    if (
      item.field !== spec.field ||
      !text ||
      text.length > spec.characters ||
      copy[target.field].some(
        value => value.trim().toLowerCase() === text.toLowerCase()
      )
    )
      return;
    const replacement = { ...item, source: { kind: "text" as const, text } };
    if (target.existing) onReplaceExisting?.(target.existing, replacement);
    else if (target.index !== undefined)
      onChange(
        assets.map((asset, index) =>
          index === target.index ? replacement : asset
        )
      );
  }
  function add(items: GoogleAssetInput[]) {
    const next = [...assets];
    const fields = existing
      .map(a => a.field)
      .concat(
        next
          .filter(a => a.source.kind !== "text" || a.source.text.trim())
          .map(a => a.field)
      );
    for (const item of items) {
      const key = googleCopyFields.find(
        k => googleCopySpecs[k].field === item.field
      );
      if (!key || item.source.kind !== "text" || !item.source.text.trim())
        continue;
      const text = item.source.text.trim();
      if (
        text.length > googleCopySpecs[key].characters ||
        fields.filter(f => f === item.field).length >=
          googleCopySpecs[key].maximum ||
        copy[key].some(v => v.toLowerCase() === text.toLowerCase()) ||
        next.some(
          a =>
            a.field === item.field &&
            a.source.kind === "text" &&
            a.source.text.toLowerCase() === text.toLowerCase()
        )
      )
        continue;
      const blank = next.findIndex(
        a =>
          a.field === item.field &&
          a.source.kind === "text" &&
          !a.source.text.trim()
      );
      const suggestion = { ...item, source: { kind: "text" as const, text } };
      if (blank >= 0) next[blank] = suggestion;
      else next.push(suggestion);
      fields.push(item.field);
    }
    onChange(next);
  }
  const selectedCopy = (
    <section
      className="google-copy-selected"
      aria-label="Selected copy for this draft"
    >
      <h3>Selected for this draft</h3>
      <p className="google-copy-help">
        Counts include kept Google text. Nothing changes live until you review
        and activate.
      </p>
      {googleCopyFields.map(key => {
        const spec = googleCopySpecs[key];
        const errors = validation[key];
        const kept = existing.filter(a => a.field === spec.field);
        const drafted = assets
          .map((asset, index) => ({ asset, index }))
          .filter(({ asset }) => asset.field === spec.field);
        return (
          <section
            key={key}
            className="google-copy-field-group"
            aria-label={`${spec.label} draft editor`}
            data-google-field={`ad.${key === "longHeadlines" ? "longHeadline" : key}`}
            tabIndex={-1}
          >
            <h4>
              {spec.label} · {kept.length + drafted.length}/{spec.maximum}
            </h4>
            {errors.invalid && (
              <div
                id={errors.errorId}
                className="google-field-error"
                role="alert"
              >
                {errors.messages.map(message => (
                  <p key={message}>{message}</p>
                ))}
              </div>
            )}
            {!!kept.length && (
              <details>
                <summary>
                  {kept.length} existing {spec.label.toLowerCase()} kept
                </summary>
                <ul>
                  {kept.map((a, index) => (
                    <li key={index}>
                      {a.text ||
                        `Existing Google ${spec.label.toLowerCase()} ${index + 1}`}
                    </li>
                  ))}
                </ul>
              </details>
            )}
            {drafted.map(({ asset, index }, order) =>
              asset.source.kind === "text" ? (
                <div key={index} className="google-copy-suggestion">
                  <Field title={`${spec.label} ${order + 1}`}>
                    <textarea
                      rows={key === "headlines" ? 1 : 2}
                      aria-invalid={
                        errors.invalid ||
                        asset.source.text.length > spec.characters
                      }
                      aria-describedby={
                        errors.invalid ? errors.errorId : undefined
                      }
                      value={asset.source.text}
                      onChange={e =>
                        onChange(
                          assets.map((a, i) =>
                            i === index
                              ? {
                                  ...a,
                                  source: {
                                    kind: "text",
                                    text: e.target.value,
                                  },
                                }
                              : a
                          )
                        )
                      }
                    />
                  </Field>
                  <small>
                    {asset.source.text.length}/{spec.characters} characters
                  </small>
                  {asset.source.text.length > spec.characters && (
                    <p role="alert">
                      Shorten this {spec.label.toLowerCase()} to{" "}
                      {spec.characters} characters.
                    </p>
                  )}
                  <Button
                    variant="ghost"
                    onClick={() =>
                      onChange(assets.filter((_, i) => i !== index))
                    }
                  >
                    Remove draft{" "}
                    {key === "descriptions" ? "description" : "headline"}{" "}
                    {order + 1}
                  </Button>
                </div>
              ) : (
                <p key={index}>
                  Selected Google {spec.label.toLowerCase()} {order + 1} is
                  retained.
                </p>
              )
            )}
            <Button
              variant="outline"
              disabled={kept.length + drafted.length >= spec.maximum}
              onClick={() =>
                onChange([
                  ...assets,
                  { field: spec.field, source: { kind: "text", text: "" } },
                ])
              }
            >
              Add{" "}
              {key === "descriptions"
                ? "description"
                : key === "longHeadlines"
                  ? "long headline"
                  : "headline"}
            </Button>
          </section>
        );
      })}
    </section>
  );
  return (
    <GooglePmaxAi
      adType={adType}
      organizationId={organizationId}
      connectionId={connectionId}
      assets={assets}
      occupiedFields={occupied}
      existingCopy={copy}
      replacementOptions={replacements}
      onReplace={replace}
      onAdd={item => add([item])}
      onApply={add}
      selectedCopy={selectedCopy}
    />
  );
}

export const GooglePmaxCopyEditor = GoogleCopyEditor;
