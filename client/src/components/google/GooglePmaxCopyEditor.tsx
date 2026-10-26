import type { GoogleAssetInput } from "@shared/googleCampaigns";
import {
  emptyGoogleCopy,
  googleCopyFields,
  googleCopySpecs,
} from "@shared/googleCopy";
import { Button } from "@/components/ui/button";
import { Field } from "./GoogleCampaignFields";
import { GooglePmaxAi } from "./GooglePmaxAi";

export function GooglePmaxCopyEditor({
  organizationId,
  connectionId,
  assets,
  onChange,
  existing = [],
  onReplaceExisting,
}: {
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
  return (
    <div>
      <GooglePmaxAi
        organizationId={organizationId}
        connectionId={connectionId}
        assets={assets}
        occupiedFields={occupied}
        existingCopy={copy}
        replacementOptions={replacements}
        onReplace={replace}
        onAdd={item => add([item])}
        onApply={add}
      />
      <h3>Copy selected for this draft</h3>
      <p>
        Headlines are short titles; long headlines are Google's longer title
        field, not a separate subheadline. Counts include retained Google
        assets. Existing text stays in the campaign unless you explicitly select
        it for replacement and activate the reviewed draft.
      </p>
      {googleCopyFields.map(key => {
        const spec = googleCopySpecs[key];
        const kept = existing.filter(a => a.field === spec.field);
        const drafted = assets
          .map((asset, index) => ({ asset, index }))
          .filter(({ asset }) => asset.field === spec.field);
        return (
          <section key={key} aria-label={`${spec.label} draft editor`}>
            <h4>
              {spec.label} · {kept.length + drafted.length}/{spec.maximum}
            </h4>
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
    </div>
  );
}
