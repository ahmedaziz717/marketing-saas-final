import { z } from "zod";
export const metaChangeSchema = z
  .object({
    kind: z.enum([
      "create_campaign",
      "create_adset",
      "update_campaign",
      "update_adset",
      "update_ad",
    ]),
    objectId: z.string().regex(/^\d+$/).optional(),
    campaignId: z.string().regex(/^\d+$/).optional(),
    name: z.string().trim().min(1).max(180),
    objective: z
      .enum(["OUTCOME_SALES", "OUTCOME_TRAFFIC"])
      .default("OUTCOME_SALES"),
    budgetMode: z.enum(["campaign", "adset"]).default("adset"),
    dailyBudget: z.number().positive().max(1000000).optional(),
    status: z.enum(["ACTIVE", "PAUSED"]).optional(),
    countries: z
      .array(z.string().regex(/^[A-Z]{2}$/))
      .min(1)
      .max(30)
      .optional(),
    pixelId: z.string().regex(/^\d+$/).optional(),
    audienceMode: z.enum(["keep", "advantage", "manual"]).default("keep"),
    placements: z.enum(["keep", "automatic", "facebook_feed"]).default("keep"),
    specialCategories: z
      .array(
        z.enum([
          "HOUSING",
          "EMPLOYMENT",
          "FINANCIAL_PRODUCTS_SERVICES",
          "ISSUES_ELECTIONS_POLITICS",
        ])
      )
      .default([]),
  })
  .superRefine((v, ctx) => {
    if (v.kind.startsWith("update") && !v.objectId)
      ctx.addIssue({ code: "custom", message: "Select an existing object." });
    if (v.kind === "create_adset" && !v.campaignId)
      ctx.addIssue({ code: "custom", message: "Select a campaign." });
    if (v.kind.startsWith("create") && v.status === "ACTIVE")
      ctx.addIssue({
        code: "custom",
        message: "New campaigns and ad sets start paused.",
      });
  });
export type MetaChange = z.infer<typeof metaChangeSchema>;
export function budgetMinorUnits(value: number) {
  return Math.round(value * 100);
}
