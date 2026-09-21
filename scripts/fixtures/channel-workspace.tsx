import { Router, useLocation } from "wouter";
import { memoryLocation } from "wouter/memory-location";
import DashboardLayout from "../../client/src/components/DashboardLayout";
import { workspaceNavigation } from "../../client/src/components/WorkspaceNavigation";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { observable } from "@trpc/server/observable";
import { trpc } from "../../client/src/lib/trpc";
import WorkspaceApp from "../../client/src/pages/WorkspaceApp";
import ProductOverviewPage from "../../client/src/pages/ProductOverviewPage";
import PlannedFeaturePage from "../../client/src/pages/PlannedFeaturePage";
import SettingsPage from "../../client/src/pages/SettingsPage";
import { PRODUCT_FEATURES, PROPOSED_PLANS, USAGE_METERS } from "../../shared/frameProduct";
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
  if (path === "workspace.members" || path === "workspace.invites") return [];
  if (path === "billing.summary") return { mode: "preview", commercialStatus: "proposal", chargesEnabled: false, enforcement: false, selectedPreviewPlanId: null, revision: 0, plans: PROPOSED_PLANS, month: input.month, creditsUsed: null, usage: USAGE_METERS.map(m => ({ ...m, quantity: m.id === "image_outputs" ? 24 : 2 })), inventory: { activeSeats: 3, catalogItems: 485, connectedAccounts: 2 }, coverage: "Recorded successful outputs, not billable credits." };
  if (path === "billing.selectPreviewPlan") { mutations.push(path); return { success: true, previewOnly: true }; }

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
  "product-home": "/app",
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
    ...Array.from({ length: Math.max(0, 10 - group.children!.length) }, (_, i) => ({
      label: `Future channel ${i + group.children!.length + 1}`,
      path: `/app/advertising/future-${i}`,
      planned: true,
    })),
  ];
}
function RoutedPage() {
  const [path] = useLocation();
  const Page = path === "/app" ? WorkspaceApp
    : path === "/app/settings/billing" ? SettingsPage
    : ["/app/creatives/overview", "/app/optimize", "/app/advertising", "/app/social"].includes(path) ? ProductOverviewPage
    : PRODUCT_FEATURES.some(f => f.availability === "planned" && f.href === path) ? PlannedFeaturePage
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
      await click("New publication");
      check(!!document.getElementById("pub-title"), "Real composer opens");
      layout();
      await click("Cancel");
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
          posts[0].state === "scheduled" &&
            posts[0].result.deliveryMode === "test",
          "Owner can explicitly save a safe test schedule"
        );
      }
      layout();
    } else if (which === "social")
      check(
        document.body.textContent?.includes("Recent Facebook posts"),
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
    if (which === "product-home") {
      check(document.querySelector("h1")?.textContent?.includes("Create. Activate. Measure. Optimize."), "Product stages are visible on Home");
      check(document.body.textContent?.includes("Tools planned"), "Home does not imply optimization tools are operational");
    }
    if (which === "studio-overview") {
      check(document.body.textContent?.includes("Image assets") && document.body.textContent?.includes("Video creation"), "Studio separates creative formats");
      check(document.body.textContent?.includes("Video generation and editing are not available yet"), "Unavailable video is clearly marked");
    }
    if (which === "billing-usage" || which === "billing-plans") {
      if (role === "creator") {
        check(document.body.textContent?.includes("Only workspace owners and administrators"), "Billing role restriction is visible");
        check(!button("Preview Growth"), "Creator has no plan actions");
      } else {
        check(document.body.textContent?.includes("AI credits are not calculated yet"), "No fabricated credit balance");
        if (which === "billing-plans") {
          const plans = Array.from(document.querySelectorAll<HTMLButtonElement>('[role="tab"]')).find(t => t.textContent === "Proposed plans")!;
          plans.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, button: 0 })); plans.click(); await pause();
          check(!!button("Preview Growth"), "Proposed plans render");
          await click("Preview Growth");
          check(mutations.length === 0, "Selecting a card does not create a charge or change a plan");
          check(!!document.querySelector('[aria-label="Confirm plan preview"]'), "Preview-only confirmation shown");
          layout();
        }
      }
    }
    if (which === "planned-attribution" || which === "optimize-overview") {
      check(document.body.textContent?.includes("Planned"), "Roadmap is labeled");
      check(!button("Upgrade") && !button("Activate"), "Unbuilt tools are not paid unlocks");
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
  parent("Social Media").click();
  await pause();
  check(
    parent("Advertising").getAttribute("aria-expanded") === "true",
    "Groups expand independently"
  );
  const facebook = children("Social Media").querySelector<HTMLAnchorElement>(
    'a[href="/app/social/facebook"]'
  )!;
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
