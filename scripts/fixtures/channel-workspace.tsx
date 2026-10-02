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
const id = "33333333-3333-4333-8333-333333333333";
const now = Date.now();
const empty = { items: [], truncated: false };
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
const mutations: string[] = [];
const role =
  new URLSearchParams((window as any).__fixtureQuery ?? location.search).get(
    "role"
  ) ?? "owner";
function respond(path: string, input: any) {
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
  if (path === "creatives.overview") return { jobs: [] };
  if (path === "assetLibrary.studioList" || path === "brand.assets") return [];
  if (path === "catalog.overview") return { products: [] };
  if (path === "publishing.get") return posts.find(p => p.id === input.id);
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

  if (path === "channels.connections")
    return which === "advertising-empty" || which === "social-empty"
      ? { ...connections, items: [] }
      : connections;
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
  if (path === "assetLibrary.list") return [];
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
      ? input.decision
      : path.endsWith("submit")
        ? "needs_review"
        : "scheduled";
    if (path.endsWith("queue")) post.result = { deliveryMode: "test" };
    return { success: true, liveEnabled: false };
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
  "studio-media": "/app/creatives/social?new=1",
  "studio-legacy": "/app/creatives/saved?asset=creative%3A42",
  "studio-post": "/app/creatives/social?new=1&plan=7",
  "studio-ad": "/app/creatives/ads?new=1",
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
  "advertising-overview": "/app/advertising",
  "social-overview": "/app/social",
  "billing-usage": "/app/settings/billing",
  "billing-plans": "/app/settings/billing",
  "planned-attribution": "/app/attribution",
  "optimize-overview": "/app/optimize",

  "advertising-empty": "/app/advertising/meta",
  "social-empty": "/app/social/facebook",
  publishing: "/app/publishing",
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
function RoutedPage() {
  const [path] = useLocation();
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
      <TooltipProvider>
        <Router hook={fixtureRouter.hook} searchHook={fixtureRouter.searchHook}>
          <RoutedPage />
        </Router>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  </trpc.Provider>
);
const pause = () => new Promise(resolve => setTimeout(resolve, 150));
const check = (condition: any, message: string) => {
  if (!condition) throw new Error(message);
};
const button = (name: string) =>
  Array.from(document.querySelectorAll<HTMLButtonElement>("button")).find(
    b => b.textContent?.trim() === name
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
    if (which === "publishing") {
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
        check(!button("Approve publication"), "Creators cannot approve");
        await click("Submit for publishing approval");
        check(posts[0].state === "needs_review", "Creator submits for review");
      } else {
        await click("Approve publication");
        await click("Save test schedule");
        check(
          posts[0].state === "approved",
          "Opening confirmation cannot queue delivery"
        );
        check(
          !!button("Confirm delivery"),
          "EvokeLoop confirmation dialog is shown"
        );
        layout();
        await click("Confirm delivery");
        check(
          posts[0].state === "scheduled" &&
            posts[0].result.deliveryMode === "test",
          "Owner can explicitly save a safe test schedule"
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
    if (which === "studio-overview") {
      check(
        document.body.textContent?.includes("Social post") &&
          document.body.textContent?.includes("Ad"),
        "Real creation modes render"
      );
      check(
        !document.body.textContent?.includes("Saved work") &&
          !document.body.textContent?.includes("Video creation"),
        "Studio removes redundant and unavailable modes"
      );
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
    }
    if (which === "studio-legacy") {
      check(
        document.body.textContent?.includes("Image & upload drafts"),
        "Old saved-work link redirects to image drafts"
      );
      check(
        document.body.textContent?.includes(
          "This version is not in this collection"
        ),
        "The legacy asset selection is retained, not silently discarded"
      );
    }
    if (which === "studio-post" || which === "studio-ad") {
      check(
        !document.getElementById("pub-destination"),
        "Destination belongs to Activate"
      );
      check(!document.getElementById("pub-date"), "Timing belongs to Activate");
      check(
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
      await click("Save & continue to Activate");
      const saved = posts.find(
        p => p.id === "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
      );
      check(
        saved && saved.state === "draft" && saved.connectionId === null,
        "Creation saves a standalone draft"
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
    if (which === "campaign-plans") {
      await click("New plan");
      check(
        document.body.textContent?.includes("Objective & creative direction"),
        "Campaign plan captures intent"
      );
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
      await click("Toggle Sidebar");
  };
  await openDrawer();
  const nav = () =>
    document.querySelector<HTMLElement>(
      'nav[aria-label="Workspace navigation"]'
    )!;
  const parent = (label: string) =>
    nav().querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`)!;
  const children = (label: string) =>
    document.getElementById(parent(label).getAttribute("aria-controls")!)!;
  check(
    parent("Advertising").getAttribute("aria-expanded") === "true",
    "Direct link opens its sidebar group"
  );
  check(
    children("Advertising").querySelector('[aria-current="page"]')
      ?.textContent === "Meta Ads",
    "Active channel highlighted"
  );
  parent("Advertising").click();
  await pause();
  check(children("Advertising").hidden, "User can collapse current section");
  parent("Advertising").click();
  await pause();
  if (ten) {
    const last = children("Advertising").querySelector<HTMLElement>(
      '[title="Future channel 10 - planned, not available yet"]'
    )!;
    check(last, "Ten channels use the same sidebar list");
    last.scrollIntoView({ block: "center" });
    await pause();
    const r = last.getBoundingClientRect();
    check(
      r.top >= 0 && r.bottom <= innerHeight + 1,
      "Last of ten channels is reachable by scrolling"
    );
    check(
      nav().scrollWidth <= nav().clientWidth + 1,
      "Long channel list fits sidebar width"
    );
    return;
  }
  parent("Social Publishing").click();
  await pause();
  check(
    parent("Advertising").getAttribute("aria-expanded") === "true",
    "Groups expand independently"
  );
  const facebook = children(
    "Social Publishing"
  ).querySelector<HTMLAnchorElement>('a[href="/app/social/facebook"]')!;
  facebook.scrollIntoView({ block: "center" });
  facebook.click();
  await pause();
  check(
    document.querySelector("h1")?.textContent === "Facebook",
    "Channel link changes the page"
  );
  if (mobile)
    check(
      !document.querySelector('[data-mobile="true"]'),
      "Selecting a channel closes the mobile drawer"
    );
  await openDrawer();
  parent("Analytics").click();
  await pause();
  const adReport = children("Analytics").querySelector<HTMLAnchorElement>(
    'a[href="/app/analytics/advertising"]'
  )!;
  adReport.scrollIntoView({ block: "center" });
  adReport.click();
  await pause();
  check(
    document.querySelector("h1")?.textContent === "Advertising analytics",
    "Analytics subsection opens directly"
  );
  fixtureRouter.navigate(
    "/app/analytics?tab=social&since=2026-09-01&until=2026-09-20&compare=1"
  );
  await pause();
  check(
    document.querySelector("h1")?.textContent === "Social media analytics",
    "Legacy deep links remain compatible"
  );
  await openDrawer();
  const overview = children("Analytics").querySelector<HTMLAnchorElement>(
    'a[href^="/app/analytics?"]'
  )!;
  check(
    overview.href.includes("since=2026-09-01") &&
      overview.href.includes("compare=1"),
    "Dates and comparison preserved by sidebar"
  );
  overview.click();
  await pause();
  check(
    document.querySelector("h1")?.textContent === "Analytics overview",
    "Overview stays separate from scoped analytics"
  );
  layout();
  // Leave the initial advertising page visible for a comparable screenshot.
  fixtureRouter.navigate("/app/advertising/meta");
  await pause();
  if (mobile) await openDrawer();
}
