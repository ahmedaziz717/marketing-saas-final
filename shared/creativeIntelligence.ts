import { z } from "zod";
import { classifyCopyText } from "./copyTaxonomy";
import {
  dimensionNames,
  TAXONOMY_VERSION,
  type Dimension,
  type Assertion,
} from "./optimization";

export type DimensionFact = {
  status: "known" | "unknown" | "not_applicable";
  values: string[];
  confidence: number;
  source: string;
  reason?: string;
};
export type CreativeIntelligence = {
  learningOrigin?: import("./learningHandoff").LearningOrigin;
  taxonomyVersion: number;
  assetKey: string;
  assetVersion: string;
  observedAtMs: number;
  requested: Record<Dimension, DimensionFact>;
  observed: Record<Dimension, DimensionFact>;
};
const videoDimensions: Dimension[] = [
  "video_duration",
  "video_hook",
  "video_pacing",
  "video_audio",
  "video_captions",
];
const deliveryDimensions: Dimension[] = [
  "audience",
  "placement",
  "weekday",
  "hour",
  "timezone",
  "budget",
  "bid_strategy",
  "objective",
  "attribution_window",
];
const unknown = (reason: string): DimensionFact => ({
  status: "unknown",
  values: [],
  confidence: 0,
  source: "unavailable",
  reason,
});
const fact = (
  value: unknown,
  source: string,
  confidence = 1
): DimensionFact => {
  const values = (Array.isArray(value) ? value : [value])
    .filter(
      v =>
        typeof v === "string" || typeof v === "number" || typeof v === "boolean"
    )
    .map(String)
    .map(v => v.trim())
    .filter(Boolean);
  return values.length
    ? {
        status: "known",
        values: Array.from(new Set(values)).slice(0, 30),
        confidence,
        source,
      }
    : unknown("Not recorded in the source.");
};
/** All entry points share one registry. Requests never become verified visual facts. */
export function creativeIntelligence(input: {
  key: string;
  fingerprint: string;
  createdAtMs: number;
  mediaType: string;
  width?: number;
  height?: number;
  durationSeconds?: number;
  channel?: string;
  isUgc?: boolean;
  copyText?: string;
  requested?: Record<string, any>;
  metadata?: Record<string, any>;
}): CreativeIntelligence {
  const requested = Object.fromEntries(
    dimensionNames.map(d => [d, unknown("No requested setting was recorded.")])
  ) as Record<Dimension, DimensionFact>;
  const observed = Object.fromEntries(
    dimensionNames.map(d => [
      d,
      unknown(
        deliveryDimensions.includes(d)
          ? "Available after activation or delivery."
          : "Requires evidence from the finished asset or a reviewed classification."
      ),
    ])
  ) as Record<Dimension, DimensionFact>;
  const setup = input.requested ?? {},
    meta = input.metadata ?? {};
  const map: Partial<Record<Dimension, unknown>> = {
    theme: setup.theme,
    art_style: setup.artStyle,
    scene: setup.shot ?? setup.setting,
    emotional_tone: setup.mood,
    composition: setup.composition,
    lighting: setup.lighting,
    camera: setup.camera,
    font_family: setup.fontFamily,
    logo_placement: setup.logoPosition,
    logo_variant: setup.logoAssetId,
    background_color: setup.backgroundColor,
    foreground_color: setup.foregroundColor,
    accent_color: setup.accentColor,
    cta_color: setup.ctaColor,
    palette: setup.colors,
    product: setup.products?.map((p: any) => p.productId),
    offer: setup.promotion?.title,
    cta: setup.copy?.cta,
    video_duration: setup.duration,
    video_audio: setup.sound,
    video_hook: setup.hook,
    video_pacing: setup.pacing,
    video_captions: setup.captions,
    channel: setup.channels,
    audience: setup.audience,
    persona: setup.persona,
  };
  for (const d of dimensionNames)
    if (map[d] !== undefined)
      requested[d] = fact(map[d], "Saved creative direction");
  observed.asset_type = fact(input.mediaType, "Stored media type");
  if (input.channel)
    observed.channel = fact(
      input.channel === "meta" ? "meta_ads" : input.channel,
      "Saved output channel; delivery tracked separately"
    );
  if (input.width && input.height) {
    const gcd = (a: number, b: number): number => (b ? gcd(b, a % b) : a);
    const g = gcd(input.width, input.height);
    observed.aspect_ratio = fact(
      `${input.width / g}:${input.height / g}`,
      "Output dimensions"
    );
  }
  if (input.durationSeconds)
    observed.video_duration = fact(
      input.durationSeconds,
      "Stored video duration"
    );
  if (input.isUgc !== undefined)
    observed.creator_content = fact(
      input.isUgc ? "creator_content" : "brand_content",
      "Asset classification"
    );
  if (meta.productIds?.length)
    observed.product = fact(
      meta.productIds,
      "Associated catalog product IDs; not visual verification"
    );
  if (meta.logoPreservation) {
    observed.logo_variant = fact(
      meta.logoPreservation.sourceKey,
      "Original logo composited into the asset"
    );
    observed.logo_placement = fact(
      `x:${meta.logoPreservation.left},y:${meta.logoPreservation.top}`,
      "Recorded logo pixel placement"
    );
    observed.logo_size = fact(
      `${meta.logoPreservation.width}x${meta.logoPreservation.height}`,
      "Recorded logo pixel dimensions"
    );
  }
  if (input.copyText?.trim())
    for (const tag of classifyCopyText(input.copyText).dimensions) {
      observed[tag.dimension] = tag.labels.length
        ? fact(
            tag.labels.map(v => v.value),
            "Rule interpretation of saved copy; review for accuracy",
            0.65
          )
        : unknown(tag.unknownReason ?? "No reliable copy signal.");
    }
  for (const d of videoDimensions)
    if (input.mediaType !== "video") {
      observed[d] = {
        status: "not_applicable",
        values: [],
        confidence: 1,
        source: "Media type",
        reason: "This asset is not a video.",
      };
      requested[d] = { ...observed[d] };
    }
  return {
    learningOrigin: setup.learningOrigin ?? meta.learningOrigin,
    taxonomyVersion: TAXONOMY_VERSION,
    assetKey: input.key,
    assetVersion: input.fingerprint,
    observedAtMs: input.createdAtMs,
    requested,
    observed,
  };
}
export function snapshotAssertions(
  snapshot: CreativeIntelligence
): Assertion[] {
  return dimensionNames.map(d => {
    const f =
      snapshot.observed[d] ?? unknown("Not recorded by the earlier taxonomy.");
    return {
      dimension: d,
      basis: "observed",
      status: f.status,
      assetVersion: snapshot.assetVersion,
      assetKey: snapshot.assetKey,
      labels: f.values.map(value => ({
        id: value.slice(0, 120),
        label: value.slice(0, 250),
        confidence: f.confidence,
        evidence: `${f.source}; asset ${snapshot.assetKey}, version ${snapshot.assetVersion}`,
      })),
      unknownReason: f.reason,
    };
  });
}
export const learningPolicySchema = z.object({
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
});
export type LearningPolicy = z.infer<typeof learningPolicySchema>;
/** Weight evidence for learning only. Never change reported outcome totals. */
export function learningWeight(
  input: {
    date: string;
    referenceDate: string;
    confidence: number;
    completeness: number;
    versionReliability: number;
    dimensions: Partial<Record<Dimension, string[]>>;
  },
  policy?: LearningPolicy
) {
  const settings = learningPolicySchema.parse(policy ?? {});
  const ageDays = Math.max(
    0,
    (Date.parse(input.referenceDate) - Date.parse(input.date)) / 86400000
  );
  const recency = Number.isFinite(ageDays)
    ? Math.pow(0.5, ageDays / settings.halfLifeDays)
    : 0;
  const relevance = settings.context.reduce((n, target) => {
    const actual = input.dimensions[target.dimension];
    return (
      n *
      (!actual?.length
        ? 0.5
        : target.values.some(v => actual.includes(v))
          ? 1
          : 0.2)
    );
  }, 1);
  const clamp = (n: number) =>
    Number.isFinite(n) ? Math.max(0, Math.min(1, n)) : 0;
  const factors = {
    recency,
    relevance,
    confidence: clamp(input.confidence),
    completeness: clamp(input.completeness),
    versionReliability: clamp(input.versionReliability),
  };
  return {
    ...factors,
    weight: Object.values(factors).reduce((a, b) => a * b, 1),
  };
}
