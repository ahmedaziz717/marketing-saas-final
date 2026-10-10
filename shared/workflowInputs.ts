import { z } from "zod";
import { rangeSchema } from "./channels";
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

export const inputKinds = [
  "performance_data",
  "text",
  "headline",
  "subheadline",
  "description",
  "caption",
  "cta",
  "url",
  "theme",
  "art_style",
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
  performance_data: "Performance data",
  text: "Text / instructions",
  headline: "Headline",
  subheadline: "Subheadline",
  description: "Description",
  caption: "Post caption",
  cta: "Call to action",
  url: "Destination URL",
  theme: "Theme",
  art_style: "Art style",
  choice: "Custom choices",
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
export const appFieldSchema = z.object({
  kind: z.enum(inputKinds),
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
  visibleWhen: z
    .object({ fieldId: z.string().max(80), equals: z.string().max(200) })
    .optional(),
});
export type AppField = z.infer<typeof appFieldSchema>;
export type InputChoice = z.infer<typeof choiceSchema>;
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
  return field.source === "system"
    ? systemInputChoices(field.kind)
    : field.options;
}
export const isChoiceField = (f: AppField) =>
  ["theme", "art_style", "choice", "channel", "size"].includes(f.kind);
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
  if (field.kind === "performance_data" && !parsePerformanceInput(value))
    return "Choose a connected Meta ad account and a valid date range.";
  if (field.required && !value.trim()) return "This field is required.";
  if (!value.trim()) return null;
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
  if (field.kind === "product" && !/^[1-9][0-9]*$/.test(value))
    return "Choose a catalog item.";
  if (
    field.kind === "asset" &&
    !/^(asset|creative|product_image):[1-9][0-9]*$/.test(value)
  )
    return "Choose an image.";
  return null;
}
export function fieldPrompt(field: AppField, value: string) {
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
