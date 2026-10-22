import { copyDimensions, copyTaxonomy } from "./copyTaxonomy";
import { z } from "zod";
import { CREATIVE_THEME_LIST } from "./creativeThemes";
import { CREATIVE_ART_STYLES } from "./creativeBuilder";

export const TAXONOMY_VERSION = 3;
export const dimensionNames = [
  "messaging_style",
  "emotional_appeal",
  "emotional_tone",
  "benefit_feature",
  "specificity",
  "copy_length",
  "urgency",
  "messaging_angle",
  "persona",
  "theme",
  "art_style",
  "scene",
  "composition",
  "lighting",
  "camera",
  "background_color",
  "foreground_color",
  "accent_color",
  "cta_color",
  "palette",
  "logo_variant",
  "logo_color",
  "logo_placement",
  "logo_size",
  "offer",
  "financing",
  "cta",
  "asset_type",
  "aspect_ratio",
  "channel",
  "audience",
  "placement",
  "weekday",
  "hour",
  "timezone",
  "budget",
  "bid_strategy",
  "font_family",
  "font_weight",
  "font_size",
  "product",
  "product_category",
  "creator_content",
  "video_duration",
  "video_hook",
  "video_pacing",
  "video_audio",
  "video_captions",
  "objective",
  "attribution_window",
] as const;
export type Dimension = (typeof dimensionNames)[number];
export const messagingStyles = [
  "aspirational",
  "playful",
  "authoritative",
  "educational",
  "conversational",
  "provocative",
  "competitive",
  "luxurious",
  "inspirational",
  "direct",
  "humorous",
  "reassuring",
] as const;
export const dimensionOptions: Partial<
  Record<Dimension, readonly { id: string; name: string }[]>
> = {
  theme: CREATIVE_THEME_LIST,
  art_style: CREATIVE_ART_STYLES,
  ...Object.fromEntries(
    copyDimensions.map(d => [
      d,
      copyTaxonomy[d].values.map(v => ({ id: v.id, name: v.label })),
    ])
  ),
  scene: [
    "product_only",
    "lifestyle_without_person",
    "lifestyle_with_people",
  ].map(id => ({ id, name: id.replaceAll("_", " ") })),
};
export const labelSchema = z.object({
  id: z.string().trim().min(1).max(120),
  label: z.string().trim().min(1).max(250),
  confidence: z.number().min(0).max(1),
  evidence: z.string().max(2000),
});
export const assertionSchema = z.object({
  dimension: z.enum(dimensionNames),
  labels: z.array(labelSchema).max(30),
  unknownReason: z.string().max(1000).optional(),
  basis: z.enum(["requested", "observed"]).optional(),
  status: z.enum(["known", "unknown", "not_applicable"]).optional(),
  assetVersion: z.string().max(100).optional(),
  assetKey: z
    .string()
    .regex(/^(asset|creative):[1-9][0-9]*$/)
    .optional(),
  retired: z.boolean().optional(),
  validSince: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  validUntil: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
});
export type Assertion = z.infer<typeof assertionSchema>;
export type Classification = Assertion & {
  source: "import" | "rule" | "human";
  version: number;
  observedAtMs: number;
  actorUserId?: number;
  revision: number;
};
export function canonicalLabel(dimension: Dimension, value: string) {
  const trimmed = value.trim();
  if (dimension.endsWith("_color")) {
    if (!/^#[\da-f]{6}$/i.test(trimmed))
      throw new Error("Use an exact six-digit HEX color, for example #1267AB.");
    return trimmed.toUpperCase();
  }
  const match = dimensionOptions[dimension]?.find(
    o => o.id === trimmed || o.name.toLowerCase() === trimmed.toLowerCase()
  );
  return match?.id ?? trimmed;
}
/** Authored assertions always win, including deliberately empty (unknown) labels. */
export function effectiveClassifications(
  rows: Classification[]
): Partial<Record<Dimension, Classification>> {
  const result: Partial<Record<Dimension, Classification>> = {};
  const latest = new Map<string, Classification>();
  for (const row of rows) {
    const key = `${row.dimension}:${row.source}`;
    if (!latest.has(key) || latest.get(key)!.revision < row.revision)
      latest.set(key, row);
  }
  for (const row of Array.from(latest.values())) {
    if (row.retired) continue;
    const current = result[row.dimension];
    const priority = { human: 3, import: 2, rule: 1 };
    if (
      !current ||
      priority[row.source] > priority[current.source] ||
      (priority[row.source] === priority[current.source] &&
        row.revision > current.revision)
    )
      result[row.dimension] = row;
  }
  return result;
}
export const historyRangeSchema = z
  .object({
    since: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    until: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  })
  .refine(
    r =>
      r.since >= "2000-01-01" &&
      r.since <= r.until &&
      [r.since, r.until].every(d => {
        const parsed = new Date(d + "T00:00:00Z");
        return (
          Number.isFinite(+parsed) && parsed.toISOString().slice(0, 10) === d
        );
      }),
    "Choose valid dates from January 1, 2000 onwards. Availability depends on the connected provider."
  );
export const analysisQuerySchema = z.object({
  range: historyRangeSchema,
  adIds: z
    .array(
      z
        .string()
        .regex(/^(?:\d+|g_(?:ad_\d+_\d+|asset_group_\d+))$/)
        .max(100)
    )
    .max(100)
    .optional(),
  grain: z.enum(["daily", "placement", "hourly"]).default("daily"),
  dimensions: z.array(z.enum(dimensionNames)).max(4).default([]),
  filters: z
    .array(
      z.object({
        dimension: z.enum(dimensionNames),
        values: z.array(z.string().max(120)).min(1).max(30),
      })
    )
    .max(20)
    .default([]),
  minimumConfidence: z.number().min(0).max(1).default(0),
  learning: z
    .object({
      halfLifeDays: z.number().min(1).max(3650).default(365),
      context: z
        .array(
          z.object({
            dimension: z.enum(dimensionNames),
            values: z.array(z.string().max(120)).min(1).max(30),
          })
        )
        .max(20)
        .default([]),
    })
    .optional(),
});
export type AnalysisQuery = z.infer<typeof analysisQuerySchema>;
export const optimizerKinds = [
  "headline",
  "primary_text",
  "description",
  "creative_direction",
  "theme",
  "art_style",
  "colors",
  "logo",
  "composition",
  "cta",
  "audience",
  "offer",
  "budget_bidding",
  "placement",
  "weekday_time",
] as const;
export type OptimizerKind = (typeof optimizerKinds)[number];
export const schedulingSettingsSchema = z.object({
  comparison: z.enum(["both", "weekday", "hour"]).default("both"),
  objective: z.literal("cost_per_purchase").default("cost_per_purchase"),
  testProbability: z.number().min(0.5).max(0.999).default(0.95),
  minimumWeekdayObservations: z.number().int().min(2).max(12).default(2),
});
export type SchedulingSettings = z.infer<typeof schedulingSettingsSchema>;
export const optimizerSchema = z.object({
  kind: z.enum(optimizerKinds),
  channel: z
    .enum(["meta_ads", "google_ads", "microsoft_ads", "facebook"])
    .default("meta_ads"),
  mode: z.enum(["analyze", "analyze_generate"]).default("analyze"),
  brief: z.string().max(10000).default(""),
  scheduling: schedulingSettingsSchema.optional(),
});
export type Provenance = {
  apiVersion: string;
  path: string;
  fetchedAtMs: number;
  requestedFields: string[];
  missingFields: string[];
  fields: Record<
    string,
    { source: string; observedAtMs: number; status: "returned" | "unavailable" }
  >;
  attribution: string;
  timezone: string | null;
  currency: string | null;
  granularity: string;
  snapshotOnly: boolean;
};
export type SyncTask = {
  kind: "account" | "campaign" | "adset" | "ad" | "creative" | "insight";
  edge: string;
  fields: string;
  range?: { since: string; until: string };
  grain?: "daily" | "placement" | "hourly";
  optional?: boolean;
};
export type SyncCheckpoint = {
  task: number;
  after?: string;
  cursors: string[];
  pages: number;
  rows: number;
  warnings: string[];
  completedTasks: number;
  startedAtMs: number;
  coverage?: { since: string; until: string };
};
export const evidenceCaveats = [
  "Observational associations are not causal effects. Audience, placement, bid, budget, season and attribution can confound comparisons.",
  "Creative labels describe the current imported snapshot; past edits and delivery-time variants may be unavailable.",
  "Ad-level outcomes cannot be assigned to an individual headline, image or dynamic-creative asset without asset-level delivery evidence.",
  "Multi-label groups overlap. Do not add cohort totals or mix daily, placement and hourly datasets.",
  "Missing metrics remain unknown. Meta-attributed purchases are not deduplicated business sales.",
];
