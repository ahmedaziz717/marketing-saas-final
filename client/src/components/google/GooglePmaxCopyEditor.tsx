import type { GoogleAssetInput } from "@shared/googleCampaigns";
import {
  emptyGoogleCopy,
  googleCopyFields,
  googleCopyCapabilities,
  type GoogleCopyAdType,
} from "@shared/googleCopy";
import type { CopyWorkspaceField } from "../AdCopyWorkspace";
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
        copy[key].some(v => v.trim().toLowerCase() === text.toLowerCase()) ||
        next.some(
          a =>
            a.field === item.field &&
            a.source.kind === "text" &&
            a.source.text.trim().toLowerCase() === text.toLowerCase()
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
  const draftFields = googleCopyFields.map(key => {
    const spec = googleCopySpecs[key];
    const errors = validation[key];
    return {
      id: key,
      label: spec.label,
      singular:
        key === "descriptions"
          ? "description"
          : key === "longHeadlines"
            ? "long headline"
            : "headline",
      characters: spec.characters,
      maximum: spec.maximum,
      suggestions: [],
      occupied: occupied.filter(field => field === spec.field).length,
      validationPath: `ad.${key === "longHeadlines" ? "longHeadline" : key}`,
      invalid: errors.invalid,
      errorId: errors.errorId,
      error: errors.invalid ? (
        <div id={errors.errorId} className="google-field-error" role="alert">
          {errors.messages.map(message => (
            <p key={message}>{message}</p>
          ))}
        </div>
      ) : undefined,
      drafts: [
        ...existing
          .filter(a => a.field === spec.field)
          .map((a, index) => ({
            id: `kept:${index}`,
            text:
              a.text ||
              `Existing Google ${spec.label.toLowerCase()} ${index + 1}`,
            readOnly: true,
          })),
        ...assets.flatMap((asset, index) =>
          asset.field !== spec.field
            ? []
            : [
                {
                  id: String(index),
                  text:
                    asset.source.kind === "text"
                      ? asset.source.text
                      : "Selected Google text retained",
                  readOnly: asset.source.kind !== "text",
                },
              ]
        ),
      ],
    };
  }) satisfies CopyWorkspaceField[];
  function editDraft(field: string, id: string, text: string) {
    const index = Number(id);
    if (!googleCopyFields.includes(field as any) || !Number.isInteger(index))
      return;
    const asset = assets[index];
    if (
      !asset ||
      asset.source.kind !== "text" ||
      asset.field !==
        googleCopySpecs[field as keyof typeof googleCopySpecs].field
    )
      return;
    onChange(
      assets.map((a, i) =>
        i === index ? { ...a, source: { kind: "text", text } } : a
      )
    );
  }
  function removeDraft(field: string, id: string) {
    const index = Number(id);
    if (!googleCopyFields.includes(field as any) || !Number.isInteger(index))
      return;
    const asset = assets[index];
    if (
      !asset ||
      asset.source.kind !== "text" ||
      asset.field !==
        googleCopySpecs[field as keyof typeof googleCopySpecs].field
    )
      return;
    onChange(assets.filter((_, i) => i !== index));
  }
  function writeDraft(field: string) {
    if (!googleCopyFields.includes(field as any)) return;
    const spec = googleCopySpecs[field as keyof typeof googleCopySpecs];
    if (
      assets.filter(a => a.field === spec.field).length +
        existing.filter(a => a.field === spec.field).length >=
      spec.maximum
    )
      return;
    onChange([
      ...assets,
      { field: spec.field, source: { kind: "text", text: "" } },
    ]);
  }
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
      draftFields={draftFields}
      onEditDraft={editDraft}
      onRemoveDraft={removeDraft}
      onWrite={writeDraft}
    />
  );
}

export const GooglePmaxCopyEditor = GoogleCopyEditor;
