import { z } from "zod";
export const metaObjectives = [
  ["OUTCOME_AWARENESS", "Awareness"],
  ["OUTCOME_TRAFFIC", "Traffic"],
  ["OUTCOME_ENGAGEMENT", "Engagement"],
  ["OUTCOME_LEADS", "Leads"],
  ["OUTCOME_APP_PROMOTION", "App promotion"],
  ["OUTCOME_SALES", "Sales"],
] as const;
export const metaGoals: Record<string, readonly [string, string][]> = {
  OUTCOME_AWARENESS: [
    ["REACH", "Reach"],
    ["IMPRESSIONS", "Impressions"],
  ],
  OUTCOME_TRAFFIC: [
    ["LINK_CLICKS", "Link clicks"],
    ["LANDING_PAGE_VIEWS", "Landing page views"],
  ],
  OUTCOME_ENGAGEMENT: [["POST_ENGAGEMENT", "Post engagement"]],
  OUTCOME_LEADS: [["OFFSITE_CONVERSIONS", "Website conversions"]],
  OUTCOME_SALES: [["OFFSITE_CONVERSIONS", "Website conversions"]],
};
export const metaPlacementOptions = [
  ["facebook_feed", "Facebook Feed", "facebook", "feed"],
  ["facebook_story", "Facebook Stories", "facebook", "story"],
  ["facebook_reels", "Facebook Reels", "facebook", "facebook_reels"],
  ["facebook_marketplace", "Facebook Marketplace", "facebook", "marketplace"],
  ["instagram_feed", "Instagram Feed", "instagram", "stream"],
  ["instagram_story", "Instagram Stories", "instagram", "story"],
  ["instagram_reels", "Instagram Reels", "instagram", "reels"],
  ["instagram_explore", "Instagram Explore", "instagram", "explore"],
] as const;
export const metaConversionEvents = [
  "PURCHASE",
  "LEAD",
  "COMPLETE_REGISTRATION",
  "ADD_TO_CART",
  "INITIATED_CHECKOUT",
  "CONTENT_VIEW",
  "SUBSCRIBE",
  "START_TRIAL",
  "CONTACT",
] as const;
const remoteId = z.string().regex(/^\d+$/);
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
      .enum([
        "OUTCOME_AWARENESS",
        "OUTCOME_TRAFFIC",
        "OUTCOME_ENGAGEMENT",
        "OUTCOME_LEADS",
        "OUTCOME_APP_PROMOTION",
        "OUTCOME_SALES",
      ])
      .default("OUTCOME_SALES"),
    budgetMode: z.enum(["campaign", "adset"]).default("adset"),
    dailyBudget: z.number().positive().max(1000000).optional(),
    lifetimeBudget: z.number().positive().max(1000000).optional(),
    bidStrategy: z
      .enum(["LOWEST_COST_WITHOUT_CAP", "COST_CAP", "LOWEST_COST_WITH_BID_CAP"])
      .optional(),
    bidAmount: z.number().positive().max(1000000).optional(),
    startTime: z.string().datetime({ offset: true }).optional(),
    endTime: z.string().datetime({ offset: true }).optional(),
    optimizationGoal: z
      .enum([
        "REACH",
        "IMPRESSIONS",
        "LINK_CLICKS",
        "LANDING_PAGE_VIEWS",
        "POST_ENGAGEMENT",
        "OFFSITE_CONVERSIONS",
      ])
      .optional(),
    conversionEvent: z.enum(metaConversionEvents).optional(),
    attribution: z
      .enum(["1d_click", "7d_click", "1d_click_1d_view", "7d_click_1d_view"])
      .optional(),
    ageMin: z.number().int().min(18).max(65).optional(),
    ageMax: z.number().int().min(18).max(65).optional(),
    genders: z
      .array(z.enum(["1", "2"]))
      .max(2)
      .optional(),
    includedAudiences: z.array(remoteId).max(30).optional(),
    excludedAudiences: z.array(remoteId).max(30).optional(),
    manualPlacements: z
      .array(
        z.enum([
          "facebook_feed",
          "facebook_story",
          "facebook_reels",
          "facebook_marketplace",
          "instagram_feed",
          "instagram_story",
          "instagram_reels",
          "instagram_explore",
        ])
      )
      .min(1)
      .max(8)
      .optional(),
    status: z.enum(["ACTIVE", "PAUSED"]).optional(),
    countries: z
      .array(z.string().regex(/^[A-Z]{2}$/))
      .min(1)
      .max(30)
      .optional(),
    pixelId: z.string().regex(/^\d+$/).optional(),
    audienceMode: z.enum(["keep", "advantage", "manual"]).default("keep"),
    placements: z
      .enum(["keep", "automatic", "facebook_feed", "manual"])
      .default("keep"),
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
    const issue = (message: string) =>
      ctx.addIssue({ code: "custom", message });
    if (v.dailyBudget && v.lifetimeBudget)
      issue("Choose either a daily or lifetime budget.");
    if (v.ageMin && v.ageMax && v.ageMin > v.ageMax)
      issue("Minimum age cannot exceed maximum age.");
    if (
      v.startTime &&
      v.endTime &&
      Date.parse(v.endTime) <= Date.parse(v.startTime)
    )
      issue("End time must be after start time.");
    if (v.kind === "create_adset" && v.lifetimeBudget && !v.endTime)
      issue("A lifetime ad-set budget needs an end date.");
    if (
      v.kind.startsWith("create") &&
      v.placements === "keep" &&
      v.kind === "create_adset"
    )
      issue("Choose automatic or manual placements.");
    if (v.placements === "manual" && !v.manualPlacements?.length)
      issue("Select at least one placement.");
    if (
      v.bidStrategy &&
      v.bidStrategy !== "LOWEST_COST_WITHOUT_CAP" &&
      !v.bidAmount &&
      v.kind === "create_adset"
    )
      issue("Enter a cost or bid cap.");
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
