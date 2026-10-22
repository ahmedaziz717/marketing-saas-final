import { z } from "zod";

export const googleCampaignTypes = {
  SEARCH: {
    label: "Search",
    description: "Keywords and responsive search ads",
  },
  PERFORMANCE_MAX: {
    label: "Performance Max",
    description: "Asset groups across Google channels",
  },
  DISPLAY: { label: "Display", description: "Responsive display ads" },
  SHOPPING: {
    label: "Shopping",
    description: "Products from a linked Merchant Center feed",
  },
  DEMAND_GEN: {
    label: "Demand Gen",
    description: "Image ads across discovery surfaces",
  },
  APP: { label: "App installs", description: "Promote an Android or iOS app" },
} as const;
export const googleCampaignTypeSchema = z.enum([
  "SEARCH",
  "PERFORMANCE_MAX",
  "DISPLAY",
  "SHOPPING",
  "DEMAND_GEN",
  "APP",
]);
const id = z
  .string()
  .regex(/^\d{1,20}$/, "Choose a Google Ads resource from this account.");
const text = (max: number) => z.string().trim().min(1).max(max);
const landingUrl = z
  .string()
  .url()
  .max(2048)
  .refine(v => {
    const u = new URL(v);
    return u.protocol === "https:" && !u.username && !u.password;
  }, "Use an HTTPS landing page.");
export const googleAssetFieldSchema = z.enum([
  "HEADLINE",
  "LONG_HEADLINE",
  "DESCRIPTION",
  "BUSINESS_NAME",
  "MARKETING_IMAGE",
  "SQUARE_MARKETING_IMAGE",
  "PORTRAIT_MARKETING_IMAGE",
  "LOGO",
  "LANDSCAPE_LOGO",
  "YOUTUBE_VIDEO",
]);
export const googleAssetInputSchema = z
  .object({
    field: googleAssetFieldSchema,
    source: z.discriminatedUnion("kind", [
      z.object({ kind: z.literal("text"), text: text(90) }),
      z.object({
        kind: z.literal("library"),
        key: z.string().regex(/^(asset|creative):\d+$/),
      }),
      z.object({ kind: z.literal("existing"), id }),
      z.object({
        kind: z.literal("youtube"),
        videoId: z.string().regex(/^[\w-]{11}$/),
      }),
    ]),
  })
  .superRefine((v, ctx) => {
    const limits: Record<string, number> = {
      HEADLINE: 30,
      LONG_HEADLINE: 90,
      DESCRIPTION: 90,
      BUSINESS_NAME: 25,
    };
    if (
      v.source.kind === "text" &&
      (!limits[v.field] || v.source.text.length > limits[v.field])
    )
      ctx.addIssue({
        code: "custom",
        message: `Check the text and character limit for ${v.field}.`,
      });
    if (
      v.source.kind === "library" &&
      !v.field.includes("IMAGE") &&
      !v.field.includes("LOGO")
    )
      ctx.addIssue({
        code: "custom",
        message: "Library images require an image or logo placement.",
      });
    if (v.source.kind === "youtube" && v.field !== "YOUTUBE_VIDEO")
      ctx.addIssue({
        code: "custom",
        message: "YouTube videos require the video placement.",
      });
  });
export type GoogleAssetInput = z.infer<typeof googleAssetInputSchema>;
export const googleAdContentSchema = z.object({
  name: text(128),
  finalUrl: z.union([landingUrl, z.literal("")]),
  headlines: z.array(text(30)).max(15),
  descriptions: z.array(text(90)).max(5),
  longHeadline: text(90).optional(),
  businessName: text(25).optional(),
  assets: z.array(googleAssetInputSchema).max(50).default([]),
  path1: z.string().trim().max(15).default(""),
  path2: z.string().trim().max(15).default(""),
});
const biddingSchema = z.object({
  strategy: z.enum([
    "MAXIMIZE_CONVERSIONS",
    "MAXIMIZE_CONVERSION_VALUE",
    "MAXIMIZE_CLICKS",
    "TARGET_CPA",
    "TARGET_ROAS",
    "MANUAL_CPC",
  ]),
  target: z.number().positive().max(1_000_000).optional(),
});
export const googleCampaignCreateSchema = z
  .object({
    kind: z.literal("campaign_create"),
    type: googleCampaignTypeSchema,
    name: text(128),
    status: z.enum(["ENABLED", "PAUSED"]).default("ENABLED"),
    dailyBudget: z.number().positive().max(1_000_000),
    bidding: biddingSchema,
    startDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .optional(),
    endDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .optional(),
    politicalAdvertising: z.enum([
      "DOES_NOT_CONTAIN_EU_POLITICAL_ADVERTISING",
      "CONTAINS_EU_POLITICAL_ADVERTISING",
    ]),
    locationIds: z.array(id).min(1).max(50),
    languageIds: z.array(id).min(1).max(20),
    searchPartners: z.boolean().default(false),
    displayExpansion: z.boolean().default(false),
    keywords: z
      .array(
        z.object({
          text: text(80),
          match: z.enum(["EXACT", "PHRASE", "BROAD"]),
          negative: z.boolean().default(false),
        })
      )
      .max(100)
      .default([]),
    ad: googleAdContentSchema,
    merchantId: id.optional(),
    feedLabel: text(100).optional(),
    shoppingPriority: z.number().int().min(0).max(2).default(0),
    appId: text(200).optional(),
    appStore: z.enum(["GOOGLE_APP_STORE", "APPLE_APP_STORE"]).optional(),
    audienceId: id.optional(),
    urlExpansion: z.boolean().default(false),
    demandChannels: z
      .array(
        z.enum([
          "youtubeInStream",
          "youtubeInFeed",
          "youtubeShorts",
          "discover",
          "gmail",
          "display",
          "maps",
        ])
      )
      .min(1)
      .max(7)
      .optional(),
  })
  .superRefine((v, ctx) => {
    const issue = (message: string) =>
      ctx.addIssue({ code: "custom", message });
    if (v.startDate && v.endDate && v.endDate < v.startDate)
      issue("The end date must follow the start date.");
    if (
      ["TARGET_CPA", "TARGET_ROAS", "MANUAL_CPC"].includes(
        v.bidding.strategy
      ) &&
      !v.bidding.target
    )
      issue("Enter a bid target.");
    const allowed: Record<typeof v.type, string[]> = {
      SEARCH: [
        "MAXIMIZE_CONVERSIONS",
        "MAXIMIZE_CONVERSION_VALUE",
        "MAXIMIZE_CLICKS",
        "TARGET_CPA",
        "TARGET_ROAS",
        "MANUAL_CPC",
      ],
      PERFORMANCE_MAX: ["MAXIMIZE_CONVERSIONS", "MAXIMIZE_CONVERSION_VALUE"],
      DISPLAY: [
        "MAXIMIZE_CONVERSIONS",
        "TARGET_CPA",
        "TARGET_ROAS",
        "MANUAL_CPC",
      ],
      SHOPPING: ["MANUAL_CPC", "MAXIMIZE_CLICKS", "TARGET_ROAS"],
      DEMAND_GEN: [
        "MAXIMIZE_CONVERSIONS",
        "MAXIMIZE_CLICKS",
        "TARGET_CPA",
        "TARGET_ROAS",
      ],
      APP: ["TARGET_CPA", "MAXIMIZE_CONVERSIONS"],
    };
    if (!allowed[v.type].includes(v.bidding.strategy))
      issue("Choose a bidding strategy supported by this campaign type.");
    if (!["SHOPPING", "APP"].includes(v.type) && !v.ad.finalUrl)
      issue("Enter an HTTPS landing page.");
    if (
      v.type !== "SHOPPING" &&
      (!v.ad.headlines.length || !v.ad.descriptions.length)
    )
      issue("Add headlines and descriptions.");
    if (
      ["DISPLAY", "DEMAND_GEN", "APP"].includes(v.type) &&
      v.ad.headlines.length > 5
    )
      issue("This ad type accepts up to 5 headlines.");
    if (v.type === "DEMAND_GEN" && !v.ad.assets.some(a => a.field === "LOGO"))
      issue("Demand Gen requires a square logo.");
    if (
      v.type === "SEARCH" &&
      (!v.keywords.some(k => !k.negative) ||
        v.ad.headlines.length < 3 ||
        v.ad.descriptions.length < 2 ||
        v.ad.descriptions.length > 4)
    )
      issue(
        "Search needs at least one keyword, 3–15 headlines and 2–4 descriptions."
      );
    if (v.type === "SHOPPING" && (!v.merchantId || !v.feedLabel))
      issue("Choose a linked Merchant Center account and feed label.");
    if (
      v.type === "PERFORMANCE_MAX" &&
      (v.merchantId || v.feedLabel) &&
      (!v.merchantId || !v.feedLabel)
    )
      issue(
        "Retail Performance Max requires both a Merchant Center account and feed label."
      );
    if (v.type === "APP" && (!v.appId || !v.appStore))
      issue("Enter the app ID and choose its store.");
    if (v.type === "DEMAND_GEN" && !v.audienceId)
      issue("Choose an audience for the Demand Gen ad group.");
    if (
      ["DISPLAY", "DEMAND_GEN"].includes(v.type) &&
      (!v.ad.businessName ||
        !v.ad.assets.some(a => a.field === "MARKETING_IMAGE") ||
        !v.ad.assets.some(a => a.field === "SQUARE_MARKETING_IMAGE"))
    )
      issue("Provide a business name, landscape image and square image.");
    if (v.type === "DISPLAY" && !v.ad.longHeadline)
      issue("Display requires a long headline.");
    if (
      v.type === "PERFORMANCE_MAX" &&
      (!v.ad.longHeadline ||
        !v.ad.businessName ||
        v.ad.headlines.length < 3 ||
        v.ad.descriptions.length < 2 ||
        !["MARKETING_IMAGE", "SQUARE_MARKETING_IMAGE", "LOGO"].every(f =>
          v.ad.assets.some(a => a.field === f)
        ))
    )
      issue(
        "Performance Max needs 3 headlines, 2 descriptions, a long headline, business name, landscape image, square image and logo."
      );
  });
export const googleChangeSchema = z.union([
  googleCampaignCreateSchema,
  z.object({
    kind: z.literal("campaign_update"),
    campaignId: id,
    name: text(128),
    status: z.enum(["ENABLED", "PAUSED"]),
    dailyBudget: z.number().positive().max(1_000_000),
  }),
  z.object({
    kind: z.literal("asset_group_update"),
    campaignId: id,
    assetGroupId: id,
    name: text(128),
    finalUrl: landingUrl,
    status: z.enum(["ENABLED", "PAUSED"]),
  }),
  z.object({
    kind: z.literal("asset_group_create"),
    campaignId: id,
    name: text(128),
    finalUrl: landingUrl,
    assets: z.array(googleAssetInputSchema).min(1).max(100),
  }),
  z
    .object({
      kind: z.literal("asset_group_assets"),
      campaignId: id,
      assetGroupId: id,
      add: z.array(googleAssetInputSchema).max(100),
      remove: z
        .array(z.object({ assetId: id, field: googleAssetFieldSchema }))
        .max(100),
    })
    .refine(
      v => v.add.length + v.remove.length > 0,
      "Choose assets to add or unlink."
    ),
  z.object({
    kind: z.literal("ad_create"),
    campaignId: id,
    adGroupId: id,
    type: z.enum(["SEARCH", "DISPLAY", "DEMAND_GEN"]),
    ad: googleAdContentSchema,
  }),
]);
export type GoogleChange = z.infer<typeof googleChangeSchema>;
export type GoogleCampaignCreate = z.infer<typeof googleCampaignCreateSchema>;
export type GoogleAdContent = z.infer<typeof googleAdContentSchema>;
