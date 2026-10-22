import { WorkflowCanvas } from "../../client/src/components/WorkflowCanvas";
import {
  newWorkflowNode,
  type WorkflowGraph,
} from "../../shared/creativeWorkflow";
import { ReleaseDetailsFixture } from "./release-details";
import { ApiCatalogConnect } from "../../client/src/components/ApiCatalogConnect";
import { catalogImageDirectory } from "../../shared/apiCatalog";
import { ImageEnhanceAction } from "../../client/src/components/ImageEnhanceAction";
import CreativeWorkflowsPage from "../../client/src/pages/CreativeWorkflowsPage";
import CreativeConfiguratorPage from "../../client/src/pages/CreativeConfiguratorPage";
import GoogleCampaignStudioPage from "../../client/src/pages/GoogleCampaignStudioPage";
import InsightsStudioPage from "../../client/src/pages/InsightsStudioPage";
import OptimizationStudioPage from "../../client/src/pages/OptimizationStudioPage";
import { VideoStudio } from "../../client/src/components/VideoStudio";
import { useState } from "react";
import { ThemeProvider } from "../../client/src/contexts/ThemeContext";
import { defaultVideoSetup } from "../../shared/videoCreation";
import {
  generationModels,
  DEFAULT_VIDEO_MODEL,
  modelVideoMode,
} from "../../shared/modelCatalog";
import { LifestylePersonPicker } from "../../client/src/components/LifestylePersonPicker";
import {
  defaultCreativeSetup,
  type CreativeSetup,
} from "../../shared/creativeBuilder";
import CreativesPage from "../../client/src/pages/CreativesPage";
import BriefsPage from "../../client/src/pages/BriefsPage";
import AssetLibraryPage from "../../client/src/pages/AssetLibraryPage";
import BrandPage from "../../client/src/pages/BrandPage";
import { CreativeBuilder } from "../../client/src/components/CreativeBuilder";
import PlatformAdminPage from "../../client/src/pages/PlatformAdminPage";
import { Router, useLocation } from "wouter";
import { memoryLocation } from "wouter/memory-location";
import DashboardLayout from "../../client/src/components/DashboardLayout";
import { workspaceNavigation } from "../../client/src/components/WorkspaceNavigation";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { observable } from "@trpc/server/observable";
import { trpc } from "../../client/src/lib/trpc";
import LoginPage from "../../client/src/pages/LoginPage";
import WorkspaceApp from "../../client/src/pages/WorkspaceApp";
import ProductOverviewPage from "../../client/src/pages/ProductOverviewPage";
import PlannedFeaturePage from "../../client/src/pages/PlannedFeaturePage";
import SettingsPage from "../../client/src/pages/SettingsPage";
import {
  PRODUCT_FEATURES,
  PROPOSED_PLANS,
  USAGE_METERS,
} from "../../shared/frameProduct";
import PublishingPage from "../../client/src/pages/PublishingPage";
import SocialMediaPage from "../../client/src/pages/SocialMediaPage";
import AdvertisingPage from "../../client/src/pages/AdvertisingPage";
import AnalyticsPage from "../../client/src/pages/AnalyticsPage";
import MeasureDashboardPage from "../../client/src/pages/MeasureDashboardPage";
import ActivationStudioPage from "../../client/src/pages/ActivationStudioPage";
import IntegrationsPage from "../../client/src/pages/IntegrationsPage";
import { contentSchema, dateInZone } from "../../shared/channels";
import { Toaster } from "../../client/src/components/ui/sonner";
import { TooltipProvider } from "../../client/src/components/ui/tooltip";
// about:blank fixture is not a secure origin; production runs on HTTPS.
if (!crypto.randomUUID)
  crypto.randomUUID = () => "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const pageId = "11111111-1111-4111-8111-111111111111",
  adsId = "22222222-2222-4222-8222-222222222222";
const secondPageId = "44444444-4444-4444-8444-444444444444";
const id = "33333333-3333-4333-8333-333333333333";
const now = Date.now();
const empty = { items: [], truncated: false };
const studioDraftAssets = [
  {
    key: "asset:1",
    name: "Emerald collection hero",
    state: "draft",
    campaignPlanId: 7,
  },
  {
    key: "asset:2",
    name: "Approved collection image",
    state: "approved",
    campaignPlanId: 7,
  },
  {
    key: "asset:3",
    name: "Gold bracelet lifestyle",
    state: "changes_requested",
    campaignPlanId: 7,
  },
].map((a, i) => ({
  ...a,
  origin: "generated",
  mediaType: "image",
  mimeType: "image/svg+xml",
  purpose: "finished",
  isUgc: false,
  revision: "1",
  fingerprint: "fixture",
  parentKey: null,
  createdAtMs: now - i * 100000,
  reviewedAtMs: null,
  reviewedByUserId: null,
  width: 1080,
  height: 1080,
  url:
    "data:image/svg+xml," +
    encodeURIComponent(
      `<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1080"><rect width="1080" height="1080" fill="${i === 2 ? "#e8dfcf" : "#d5e4dc"}"/><circle cx="540" cy="455" r="230" fill="none" stroke="${i === 2 ? "#a67c35" : "#426653"}" stroke-width="55"/><text x="540" y="850" text-anchor="middle" font-size="52" fill="#243932">${i === 2 ? "Gold collection" : "Emerald collection"}</text></svg>`
    ),
}));
const posts: any[] = [
  {
    id,
    organizationId: 1,
    channel: "facebook",
    connectionId: pageId,
    assetKey: null,
    content: contentSchema.parse({
      title: "Weekly product story",
      message: "Review our latest collection.",
    }),
    state: "draft",
    revision: 1,
    scheduledAtMs: now + 3600000,
    timezone: "UTC",
    createdAtMs: now,
    updatedAtMs: now,
    result: null,
    error: null,
  },
];
const details = {
  permissions: [],
  tasks: [],
  capabilities: ["read", "publish", "insights"],
  warnings: [],
  currency: "USD",
  timezone: "UTC",
};
const connections = {
  items: [
    {
      id: pageId,
      channel: "facebook",
      name: "Demo Facebook Page",
      accountId: "123",
      status: "connected",
      details,
      expired: false,
      verifiedAtMs: now,
    },
    {
      id: adsId,
      channel: "meta_ads",
      name: "Demo ad account",
      accountId: "456",
      status: "connected",
      details: { ...details, pageId: "123", pageName: "Demo Facebook Page" },
      expired: false,
      verifiedAtMs: now,
    },
  ],
  oauthConfigured: false,
  advancedEnabled: false,
  hasLegacy: false,
  callbackUrl: null,
  liveSocial: false,
  liveAds: false,
};
const metrics = {
  spend: 120,
  impressions: 12000,
  clicks: 200,
  linkClicks: 180,
  purchases: 4,
  purchaseValue: 600,
  roas: 5,
};
const fixtureCampaigns: any[] = [
  {
    id: "8",
    name: "Paused campaign",
    status: "PAUSED",
    objective: "OUTCOME_SALES",
    account_id: "456",
  },
  {
    id: "10",
    name: "Prospecting · Gaming PCs",
    status: "ACTIVE",
    objective: "OUTCOME_TRAFFIC",
    account_id: "456",
  },
  {
    id: "12",
    name: "Retargeting · CLX",
    status: "ACTIVE",
    objective: "OUTCOME_SALES",
    account_id: "456",
  },
];
const fixtureAdsets: any[] = [
  {
    id: "9",
    name: "Paused ad set",
    status: "PAUSED",
    campaign_id: "8",
    account_id: "456",
  },
  {
    id: "11",
    name: "US · Gaming enthusiasts",
    status: "ACTIVE",
    campaign_id: "10",
    account_id: "456",
  },
  {
    id: "13",
    name: "Previous visitors",
    status: "ACTIVE",
    campaign_id: "12",
    account_id: "456",
  },
];
const mutations: string[] = [];
const googleFixtureId = "55555555-5555-4555-8555-555555555555";
const googleCampaignRows = [
  {
    campaign: {
      id: "11",
      name: "Active Search",
      status: "ENABLED",
      advertisingChannelType: "SEARCH",
    },
    campaignBudget: { amountMicros: "15000000", period: "DAILY" },
  },
  {
    campaign: {
      id: "12",
      name: "Active PMax",
      status: "ENABLED",
      advertisingChannelType: "PERFORMANCE_MAX",
      brandGuidelinesEnabled: true,
    },
    campaignBudget: { amountMicros: "20000000", period: "DAILY" },
  },
  {
    campaign: {
      id: "13",
      name: "Paused Search",
      status: "PAUSED",
      advertisingChannelType: "SEARCH",
    },
    campaignBudget: { amountMicros: "10000000", period: "DAILY" },
  },
];
const copyRequests: any[] = [];
const videoDrafts: any[] = [];
const videoQuotes: any[] = [];
const role =
  new URLSearchParams((window as any).__fixtureQuery ?? location.search).get(
    "role"
  ) ?? "owner";
const fixtureModels = [
  generationModels.find(m => m.id === DEFAULT_VIDEO_MODEL)!,
  generationModels.find(
    m => m.kind === "video" && modelVideoMode(m) === "edit"
  )!,
  generationModels.find(
    m => m.kind === "video" && modelVideoMode(m) === "motion"
  )!,
  generationModels.find(m => m.kind === "image")!,
];
function respond(path: string, input: any) {
  if (path === "creativeBuilder.enhancementSetup")
    return {
      setup: {
        ...defaultCreativeSetup(),
        name: "Emerald collection · Enhanced",
        formatIds: ["square_1_1"],
        modelId: fixtureModels.find(m => m.kind === "image")!.id,
        preserveProduct: true,
        enhancement: {
          assetKey: "asset:1",
          revision: "a".repeat(64),
          instruction:
            "Recreate this Studio product advertisement as a stunning, professional ad creative with dramatically improved visual quality.",
        },
      },
      source: studioDraftAssets[0],
      width: 1080,
      height: 1080,
      hasProductOverlay: true,
      canPreserveProductOverlay: true,
    };
  if (path === "models.catalog" || path === "models.studioCatalog")
    return fixtureModels.map(m => ({
      ...m,
      routeId: m.id,
      enabled: true,
      available: true,
      estimatedCredits: 235,
      estimatedSeconds: 5,
      reason: null,
      direct: false,
    }));
  if (path === "workflows.availability") return { enabled: true, reason: null };
  if (
    path === "workflows.list" ||
    path === "workflows.listApps" ||
    path === "insights.runs"
  )
    return [];
  if (path === "creativeBuilder.quote") return { credits: 24, outputs: 1 };
  if (path === "models.credits")
    return {
      remaining: 80,
      allowance: 100,
      packageName: "Test",
      textEstimate: 1,
      enforced: false,
    };
  if (path === "video.generate" || path === "video.save") mutations.push(path);
  if (path === "briefs.list")
    return [
      {
        id: 7,
        name: "Autumn learning",
        audience: "Families seeking classes",
        offer: "Directory subscription",
        creativeDirection: "Grow qualified member registrations",
        formats: [],
        placements: [],
        assetIds: [],
        productIds: [],
        status: "draft",
        destinationUrl: "",
        requiredClaims: "",
      },
    ];
  if (path === "briefs.get") return respond("briefs.list", input)[0];
  if (path === "video.options") return { ready: true, reason: null };
  if (path === "video.catalogImages") return { items: [], nextOffset: null };
  if (path === "video.list") return [...videoDrafts];
  if (path === "video.get") return videoDrafts.find(job => job.id === input.id);
  if (path === "video.save") {
    const index = videoDrafts.findIndex(job => job.id === input.id);
    const job = {
      id:
        input.id ??
        `55555555-5555-4555-8555-${String(videoDrafts.length + 1).padStart(12, "0")}`,
      setup: structuredClone(input.setup),
      revision: index >= 0 ? videoDrafts[index].revision + 1 : 1,
      status: "draft",
      credits: 0,
      error: null,
      cancelRequested: false,
      assetKey: null,
      createdAtMs: now,
      updatedAtMs: now,
    };
    if (index >= 0) videoDrafts[index] = job;
    else videoDrafts.push(job);
    return job;
  }
  if (path === "video.quote") {
    videoQuotes.push(input.setup);
    return { credits: 235, durationSeconds: 5 };
  }
  if (path === "creatives.overview") return { jobs: [] };
  if (path === "brand.assets") return [];
  if (path === "catalog.overview") return { products: [] };
  if (path === "publishing.get") return posts.find(p => p.id === input.id);
  if (path === "creativeBuilder.people") return [];
  if (path === "creativeBuilder.options")
    return {
      products: [],
      logos: [],
      references: [],
      drafts: [],
      brand: {
        status: "active",
        name: "Learn Like This",
        colors: ["#6d50d8"],
        fonts: ["Rubik"],
        voice: "Clear and inviting",
        businessProfile: {
          model: "directory",
          summary:
            "Discover independent learning providers through our directory.",
        },
      },
    };
  if (
    path === "platformAdmin.openaiCosts" ||
    path === "platformAdmin.syncOpenaiCosts"
  )
    return {
      range: input.range,
      syncedAtMs: now,
      amountUsd: 12.5,
      rows: [
        {
          date: input.range.since,
          projectId: "proj_demo",
          lineItem: "Image generation",
          amountUsd: 12.5,
          quantity: null,
          quantityUnit: null,
        },
      ],
    };
  if (path === "platformAdmin.customerCredits")
    return {
      tier: "Trial",
      period: "2026-09",
      allowance: 100,
      remaining: 80,
      enforced: true,
      paused: false,
    };
  if (path === "platformAdmin.config")
    return {
      tiers: [
        {
          id: "trial",
          name: "Trial",
          monthlyCredits: 100,
          monthlyPriceMicros: 0,
        },
      ],
      rates: [],
    };
  if (path === "platformAdmin.accounts")
    return {
      items: [
        {
          organization: { id: 1, name: "Demo customer account" },
          account: {
            tierId: "trial",
            enforceCredits: 1,
            aiPaused: 0,
            ownerEmail: "owner@example.test",
            notes: "",
          },
          tier: { name: "Trial" },
        },
      ],
    };
  if (path === "platformAdmin.account")
    return {
      period: "2026-09",
      allowance: 100,
      remaining: 80,
      ledger: [],
      members: [],
    };
  if (path === "platformAdmin.audit") return [];
  if (path === "platformAdmin.report")
    return {
      groups: [
        {
          organizationId: 1,
          provider: "openai",
          model: "sample-text-model",
          kind: "text",
          status: "succeeded",
          requests: 12,
          inputTokens: 42000,
          outputTokens: 1000,
          costMicros: 100000,
          unpriced: 0,
          credits: 12,
        },
      ],
      financial: [],
      recent: [],
      entries: [],
      coverage: "Fixture: measured costs only.",
    };

  if (path === "workspace.members" || path === "workspace.invites") return [];
  if (path === "insights.dashboards" || path === "insights.list") return [];
  if (path === "insights.options")
    return {
      connections: [
        ...connections.items,
        {
          id: "55555555-5555-4555-8555-555555555555",
          name: "Demo Google Ads",
          channel: "google_ads",
          status: "connected",
          currency: "USD",
          timezone: "America/New_York",
        },
      ],
      members: [],
      recipients: [],
      canEdit: true,
      emailConfigured: false,
    };
  if (path === "billing.summary")
    return {
      mode: "preview",
      commercialStatus: "proposal",
      chargesEnabled: false,
      enforcement: false,
      selectedPreviewPlanId: null,
      revision: 0,
      plans: PROPOSED_PLANS,
      month: input.month,
      creditsUsed: null,
      usage: USAGE_METERS.map(m => ({
        ...m,
        quantity: m.id === "image_outputs" ? 24 : 2,
      })),
      inventory: { activeSeats: 3, catalogItems: 485, connectedAccounts: 2 },
      coverage: "Recorded successful outputs, not billable credits.",
    };
  if (path === "billing.selectPreviewPlan") {
    mutations.push(path);
    return { success: true, previewOnly: true };
  }

  if (path === "catalogSources.list" && which.startsWith("google-")) return [];
  if (path === "googleAds.campaigns.drafts") return [];
  if (path === "googleAds.campaigns.resources") return [];
  if (path === "googleAds.campaigns.inventory")
    return {
      campaigns: googleCampaignRows.filter(r =>
        input.campaignId
          ? r.campaign.id === input.campaignId
          : input.includeInactive || r.campaign.status === "ENABLED"
      ),
      groups:
        input.campaignId === "12"
          ? [
              {
                assetGroup: {
                  id: "21",
                  name: "Core products",
                  status: "ENABLED",
                  adStrength: "GOOD",
                  finalUrls: ["https://shop.example"],
                },
              },
            ]
          : [],
      assets:
        input.campaignId === "12"
          ? [
              {
                assetGroup: { id: "21" },
                assetGroupAsset: { fieldType: "HEADLINE", status: "ENABLED" },
                asset: {
                  id: "31",
                  name: "Existing headline",
                  textAsset: { text: "Shop the collection" },
                },
              },
            ]
          : [],
      ads: [],
      limited: false,
      currency: "USD",
      timezone: "America/New_York",
    };
  if (path === "googleAds.connections")
    return {
      oauthConfigured: which.startsWith("google-"),
      livePublishingEnabled: true,
      items: ["google-campaigns", "google-campaign-new"].includes(which)
        ? [
            {
              id: googleFixtureId,
              name: "Demo Google Ads",
              channel: "google_ads",
              accountId: "2222222222",
              status: "connected",
              needsReconnect: false,
              details: {
                currency: "USD",
                timezone: "America/New_York",
                google: {},
              },
            },
          ]
        : which === "google-manage"
          ? Array.from({ length: 12 }, (_, i) => ({
              id: `google-${i}`,
              name:
                i === 0 ? "CLX Gaming" : `Google advertising account ${i + 1}`,
              accountId: String(2222222222 + i),
              status: "connected",
              needsReconnect: i === 1,
              details: {
                currency: "USD",
                timezone: "America/New_York",
                warnings: [],
                google: { testAccount: false, loginCustomerId: "1111111111" },
              },
            }))
          : [],
    };
  if (path === "googleAds.selection")
    return {
      accounts:
        which === "google-empty"
          ? []
          : Array.from({ length: 20 }, (_, i) => ({
              id: String(2222222222 + i),
              name:
                i === 0 ? "CLX Gaming" : `Google advertising account ${i + 1}`,
              currency: "USD",
              timezone: "America/New_York",
              testAccount: false,
              loginCustomerId: "1111111111",
            })),
      warnings:
        which === "google-selection"
          ? [
              "One account group could not be loaded. If an account is missing, try connecting again.",
            ]
          : [],
    };
  if (path === "googleAds.cancelSelection") {
    mutations.push(path);
    return { success: true };
  }
  if (path === "channels.connections") {
    if (which === "advertising-empty" || which === "social-empty")
      return { ...connections, items: [] };
    if (which === "studio-post-empty")
      return {
        ...connections,
        items: connections.items.filter(c => c.channel === "meta_ads"),
      };
    if (which === "studio-post" || which === "studio-ad")
      return {
        ...connections,
        items: [
          ...connections.items,
          {
            ...connections.items[0],
            id: secondPageId,
            name: "Second Facebook Page",
          },
          {
            ...connections.items[0],
            id: "55555555-5555-4555-8555-555555555555",
            name: "Disconnected Page",
            status: "disconnected",
          },
          {
            ...connections.items[0],
            id: "66666666-6666-4666-8666-666666666666",
            name: "Expired Page",
            expired: true,
          },
        ],
      };
    return connections;
  }
  if (path === "publishing.list") return { items: posts, truncated: false };
  if (path === "publishing.history")
    return which.startsWith("activation-")
      ? [
          {
            id: "event-3",
            action: "publication.queued",
            author: "Workspace member",
            at: now - 10000,
          },
          {
            id: "event-2",
            action: "publication.approved",
            author: "Workspace member",
            at: now - 20000,
          },
          {
            id: "event-1",
            action: "publication.draft_saved",
            author: "Workspace member",
            at: now - 30000,
          },
        ]
      : [];
  if (path === "channels.plan")
    return {
      organizationId: 1,
      channel: "facebook",
      timezone: "UTC",
      postsPerWeek: 2,
      slots: [
        { day: 2, time: "10:00" },
        { day: 5, time: "10:00" },
      ],
    };
  if (path === "channels.metaObject") {
    const object = (
      input.kind === "campaign" ? fixtureCampaigns : fixtureAdsets
    ).find(o => o.id === input.objectId);
    if (!object) throw new Error("Missing fixture object " + input.objectId);
    return { object, advantage: null, liveEnabled: true };
  }
  if (path === "channels.metaPixels")
    return {
      data: [{ id: "88", name: "CLX website dataset" }],
      truncated: false,
    };
  if (path === "channels.metaAudiences")
    return {
      data: [{ id: "77", name: "Website visitors", subtype: "WEBSITE" }],
      truncated: false,
    };
  if (path === "catalogSources.previewApi") {
    mutations.push(path);
    return {
      count: 3,
      ready: true,
      reviewProductCount: 3,
      mapping: {
        ...input.config,
        ...(input.config.imageBaseUrl
          ? { imageBaseUrl: catalogImageDirectory(input.config.imageBaseUrl) }
          : {}),
      },
      issues: [
        {
          index: 0,
          product: "Desktop kit",
          field: "productUrl",
          blocking: false,
          message: "Product-page link missing",
        },
        {
          index: 1,
          product: "Laptop kit",
          field: "imageUrl",
          blocking: false,
          message: "Source image unavailable; import for review.",
        },
        {
          index: 2,
          product: "Ready-to-ship kit",
          field: "productUrl",
          blocking: false,
          message: "Product-page link missing",
        },
      ],
      samples: ["Desktop kit", "Laptop kit", "Ready-to-ship kit"].map(
        (name, i) => ({
          name,
          sku: `KIT-${i}`,
          productUrl: "",
          imageUrl: "",
          specifications: { Memory: "32 GB" },
          features: ["Test feature"],
        })
      ),
    };
  }
  if (path === "catalogSources.connect") {
    mutations.push(path);
    return { id: 99 };
  }
  if (path === "channels.reviewMetaChange") {
    mutations.push(path);
    return {
      params: { status: "PAUSED" },
      warnings: [],
      liveEnabled: true,
      ticket: "synthetic-review",
    };
  }
  if (path === "channels.applyMetaChange") {
    mutations.push(path);
    const id = input.change.kind === "create_campaign" ? "20" : "21";
    (input.change.kind === "create_campaign"
      ? fixtureCampaigns
      : fixtureAdsets
    ).push({
      id,
      name: input.change.name,
      status: "PAUSED",
      objective: input.change.objective,
      campaign_id: input.change.campaignId,
      account_id: "456",
    });
    return { id, success: true };
  }
  if (path === "channels.adObjects" && which.startsWith("studio-ad")) {
    const filter = (o: any) =>
      !input.filters ||
      input.filters.status === "all" ||
      o.status.toLowerCase() === input.filters.status;
    return {
      campaigns: fixtureCampaigns.filter(filter),
      adsets: fixtureAdsets.filter(filter),
      ads: [],
      truncated: false,
      currency: "USD",
    };
  }
  if (path === "channels.adObjects")
    return {
      campaigns: [
        {
          id: "8",
          name: "Demo campaign",
          status: "PAUSED",
          objective: "OUTCOME_SALES",
        },
      ],
      adsets: [
        { id: "9", name: "Demo ad set", status: "PAUSED", campaign_id: "8" },
      ],
      ads: [],
      truncated: false,
      currency: "USD",
    };
  if (path === "channels.posts")
    return {
      data: [
        {
          id: "123_10",
          message: "A published example post.",
          createdAt: new Date(now).toISOString(),
          reactions: 12,
          comments: 2,
          shares: 1,
          url: null,
        },
      ],
      truncated: false,
    };
  if (path === "channels.report")
    return input.connectionId === adsId
      ? {
          channel: "meta_ads",
          refreshedAtMs: now,
          data: {
            summary: metrics,
            currency: "USD",
            timezone: "UTC",
            daily: [{ date: "2026-09-01", ...metrics }],
            campaigns: [{ id: "8", name: "Demo campaign", ...metrics }],
            platforms: [{ name: "facebook", ...metrics }],
            attribution: "Fixture only - not live provider data",
            truncated: false,
          },
        }
      : {
          channel: "facebook",
          refreshedAtMs: now,
          data: {
            postCount: 2,
            followersNow: 500,
            series: [
              { metric: "page_media_view", total: 5000, values: [] },
              { metric: "page_post_engagements", total: 25, values: [] },
            ],
            posts: [],
            warnings: [],
            note: "Fixture only - not live provider data",
            truncated: false,
          },
        };
  if (path === "brand.get")
    return {
      name: "Learn Like This Brand",
      colors: ["#15141A"],
      fonts: ["Manrope"],
      voice: "",
      requiredClaims: "",
      prohibitedContent: "",
      status: "draft",
      businessProfile: { website: "learnlikethis.com" },
    };
  if (path === "brand.scanWebsite") {
    mutations.push(path);
    return {
      sourceUrl: "https://learnlikethis.com",
      name: "Learn Like This",
      colors: ["#0F414C", "#88A34A", "#D25A12"],
      fonts: ["Montserrat"],
      voice:
        "Welcoming and practical. Help families discover independent educational resources. Attribute services to the listed providers.",
      logoUrls: [],
      warnings: [],
    };
  }
  if (path === "assetLibrary.studioList")
    return ["studio-drafts", "video-studio", "video-ugc"].includes(which)
      ? studioDraftAssets
      : [];
  if (path === "assetLibrary.list" && which.startsWith("activation-"))
    return studioDraftAssets;
  if (path === "assetLibrary.list")
    return ["studio-ad-copy", "studio-post-media", "studio-media"].includes(
      which
    )
      ? [
          {
            key: "asset:1",
            name: "Approved learning directory image",
            origin: "generated",
            mediaType: "image",
            mimeType: "image/svg+xml",
            purpose: "finished",
            isUgc: false,
            state: "approved",
            revision: "1",
            fingerprint: "fixture",
            parentKey: null,
            createdAtMs: now,
            reviewedAtMs: now,
            reviewedByUserId: 1,
            width: 1080,
            height: 1080,
            url:
              "data:image/svg+xml," +
              encodeURIComponent(
                '<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1080"><rect width="1080" height="1080" fill="#efeafb"/><text x="100" y="500" font-size="72" fill="#7041bd">Discover learning</text></svg>'
              ),
          },
        ]
      : [];
  if (path === "channels.draftAssetCopy") {
    mutations.push(path);
    copyRequests.push(input);
    const n = copyRequests.length;
    const option = (i: number) => ({
      message: `Discover learning opportunities near you. Explore independent providers and find your next step. Option ${i + 1}, generation ${n}.`,
      headline: `Find your next learning adventure ${i + 1}.${n}`,
      description: `Explore classes and providers ${i + 1}.${n}`,
    });
    if (input.regeneration) {
      const { index, field } = input.regeneration;
      const fresh = option(index);
      return {
        options: [
          field === "set"
            ? fresh
            : {
                ...input.currentOptions[index],
                [field]: fresh[field as keyof typeof fresh],
              },
        ],
      };
    }
    return { options: Array.from({ length: 5 }, (_, i) => option(i)) };
  }
  if (path.startsWith("catalog.")) return [];
  if (
    path === "publishing.review" ||
    path === "publishing.submit" ||
    path === "publishing.queue"
  ) {
    mutations.push(path);
    const post = posts.find(p => p.id === input.id);
    post.revision++;
    post.state = path.endsWith("review")
      ? input.delivery
        ? "scheduled"
        : input.decision
      : path.endsWith("submit")
        ? "needs_review"
        : "scheduled";
    if (path.endsWith("queue") || input.delivery)
      post.result = { deliveryMode: connections.liveSocial ? "live" : "test" };
    return { success: true, liveEnabled: connections.liveSocial };
  }
  if (path === "publishing.save") {
    mutations.push(path);
    const post = {
      ...input,
      revision: input.revision + 1,
      state: "draft",
      createdAtMs: now,
      updatedAtMs: now,
    };
    const found = posts.findIndex(p => p.id === input.id);
    if (found === -1) posts.push(post);
    else posts[found] = post;
    return post;
  }
  if (path === "channels.accountImage") return {};
  if (path === "workspace.mine") return [];
  throw new Error("No fixture response for " + path);
}
const client = trpc.createClient({
  links: [
    () =>
      ({ op }) =>
        observable(observer => {
          try {
            observer.next({
              result: {
                data: JSON.parse(JSON.stringify(respond(op.path, op.input))),
              },
            });
            observer.complete();
          } catch (error) {
            observer.error(error as any);
          }
        }),
  ],
});
const query = new QueryClient({
  defaultOptions: {
    queries: { retry: false, refetchOnWindowFocus: false },
    mutations: { retry: false },
  },
});
const which =
  new URLSearchParams((window as any).__fixtureQuery ?? location.search).get(
    "page"
  ) ?? "publishing";
const routeForPage: Record<string, string> = {
  "enhance-image": "/app/enhance-fixture",
  "report-layout": "/app/release-fixture",
  "product-facts": "/app/release-fixture",
  "workflow-library": "/app/creatives/workflows",
  "workflow-density": "/app/workflow-density-fixture",
  "studio-channels": "/app/activate/studio",
  "creative-overview": "/app/creatives/studio",
  "creative-editor": "/app/creatives/studio",
  "creative-scene": "/app/creatives/studio",
  "creative-type": "/app/creatives/studio",
  "creative-people": "/app/creatives/studio",
  "creative-checkpoint": "/app/creatives/studio",
  "creative-video": "/app/creatives/video",
  "insights-studio": "/app/analytics/studio",
  "google-campaigns": "/app/activate/google",
  "google-campaign-new": "/app/activate/google",
  "optimization-studio": "/app/optimize/studio",

  "model-picker": "/app/model-picker",
  "studio-media": "/app/creatives/social?new=1",
  "studio-legacy": "/app/creatives/saved?asset=creative%3A42",
  "studio-post": "/app/creatives/social?new=1&plan=7",
  "studio-post-media": `/app/creatives/social?edit=${id}`,
  "studio-post-empty": "/app/creatives/social?new=1",
  "studio-ad": "/app/creatives/ads?new=1",
  "studio-ad-setup": "/app/creatives/ads?new=1",
  "studio-ad-create": "/app/creatives/ads?new=1",
  "studio-ad-warning": "/app/creatives/ads?new=1",
  "catalog-api-import": "/app/catalog-api-fixture",
  "studio-ad-copy": "/app/creatives/ads?new=1&asset=asset%3A1",
  "campaign-plans": "/app/plans",
  "asset-library": "/app/library",
  roadmap: "/app/roadmap",
  "brand-kit": "/app/brand",
  "directory-creative": "/app/creatives/directory",
  "platform-admin": "/admin",
  "product-home": "/app",
  navigation: "/app/activate/studio",
  "navigation-ten": "/app/activate/studio",
  login: "/login",
  signup: "/signup",
  "reset-password": "/reset-password",
  "studio-overview": "/app/creatives/overview",
  "video-studio": "/app/creatives/video",
  "video-ugc": "/app/creatives/video?type=ugc",
  "studio-drafts": "/app/creatives/drafts?plan=7",
  "advertising-overview": "/app/advertising",
  "social-overview": "/app/social",
  "billing-usage": "/app/settings/billing",
  "billing-plans": "/app/settings/billing",
  "planned-attribution": "/app/attribution",
  "optimize-overview": "/app/optimize",

  "advertising-empty": "/app/advertising/meta",
  "social-empty": "/app/social/facebook",
  "activation-failed": `/app/activate/studio?publication=${id}`,
  "activation-unknown": `/app/activate/studio?publication=${id}`,
  "activation-published": `/app/activate/studio?publication=${id}`,
  "activation-processing": `/app/activate/studio?publication=${id}`,
  "activation-scheduled": `/app/activate/studio?publication=${id}`,
  publishing: "/app/publishing",
  "publishing-live": "/app/publishing",
  "publishing-approved": "/app/publishing",
  social: "/app/social/facebook",
  advertising: "/app/advertising/meta",
  analytics: "/app/analytics",
  "analytics-ads": "/app/analytics/advertising",
  "analytics-social": "/app/analytics/social",
  integrations: "/app/settings/integrations",
  "google-connect": "/app/settings/integrations",
  "google-selection":
    "/app/settings/integrations?googleSelection=11111111-1111-4111-8111-111111111111",
  "google-empty":
    "/app/settings/integrations?googleSelection=11111111-1111-4111-8111-111111111111",
  "google-manage": "/app/settings/integrations",
};
const fixtureRouter = memoryLocation({
  path: routeForPage[which] ?? "/app/advertising/meta",
});
if (which.startsWith("activation-")) {
  connections.liveAds = true;
  Object.assign(posts[0], {
    channel: "meta_ads",
    connectionId: adsId,
    assetKey: "asset:2",
    content: contentSchema.parse({
      title: "Autumn collection campaign",
      message:
        "Find a little everyday brilliance. Explore the new collection, made to go wherever the day takes you.",
      headline: "Made for your every day",
      description: "Discover the collection",
      link: "https://example.com/collection",
      adSetId: "9",
    }),
    scheduledAtMs: null,
    state:
      which === "activation-unknown"
        ? "delivery_unknown"
        : which.replace("activation-", ""),
    error:
      which === "activation-failed"
        ? "Invalid parameter"
        : which === "activation-unknown"
          ? "Provider request timed out"
          : null,
    result: { retrySafe: which === "activation-failed", deliveryMode: "live" },
  });
  if (which === "activation-published") posts[0].externalId = "123456789";
}
if (which === "studio-drafts") {
  posts[0].assetKey = "asset:2";
  posts[0].content.campaignPlanId = 7;
  posts.push({
    ...posts[0],
    id: "55555555-5555-4555-8555-555555555555",
    channel: "meta_ads",
    content: contentSchema.parse({
      title: "Weekend collection ad",
      message: "Discover the collection.",
      campaignPlanId: 7,
    }),
  });
  posts.push({
    ...posts[0],
    id: "66666666-6666-4666-8666-666666666666",
    state: "scheduled",
    content: contentSchema.parse({
      title: "Already scheduled",
      message: "Excluded from drafts",
      campaignPlanId: 7,
    }),
  });
}
if (which === "publishing-live" || which === "publishing-approved")
  connections.liveSocial = true;
if (which === "publishing-approved") posts[0].state = "approved";
if (which === "studio-post-media") {
  posts[0].assetKey = "asset:1";
  posts[0].scheduledAtMs = null;
  posts[0].content.message =
    "Find your next learning adventure. Explore local classes and independent providers.";
  posts[0].content.link = "https://example.com/classes";
}
if (which === "navigation-ten") {
  const group = workspaceNavigation.find(
    item => item.path === "/app/advertising"
  )!;
  group.children = [
    ...group.children!,
    ...Array.from(
      { length: Math.max(0, 10 - group.children!.length) },
      (_, i) => ({
        label: `Future channel ${i + group.children!.length + 1}`,
        path: `/app/advertising/future-${i}`,
        planned: true,
      })
    ),
  ];
}
function WorkflowDensityFixture() {
  const [graph, setGraph] = useState<WorkflowGraph>({
    nodes: [newWorkflowNode("start_trigger", "start")],
    edges: [],
  });
  return (
    <div className="wf-editor">
      <header className="wf-editor-header">
        <h1>Workflow builder</h1>
      </header>
      <WorkflowCanvas
        graph={graph}
        onChange={setGraph}
        organizationId={1}
        role="owner"
        busy={false}
        onRunNode={() => {}}
      />
    </div>
  );
}
function ModelPickerFixture() {
  const [setup, setSetup] = useState<CreativeSetup>({
    ...defaultCreativeSetup(),
    shot: "multiple",
  });
  return (
    <DashboardLayout>
      <h1>Model picker</h1>
      <LifestylePersonPicker setup={setup} onChange={setSetup} />
    </DashboardLayout>
  );
}
function RoutedPage() {
  const [path] = useLocation();
  if (path === "/app/catalog-api-fixture")
    return (
      <DashboardLayout>
        <h1>Catalog sources</h1>
        <ApiCatalogConnect organizationId={1} onConnected={async () => {}} />
      </DashboardLayout>
    );
  if (path === "/app/enhance-fixture")
    return (
      <DashboardLayout>
        <h1>Image assets</h1>
        <ImageEnhanceAction
          asset={
            {
              ...studioDraftAssets[0],
              mimeType: "image/png",
              revision: "a".repeat(64),
            } as any
          }
          organizationId={1}
        />
      </DashboardLayout>
    );
  if (path === "/app/release-fixture")
    return (
      <DashboardLayout>
        <ReleaseDetailsFixture facts={which === "product-facts"} />
      </DashboardLayout>
    );
  if (path === "/app/workflow-density-fixture")
    return (
      <DashboardLayout>
        <WorkflowDensityFixture />
      </DashboardLayout>
    );
  if (path === "/app/creatives/workflows")
    return (
      <DashboardLayout>
        <CreativeWorkflowsPage />
      </DashboardLayout>
    );
  if (
    which.startsWith("creative-") &&
    ["/app/creatives/studio", "/app/creatives/video"].includes(path)
  )
    return (
      <DashboardLayout>
        <CreativeConfiguratorPage
          initialKind={which === "creative-video" ? "video" : "image"}
        />
      </DashboardLayout>
    );
  if (path === "/app/activate/google")
    return (
      <DashboardLayout>
        <GoogleCampaignStudioPage />
      </DashboardLayout>
    );
  if (path === "/app/analytics/studio")
    return (
      <DashboardLayout>
        <InsightsStudioPage />
      </DashboardLayout>
    );
  if (path === "/app/optimize/studio")
    return (
      <DashboardLayout>
        <OptimizationStudioPage />
      </DashboardLayout>
    );
  // Historical component fixtures remain separate from production routes.
  if (which === "video-studio" || which === "video-ugc")
    return (
      <DashboardLayout>
        <h1>Video component compatibility</h1>
        <VideoStudio />
      </DashboardLayout>
    );
  if (path === "/app/activate/studio")
    return (
      <DashboardLayout>
        <ActivationStudioPage />
      </DashboardLayout>
    );
  if (path === "/app/analytics")
    return (
      <DashboardLayout>
        <MeasureDashboardPage />
      </DashboardLayout>
    );
  if (path === "/app/model-picker") return <ModelPickerFixture />;
  if (["/login", "/signup", "/reset-password"].includes(path))
    return (
      <LoginPage
        signup={path === "/signup"}
        resetPassword={path === "/reset-password"}
      />
    );
  if (path === "/app/brand") return <BrandPage />;
  if (path === "/app/creatives/directory")
    return (
      <DashboardLayout>
        <h1>Image assets</h1>
        <CreativeBuilder onGenerated={() => {}} />
      </DashboardLayout>
    );
  if (path === "/admin" || path.startsWith("/admin/"))
    return <PlatformAdminPage />;
  const Page =
    path === "/app"
      ? WorkspaceApp
      : path.startsWith("/app/creatives")
        ? CreativesPage
        : path === "/app/plans"
          ? BriefsPage
          : path === "/app/library"
            ? AssetLibraryPage
            : path === "/app/roadmap"
              ? ProductOverviewPage
              : path === "/app/settings/billing"
                ? SettingsPage
                : [
                      "/app/creatives/overview",
                      "/app/optimize",
                      "/app/advertising",
                      "/app/social",
                    ].includes(path)
                  ? ProductOverviewPage
                  : PRODUCT_FEATURES.some(
                        f => f.availability === "planned" && f.href === path
                      )
                    ? PlannedFeaturePage
                    : path.startsWith("/app/analytics")
                      ? AnalyticsPage
                      : path.startsWith("/app/social")
                        ? SocialMediaPage
                        : path.startsWith("/app/advertising")
                          ? AdvertisingPage
                          : path.startsWith("/app/settings")
                            ? IntegrationsPage
                            : PublishingPage;
  return (
    <DashboardLayout>
      <Page />
    </DashboardLayout>
  );
}
window.confirm = () => true;
createRoot(document.getElementById("root")!).render(
  <trpc.Provider client={client} queryClient={query}>
    <QueryClientProvider client={query}>
      <ThemeProvider switchable defaultTheme="light">
        <TooltipProvider>
          <Router
            hook={fixtureRouter.hook}
            searchHook={fixtureRouter.searchHook}
          >
            <RoutedPage />
          </Router>
          <Toaster />
        </TooltipProvider>
      </ThemeProvider>
    </QueryClientProvider>
  </trpc.Provider>
);
const pause = () => new Promise(resolve => setTimeout(resolve, 150));
const check = (condition: any, message: string) => {
  if (!condition) throw new Error(message);
};
const button = (name: string) =>
  Array.from(document.querySelectorAll<HTMLButtonElement>("button")).find(
    b =>
      b.textContent?.trim() === name ||
      b.getAttribute("aria-label") === name ||
      b.getAttribute("aria-label") === `Open ${name} category`
  );
async function click(name: string) {
  let b = button(name);
  if (b?.matches(".journey-category") && !b.getClientRects().length) {
    const overview = button("All categories");
    if (overview?.getClientRects().length) {
      overview.click();
      await pause();
      b = button(name);
    }
  }
  if (
    b &&
    !b.getClientRects().length &&
    document.querySelector(".studio-journey")
  ) {
    const active = document.querySelector<HTMLButtonElement>(
      '.journey-category[aria-current="true"]'
    );
    if (active?.getClientRects().length && !active.disabled) {
      active.click();
      await pause();
      b = button(name);
    }
  }
  check(b && !b.disabled, name + " is available");
  b!.scrollIntoView({ block: "center", behavior: "instant" });
  await pause();
  const r = b!.getBoundingClientRect();
  check(
    b!.contains(
      document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)
    ),
    name + " is not covered"
  );
  b!.click();
  await pause();
}
function layout() {
  for (const grid of document.querySelectorAll<HTMLElement>(".choice-grid")) {
    const tiles = Array.from(grid.querySelectorAll<HTMLElement>(".choice-tile"))
      .filter(tile => tile.getClientRects().length)
      .map(tile => tile.getBoundingClientRect());
    if (tiles.length < 2) continue;
    check(
      tiles.every(
        tile =>
          Math.abs(tile.width - tiles[0].width) < 1 &&
          Math.abs(tile.height - tiles[0].height) < 1
      ),
      `${grid.getAttribute("aria-label")} choices have uniform tile dimensions`
    );
  }
  check(
    document.documentElement.scrollWidth <= innerWidth + 1,
    "Page has horizontal overflow: " +
      JSON.stringify(
        Array.from(document.querySelectorAll<HTMLElement>("body *"))
          .filter(
            el =>
              el.getBoundingClientRect().right > innerWidth + 1 &&
              el.getBoundingClientRect().width > 0
          )
          .slice(-8)
          .map(el => ({
            tag: el.tagName,
            class: el.className,
            right: el.getBoundingClientRect().right,
            width: el.getBoundingClientRect().width,
          }))
      )
  );
  const d = document.querySelector<HTMLElement>('[role="dialog"]');
  if (d) {
    const r = d.getBoundingClientRect();
    check(
      r.left >= 0 &&
        r.right <= innerWidth + 1 &&
        r.top >= -1 &&
        r.bottom <= innerHeight + 1,
      "Dialog stays inside viewport"
    );
    check(
      d.scrollWidth <= d.clientWidth + 1,
      "Dialog has no horizontal overflow"
    );
    const buttons = Array.from(d.querySelectorAll<HTMLElement>("button"));
    for (const b of buttons) {
      if (b.getAttribute("data-slot") === "dialog-close") continue;
      check(
        getComputedStyle(b).position !== "fixed",
        "Dialog buttons must stay in flow"
      );
    }
  }
}
async function pressStudioControl(
  control: HTMLButtonElement | undefined,
  label: string
) {
  check(control && !control.disabled, label + " is available");
  control!.scrollIntoView({ block: "center", behavior: "instant" });
  await pause();
  const rect = control!.getBoundingClientRect();
  check(
    control!.contains(
      document.elementFromPoint(
        rect.x + rect.width / 2,
        rect.y + rect.height / 2
      )
    ),
    label + " is reachable"
  );
  control!.click();
  await pause();
}
async function acceptDiscovery() {
  const keep =
    button("Keep defaults & continue") ??
    button("Continue with current choices");
  if (keep?.getClientRects().length) {
    keep.click();
    await pause();
  }
}
async function studioSection(title: string, openCategory = true) {
  const overview = button("All categories");
  if (innerWidth <= 700 && overview?.getClientRects().length) {
    overview.click();
    await pause();
  }
  await pressStudioControl(
    Array.from(
      document.querySelectorAll<HTMLButtonElement>(
        '.journey-mobile-steps button, .journey-sections button, [aria-label="Activation sections"] button'
      )
    ).find(
      b =>
        b.getClientRects().length &&
        b.querySelector("strong")?.textContent === title
    ),
    title
  );
  await acceptDiscovery();
  if (innerWidth <= 700 && openCategory) {
    const active = document.querySelector<HTMLButtonElement>(
      '.journey-category[aria-current="true"]'
    );
    if (active?.getClientRects().length && !active.disabled) {
      active.click();
      await pause();
    }
  }
}
async function clickPrefix(title: string) {
  await pressStudioControl(
    Array.from(document.querySelectorAll<HTMLButtonElement>("button")).find(
      b => b.getClientRects().length && b.textContent?.trim().startsWith(title)
    ),
    title
  );
}
async function chooseVisual(select: HTMLSelectElement, value: string) {
  const root = select.closest(".choice-select");
  check(!!root, "Choice is rendered as visual tiles");
  const find = () =>
    Array.from(root!.querySelectorAll<HTMLButtonElement>(".choice-tile")).find(
      b => b.dataset.value === value
    );
  let tile = find();
  while (!tile) {
    const more = Array.from(
      root!.querySelectorAll<HTMLButtonElement>("button")
    ).find(b => b.textContent?.startsWith("Show more"));
    check(more, "Choice is available: " + value);
    more!.click();
    await pause();
    tile = find();
  }
  await pressStudioControl(tile, "Select " + tile.getAttribute("aria-label"));
}
async function fillControl(selector: string, value: string) {
  const el = document.querySelector<
    HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
  >(selector)!;
  check(!!el, selector + " is present");
  if (
    el.closest(".choice-select")?.getAttribute("data-density") !== "select" &&
    el.closest(".choice-select")
  )
    return chooseVisual(
      el.closest(".choice-select")!.querySelector("select")!,
      value
    );
  const proto =
    el instanceof HTMLTextAreaElement
      ? HTMLTextAreaElement.prototype
      : el instanceof HTMLSelectElement
        ? HTMLSelectElement.prototype
        : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto, "value")!.set!.call(el, value);
  el.dispatchEvent(
    new Event(el instanceof HTMLSelectElement ? "change" : "input", {
      bubbles: true,
    })
  );
  await pause();
}
async function chooseVideoModel(mode: "create" | "edit" | "motion") {
  const model =
    mode === "create"
      ? fixtureModels[0]
      : fixtureModels.find(m => modelVideoMode(m) === mode)!;
  const label = Array.from(document.querySelectorAll("span")).find(
    el => el.textContent === "Generation model"
  )!;
  await pressStudioControl(
    label.parentElement!.querySelector<HTMLButtonElement>("button")!,
    "Choose generation model"
  );
  const choice = Array.from(
    document.querySelectorAll<HTMLButtonElement>('[role="dialog"] button')
  ).find(
    el =>
      el.querySelector("strong")?.textContent === model.name &&
      el.textContent?.includes(model.variant)
  );
  await pressStudioControl(choice, model.name + " " + model.variant);
}
(window as any).runChannelRegression = async () => {
  try {
    await pause();
    layout();
    if (which === "google-campaigns" || which === "google-campaign-new") {
      check(
        !!document.querySelector(".studio-journey"),
        "Google uses the shared studio"
      );
      await click("Campaign");
      check(
        document.querySelectorAll(".google-campaign-list button").length === 2,
        "Inactive Google campaigns are off by default"
      );
      const inactive = Array.from(
        document.querySelectorAll<HTMLInputElement>('input[type="checkbox"]')
      ).find(i =>
        i.parentElement?.textContent?.includes("Include inactive campaigns")
      )!;
      check(!inactive.checked, "Campaign status checkbox is off");
      inactive.click();
      await pause();
      check(
        document.querySelectorAll(".google-campaign-list button").length === 3,
        "Inactive campaign opt-in includes paused campaigns"
      );
      if (which === "google-campaigns") {
        await clickPrefix("Active PMax");
        check(
          document.body.textContent?.includes("Core products"),
          "Existing asset groups are available"
        );
        await click("Manage group assets");
        check(
          document.body.textContent?.includes("Shop the collection"),
          "Existing Google assets can be selected for replacement"
        );
      } else {
        await click("New campaign");
        check(
          document.querySelectorAll(".cfg-card-grid .cfg-card").length === 6,
          "Six supported campaign families are offered"
        );
        await click("Select Performance Max");
        await studioSection("Delivery");
        check(
          document.body.textContent?.includes("Daily budget"),
          "Campaign budget and bidding are editable"
        );
      }
      check(
        mutations.length === 0,
        "Browsing campaign controls never launches ads"
      );
      layout();
    }
    if (which.startsWith("activation-")) {
      const state = document.querySelector<HTMLElement>(
        '[aria-label="Delivery status"]'
      );
      check(!!state, "Saved activation has a clear delivery status");
      check(
        !!document.querySelector('[aria-label="Content preview"]'),
        "Saved creative remains expanded"
      );
      check(
        document.querySelectorAll(".publication-timeline li").length === 3,
        "Publication history is a readable timeline"
      );
      check(
        mutations.length === 0,
        "Opening delivery status does not retry or publish anything"
      );
      if (which !== "activation-scheduled")
        check(
          !document.querySelector(".cfg-section-button"),
          "Read-only results do not waste space on inactive editor steps"
        );
      check(
        getComputedStyle(state!).borderRadius === "15px",
        "Saved activation uses the shared rounded Studio cards"
      );
      if (which === "activation-failed") {
        check(
          state!.textContent?.includes("Invalid parameter"),
          "The original provider response remains available"
        );
        check(
          !!button("Retry failed delivery") &&
            !!button("Return failed item to draft"),
          "Safe recovery actions are grouped together"
        );
        check(
          getComputedStyle(button("Retry failed delivery")!).backgroundColor ===
            "rgb(109, 80, 216)",
          "Recovery action uses the Studio violet theme"
        );
        if (innerWidth > 900)
          check(
            button("Retry failed delivery")!.getBoundingClientRect().bottom <
              innerHeight,
            "Recovery controls fit above the desktop fold"
          );
      } else if (which === "activation-unknown") {
        check(
          !!button("Verify existing delivery") &&
            !button("Retry failed delivery"),
          "An uncertain delivery cannot be retried"
        );
      } else if (which === "activation-published") {
        check(
          state!.textContent?.includes("Your ad was created paused"),
          "Ad result explicitly remains paused"
        );
        check(
          !button("Retry failed delivery") && !button("Create paused ad"),
          "Completed delivery has no duplicate send action"
        );
      } else if (which === "activation-processing") {
        check(
          state!.textContent?.includes("Delivery is in progress"),
          "Provider processing is distinguished from a saved draft"
        );
      } else {
        check(
          state!.textContent?.includes("Your publication is queued"),
          "Queued delivery has a clear waiting state"
        );
      }
      layout();
    }
    if (which === "creative-type") {
      await studioSection("Type & Source", false);
      await click("Creative type");
      check(
        document.querySelectorAll(".cfg-bottom .cfg-primary").length === 1,
        "One Generate action"
      );
      check(mutations.length === 0, "Exploration never starts generation");
      layout();
    }
    if (which === "creative-people") {
      await studioSection("Look & Feel", false);
      await click("Scene");
      await click("Select Lifestyle · with people");
      if (innerWidth <= 700) await click("All categories");
      await click("People");
      let filterSize: { width: number; height: number } | undefined;
      for (const name of ["Collection", "Gender", "Age group", "Hair color"]) {
        const tab = Array.from(
          document.querySelectorAll<HTMLButtonElement>(".studio-filter-tab")
        ).find(tab => tab.querySelector("strong")?.textContent === name);
        await pressStudioControl(tab, name + " filter tab");
        check(
          tab?.getAttribute("aria-selected") === "true",
          name + " tab opens its choices"
        );
        const panels = Array.from(
          document.querySelectorAll<HTMLElement>(".studio-filter-panel")
        ).filter(panel => panel.getClientRects().length);
        check(panels.length === 1, "Only the active filter panel is shown");
        const tiles = Array.from(
          panels[0].querySelectorAll<HTMLElement>(".choice-tile")
        ).map(tile => tile.getBoundingClientRect());
        check(tiles.length > 0, name + " choices are visible");
        filterSize ??= { width: tiles[0].width, height: tiles[0].height };
        check(
          tiles.every(
            tile =>
              Math.abs(tile.width - filterSize!.width) < 1 &&
              Math.abs(tile.height - filterSize!.height) < 1
          ),
          "Every People filter uses the same tile size"
        );
        layout();
      }
      await chooseVisual(
        document.querySelector<HTMLSelectElement>(
          '[data-choice-label="Hair color"] select'
        )!,
        "blonde"
      );
      check(
        document
          .querySelector('.studio-filter-tab[data-state="active"]')
          ?.textContent?.includes("Blonde"),
        "Filter tabs retain visible summaries"
      );
      const portraits = Array.from(
        document.querySelectorAll<HTMLElement>(
          '.cfg-people-grid .cfg-card-art [role="img"]'
        )
      );
      check(portraits.length > 0, "The studio model library renders portraits");
      for (const portrait of portraits) {
        const bounds = portrait.getBoundingClientRect();
        check(
          bounds.width > 0 && Math.abs(bounds.width - bounds.height) < 1,
          `Model portraits preserve square proportions: ${bounds.width} × ${bounds.height}`
        );
      }
      await pressStudioControl(
        document.querySelector<HTMLButtonElement>(
          ".cfg-people-grid .cfg-choice"
        )!,
        "Select first model"
      );
      check(
        document
          .querySelector(".cfg-selection-strip")
          ?.textContent?.includes("1 / 4 selected"),
        "Model selection remains available"
      );
      const filters = document.querySelector<HTMLElement>(
        ".studio-filter-tabs"
      )!;
      const stickyBottom = Math.max(
        ...Array.from(
          document.querySelectorAll<HTMLElement>(
            ".cfg-heading, .journey-sections, .journey-focus-heading"
          )
        )
          .filter(element => element.getClientRects().length)
          .map(element => element.getBoundingClientRect().bottom)
      );
      window.scrollBy({
        top: filters.getBoundingClientRect().top - stickyBottom - 14,
        behavior: "instant",
      });
      await pause();
      layout();
    }
    if (
      [
        "creative-overview",
        "creative-editor",
        "creative-scene",
        "creative-checkpoint",
        "creative-video",
      ].includes(which)
    ) {
      await studioSection("Look & Feel", false);
      const cards = Array.from(
        document.querySelectorAll<HTMLElement>(".journey-category")
      );
      check(
        cards.length === (which === "creative-video" ? 6 : 7),
        "Every Look & Feel category is visible"
      );
      check(
        cards.every(c => c.getClientRects().length),
        "Categories are visible without opening a hidden strip"
      );
      if (innerWidth <= 700) {
        check(
          !document
            .querySelector<HTMLElement>(".journey-editor")!
            .getClientRects().length,
          "Mobile starts with the overview"
        );
        const columns = new Set(
          cards.map(c => Math.round(c.getBoundingClientRect().left))
        );
        check(columns.size === 2, "Mobile overview has two columns");
      }
      if (which === "creative-scene") await click("Scene");
      if (which === "creative-editor" || which === "creative-checkpoint") {
        await click("Theme");
        if (innerWidth <= 700) {
          check(
            !document
              .querySelector<HTMLElement>(".journey-overview")!
              .getClientRects().length,
            "Focused editor hides category overview"
          );
          if (which === "creative-checkpoint") await click("All categories");
        }
      }
      if (which === "creative-checkpoint") {
        await click("Continue to next section");
        check(
          !document.querySelector('[role="dialog"]'),
          "Section changes never open discovery dialogs"
        );
        await studioSection("Look & Feel", false);
        await click("Review");
        check(
          !!document.querySelector('[aria-label="Review unviewed choices"]'),
          "Review opens only on request"
        );
        check(
          !document.querySelector('[role="dialog"]'),
          "Optional review stays inline"
        );
      }
      check(
        document.querySelectorAll(".cfg-bottom .cfg-primary").length === 1,
        "One Generate action"
      );
      check(mutations.length === 0, "Exploration never starts generation");
      layout();
    }
    if (which === "insights-studio" || which === "optimization-studio") {
      check(
        !!document.querySelector(".studio-journey"),
        "Studio uses the shared journey"
      );
      const cards = Array.from(
        document.querySelectorAll<HTMLElement>(".journey-category")
      );
      check(
        cards.length === 2 && cards.every(c => c.getClientRects().length),
        "All starting categories are visible"
      );
      await click(
        which === "insights-studio" ? "Report purpose" : "What to improve"
      );
      check(
        !!document
          .querySelector<HTMLElement>(".journey-editor")
          ?.getClientRects().length,
        "Category opens the editor"
      );
      check(
        mutations.length === 0,
        "Navigation never runs a report or analysis"
      );
      if (which === "insights-studio") {
        await click("Accounts & dates");
        await click("Google Ads");
        check(
          !!button("Google Ads account Demo Google Ads"),
          "Google Ads accounts are available in Insights"
        );
        check(
          !button("Meta advertising account Demo ad account"),
          "Channel filter separates Google and Meta accounts"
        );
        await click("Google Ads account Demo Google Ads");
        check(
          button("Google Ads account Demo Google Ads")?.getAttribute(
            "aria-pressed"
          ) === "true",
          "Google source is selected explicitly"
        );
        layout();
        Array.from(
          document.querySelectorAll<HTMLButtonElement>(
            ".journey-sections button"
          )
        )
          .find(b => b.textContent?.startsWith("Report setup"))!
          .click();
        await pause();
        await click("Key metrics");
        await click("Google Ads");
        check(
          document.body.textContent?.includes("Click CTR"),
          "Google click metrics are offered"
        );
        check(
          !document
            .querySelector(".insight-metric-choices")
            ?.textContent?.includes("Link clicks"),
          "Google metrics preserve Meta link-click meaning"
        );
        check(
          mutations.length === 0,
          "Browsing Google metrics does not run reports"
        );
      }
      layout();
    }
    if (which === "model-picker") {
      await click("Browse 500 models");
      layout();
      for (const label of [
        "Woman · Black 1",
        "Woman · Black 2",
        "Woman · Black 3",
        "Woman · Black 4",
      ])
        await click(label);
      check(button("Woman · Black 5")?.disabled, "A fifth model is disabled");
      await click("Use 4 models");
      await click("Browse 500 models");
      check(
        document.body.textContent?.includes("4 / 4 selected"),
        "Selected models survive reopening"
      );
      if (innerWidth < 640) await click("Model filters");
      const age = Array.from(document.querySelectorAll("label, .choice-field"))
        .find(l => l.textContent?.startsWith("Age group"))!
        .querySelector("select")!;
      await chooseVisual(age, "child");
      check(
        document.body.textContent?.includes("100 matching models"),
        "Kids filter works"
      );
      if (innerWidth < 640) await click("Model filters");
      layout();
    }
    if (which.startsWith("publishing")) {
      check(
        button("Week")?.getAttribute("aria-pressed") === "true",
        "Weekly view is default"
      );
      await click("New content");
      check(
        !!document.querySelector('[aria-label="Activation sections"]'),
        "New content opens Activation Studio"
      );
      layout();
      fixtureRouter.navigate("/app/publishing");
      await pause();
      await click("List");
      const post = Array.from(
        document.querySelectorAll<HTMLButtonElement>("button")
      ).find(b => b.textContent?.includes("Weekly product story"));
      check(post, "Saved publication is visible");
      post!.click();
      await pause();
      layout();
      const reviewSurface =
        document.querySelector<HTMLElement>('[role="dialog"]')!;
      check(
        getComputedStyle(reviewSurface).getPropertyValue("--primary").trim() ===
          "#6d50d8",
        "Calendar review dialog retains the workspace theme"
      );
      check(
        !!reviewSurface.querySelector(".publication-state-card"),
        "Calendar and Studio share the delivery review layout"
      );
      if (role === "creator") {
        check(
          !button("Approve & schedule") &&
            !button("Approve & save test schedule"),
          "Creators cannot approve"
        );
        await click("Submit for publishing approval");
        check(posts[0].state === "needs_review", "Creator submits for review");
      } else {
        const wasApproved = posts[0].state === "approved";
        const action = wasApproved
          ? "Schedule post"
          : connections.liveSocial
            ? "Approve & schedule"
            : "Approve & save test schedule";
        await click(action);
        check(
          posts[0].state === (wasApproved ? "approved" : "draft"),
          "Opening confirmation cannot approve or queue delivery"
        );
        const confirmation = Array.from(
          document.querySelectorAll('[role="dialog"]')
        ).at(-1)!;
        const confirmButton = Array.from(
          confirmation.querySelectorAll<HTMLButtonElement>("button")
        ).find(b => b.textContent === action);
        check(
          !!confirmButton &&
            confirmation.textContent?.includes("Demo Facebook Page") &&
            confirmation.textContent?.includes("UTC"),
          "Confirmation clearly identifies the Page and time"
        );
        layout();
        confirmButton!.click();
        await pause();
        check(
          posts[0].state === "scheduled" &&
            posts[0].result.deliveryMode ===
              (connections.liveSocial ? "live" : "test"),
          "Confirmation schedules the post in the selected mode"
        );
        check(
          !button("Schedule post") &&
            !button("Approve & schedule") &&
            !button("Approve & save test schedule"),
          "Scheduled posts have no duplicate scheduling action"
        );
        if (connections.liveSocial)
          check(
            document.body.textContent?.includes("No further action is needed"),
            "Automatic publishing is clearly explained"
          );
      }
      layout();
    } else if (which === "social")
      check(
        Array.from(document.querySelectorAll("h2")).some(
          h => h.textContent === "Facebook posts"
        ),
        "Facebook posts render"
      );
    else if (which === "advertising")
      check(
        document.body.textContent?.includes("Demo campaign"),
        "Campaign hierarchy renders"
      );
    else if (which === "analytics")
      check(
        !!button("Customize") &&
          !!document.querySelector('a[href="/app/analytics/studio"]'),
        "Customizable Measure dashboard and report creation render"
      );
    else if (which === "enhance-image") {
      await click("Enhance image");
      await pause();
      await pause();
      await pause();
      check(
        document
          .querySelector<HTMLTextAreaElement>(
            '[aria-label="Enhancement direction"]'
          )
          ?.value.includes("dramatically improved visual quality"),
        "Enhance carries the requested editable direction"
      );
      check(
        !!document.querySelector(
          '[role="radio"][aria-checked="true"][data-value="keep"]'
        ),
        "Original product overlay is preserved by default"
      );
      const dialog = document.querySelector<HTMLElement>('[role="dialog"]')!;
      const action = [
        ...dialog.querySelectorAll<HTMLButtonElement>("button"),
      ].find(b => b.textContent?.trim() === "Enhance image")!;
      check(
        !!action && !action.disabled,
        "A quoted enhancement can be started explicitly"
      );
      check(
        document.body.textContent?.includes("24 credits"),
        "Enhance shows the current credit quote"
      );
      check(
        mutations.length === 0,
        "Opening Enhance does not generate, approve, or publish"
      );
      action.scrollIntoView({ block: "center" });
      layout();
    } else if (which === "report-layout") {
      check(
        document.querySelectorAll('.date-range-choices [role="radio"]')
          .length === 12,
        "All date presets appear together"
      );
      const widget = document.querySelector<HTMLElement>(".insight-widget")!;
      const content = widget.querySelector<HTMLElement>(
        ".insight-widget-content"
      )!;
      const body = widget.querySelector<HTMLElement>(".insight-widget-body")!;
      check(
        widget.dataset.autoSize === "true",
        "New reports fit content automatically"
      );
      check(
        body.getBoundingClientRect().bottom <=
          widget.getBoundingClientRect().bottom,
        "Metric report fits its dashboard widget without clipping"
      );
      check(
        content.scrollHeight <= content.clientHeight + 1,
        "Auto-sized report needs no inner vertical scrolling"
      );
      for (const number of widget.querySelectorAll<HTMLElement>(
        ".insight-metric > strong"
      ))
        check(
          number.scrollWidth <= number.clientWidth + 1,
          "Currency values fit their metric tiles"
        );
      check(
        document.body.textContent?.includes("USD 95,458.20"),
        "Currency preserves two decimal places"
      );
      layout();
    } else if (which === "product-facts") {
      check(
        document.querySelectorAll(".cfg-specification-list li").length === 5,
        "Specifications and features render as separate bullets"
      );
      check(
        !!button("Include availability"),
        "Availability is its own selected fact"
      );
      check(
        !!document.querySelector('[aria-label="Specification 1 name"]'),
        "Catalog specifications have structured name and value fields"
      );
      layout();
    } else if (which === "google-connect") {
      check(
        button("Connect with Google") &&
          !button("Connect with Google")?.disabled,
        "Google login is available when configured"
      );
      check(
        mutations.length === 0,
        "Browsing connections does not authorize any account"
      );
      layout();
    } else if (which === "google-selection" || which === "google-empty") {
      check(
        document
          .querySelector('[role="dialog"]')
          ?.textContent?.includes("Choose your Google Ads accounts"),
        "Google account picker is open"
      );
      check(
        button("Connect selected")?.disabled,
        "Connecting requires an explicit account choice"
      );
      if (which === "google-selection") {
        const choice = document.querySelector<HTMLInputElement>(
          '[role="dialog"] input[type="checkbox"]'
        );
        check(choice && !choice.checked, "No Google account is preselected");
        choice!.click();
        await pause();
        const action = button("Connect selected (1)")!;
        check(action && !action.disabled, "Selected accounts can be connected");
        const r = action.getBoundingClientRect();
        check(
          r.top >= 0 && r.bottom <= innerHeight,
          "Google selection action remains visible with a long account list"
        );
        const warning = document.querySelector(
          '[role="dialog"] [role="status"]'
        )!;
        check(
          warning.getBoundingClientRect().bottom <= innerHeight,
          "Google discovery warning stays visible"
        );
      } else
        check(
          document.body.textContent?.includes("No active advertising accounts"),
          "Empty Google access is explained"
        );
      check(
        mutations.length === 0,
        "Choosing accounts does not connect until confirmed"
      );
      layout();
    } else if (which === "google-manage") {
      const card = Array.from(document.querySelectorAll("article")).find(
        el => el.querySelector("h3")?.textContent === "Google Ads"
      )!;
      card.querySelector<HTMLButtonElement>("button")!.click();
      await pause();
      await click("Disconnect");
      const action = button("Confirm disconnect")!;
      check(
        action && action.getBoundingClientRect().bottom <= innerHeight,
        "Disconnect confirmation stays visible beneath long account lists"
      );
      check(
        mutations.length === 0,
        "Disconnect requires explicit confirmation"
      );
      layout();
    } else if (which === "integrations") {
      check(
        document.body.textContent?.includes("Social Media"),
        "Social integration category renders"
      );
      await click("Manage connections");
      layout();
      check(
        button("Connect with Meta")?.disabled,
        "Unconfigured OAuth is explained, not faked"
      );
    }
    if (
      ["social", "advertising", "social-empty", "advertising-empty"].includes(
        which
      )
    ) {
      check(
        !document.querySelector(
          'nav[aria-label="Advertising channels"],nav[aria-label="Social channels"]'
        ),
        "No horizontal channel selector remains"
      );
      check(
        !button("Connect account") && !button("Manage connections"),
        "Connection management is only in Integrations"
      );
    }
    if (which === "analytics-ads" || which === "analytics-social") {
      const account = document.querySelector<HTMLSelectElement>(
        '[data-choice-label="Analytics account"] select'
      )!;
      check(
        account.options.length === 2,
        "Scoped analytics has only its account type"
      );
      check(
        document.querySelector("h1")?.textContent ===
          (which === "analytics-ads"
            ? "Advertising analytics"
            : "Social media analytics"),
        "Analytics deep link chooses the correct view"
      );
    }
    if (["login", "signup", "reset-password"].includes(which)) {
      check(
        document
          .querySelector("h1")
          ?.textContent?.includes(
            which === "signup"
              ? "Create your EvokeLoop account"
              : which === "reset-password"
                ? "Set your password"
                : "Log in to EvokeLoop"
          ),
        "Correct auth screen and brand"
      );
      check(
        !!document.querySelector("form"),
        "Authentication form is preserved"
      );
      check(
        document.querySelector<HTMLFormElement>("form")?.checkValidity() ===
          false,
        "Empty auth form does not submit"
      );
      check(
        mutations.length === 0,
        "Visual test does not change real accounts"
      );
    }
    if (which === "product-home") {
      check(
        document
          .querySelector("h1")
          ?.textContent?.includes("Your marketing studios") &&
          document.querySelectorAll(".workspace-studio-card").length === 4,
        "Studios are the main entry points on Home"
      );
      check(
        document
          .querySelector('.workspace-studio-card[data-workflow="Optimize"]')
          ?.textContent?.includes("Optimization Studio"),
        "Home includes Optimization Studio"
      );
      const studios = document.querySelectorAll<HTMLAnchorElement>(
        ".workspace-studio-card"
      );
      check(
        [
          "/app/creatives/studio",
          "/app/activate/studio",
          "/app/analytics/studio",
          "/app/optimize/studio",
        ].every((href, i) => studios[i].getAttribute("href") === href),
        "Home links directly to the four studios"
      );
      check(
        !!(
          studios[3].compareDocumentPosition(
            document.querySelector(".insights-dashboard")!
          ) & Node.DOCUMENT_POSITION_FOLLOWING
        ),
        "Personal dashboard widgets follow the studios"
      );
    }
    if (which === "video-studio") {
      check(
        !!document.querySelector('[aria-label="Video type"]'),
        "Video creation has Product and Creator routes"
      );
      check(
        !!document.querySelector("#video-prompt"),
        "Video prompt is visible"
      );
      await chooseVideoModel("edit");
      check(
        document.body.textContent?.includes("Source video"),
        "An edit model requires source video"
      );
      check(
        button("Generate video")?.disabled,
        "Generation stays disabled without required source media"
      );
      await chooseVideoModel("motion");
      check(
        document.body.textContent?.includes("Motion reference video"),
        "A motion model exposes its video input"
      );
      await chooseVideoModel("create");
      await click("Add images");
      layout();
      check(
        !!button("Product images") && !!button("Upload"),
        "Reference picker includes product images and upload"
      );
      await click("Image assets");
      await click("Emerald collection hero");
      await click("Use selected images");
      check(
        !!document.querySelector('img[alt^="Reference 1"]'),
        "Selected reference appears in the video editor"
      );
      check(
        !mutations.includes("video.generate"),
        "Changing models and references never starts paid generation"
      );
    }
    if (which === "video-ugc") {
      check(
        !!document.querySelector("#video-prompt") && !!button("Creator videos"),
        "Creator video uses the shared editor"
      );
      await fillControl(
        "#video-prompt",
        "Four people introduce the collection in a bright studio."
      );
      await click("Add images");
      await click("Image assets");
      await click("Emerald collection hero");
      await click("Use selected images");
      await click("Browse 500 models");
      layout();
      for (let i = 1; i <= 4; i++) await click(`Woman · Black ${i}`);
      check(
        button("Woman · Black 5")?.disabled,
        "Creator video supports at most four people"
      );
      await click("Use 4 models");
      await click("Save draft");
      check(
        videoDrafts[0]?.setup.category === "ugc" &&
          videoDrafts[0]?.setup.people.length === 4 &&
          videoDrafts[0]?.setup.imageKeys[0] === "asset:1",
        "Creator draft saves category, people and references"
      );
      await click("Product videos");
      check(
        !button("Browse 500 models"),
        "Product editor hides the people picker"
      );
      await click("Creator videos");
      await new Promise(resolve => setTimeout(resolve, 4500));
      await click("Open Untitled creator video");
      await click("Browse 500 models");
      check(
        document.body.textContent?.includes("4 / 4 selected"),
        "Saved creator video restores people"
      );
      await click("Cancel");
      check(
        !!document.querySelector('img[alt^="Reference 1"]'),
        "Saved creator video restores references"
      );
      check(
        videoQuotes.some(
          setup =>
            setup.category === "ugc" &&
            setup.people.length === 4 &&
            setup.modelId === DEFAULT_VIDEO_MODEL
        ),
        "Creator quote includes the selected model and people"
      );
      check(
        !mutations.includes("video.generate"),
        "Saving creator video never starts generation"
      );
      layout();
    }
    if (which === "studio-channels") {
      await studioSection("Destination");
      const cards = Array.from(
        document.querySelectorAll<HTMLElement>(
          ".activation-channel-grid .cfg-card"
        )
      );
      check(
        cards.length === 3,
        "Google, Meta and Facebook are available together"
      );
      const bounds = cards.map(c => c.getBoundingClientRect());
      if (innerWidth >= 1366) {
        check(
          bounds.every(b => Math.abs(b.top - bounds[0].top) < 1),
          "All three channels share one desktop row"
        );
        check(
          bounds.every(b => b.width <= 340 && b.height <= 270),
          "Channel cards use a compact comparable size"
        );
      }
      check(
        cards.every(
          c =>
            c.querySelector(".cfg-card-art")!.getBoundingClientRect().height <=
            140
        ),
        "Channel artwork does not grow with the viewport"
      );
      check(!mutations.length, "Choosing a channel does not publish");
      layout();
    }
    if (which === "workflow-density") {
      await click("Add step");
      const filters = document
        .querySelector(".wf-palette-filter")!
        .getBoundingClientRect();
      const step = document
        .querySelector(".wf-node-group button")!
        .getBoundingClientRect();
      const palette = document
        .querySelector(".wf-node-library")!
        .getBoundingClientRect();
      check(
        filters.height <= 160,
        "Capabilities fit in a compact control group"
      );
      check(
        step.bottom < Math.min(innerHeight, palette.bottom),
        "The first actual step is visible below the filters"
      );
      await click("Close step library");
      await click("Settings for Start trigger");
      await chooseVisual(
        document.querySelector(
          '.choice-select[data-density="segmented"] select'
        )!,
        "scheduled"
      );
      const weekday = document.querySelector<HTMLSelectElement>(
        'select[aria-label="Weekday"]'
      )!;
      check(
        !!weekday && !weekday.hidden,
        "Weekday is a compact native control"
      );
      await fillControl('select[aria-label="Weekday"]', "5");
      check(weekday.value === "5", "The schedule remains editable");
      const inspector = document.querySelector<HTMLElement>(".wf-inspector")!;
      inspector.scrollTop = 0;
      const hour = inspector
        .querySelector<HTMLInputElement>('input[type="number"]')!
        .getBoundingClientRect();
      check(
        hour.bottom <
          Math.min(innerHeight, inspector.getBoundingClientRect().bottom),
        "Scheduling controls fit above the inspector fold"
      );
      check(!mutations.length, "Layout interactions do not run the workflow");
      layout();
    }
    if (which === "workflow-library") {
      check(
        document.querySelectorAll(".wf-template").length > 0,
        "Workflow templates render"
      );
      check(!mutations.length, "Browsing workflows performs no writes");
      layout();
    }
    if (which === "studio-overview") {
      check(
        !!document.querySelector('a[aria-label="Social composer"]') &&
          !!document.querySelector('a[aria-label="Ad builder"]'),
        "Real creation modes render"
      );
      const tabs = Array.from(
        document.querySelectorAll('nav[aria-label="Create navigation"] a')
      );
      check(
        tabs.length === 4 &&
          tabs[0].textContent === "Apps" &&
          tabs[1].textContent === "Drafts",
        "Create has apps, drafts, plans, and planned workflows"
      );
      check(
        !document.querySelector(
          'input[placeholder="Search names, captions, and ad copy…"]'
        ) && !document.body.textContent?.includes("No drafts yet"),
        "Creation screen does not duplicate the drafts view"
      );
      check(
        !document.body.textContent?.includes("Saved work") &&
          !document.body.textContent?.includes("Video creation"),
        "Studio removes redundant and unavailable modes"
      );
    }
    if (which === "studio-drafts") {
      const results = () =>
        document.querySelectorAll('[aria-label="Draft results"] article');
      const filter = async (label: string) => {
        const control = Array.from(
          document.querySelectorAll<HTMLButtonElement>(
            '[aria-label="Draft types"] button'
          )
        ).find(b => b.textContent?.startsWith(label));
        check(!!control, "Draft type exists: " + label);
        control!.click();
        await pause();
        layout();
      };
      check(
        results().length === 4,
        "Image, post, and ad drafts share one list; approved and scheduled work is excluded"
      );
      await filter("Images");
      check(results().length === 2, "Image filter includes returned drafts");
      await filter("Social posts");
      check(results().length === 1, "Social filter shows posts only");
      await filter("Ads");
      check(results().length === 1, "Ad filter shows ads only");
      await filter("All");
      const search = document.querySelector<HTMLInputElement>(
        'input[placeholder="Search names, captions, and ad copy…"]'
      )!;
      Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        "value"
      )!.set!.call(search, "Emerald");
      search.dispatchEvent(new Event("input", { bubbles: true }));
      await pause();
      check(
        results().length === 1,
        "Search finds image drafts in the unified list"
      );
      Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        "value"
      )!.set!.call(search, "");
      search.dispatchEvent(new Event("input", { bubbles: true }));
      await pause();
      check(
        results().length === 4 && mutations.length === 0,
        "Browsing draft types does not alter or copy records"
      );
      layout();
    }
    if (which === "studio-media") {
      await studioSection("Copy");
      await click("Compose");
      await fillControl(
        "#pub-message",
        "This caption survives media selection."
      );
      await studioSection("Creative");
      check(
        !!document.querySelector('[aria-label="Approved asset library"] img'),
        "Approved assets render as image tiles"
      );
      check(
        !document.querySelector('[role="dialog"]'),
        "Approved assets are inline"
      );
      const sizes = document.querySelector<HTMLSelectElement>(
        '[data-choice-label="Asset dimensions"] select'
      )!;
      check(
        sizes.textContent?.includes("9:16 · e.g. 1080 × 1920 px"),
        "Asset size filter explains ratio and dimensions"
      );
      await fillControl('[aria-label="Asset dimensions"]', "story");
      check(
        !button("Select Approved learning directory image"),
        "Size filter excludes incompatible assets"
      );
      await fillControl('[aria-label="Asset dimensions"]', "all");
      await click("Select Approved learning directory image");
      await studioSection("Copy");
      await click("Compose");
      check(
        document.querySelector<HTMLTextAreaElement>("#pub-message")?.value ===
          "This caption survives media selection.",
        "Copy survives category navigation and asset selection"
      );
      check(
        mutations.length === 0,
        "Selecting media never starts generation or publishing"
      );
      layout();
    }
    if (which === "studio-legacy") {
      check(
        document.body.textContent?.includes("Your drafts"),
        "Old saved-work link redirects to image drafts"
      );
      check(
        document.body.textContent?.includes(
          "This version is not in this collection"
        ),
        "The legacy asset selection is retained, not silently discarded"
      );
    }
    if (which === "catalog-api-import") {
      await click("Connect API endpoint");
      await fillControl(
        "#catalog-api-endpoint",
        "https://api.example/products"
      );
      await click("Preview products");
      const dialog = document.querySelector<HTMLElement>('[role="dialog"]')!;
      const footer = dialog.querySelector<HTMLElement>(
        "[data-dialog-actions]"
      )!;
      const scroller = dialog.querySelector<HTMLElement>(
        "[data-dialog-scroll]"
      )!;
      check(
        !button("Connect and import catalog")!.disabled,
        "Incomplete product details do not block import"
      );
      check(
        footer.textContent?.includes("3 products can be imported for review"),
        "Import status stays beside Connect"
      );
      check(
        !scroller.contains(footer),
        "API actions are outside the scrolling body"
      );
      for (const fraction of [0, 0.5, 1]) {
        scroller.scrollTop =
          (scroller.scrollHeight - scroller.clientHeight) * fraction;
        await pause();
        const r = footer.getBoundingClientRect();
        check(
          r.top >= 0 && r.bottom <= innerHeight,
          "API status/actions visible at every scroll position"
        );
      }
      const imageInput = Array.from(
        dialog.querySelectorAll<HTMLLabelElement>("label")
      )
        .find(label =>
          label.textContent?.includes("Website address where product images")
        )!
        .querySelector<HTMLInputElement>("input")!;
      Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        "value"
      )!.set!.call(imageInput, "https://cdn.example/clx");
      imageInput.dispatchEvent(new Event("input", { bubbles: true }));
      await pause();
      check(
        button("Connect and import catalog")!.disabled,
        "Changing image settings invalidates the old preview"
      );
      check(
        footer.textContent?.includes("Settings changed"),
        "Stale-preview reason is visible"
      );
      await click("Update preview");
      check(
        !button("Connect and import catalog")!.disabled,
        "Rechecking enables import with warnings"
      );
      check(
        // Re-preview replaces the optional-details panel; inspect the new input.
        Array.from(dialog.querySelectorAll<HTMLLabelElement>("label"))
          .find(label =>
            label.textContent?.includes("Website address where product images")
          )
          ?.querySelector<HTMLInputElement>("input")?.value ===
          "https://cdn.example/clx/",
        "The image directory is normalized without losing its folder"
      );
      check(
        mutations.every(m => m === "catalogSources.previewApi"),
        "Browser validation does not import or publish real data"
      );
      layout();
    }
    if (
      which === "studio-ad-setup" ||
      which === "studio-ad-create" ||
      which === "studio-ad-warning"
    ) {
      const select = async (selector: string, value: string) => {
        const el = document.querySelector<HTMLSelectElement>(selector)!;
        check(!!el, "Selector available: " + selector);
        await chooseVisual(el, value);
      };
      check(
        !!document.querySelector('[aria-label="Activation sections"]'),
        "Legacy ad link opens Activation Studio"
      );
      await click("Select Demo ad account");
      await click("Campaign & ad set");
      check(
        document.querySelector<HTMLSelectElement>(
          '[data-choice-label=\"Campaign and ad set status\"] select'
        )?.value === "active",
        "Campaigns default to Active"
      );
      check(
        !document
          .getElementById("pub-meta-campaign")
          ?.textContent?.includes("Paused campaign"),
        "Paused campaigns excluded by default"
      );
      await select("#pub-meta-campaign", "10");
      check(
        document
          .getElementById("pub-adset")
          ?.textContent?.includes("Gaming enthusiasts") &&
          !document
            .getElementById("pub-adset")
            ?.textContent?.includes("Previous visitors"),
        "Ad sets are scoped to selected campaign"
      );
      await select("#pub-adset", "11");
      await select(
        '[data-choice-label=\"Campaign and ad set status\"] select',
        "all"
      );
      await select("#pub-meta-campaign", "8");
      check(
        document.querySelector<HTMLSelectElement>("#pub-adset")?.value === "",
        "Changing campaign clears its ad set"
      );
      await select("#pub-adset", "9");
      await select(
        '[data-choice-label=\"Campaign and ad set status\"] select',
        "active"
      );
      check(
        document.querySelector<HTMLSelectElement>("#pub-adset")?.value === "9",
        "Explicit paused selection survives status filtering"
      );
      layout();
      await click("New campaign");
      const dialog = () =>
        Array.from(
          document.querySelectorAll<HTMLElement>('[role="dialog"]')
        ).at(-1)!;
      check(
        dialog().querySelectorAll('[name="meta-objective"]').length === 6,
        "All six campaign objectives are available"
      );
      await click("Review settings");
      check(
        mutations.length === 1 && mutations[0] === "channels.reviewMetaChange",
        "Review does not create anything"
      );
      const approve = dialog().querySelector<HTMLInputElement>(
        'input[type="checkbox"]'
      )!;
      approve.click();
      await pause();
      await click("Create paused campaign");
      check(
        document.querySelector<HTMLSelectElement>("#pub-meta-campaign")
          ?.value === "20",
        "New paused campaign is automatically selected"
      );
      await click("New ad set");
      check(
        dialog().textContent?.includes("Dataset / Meta Pixel") &&
          dialog().textContent?.includes("Audience"),
        "Ad set form follows the new Sales campaign objective"
      );
      if (which === "studio-ad-warning") {
        const changesBeforeValidation = mutations.length;
        await fillControl('[data-meta-field="startTime"]', "2000-01-01T00:00");
        await click("Review settings");
        const footer = dialog().querySelector<HTMLElement>(
          "[data-dialog-actions]"
        )!;
        const scroller = dialog().querySelector<HTMLElement>(
          "[data-dialog-scroll]"
        )!;
        check(
          footer.textContent?.includes("Choose a future start date"),
          "Date error is adjacent to the action buttons"
        );
        for (const fraction of [0, 0.5, 1]) {
          scroller.scrollTop =
            (scroller.scrollHeight - scroller.clientHeight) * fraction;
          await pause();
          const r = footer.getBoundingClientRect();
          check(
            r.top >= 0 && r.bottom <= innerHeight,
            "Validation remains visible at top, middle and bottom"
          );
        }
        await click("Go to the field");
        check(
          (document.activeElement as HTMLElement)?.dataset.metaField ===
            "startTime",
          "Error action focuses the date input"
        );
        await fillControl('[data-meta-field="startTime"]', "2001-01-01T00:00");
        check(
          footer.textContent?.includes("Choose a future start date"),
          "Warning remains while the date is still invalid"
        );
        await fillControl('[data-meta-field="startTime"]', "");
        check(
          !footer.querySelector('[role="alert"]'),
          "Clearing the optional start date clears its warning immediately"
        );
        check(
          mutations.length === changesBeforeValidation,
          "Invalid dates cause no Meta request or ad creation"
        );
        await fillControl('[data-meta-field="startTime"]', "2000-01-01T00:00");
        scroller.scrollTop = scroller.scrollHeight;
        await pause();
        layout();
      } else if (which === "studio-ad-create") {
        layout();
      } else {
        const budgetLabel = Array.from(
          dialog().querySelectorAll("label, .choice-field")
        ).find(l => l.textContent?.trim() === "Budget (USD)")!;
        const amount = budgetLabel.querySelector("input")!;
        Object.getOwnPropertyDescriptor(
          HTMLInputElement.prototype,
          "value"
        )!.set!.call(amount, "20");
        amount.dispatchEvent(new Event("input", { bubbles: true }));
        const pixelLabel = Array.from(
          dialog().querySelectorAll("label, .choice-field")
        ).find(l => l.textContent?.includes("Dataset / Meta Pixel"))!;
        const pixel = pixelLabel.querySelector("select")!;
        await chooseVisual(pixel, "88");
        await click("Review settings");
        check(
          dialog().textContent?.includes("USD 20 / day"),
          "New ad set review shows the exact budget"
        );
        dialog()
          .querySelector<HTMLInputElement>('input[type="checkbox"]')!
          .click();
        await pause();
        await click("Create paused ad set");
        check(
          document.querySelector<HTMLSelectElement>("#pub-adset")?.value ===
            "21" &&
            document.querySelector<HTMLSelectElement>("#pub-meta-campaign")
              ?.value === "20",
          "New paused ad set remains selected under its new campaign"
        );
        await select("#pub-meta-campaign", "10");
        check(
          document.querySelector<HTMLSelectElement>("#pub-adset")?.value === "",
          "Switching campaigns clears the previous ad set"
        );
        await select("#pub-adset", "11");
        await click("Ad account");
        check(
          button("Select Demo ad account")?.getAttribute("aria-pressed") ===
            "true",
          "Campaign setup preserves the selected ad account"
        );
        await click("Campaign & ad set");
        check(
          document.querySelector<HTMLSelectElement>("#pub-adset")?.value ===
            "11",
          "Category navigation retains campaign and ad set"
        );
        layout();
      }
    }
    if (which === "studio-ad-copy") {
      await click("Select Demo ad account");
      await studioSection("Copy");
      await click("Brief");
      await fillControl(
        '[aria-label="What are you promoting?"]',
        "A collection of independent learning opportunities"
      );
      await click("Compose");
      await clickPrefix("Create copy with AI");
      const fields = () =>
        ["Primary text", "Headline", "Description"].map(
          label =>
            document.querySelector<HTMLTextAreaElement>(
              `textarea[aria-label="${label}"]`
            )!.value
        );
      check(
        fields().every(Boolean),
        "Generated copy populates the three editable ad fields"
      );
      const original = fields();
      await clickPrefix("Regenerate headline");
      check(
        copyRequests.at(-1).regeneration.field === "headline" &&
          copyRequests.at(-1).regeneration.index === 0,
        "Regenerate targets the current headline"
      );
      check(
        fields()[1] !== original[1] &&
          fields()[0] === original[0] &&
          fields()[2] === original[2],
        "Regenerating a headline preserves primary text and description"
      );
      await clickPrefix("Regenerate copy");
      check(
        fields().every((value, i) => value !== original[i]),
        "Full generation replaces all three current fields"
      );
      const alternatives = Array.from(
        document.querySelectorAll<HTMLDetailsElement>("details")
      ).find(el =>
        el
          .querySelector("summary")
          ?.textContent?.startsWith("Other AI versions")
      )!;
      alternatives.open = true;
      await click("Apply this version");
      const savedFields = fields();
      await click("Save draft");
      const saved = posts.find(
        p => p.id === "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
      )!;
      check(
        saved?.content.copyAlternatives.length === 4,
        "Draft preserves the other AI versions"
      );
      check(
        !!document.querySelector('[aria-label="Activation sections"]') &&
          !document.querySelector('[role="dialog"]'),
        "Saving stays in Activation Studio"
      );
      fixtureRouter.navigate(`/app/activate/studio?publication=${saved.id}`);
      await pause();
      check(
        JSON.stringify(fields()) === JSON.stringify(savedFields),
        "Saved primary text, headline and description reopen in Compose"
      );
      check(
        mutations.every(m =>
          ["channels.draftAssetCopy", "publishing.save"].includes(m)
        ),
        "Copy generation and saving never approve or publish"
      );
      layout();
    }
    if (which === "studio-post-media") {
      const caption =
        document.querySelector<HTMLTextAreaElement>("#pub-message")!;
      check(
        caption.value.includes("https://example.com/classes"),
        "Legacy photo link is visible in caption"
      );
      check(
        !document.getElementById("pub-link"),
        "Media posts hide website preview field"
      );
      check(
        caption.rows >= 5 && caption.getBoundingClientRect().height >= 100,
        "Caption provides at least five visible writing lines"
      );
      await click("Add website link");
      layout();
      const link =
        document.querySelector<HTMLInputElement>("#pub-caption-link")!;
      Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        "value"
      )!.set!.call(link, "example.com/more");
      link.dispatchEvent(new Event("input", { bubbles: true }));
      await pause();
      await click("Add to caption");
      check(
        caption.value.includes("https://example.com/more"),
        "Website action adds URL to caption"
      );
      check(mutations.length === 0, "Editing content never publishes");
      document
        .querySelector(".activation-fields")!
        .scrollIntoView({ block: "start", behavior: "instant" });
      await pause();
      layout();
    }
    if (which === "studio-post" || which === "studio-ad") {
      const social = which === "studio-post";
      const accountName = social ? "Second Facebook Page" : "Demo ad account";
      check(
        !!document.querySelector('[aria-label="Activation sections"]'),
        "Legacy creation link opens Activation Studio"
      );
      check(
        !button("Select Disconnected Page") && !button("Select Expired Page"),
        "Disconnected and expired accounts are excluded"
      );
      check(
        social
          ? !button("Select Demo ad account")
          : !button("Select Demo Facebook Page"),
        "Account tiles match the channel"
      );
      await click(`Select ${accountName}`);
      await studioSection("Copy");
      await click("Compose");
      await fillControl(
        social ? "#pub-message" : 'textarea[aria-label="Primary text"]',
        "Explore our latest collection."
      );
      check(
        !!document.querySelector('[aria-label="Content preview"]'),
        "Compose includes a live content preview"
      );
      await click("Save draft");
      const saved = posts.find(
        p => p.id === "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
      )!;
      check(
        saved?.state === "draft" &&
          saved.connectionId === (social ? secondPageId : adsId),
        "Draft saves the selected account"
      );
      check(
        !!document.querySelector('[aria-label="Activation sections"]') &&
          !document.querySelector('[role="dialog"]'),
        "Saving keeps the cohesive studio experience"
      );
      await studioSection("Timing");
      await fillControl(
        'label:has(input[type="datetime-local"]) + label input',
        "UTC"
      );
      await fillControl(
        'input[type="datetime-local"]',
        new Date(now + 7200000).toISOString().slice(0, 16)
      );
      await click("Save draft");
      const updated = posts.find(p => p.id === saved.id)!;
      check(
        posts.filter(p => p.id === saved.id).length === 1 &&
          updated.revision === 2 &&
          updated.scheduledAtMs > now,
        "Timing updates the same saved draft without duplicating it"
      );
      check(
        mutations.every(m => m === "publishing.save"),
        "Saving timing never approves or schedules delivery"
      );
      if (social)
        check(
          updated.content.campaignPlanId === 7,
          "Campaign association survives studio edits"
        );
      await studioSection("Review & activate");
      check(
        document.body.textContent?.includes(accountName) &&
          document.body.textContent?.includes("Confirm your activation"),
        "Final review presents destination and activation together"
      );
      layout();
    }
    if (which === "studio-post-empty") {
      check(
        document.body.textContent?.includes("No connected accounts available."),
        "Missing social connection is explained"
      );
      check(
        !button("Select Demo ad account") &&
          !!document.querySelector('a[href="/app/settings/integrations"]'),
        "Ad accounts cannot substitute for Pages and setup is available"
      );
      await click("Save draft");
      const saved = posts.find(
        p => p.id === "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
      );
      check(
        saved?.channel === "facebook" &&
          saved.connectionId === null &&
          saved.state === "draft",
        "An unconnected social draft can be saved"
      );
      check(
        mutations.length === 1 && mutations[0] === "publishing.save",
        "Unconnected draft cannot publish"
      );
      layout();
    }
    if (which === "campaign-plans") {
      await click("New plan");
      check(
        document.body.textContent?.includes("Objective & creative direction"),
        "Campaign plan captures intent"
      );
      layout();
    }
    if (which === "asset-library") {
      const sizes = document.querySelector<HTMLSelectElement>(
        '[data-choice-label="Asset size"] select'
      )!;
      check(
        sizes.textContent?.includes("4:5 · e.g. 1080 × 1350 px"),
        "Library uses the same clear size labels as the picker"
      );
      await chooseVisual(sizes, "portrait");
      layout();
    }
    if (which === "brand-kit") {
      button("Scan website")!.click();
      await pause();
      layout();
      (
        document
          .querySelector("#brand-website")!
          .closest("form") as HTMLFormElement
      ).requestSubmit();
      await pause();
      layout();
      check(!!button("Use scanned details"), "Scan results can be reviewed");
      check(
        mutations.length === 1 && mutations[0] === "brand.scanWebsite",
        "Scan does not save the brand kit"
      );
      button("Use scanned details")!.click();
      await pause();
      layout();
      check(
        (document.querySelector("#brand-name") as HTMLInputElement).value ===
          "Learn Like This",
        "Detected identity is editable"
      );
      check(
        (
          document.querySelector("#brand-voice") as HTMLTextAreaElement
        ).value.includes("Welcoming"),
        "Suggested voice is ready for review"
      );
    }
    if (which === "directory-creative") {
      check(
        (document.querySelector("select") as HTMLSelectElement) !== null,
        "Creator renders"
      );
      check(
        !document.querySelector('[aria-label="Search products or SKU"]'),
        "Directory does not require catalog selection"
      );
      check(
        document.body.textContent?.includes("No catalog required"),
        "Catalog-free promotion is selected"
      );
      check(
        document.body.textContent?.includes("3 images"),
        "Promotion has one image per size"
      );
      layout();
    }
    if (which === "platform-admin") {
      check(
        document.body.textContent?.includes("Business health"),
        "Admin overview renders"
      );
      check(
        !!document.querySelector("[data-platform-admin-shell]"),
        "Dedicated admin shell renders"
      );
      check(
        !document.querySelector('[aria-label="Switch account"]'),
        "No customer account switcher in admin"
      );
      check(
        !document.body.textContent?.includes("Content Studio"),
        "Customer navigation is absent from admin"
      );
      const nav = async (title: string) => {
        const link = Array.from(
          document.querySelectorAll<HTMLAnchorElement>("nav a")
        ).find(a => a.textContent?.trim() === title);
        check(!!link, `Navigation ${title}`);
        link!.click();
        await pause();
      };
      for (const tab of [
        "Accounts",
        "Usage & costs",
        "OpenAI billing",
        "Tiers",
        "Provider rates",
        "Financial entries",
        "Audit",
        "Overview",
      ]) {
        await nav(tab);
        layout();
      }
      await nav("Accounts");
      const accountButton = Array.from(
        document.querySelectorAll<HTMLButtonElement>("button")
      ).find(b => b.textContent?.includes("Demo customer account"));
      check(!!accountButton, "Account is available");
      accountButton!.click();
      await pause();
      layout();
      check(!!button("Apply credit adjustment"), "Credit controls render");
      check(mutations.length === 0, "Browsing admin does not mutate accounts");
    }
    if (which === "billing-usage" || which === "billing-plans") {
      if (role === "creator") {
        check(
          document.body.textContent?.includes(
            "Only workspace owners and administrators"
          ),
          "Billing role restriction is visible"
        );
        check(!button("Preview Growth"), "Creator has no plan actions");
      } else {
        check(
          document.body.textContent?.includes("Current AI credit allowance"),
          "No fabricated credit balance"
        );
        if (which === "billing-plans") {
          const plans = Array.from(
            document.querySelectorAll<HTMLButtonElement>('[role="tab"]')
          ).find(t => t.textContent === "Proposed plans")!;
          plans.dispatchEvent(
            new MouseEvent("mousedown", { bubbles: true, button: 0 })
          );
          plans.click();
          await pause();
          check(!!button("Preview Growth"), "Proposed plans render");
          await click("Preview Growth");
          check(
            mutations.length === 0,
            "Selecting a card does not create a charge or change a plan"
          );
          check(
            !!document.querySelector('[aria-label="Confirm plan preview"]'),
            "Preview-only confirmation shown"
          );
          layout();
        }
      }
    }
    if (which === "planned-attribution" || which === "optimize-overview") {
      check(
        document.body.textContent?.includes("Planned") ||
          document.body.textContent?.includes("on the roadmap"),
        "Roadmap is labeled"
      );
      check(
        !Array.from(
          document.querySelectorAll<HTMLButtonElement>("button")
        ).some(
          control =>
            !control.closest('[aria-label="Workspace navigation"]') &&
            ["Upgrade", "Activate"].includes(control.textContent?.trim() ?? "")
        ),
        "Unbuilt tools are not paid unlocks"
      );
    }
    if (which.startsWith("navigation"))
      await navigationChecks(which === "navigation-ten");
    return {
      passed: true,
      page: which,
      role,
      width: innerWidth,
      height: innerHeight,
      mutations,
    };
  } catch (e) {
    return {
      passed: false,
      page: which,
      role,
      width: innerWidth,
      height: innerHeight,
      error: e instanceof Error ? e.message : String(e),
    };
  }
};

async function navigationChecks(ten: boolean) {
  const mobile = innerWidth < 768;
  const openDrawer = async () => {
    if (mobile && !document.querySelector('[data-mobile="true"]'))
      await click("Open navigation");
  };
  await openDrawer();
  const parent = (label: string) =>
    document.querySelector<HTMLButtonElement>(
      `nav[aria-label="Workspace navigation"] button[aria-label="${label}"]`
    )!;
  const children = (label: string) =>
    document.getElementById(parent(label).getAttribute("aria-controls")!)!;
  check(
    parent("Activate").getAttribute("aria-expanded") === "false",
    "Direct links keep submenus closed"
  );
  parent("Activate").click();
  await pause();
  check(
    children("Activate").querySelector('[aria-current="page"]')?.textContent ===
      "Activation Studio",
    "Active studio highlighted"
  );
  if (!mobile)
    check(!!button("Expand sidebar"), "Opening a group keeps the rail compact");
  if (ten) {
    const last = Array.from(
      children("Activate").querySelectorAll<HTMLAnchorElement>("a")
    ).at(-1)!;
    check(last, "Ten channels remain accessible");
    last.scrollIntoView({ block: "center" });
    await pause();
    const rect = last.getBoundingClientRect();
    check(
      rect.top >= 0 && rect.bottom <= innerHeight + 1,
      "Last channel reachable"
    );
    return;
  }
  if (!mobile) {
    const trigger = parent("Activate");
    const firstLink =
      children("Activate").querySelector<HTMLAnchorElement>("a")!;
    firstLink.focus();
    firstLink.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Escape", bubbles: true })
    );
    await pause();
    check(
      trigger.getAttribute("aria-expanded") === "false" &&
        document.activeElement === trigger,
      "Escape closes the real browser flyout and restores focus"
    );
    trigger.click();
    await pause();
  }
  children("Activate")
    .querySelector<HTMLAnchorElement>('a[href="/app/publishing"]')!
    .click();
  await pause();
  check(
    document.querySelector("h1")?.textContent === "Calendar",
    "Calendar link changes page"
  );
  if (mobile)
    check(
      !document.querySelector('[data-mobile="true"]'),
      "Selection closes mobile drawer"
    );
  await openDrawer();
  parent("Measure").click();
  await pause();
  children("Measure")
    .querySelector<HTMLAnchorElement>('a[href="/app/analytics/advertising"]')!
    .click();
  await pause();
  check(
    document.querySelector("h1")?.textContent === "Advertising analytics",
    "Analytics opens directly"
  );
  fixtureRouter.navigate(
    "/app/analytics?tab=social&since=2026-09-01&until=2026-09-20&compare=1"
  );
  await pause();
  await openDrawer();
  parent("Measure").click();
  await pause();
  const overview = children("Measure").querySelector<HTMLAnchorElement>(
    'a[href^="/app/analytics?"]'
  )!;
  check(
    overview.href.includes("since=2026-09-01") &&
      overview.href.includes("compare=1"),
    "Dates and comparison preserved"
  );
  overview.click();
  await pause();
  layout();
  fixtureRouter.navigate("/app/advertising/meta");
  await pause();
  if (mobile) await openDrawer();
}
