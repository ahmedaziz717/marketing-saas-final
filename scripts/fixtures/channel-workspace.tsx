import { useState } from "react";
import { ThemeProvider } from "../../client/src/contexts/ThemeContext";
import { defaultVideoSetup } from "../../shared/videoCreation";
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
const copyRequests: any[] = [];
const videoDrafts: any[] = [];
const videoQuotes: any[] = [];
const role =
  new URLSearchParams((window as any).__fixtureQuery ?? location.search).get(
    "role"
  ) ?? "owner";
function respond(path: string, input: any) {
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
  if (path === "publishing.history") return [];
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
  if (path === "assetLibrary.list")
    return ["studio-ad-copy", "studio-post-media"].includes(which)
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
  "model-picker": "/app/model-picker",
  "studio-media": "/app/creatives/social?new=1",
  "studio-legacy": "/app/creatives/saved?asset=creative%3A42",
  "studio-post": "/app/creatives/social?new=1&plan=7",
  "studio-post-media": `/app/creatives/social?edit=${id}`,
  "studio-post-empty": "/app/creatives/social?new=1",
  "studio-ad": "/app/creatives/ads?new=1",
  "studio-ad-setup": "/app/creatives/ads?new=1",
  "studio-ad-create": "/app/creatives/ads?new=1",
  "studio-ad-copy": "/app/creatives/ads?new=1&asset=asset%3A1",
  "campaign-plans": "/app/plans",
  "asset-library": "/app/library",
  roadmap: "/app/roadmap",
  "brand-kit": "/app/brand",
  "directory-creative": "/app/creatives/directory",
  "platform-admin": "/admin",
  "product-home": "/app",
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
  publishing: "/app/publishing",
  "publishing-live": "/app/publishing",
  "publishing-approved": "/app/publishing",
  social: "/app/social/facebook",
  advertising: "/app/advertising/meta",
  analytics: "/app/analytics",
  "analytics-ads": "/app/analytics/advertising",
  "analytics-social": "/app/analytics/social",
  integrations: "/app/settings/integrations",
};
const fixtureRouter = memoryLocation({
  path: routeForPage[which] ?? "/app/advertising/meta",
});
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
    b => b.textContent?.trim() === name || b.getAttribute("aria-label") === name
  );
async function click(name: string) {
  const b = button(name);
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
  check(
    document.documentElement.scrollWidth <= innerWidth + 1,
    "Page has horizontal overflow"
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
(window as any).runChannelRegression = async () => {
  try {
    await pause();
    layout();
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
      const age = Array.from(document.querySelectorAll("label"))
        .find(l => l.textContent?.startsWith("Age group"))!
        .querySelector("select")!;
      age.value = "child";
      age.dispatchEvent(new Event("change", { bubbles: true }));
      await pause();
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
      check(!!document.getElementById("pub-title"), "Real composer opens");
      layout();
      await click("Cancel");
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
        document.body.textContent?.includes("Combined ad spend"),
        "Cross-channel reporting renders"
      );
    else if (which === "integrations") {
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
        '[aria-label="Analytics account"]'
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
          ?.textContent?.includes("Make your next move.") &&
          document.body.textContent?.includes(
            "Create. Activate. Measure. Optimize."
          ),
        "Product stages are visible on Home"
      );
      check(
        document.body.textContent?.includes(
          "Automated optimization is on the roadmap."
        ),
        "Home does not imply optimization tools are operational"
      );
    }
    if (which === "video-studio") {
      check(
        !!document.querySelector('[aria-label="Video type"]'),
        "Video creation has Product and UGC routes"
      );
      check(
        !!document.querySelector("#video-prompt"),
        "Video prompt is visible"
      );
      await click("Edit video");
      check(
        document.body.textContent?.includes("Source video"),
        "Edit mode requires source video"
      );
      check(
        !Array.from(document.querySelectorAll("label")).some(label =>
          label.textContent?.startsWith("Aspect ratio")
        ),
        "Edit mode hides unsupported ratio controls"
      );
      await click("Motion control");
      check(
        !document.body.textContent?.includes("Generate sound"),
        "Motion mode hides unsupported sound controls"
      );
      await click("Create video");
      await click("Add images");
      check(
        !!document.querySelector('[role="dialog"]'),
        "Reference picker opens accessibly"
      );
      const image = Array.from(
        document.querySelectorAll<HTMLButtonElement>('[role="dialog"] button')
      ).find(button => button.textContent?.includes("Emerald collection hero"));
      image?.click();
      await new Promise(resolve => setTimeout(resolve, 30));
      await click("Use selected images");
      check(
        !!document.querySelector('img[alt^="Reference 1"]'),
        "Selected reference appears in the video editor"
      );
    }
    if (which === "video-ugc") {
      check(
        !!document.querySelector("#video-prompt"),
        "UGC uses the video editor"
      );
      check(
        button("Generation coming soon")?.disabled,
        "UGC generation is unavailable until its provider is connected"
      );
      for (const label of [
        "Create video",
        "Edit video",
        "Extend video",
        "Motion control",
        "Save draft",
      ])
        check(!!button(label), `UGC has the shared ${label} control`);
      await click("Edit video");
      check(
        document.body.textContent?.includes("Source video"),
        "UGC edit has a source video picker"
      );
      await click("Create video");
      await click("Add images");
      await click("Emerald collection hero");
      await click("Use selected images");
      await click("Browse 500 models");
      layout();
      for (let i = 1; i <= 4; i++) await click(`Woman · Black ${i}`);
      check(
        button("Woman · Black 5")?.disabled,
        "UGC supports at most four models"
      );
      await click("Use 4 models");
      await click("Save draft");
      check(
        videoDrafts[0]?.setup.category === "ugc" &&
          videoDrafts[0]?.setup.people.length === 4 &&
          videoDrafts[0]?.setup.imageKeys[0] === "asset:1",
        "UGC save keeps category, four models, and references"
      );
      await click("Product videos");
      check(
        !button("Browse 500 models"),
        "Product editor does not show the UGC model picker"
      );
      await click("UGC videos");
      // The temporary save toast sits above the final history row on mobile.
      await new Promise(resolve => setTimeout(resolve, 4500));
      await click("Open Untitled UGC video");
      await click("Browse 500 models");
      check(
        document.body.textContent?.includes("4 / 4 selected"),
        "Saved UGC restores its model selection"
      );
      await click("Cancel");
      check(
        !!document.querySelector('img[alt^="Reference 1"]'),
        "Saved UGC restores its image references"
      );
      check(
        videoQuotes.every(setup => setup.category !== "ugc"),
        "UGC never requests product credit quotes"
      );
      check(
        !mutations.includes("video.generate"),
        "Saving UGC does not trigger generation"
      );
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
      const caption =
        document.querySelector<HTMLTextAreaElement>("#pub-message")!;
      Object.getOwnPropertyDescriptor(
        HTMLTextAreaElement.prototype,
        "value"
      )!.set!.call(caption, "This caption survives media creation.");
      caption.dispatchEvent(new Event("input", { bubbles: true }));
      await pause();
      await click("Create or upload media");
      layout();
      check(
        !!button("Upload assets"),
        "Uploader is available without leaving the composer"
      );
      await click("Generate image");
      layout();
      check(
        !!document.getElementById("saved-creative-setup"),
        "Uses the shared image builder"
      );
      await click("Back to content");
      layout();
      check(
        document.querySelector<HTMLTextAreaElement>("#pub-message")?.value ===
          "This caption survives media creation.",
        "Copy is retained across nested media creation"
      );
      check(
        mutations.length === 0,
        "Browsing media never starts a paid generation"
      );
      await click("Browse approved assets");
      const sizes = document.querySelector<HTMLSelectElement>(
        '[aria-label="Asset dimensions"]'
      )!;
      check(
        sizes.textContent?.includes("9:16 · e.g. 1080 × 1920 px"),
        "Image filter explains ratio and pixel dimensions"
      );
      sizes.value = "story";
      sizes.dispatchEvent(new Event("change", { bubbles: true }));
      await pause();
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
    if (which === "studio-ad-setup" || which === "studio-ad-create") {
      const select = async (selector: string, value: string) => {
        const el = document.querySelector<HTMLSelectElement>(selector)!;
        check(!!el, "Selector available: " + selector);
        el.value = value;
        el.dispatchEvent(new Event("change", { bubbles: true }));
        await pause();
      };
      const platform =
        document.querySelector<HTMLSelectElement>("#pub-ad-platform")!;
      check(
        platform.options.length === 1 &&
          platform.options[0].textContent?.includes("Meta Ads"),
        "Only connected ad channels appear first"
      );
      check(
        platform.compareDocumentPosition(
          document.getElementById("pub-destination")!
        ) & Node.DOCUMENT_POSITION_FOLLOWING,
        "Channel comes before its account"
      );
      await select("#pub-destination", adsId);
      check(
        document.querySelector<HTMLSelectElement>(
          '[aria-label="Campaign and ad set status"]'
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
      await select('[aria-label="Campaign and ad set status"]', "all");
      await select("#pub-meta-campaign", "8");
      check(
        document.querySelector<HTMLSelectElement>("#pub-adset")?.value === "",
        "Changing campaign clears its ad set"
      );
      await select("#pub-adset", "9");
      await select('[aria-label="Campaign and ad set status"]', "active");
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
      if (which === "studio-ad-create") {
        layout();
      } else {
        const budgetLabel = Array.from(dialog().querySelectorAll("label")).find(
          l => l.textContent?.trim() === "Budget (USD)"
        )!;
        const amount = budgetLabel.querySelector("input")!;
        Object.getOwnPropertyDescriptor(
          HTMLInputElement.prototype,
          "value"
        )!.set!.call(amount, "20");
        amount.dispatchEvent(new Event("input", { bubbles: true }));
        const pixelLabel = Array.from(dialog().querySelectorAll("label")).find(
          l => l.textContent?.includes("Dataset / Meta Pixel")
        )!;
        const pixel = pixelLabel.querySelector("select")!;
        pixel.value = "88";
        pixel.dispatchEvent(new Event("change", { bubbles: true }));
        await pause();
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
        await select("#pub-adset", "11");
        await select("#pub-destination", "");
        check(
          !document.getElementById("pub-adset"),
          "No previous account campaigns leak into an unselected account"
        );
        await select("#pub-destination", adsId);
        check(
          document.querySelector<HTMLSelectElement>("#pub-meta-campaign")
            ?.value === "",
          "Account change clears campaign selection"
        );
        await select("#pub-meta-campaign", "10");
        await select("#pub-adset", "11");
        layout();
      }
    }
    if (which === "studio-ad-copy") {
      await click("Continue to creative");
      await click("Generate 5 copy sets");
      const fields = () =>
        Array.from(
          document.querySelectorAll<HTMLTextAreaElement>('textarea[id^="pub-"]')
        ).map(el => ({ id: el.id, value: el.value }));
      check(
        fields().length === 15,
        "All 15 editable fields appear after generation"
      );
      const original = JSON.stringify(fields());
      const headlines = document.querySelector<HTMLButtonElement>(
        '[role="tab"][data-state="inactive"]'
      )!;
      headlines.focus();
      await pause();
      check(
        headlines.getAttribute("data-state") === "active",
        "Headlines tab is keyboard accessible"
      );
      const single = document.querySelector<HTMLButtonElement>(
        '[aria-label="Regenerate headline option 3"]'
      )!;
      single.scrollIntoView({ block: "center", behavior: "instant" });
      single.click();
      await pause();
      check(
        copyRequests.at(-1).regeneration.field === "headline" &&
          copyRequests.at(-1).regeneration.index === 2,
        "Regenerate requests only the selected field"
      );
      const changed = fields().filter(
        (f, i) => f.value !== JSON.parse(original)[i].value
      );
      check(
        changed.length === 1 && changed[0].id === "pub-headline-2",
        "Only headline 3 changed"
      );
      await click("Undo last generation");
      check(
        JSON.stringify(fields()) === original,
        "Undo restores previous copy"
      );
      const menu = document.querySelector<HTMLButtonElement>(
        '[aria-label="More actions for headline option 5"]'
      )!;
      menu.focus();
      menu.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Enter", bubbles: true })
      );
      await pause();
      const setAction = Array.from(
        document.querySelectorAll<HTMLElement>('[role="menuitem"]')
      ).find(el => el.textContent === "Regenerate full set 5 (all 3 fields)");
      check(!!setAction, "Full set regeneration is offered in the menu");
      setAction!.click();
      await pause();
      check(
        fields().filter((f, i) => f.value !== JSON.parse(original)[i].value)
          .length === 3,
        "Full set regeneration changes only three fields"
      );
      await click("Regenerate all 5 sets");
      check(
        fields().length === 15 &&
          fields().every((f, i) => f.value !== JSON.parse(original)[i].value),
        "Regenerate all replaces all 15 options"
      );
      const savedFields = fields();
      await click("Save draft");
      const saved = posts.find(
        p => p.id === "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
      )!;
      check(
        saved.content.textVariants.messages.length === 4 &&
          saved.content.textVariants.headlines.length === 4 &&
          saved.content.textVariants.descriptions.length === 4,
        "Draft saves one primary plus four alternatives of every type"
      );
      const savedCard = Array.from(document.querySelectorAll("article")).find(
        el => el.querySelector("h3")?.textContent === saved.content.title
      )!;
      const editButton = Array.from(
        savedCard.querySelectorAll<HTMLButtonElement>("button")
      ).find(el => el.textContent === "Edit content")!;
      editButton.click();
      await pause();
      await click("Continue to creative");
      check(
        JSON.stringify(fields()) === JSON.stringify(savedFields),
        "All copy options survive save and reopen"
      );
      check(
        mutations.every(m =>
          ["channels.draftAssetCopy", "publishing.save"].includes(m)
        ),
        "Generating copy never approves or publishes the ad"
      );
      document
        .querySelector('[aria-label="Ad copy options"]')!
        .scrollIntoView({ block: "start", behavior: "instant" });
      await pause();
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
        caption.getBoundingClientRect().height >= 144,
        "Caption has a full writing area"
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
      const body = document.querySelector(
        ".publication-fields"
      )!.parentElement!;
      body.scrollTop = 0;
      await pause();
      layout();
    }
    if (which === "studio-post" || which === "studio-ad") {
      const destination =
        document.querySelector<HTMLSelectElement>("#pub-destination")!;
      check(
        !document.getElementById("pub-channel"),
        "Content mode cannot switch between organic posts and paid ads"
      );
      const optionIds = Array.from(destination.options)
        .map(o => o.value)
        .filter(Boolean);
      check(
        JSON.stringify(optionIds) ===
          JSON.stringify(
            which === "studio-post" ? [pageId, secondPageId] : [adsId]
          ),
        "Account picker includes only active accounts for the content type"
      );
      check(
        destination.textContent?.includes(
          which === "studio-post"
            ? "Demo Facebook Page · Facebook"
            : "Demo ad account · Meta Ads"
        ),
        "Accounts are identified by name and platform"
      );
      destination.value = which === "studio-post" ? secondPageId : adsId;
      destination.dispatchEvent(new Event("change", { bubbles: true }));
      await pause();
      check(!document.getElementById("pub-date"), "Timing belongs to Activate");
      if (which === "studio-ad") await click("Continue to creative");
      check(
        which === "studio-ad" ||
          !!document.querySelector('[aria-label="Content preview"]'),
        "Content has a live preview"
      );
      if (which === "studio-post")
        check(
          !document.getElementById("pub-headline"),
          "Post mode has organic fields"
        );
      else
        check(
          !!document.getElementById("pub-headline") &&
            !!document.querySelector('[aria-label="Ad format"]'),
          "Ad mode supports copy and creative formats"
        );
      layout();
      if (which === "studio-ad") await click("Preview ad");
      if (which === "studio-post") {
        const caption =
          document.querySelector<HTMLTextAreaElement>("#pub-message")!;
        Object.getOwnPropertyDescriptor(
          HTMLTextAreaElement.prototype,
          "value"
        )!.set!.call(caption, "Explore our latest collection.");
        caption.dispatchEvent(new Event("input", { bubbles: true }));
        await pause();
      }
      await click(
        which === "studio-post"
          ? "Save & continue"
          : "Save & continue to Activate"
      );
      const saved = posts.find(
        p => p.id === "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
      );
      check(
        saved &&
          saved.state === "draft" &&
          saved.connectionId ===
            (which === "studio-post" ? secondPageId : adsId),
        "Creation saves the selected account on the draft"
      );
      check(
        document.querySelector<HTMLSelectElement>("#pub-destination")?.value ===
          saved.connectionId,
        "The chosen account is preserved when continuing to Activate"
      );
      check(
        !!document.getElementById("pub-destination") &&
          !!document.getElementById("pub-date"),
        "The same record opens in delivery settings"
      );
      check(
        !document.getElementById("pub-message"),
        "Delivery settings do not duplicate the content editor"
      );
      layout();
      await click("Save delivery settings");
      check(
        posts.filter(p => p.id === saved.id).length === 1 &&
          saved.revision === 1,
        "Handoff never copies the content record"
      );
      check(
        mutations.every(m => m === "publishing.save"),
        "Neither saving nor handoff calls approval or publishing"
      );
      check(
        posts.find(p => p.id === saved.id).revision === 2,
        "Delivery configuration updates the existing version"
      );
      if (which === "studio-post")
        check(
          posts.find(p => p.id === saved.id).content.campaignPlanId === 7,
          "Plan association survives the handoff"
        );
      layout();
    }
    if (which === "studio-post-empty") {
      const destination =
        document.querySelector<HTMLSelectElement>("#pub-destination")!;
      check(
        destination.options.length === 1,
        "Ad accounts never substitute for missing social accounts"
      );
      check(
        document.body.textContent?.includes(
          "No Facebook Pages are connected for social publishing."
        ),
        "Missing social connection is explained"
      );
      check(
        !!document.querySelector('a[href="/app/settings/integrations"]'),
        "Social account setup is available"
      );
      layout();
      await click("Save draft");
      const saved = posts.find(
        p => p.id === "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
      );
      check(
        saved?.channel === "facebook" &&
          saved.connectionId === null &&
          saved.state === "draft",
        "A social draft can be saved before connecting an account"
      );
      check(
        mutations.length === 1 && mutations[0] === "publishing.save",
        "Saving an unconnected draft cannot publish"
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
        '[aria-label="Asset size"]'
      )!;
      check(
        sizes.textContent?.includes("4:5 · e.g. 1080 × 1350 px"),
        "Library uses the same clear size labels as the picker"
      );
      sizes.value = "portrait";
      sizes.dispatchEvent(new Event("change", { bubbles: true }));
      await pause();
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
        !button("Upgrade") && !button("Activate"),
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
      "Meta Ads",
    "Active channel highlighted"
  );
  if (!mobile)
    check(!!button("Expand sidebar"), "Opening a group keeps the rail compact");
  if (ten) {
    const last = children("Activate").querySelector<HTMLAnchorElement>(
      'a[href="/app/advertising/future-3"]'
    )!;
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
  children("Activate")
    .querySelector<HTMLAnchorElement>('a[href="/app/social/facebook"]')!
    .click();
  await pause();
  check(
    document.querySelector("h1")?.textContent === "Facebook",
    "Channel link changes page"
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
