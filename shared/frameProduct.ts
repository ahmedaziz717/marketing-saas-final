/** Product availability is separate from both a subscription and a person's role. */
export const PRODUCT_STAGES = [
  {
    id: "create",
    label: "Create",
    description: "Build content and organize approved assets.",
    href: "/app/creatives/overview",
  },
  {
    id: "activate",
    label: "Activate",
    description: "Manage channels and schedule approved content.",
    href: "/app/advertising",
  },
  {
    id: "measure",
    label: "Measure",
    description: "Compare channel and campaign performance.",
    href: "/app/analytics",
  },
  {
    id: "optimize",
    label: "Optimize",
    description: "Recommendations, testing and automation are next.",
    href: "/app/optimize",
    planned: true,
  },
] as const;
export type ProductStage = (typeof PRODUCT_STAGES)[number]["id"];
export const PRODUCT_FEATURES = [
  {
    id: "image_assets",
    name: "Image assets",
    stage: "create",
    availability: "available",
    href: "/app/creatives/images",
    description:
      "Generate and refine images with the existing shared creative builder.",
  },
  {
    id: "ad_creative",
    name: "Ad creative",
    stage: "create",
    availability: "available",
    href: "/app/creatives/ads",
    description:
      "Create image-based advertising assets. Campaigns and budgets stay under Activate.",
  },
  {
    id: "social_content",
    name: "Social content",
    stage: "create",
    availability: "available",
    href: "/app/creatives/social",
    description:
      "Create social images in the shared builder. Prepare captions and posts in Publishing.",
  },
  {
    id: "video",
    name: "Video creation",
    stage: "create",
    availability: "planned",
    href: "/app/creatives/video",
    description:
      "Video generation and editing are not available yet. Upload existing video files in Saved work.",
  },
  {
    id: "ugc",
    name: "User-generated content",
    stage: "create",
    availability: "available",
    href: "/app/creatives/saved?type=ugc",
    description:
      "Upload and classify creator or customer images and videos, then submit selected versions for review.",
  },
  {
    id: "email_builder",
    name: "Email builder",
    stage: "create",
    availability: "planned",
    href: "/app/creatives/email",
    description:
      "Email design and editing are planned, separate from delivery through an email provider.",
  },
  {
    id: "landing_pages",
    name: "Landing pages",
    stage: "create",
    availability: "planned",
    href: "/app/creatives/pages",
    description:
      "Page-section design and export are planned. There is no live page builder in this release.",
  },
  {
    id: "blog",
    name: "Blog & insights",
    stage: "create",
    availability: "planned",
    href: "/app/creatives/blog",
    description:
      "Article creation with supporting images and CMS delivery is planned.",
  },
  {
    id: "asset_library",
    name: "Asset Library",
    stage: "create",
    availability: "available",
    href: "/app/library",
    description:
      "Review submitted versions and reuse approved content. Drafts stay in Studio.",
  },
  {
    id: "catalog",
    name: "Catalog",
    stage: "create",
    availability: "available",
    href: "/app/catalog",
    description: "Manage product data and approved product images.",
  },
  {
    id: "advertising",
    name: "Advertising",
    stage: "activate",
    availability: "connection_required",
    href: "/app/advertising",
    description:
      "Meta-first account reporting and paused image-ad preparation. Provider authorization is required.",
  },
  {
    id: "social_media",
    name: "Social Media",
    stage: "activate",
    availability: "connection_required",
    href: "/app/social",
    description:
      "Facebook-first post management with a shared publishing calendar. Provider authorization is required.",
  },
  {
    id: "email_delivery",
    name: "Email",
    stage: "activate",
    availability: "planned",
    href: "/app/email",
    description:
      "Email provider connections and campaign delivery are planned.",
  },
  {
    id: "publishing",
    name: "Publishing",
    stage: "activate",
    availability: "available",
    href: "/app/publishing",
    description:
      "Plan drafts by week or month and schedule future content. Delivery still requires approval and a connected destination.",
  },
  {
    id: "analytics",
    name: "Analytics",
    stage: "measure",
    availability: "connection_required",
    href: "/app/analytics",
    description:
      "Overall, advertising and social reports. Metrics require connected accounts and available provider data.",
  },
  {
    id: "attribution",
    name: "Attribution",
    stage: "measure",
    availability: "planned",
    href: "/app/attribution",
    description:
      "Cross-channel attribution requires the unified event layer. Platform-reported conversions in Analytics are not deduplicated attribution.",
  },
  {
    id: "incrementality",
    name: "Incrementality",
    stage: "measure",
    availability: "planned",
    href: "/app/incrementality",
    description:
      "Controlled lift measurement is planned after the event and attribution foundations.",
  },
  {
    id: "recommendations",
    name: "Recommendations",
    stage: "optimize",
    availability: "planned",
    href: "/app/optimize/recommendations",
    description:
      "Actionable suggestions backed by campaign and business results are planned.",
  },
  {
    id: "budget_optimizer",
    name: "Budget Optimizer",
    stage: "optimize",
    availability: "planned",
    href: "/app/optimize/budgets",
    description:
      "Budget recommendations and controlled changes are planned. This page cannot change advertising spend.",
  },
  {
    id: "experiments",
    name: "Experiments",
    stage: "optimize",
    availability: "planned",
    href: "/app/optimize/experiments",
    description:
      "Campaign and creative experiments with measurable outcomes are planned.",
  },
  {
    id: "ai_agent",
    name: "AI Agent",
    stage: "optimize",
    availability: "planned",
    href: "/app/optimize/agent",
    description:
      "End-to-end campaign assistance will build on shared execution, measurement and approval controls.",
  },
] as const;
export type FeatureId = (typeof PRODUCT_FEATURES)[number]["id"];
export const PLAN_IDS = ["launch", "growth", "scale", "enterprise"] as const;
export type PlanId = (typeof PLAN_IDS)[number];
export const PROPOSED_PLANS: ReadonlyArray<{
  id: PlanId;
  name: string;
  monthlyUsd: number | null;
  credits: number | null;
  monthlyAdSpendUsd: number | null;
  description: string;
  popular?: boolean;
}> = [
  {
    id: "launch",
    name: "Launch",
    monthlyUsd: 99,
    credits: 1000,
    monthlyAdSpendUsd: 10000,
    description: "A starting point for a growing marketing workflow.",
  },
  {
    id: "growth",
    name: "Growth",
    monthlyUsd: 299,
    credits: 4000,
    monthlyAdSpendUsd: 50000,
    description: "More proposed AI usage and advertising scale.",
    popular: true,
  },
  {
    id: "scale",
    name: "Scale",
    monthlyUsd: 799,
    credits: 15000,
    monthlyAdSpendUsd: 250000,
    description: "Higher-volume marketing and measurement needs.",
  },
  {
    id: "enterprise",
    name: "Enterprise",
    monthlyUsd: null,
    credits: null,
    monthlyAdSpendUsd: null,
    description:
      "Custom terms. $2,000+ per month was discussed, not committed.",
  },
];
export const COMMERCIAL_STATUS = "proposal" as const;
export type EntitlementPolicy =
  | { mode: "preview" }
  | { mode: "subscription"; includedFeatures: readonly FeatureId[] };
/** No price-tier mapping is assumed until a commercial feature matrix is approved. */
export function resolveFeatureAccess(id: FeatureId, policy: EntitlementPolicy) {
  const feature = PRODUCT_FEATURES.find(item => item.id === id);
  if (!feature) throw new Error("Unknown product feature");
  if (feature.availability === "planned")
    return { feature, access: "planned" as const };
  if (policy.mode === "preview") return { feature, access: "preview" as const };
  return {
    feature,
    access: policy.includedFeatures.includes(id)
      ? ("included" as const)
      : ("not_in_plan" as const),
  };
}
export function mayManageBilling(role: string) {
  return role === "owner" || role === "admin";
}
export const USAGE_METERS = [
  {
    id: "image_outputs",
    action: "creative_generation.completed",
    label: "Generated images",
    unit: "images",
    entity: "creative_job",
  },
  {
    id: "ai_caption_drafts",
    action: "publication.ai_drafted",
    label: "AI caption drafts",
    unit: "drafts",
    entity: "publication",
  },
  {
    id: "asset_uploads",
    action: "asset_library.uploaded",
    label: "Library uploads",
    unit: "files",
    entity: "library_asset",
  },
  {
    id: "catalog_scans",
    action: "website_crawl.review_ready",
    label: "Completed website scans",
    unit: "scans",
    entity: "website_crawl_job",
  },
] as const;
export function usageMonthRange(month: string) {
  if (!/^(20[2-9][0-9]|2100)-(0[1-9]|1[0-2])$/.test(month))
    throw new Error("Choose a valid month between 2020 and 2100.");
  const [year, index] = month.split("-").map(Number);
  return { start: Date.UTC(year, index - 1, 1), end: Date.UTC(year, index, 1) };
}
