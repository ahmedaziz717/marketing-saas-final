import { z } from "zod";
import { rangeSchema } from "./channels";

export const copyFields = ["headline", "primary_text", "description"] as const;
export const copyFieldNames = {
  headline: "Headline",
  primary_text: "Primary text",
  description: "Description",
};
export const copyComparisonSchema = z.object({
  objective: z.enum(["cpa", "roas"]).default("cpa"),
  minimumImpressions: z.number().int().min(0).max(1000000).default(1000),
  minimumPurchases: z.number().int().min(1).max(10000).default(5),
});
export type CopyComparison = z.infer<typeof copyComparisonSchema>;
const metric = z.number().finite().nonnegative().nullable();
export const copyEvidenceSchema = z.object({
  source: z.literal("live_meta_ad_copy"),
  schemaVersion: z.literal(1),
  connectionId: z.string().uuid(),
  accountId: z.string(),
  accountName: z.string(),
  range: rangeSchema,
  currency: z.string().nullable(),
  timezone: z.string(),
  fetchedAtMs: z.number(),
  purchaseAction: z.string().nullable(),
  attribution: z.string(),
  warnings: z.array(z.string()),
  coverage: z.object({
    insightsReturned: z.number(),
    inspectedAds: z.number(),
    missingCreativeAds: z.number(),
    truncated: z.boolean(),
  }),
  ads: z
    .array(
      z.object({
        id: z.string(),
        name: z.string(),
        campaignId: z.string(),
        adsetId: z.string(),
        creativeId: z.string().nullable(),
        copy: z.object({
          headline: z.array(z.string()),
          primary_text: z.array(z.string()),
          description: z.array(z.string()),
        }),
        ambiguous: z.boolean(),
        warning: z.string().nullable(),
        metrics: z.object({
          spend: metric,
          impressions: metric,
          clicks: metric,
          linkClicks: metric,
          purchases: metric,
          purchaseValue: metric,
          roas: metric,
        }),
      })
    )
    .max(100),
});
export type CopyEvidence = z.infer<typeof copyEvidenceSchema>;
