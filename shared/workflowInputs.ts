import {
  ART_STYLE_INFLUENCES,
  artStyleInfluenceDirection,
} from "./artStyleInfluence";
import { z } from "zod";
import { rangeSchema, connectionChannelSchema } from "./channels";
export const performanceInputSchema = z.object({
  connectionId: z.string().uuid(),
  range: rangeSchema,
});
export function parsePerformanceInput(value: string) {
  try {
    return performanceInputSchema.safeParse(JSON.parse(value)).data;
  } catch {
    return undefined;
  }
}
import { CREATIVE_THEME_GROUPS } from "./creativeThemes";
import { CREATIVE_ART_STYLES } from "./creativeBuilder";
import { modelOptionsSchema } from "./modelCatalog";
import { workflowModel } from "./workflowModelCatalog";

export const inputKinds = [
  "connection",
  "performance_data",
  "text",
  "model",
  "headline",
  "subheadline",
  "description",
  "caption",
  "cta",
  "url",
  "theme",
  "art_style",
  "style_influence",
  "choice",
  "product",
  "asset",
  "channel",
  "size",
  "audience",
  "voice",
  "language",
  "number",
] as const;
export const inputLabels: Record<(typeof inputKinds)[number], string> = {
  connection: "Connected destination",
  performance_data: "Account & date range",
  text: "Text / instructions",
  headline: "Headline",
  subheadline: "Subheadline",
  description: "Description",
  caption: "Post caption",
  cta: "Call to action",
  url: "Destination URL",
  theme: "Theme",
  art_style: "Art style",
  style_influence: "Art Style Influence",
  choice: "Custom choices",
  model: "Model selector",
  product: "Product, service or plan",
  asset: "Reference image",
  channel: "Channel",
  size: "Size & aspect ratio",
  audience: "Audience",
  voice: "Brand voice",
  language: "Language",
  number: "Number",
};
export const choiceSchema = z.object({
  id: z.string().min(1).max(100),
  label: z.string().min(1).max(160),
  direction: z.string().max(2000).default(""),
});
const contentControl = z.enum(["choose", "always", "never"]);
export const workflowMediaOptionsSchema = z
  .object({
    productImages: z.boolean().default(true),
    approvedAssets: z.boolean().default(true),
    finishedAssetsOnly: z.boolean().optional(),
    allowUpload: z.boolean().default(false),
    bullets: z.enum(["choose", "all", "none"]).default("choose"),
    price: contentControl.default("choose"),
    description: contentControl.default("choose"),
    link: contentControl.default("choose"),
  })
  .refine(
    options => options.productImages || options.approvedAssets,
    "Enable at least one image source."
  );
export const workflowMediaSelectionSchema = z
  .object({
    productId: z.number().int().positive().max(2147483647).optional(),
    imageKey: z
      .string()
      .regex(/^(asset|creative|product_image):[1-9][0-9]*$/)
      .refine(
        value => Number(value.split(":")[1]) <= 2147483647,
        "Invalid image reference"
      )
      .optional(),
    featuredSpecKeys: z.array(z.string().min(1).max(500)).max(20).default([]),
    includePrice: z.boolean().default(false),
    includeDescription: z.boolean().default(true),
    includeLink: z.boolean().default(false),
  })
  .strict();
export type WorkflowMediaSelection = z.infer<
  typeof workflowMediaSelectionSchema
>;
export const appFieldSchema = z.object({
  kind: z.enum(inputKinds),
  connectionChannel: connectionChannelSchema.optional(),
  modelKind: z.enum(["text", "image", "video"]).optional(),
  allowedModelIds: z.array(z.string().min(1).max(240)).max(50).optional(),
  modelSettings: z.record(z.string().max(240), modelOptionsSchema).optional(),
  help: z.string().max(600).default(""),
  required: z.boolean().default(false),
  locked: z.boolean().default(false),
  source: z.enum(["system", "curated", "custom"]).default("system"),
  options: z.array(choiceSchema).max(200).default([]),
  multiple: z.boolean().default(false),
  maxSelections: z.number().int().min(1).max(20).default(5),
  defaultValue: z.string().max(10000).default(""),
  ai: z.boolean().default(false),
  aiInstructions: z.string().max(3000).default(""),
  media: workflowMediaOptionsSchema.optional(),
  studio: z
    .object({
      section: z.enum(["setup", "direction", "content"]).optional(),
      category: z.string().trim().max(60).optional(),
    })
    .optional(),
  visibleWhen: z
    .object({ fieldId: z.string().max(80), equals: z.string().max(200) })
    .optional(),
});
export type AppField = z.infer<typeof appFieldSchema>;
export type InputChoice = z.infer<typeof choiceSchema>;
export const workflowMediaOptions = (field: AppField) =>
  workflowMediaOptionsSchema.parse(field.media ?? {});
export function parseWorkflowMediaSelection(
  value: string,
  kind: "product" | "asset"
) {
  if (kind === "product" && /^[1-9][0-9]*$/.test(value))
    return workflowMediaSelectionSchema.safeParse({ productId: Number(value) })
      .data;
  if (
    kind === "asset" &&
    /^(asset|creative|product_image):[1-9][0-9]*$/.test(value)
  )
    return workflowMediaSelectionSchema.safeParse({ imageKey: value }).data;
  try {
    return workflowMediaSelectionSchema.safeParse(JSON.parse(value)).data;
  } catch {
    return undefined;
  }
}
export function workflowProductContent(
  field: AppField,
  selection: WorkflowMediaSelection,
  specs: Record<string, string>
) {
  const options = workflowMediaOptions(field);
  const flag = (mode: "choose" | "always" | "never", value: boolean) =>
    mode === "always" || (mode === "choose" && value);
  return {
    featuredSpecKeys:
      options.bullets === "all"
        ? Object.keys(specs).filter(k => specs[k]?.trim())
        : options.bullets === "none"
          ? []
          : Array.from(new Set(selection.featuredSpecKeys)),
    includePrice: flag(options.price, selection.includePrice),
    includeDescription: flag(options.description, selection.includeDescription),
    includeLink: flag(options.link, selection.includeLink),
  };
}
export const sizeChoices = [
  {
    id: "1:1",
    label: "Square · 1:1 · 1080 × 1080",
    direction: "Square composition, 1080 × 1080 pixels",
  },
  {
    id: "4:5",
    label: "Portrait · 4:5 · 1080 × 1350",
    direction: "Portrait feed composition, 1080 × 1350 pixels",
  },
  {
    id: "9:16",
    label: "Stories / Reels · 9:16 · 1080 × 1920",
    direction: "Vertical composition, 1080 × 1920 pixels",
  },
  {
    id: "1.91:1",
    label: "Landscape · 1.91:1 · 1200 × 628",
    direction: "Landscape composition, 1200 × 628 pixels",
  },
  {
    id: "16:9",
    label: "Widescreen · 16:9 · 1920 × 1080",
    direction: "Widescreen composition, 1920 × 1080 pixels",
  },
];
export function systemInputChoices(kind: AppField["kind"]): InputChoice[] {
  if (kind === "theme")
    return CREATIVE_THEME_GROUPS.flatMap(g =>
      g.themes.map(t => ({
        id: t.id,
        label: `${g.name} · ${t.name}`,
        direction: t.direction,
      }))
    );
  if (kind === "art_style")
    return CREATIVE_ART_STYLES.map(t => ({
      id: t.id,
      label: t.name,
      direction: t.direction,
    }));
  if (kind === "style_influence")
    return ART_STYLE_INFLUENCES.map(item => ({
      id: item.id,
      label: item.name,
      direction: artStyleInfluenceDirection(item.id),
    }));
  if (kind === "size") return sizeChoices;
  if (kind === "channel")
    return [
      "Meta Ads",
      "Facebook organic",
      "Instagram organic",
      "Google Ads",
      "Microsoft Ads",
      "Email",
      "Website",
    ].map(label => ({ id: label, label, direction: label }));
  return [];
}
export function fieldChoices(field: AppField) {
  if (field.kind === "model")
    return (field.allowedModelIds ?? []).map(id => ({
      id,
      label: workflowModel(id)?.name ?? id,
      direction: "",
    }));
  return field.source === "system"
    ? systemInputChoices(field.kind)
    : field.options;
}
export const isChoiceField = (f: AppField) =>
  [
    "theme",
    "art_style",
    "style_influence",
    "choice",
    "channel",
    "size",
    "model",
  ].includes(f.kind);
export function selectionValues(value: string, multiple: boolean) {
  if (!multiple) return value ? [value] : [];
  try {
    const v: unknown = JSON.parse(value || "[]");
    return Array.isArray(v) && v.every(x => typeof x === "string")
      ? (v as string[])
      : [];
  } catch {
    return [];
  }
}
export function fieldValueProblem(
  field: AppField,
  value: string
): string | null {
  if (field.kind === "model") {
    const allowed = field.allowedModelIds ?? [];
    if (
      !allowed.length ||
      allowed.length !== new Set(allowed).size ||
      allowed.some(id => workflowModel(id)?.kind !== field.modelKind)
    )
      return "Choose at least one compatible allowed model.";
    if (field.multiple || field.ai)
      return "A model selector allows exactly one model per run.";
    if (!allowed.includes(field.defaultValue))
      return "Choose one of the allowed models as the default.";
    if (!allowed.includes(value))
      return "Choose one model allowed by this App.";
    return null;
  }
  if (field.kind === "performance_data" && !parsePerformanceInput(value))
    return "Choose a connected Meta ad account and a valid date range.";
  if (field.required && !value.trim()) return "This field is required.";
  if (!value.trim()) return null;
  if (
    field.kind === "connection" &&
    !z.string().uuid().safeParse(value).success
  )
    return "Choose a connected destination.";
  if (field.kind === "headline" && value.length > 200)
    return "Use no more than 200 characters.";
  if (isChoiceField(field)) {
    const values = selectionValues(value, field.multiple);
    if (field.required && !values.length) return "Choose at least one option.";
    if (
      !values.length ||
      new Set(values).size !== values.length ||
      values.length > (field.multiple ? field.maxSelections : 1)
    )
      return "Check the number of selected options.";
    if (values.some(id => !fieldChoices(field).some(o => o.id === id)))
      return "Choose an available option.";
  }
  if (field.kind === "url") {
    try {
      if (!["https:", "http:"].includes(new URL(value).protocol))
        return "Enter a website URL.";
    } catch {
      return "Enter a full URL including https://.";
    }
  }
  if (field.kind === "number" && !Number.isFinite(Number(value)))
    return "Enter a number.";
  if (field.kind === "product" || field.kind === "asset") {
    const selected = parseWorkflowMediaSelection(value, field.kind);
    if (
      !selected ||
      (field.kind === "product" ? !selected.productId : !selected.imageKey)
    )
      return field.kind === "product"
        ? "Choose a catalog item."
        : "Choose an image.";
    const options = workflowMediaOptions(field);
    if (
      field.kind === "asset" &&
      selected.imageKey &&
      (selected.imageKey.startsWith("product_image:")
        ? !options.productImages
        : !options.approvedAssets)
    )
      return "Choose an image source allowed by this workflow.";
    if (
      selected.featuredSpecKeys.length !==
      new Set(selected.featuredSpecKeys).size
    )
      return "Choose each bullet only once.";
  }
  return null;
}
export function fieldPrompt(field: AppField, value: string) {
  if (field.kind === "connection")
    return value ? "Connected destination selected" : "Choose a destination";
  if (field.kind === "product" || field.kind === "asset") {
    const selected = parseWorkflowMediaSelection(value, field.kind);
    if (!selected) return "Choose an image or product";
    const options = workflowMediaOptions(field);
    const content = workflowProductContent(field, selected, {});
    return [
      selected.productId ? "Selected catalog product" : "Selected image",
      options.bullets === "all"
        ? "All catalog bullets"
        : content.featuredSpecKeys.length
          ? `Bullets: ${content.featuredSpecKeys.join(", ")}`
          : "No feature bullets",
      content.includePrice ? "Show price" : "No price",
      content.includeDescription ? "Description allowed" : "No description",
      content.includeLink ? "Product link allowed" : "No product link",
    ].join(" · ");
  }
  if (field.kind === "performance_data") {
    const selected = parsePerformanceInput(value);
    return selected
      ? `Live Meta performance · ${selected.range.since} to ${selected.range.until}`
      : "Choose an ad account and date range when running.";
  }
  return isChoiceField(field)
    ? selectionValues(value, field.multiple)
        .map(id => {
          const o = fieldChoices(field).find(o => o.id === id);
          return o ? `${o.label}: ${o.direction}` : "";
        })
        .join("\n")
    : value;
}
