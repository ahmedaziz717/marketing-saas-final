import { z } from "zod";
import {
  optimizerKinds,
  type OptimizerKind,
  type Dimension,
} from "./optimization";
export const optimizerLibrary: Record<
  OptimizerKind,
  { name: string; dimensions: Dimension[]; test: string }
> = {
  headline: {
    name: "Headline optimizer",
    dimensions: ["messaging_style", "messaging_angle"],
    test: "Test one headline at a time with the same creative, audience, offer, budget and attribution window.",
  },
  primary_text: {
    name: "Primary text optimizer",
    dimensions: ["messaging_style", "emotional_appeal", "urgency"],
    test: "Compare primary-text variants with the same headline, creative, targeting and offer.",
  },
  description: {
    name: "Description optimizer",
    dimensions: ["messaging_angle", "offer"],
    test: "Compare concise descriptions only where the placement displays them.",
  },
  creative_direction: {
    name: "Creative direction optimizer",
    dimensions: ["scene", "composition", "lighting", "camera"],
    test: "Compare one creative treatment while keeping copy, targeting and delivery settings stable.",
  },
  theme: {
    name: "Theme optimizer",
    dimensions: ["theme"],
    test: "Use approved system theme IDs or reviewed custom themes in a controlled creative test.",
  },
  art_style: {
    name: "Art style optimizer",
    dimensions: ["art_style"],
    test: "Compare two art styles using the same subject, message, offer and delivery settings.",
  },
  colors: {
    name: "Color optimizer",
    dimensions: [
      "background_color",
      "foreground_color",
      "accent_color",
      "cta_color",
      "palette",
    ],
    test: "Change one reviewed HEX color role at a time; retain accessible text contrast.",
  },
  logo: {
    name: "Logo optimizer",
    dimensions: ["logo_variant", "logo_color", "logo_placement", "logo_size"],
    test: "Compare approved logo treatments with stable composition and legibility.",
  },
  composition: {
    name: "Composition optimizer",
    dimensions: ["composition", "camera", "lighting"],
    test: "Vary a single framing or lighting factor with the same message and audience.",
  },
  cta: {
    name: "CTA optimizer",
    dimensions: ["cta"],
    test: "Test a channel-supported CTA aligned to the destination and objective.",
  },
  audience: {
    name: "Audience optimizer",
    dimensions: ["audience", "persona"],
    test: "Review eligible audiences and use a controlled split; do not infer protected traits or causal lift.",
  },
  offer: {
    name: "Offer optimizer",
    dimensions: ["offer", "financing"],
    test: "Use only verified offer and financing claims; control for seasonality and eligibility.",
  },
  budget_bidding: {
    name: "Budget and bidding optimizer",
    dimensions: ["budget", "bid_strategy"],
    test: "Propose a bounded experiment for human budget approval. Snapshot settings do not establish historical budget effects.",
  },
  placement: {
    name: "Placement optimizer",
    dimensions: ["placement", "aspect_ratio"],
    test: "Compare placement-specific performance with compatible asset formats and attribution.",
  },
  weekday_time: {
    name: "Scheduling optimizer",
    dimensions: ["weekday", "hour", "timezone"],
    test: "Test account-local delivery windows across multiple weeks and control for weekday and audience differences.",
  },
};
export const optimizerInputSchema = z.object({
  schemaVersion: z.literal(1),
  kind: z.enum(optimizerKinds),
  channel: z.enum(["meta_ads", "google_ads", "microsoft_ads", "facebook"]),
  brief: z.string().max(10000),
  evidence: z
    .object({
      summary: z
        .object({
          spend: z.number().nullable(),
          impressions: z.number().nullable(),
          clicks: z.number().nullable(),
          purchases: z.number().nullable(),
          purchaseValue: z.number().nullable(),
          roas: z.number().nullable(),
          adCount: z.number(),
          samples: z.number(),
          evidenceStrength: z.string(),
        })
        .passthrough(),
      groups: z.array(
        z
          .object({
            labels: z.array(z.string()),
            sourceAdIds: z.array(z.string()),
          })
          .passthrough()
      ),
      coverage: z
        .object({ incomplete: z.boolean(), truncated: z.boolean() })
        .passthrough(),
    })
    .passthrough(),
});
export const optimizerOutputSchema = z.object({
  schemaVersion: z.literal(1),
  kind: z.enum(optimizerKinds),
  channel: z.string(),
  decision: z.enum([
    "insufficient_evidence",
    "propose_test",
    "unsupported_channel",
  ]),
  confidence: z.number().min(0).max(1).nullable(),
  observations: z.array(z.string()),
  sourceAdIds: z.array(z.string()),
  dimensions: z.array(z.string()),
  suggestedTests: z.array(z.string()),
  generationBrief: z.string(),
  caveats: z.array(z.string()),
  requiresHumanApproval: z.literal(true),
});
export type OptimizerOutput = z.infer<typeof optimizerOutputSchema>;
