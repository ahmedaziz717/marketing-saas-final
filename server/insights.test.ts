import {
  beforeAll,
  beforeEach,
  afterAll,
  afterEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { eq } from "drizzle-orm";
const state = vi.hoisted(() => ({
  db: null as any,
  ads: vi.fn(),
  social: vi.fn(),
  google: vi.fn(),
}));
vi.mock("./db", () => ({
  getDb: async () => state.db,
  closeDb: async () => {},
}));
vi.mock("./lib/channelReports", () => ({
  adsReport: (...args: unknown[]) => state.ads(...args),
  facebookReport: (...args: unknown[]) => state.social(...args),
}));
vi.mock("./lib/googleAdsReports", () => ({
  googleAdsReport: (...args: unknown[]) => state.google(...args),
}));
import { insightsRouter } from "./routers/insights";
import {
  insightReports,
  insightRuns,
  insightDashboards,
} from "../drizzle/insightsSchema";
import {
  users,
  organizations,
  organizationMemberships,
} from "../drizzle/schema";
import { channelConnections } from "../drizzle/channelSchema";
import {
  defaultInsightConfig,
  insightConfigSchema,
  insightRange,
  insightChartPoints,
  metricChange,
  nextInsightRun,
  reportPreviousRange,
  independentWidgetConfig,
} from "../shared/insights";
import { scheduleInsights, processNextInsight } from "./lib/insights";
import { deliverNextInsight } from "./lib/insightDelivery";
import { insightPdf } from "./lib/insightPdf";
import type { TrpcContext } from "./_core/context";

it("uses completed days and the report timezone when resolving rolling and comparison periods", () => {
  const c = defaultInsightConfig("America/New_York");
  expect(insightRange(c, Date.parse("2026-10-16T01:00:00Z"))).toEqual({
    since: "2026-10-08",
    until: "2026-10-14",
  });
  expect(
    reportPreviousRange(insightRange(c, Date.parse("2026-10-16T01:00:00Z")))
  ).toEqual({ since: "2026-10-01", until: "2026-10-07" });
  c.includeToday = true;
  expect(insightRange(c, Date.parse("2026-10-16T01:00:00Z"))).toEqual({
    since: "2026-10-09",
    until: "2026-10-15",
  });
  c.period = "this_month";
  c.includeToday = false;
  expect(() => insightRange(c, Date.parse("2026-11-01T14:00:00Z"))).toThrow(
    "no completed days"
  );
});
it("handles daily DST gaps and repeated times, monthly short months, and end dates", () => {
  const c = defaultInsightConfig("America/New_York");
  Object.assign(c.schedule, {
    enabled: true,
    frequency: "daily",
    hour: 2,
    minute: 30,
  });
  expect(
    new Date(
      nextInsightRun(c, Date.parse("2026-03-08T05:00:00Z"))!
    ).toISOString()
  ).toBe("2026-03-08T07:00:00.000Z");
  c.schedule.hour = 1;
  expect(
    new Date(
      nextInsightRun(c, Date.parse("2026-11-01T04:00:00Z"))!
    ).toISOString()
  ).toBe("2026-11-01T07:00:00.000Z");
  Object.assign(c.schedule, {
    frequency: "monthly",
    monthDay: 31,
    hour: 9,
    minute: 0,
  });
  expect(
    new Date(
      nextInsightRun(c, Date.parse("2027-02-01T00:00:00Z"))!
    ).toISOString()
  ).toBe("2027-02-28T14:00:00.000Z");
  c.schedule.endDate = "2027-02-27";
  expect(nextInsightRun(c, Date.parse("2027-02-01T00:00:00Z"))).toBeNull();
});
it("rejects fixed dates on recurring schedules and preserves unavailable/zero comparison semantics", () => {
  const c = defaultInsightConfig();
  c.connectionIds = [randomUUID()];
  c.period = "custom";
  c.schedule.enabled = true;
  expect(insightConfigSchema.safeParse(c).success).toBe(false);
  expect(metricChange(12, 0)).toBeNull();
  expect(metricChange(null, 12)).toBeNull();
  expect(metricChange(0, 12)).toBe(-100);
});

it("preserves missing-day gaps in trend charts", () => {
  expect(
    insightChartPoints(
      {
        series: [
          { date: "2026-10-01", values: { spend: 10 } },
          { date: "2026-10-03", values: { spend: 0 } },
        ],
      },
      "spend"
    )
  ).toEqual([
    { date: "2026-10-01", value: 10 },
    { date: "2026-10-02", value: null },
    { date: "2026-10-03", value: 0 },
  ]);
});
it("resolves custom rolling day counts without daylight-saving drift", () => {
  const config = {
    ...defaultInsightConfig("America/New_York"),
    period: "days" as const,
    rollingDays: 21,
  };
  expect(insightRange(config, Date.parse("2026-11-10T12:00:00Z"))).toEqual({
    since: "2026-10-20",
    until: "2026-11-09",
  });
  expect(
    insightRange(
      { ...config, includeToday: true, rollingDays: 1 },
      Date.parse("2026-11-10T12:00:00Z")
    )
  ).toEqual({ since: "2026-11-10", until: "2026-11-10" });
});

let engine: PGlite,
  org: number,
  other: number,
  ownerId: number,
  reviewerId: number,
  adsId = randomUUID(),
  pageId = randomUUID(),
  foreignId = randomUUID(),
  googleId = randomUUID(),
  foreignGoogleId = randomUUID();
let owner: ReturnType<typeof insightsRouter.createCaller>,
  reviewer: typeof owner,
  outsider: typeof owner;
const now = Date.parse("2026-10-16T13:00:00Z");
const googleData = () => ({
  summary: {
    spend: 250,
    impressions: 10000,
    clicks: 100,
    clickCtr: 1,
    cpc: 2.5,
    conversions: 5.5,
    conversionValue: 600,
    purchases: 2.5,
    purchaseValue: 500,
    roas: 2,
    cpa: 100,
  },
  currency: "EUR",
  timezone: "Europe/Paris",
  warnings: [],
  attribution: "Google Ads attribution. PURCHASE category; interaction date.",
  daily: [
    {
      date: insightRange(defaultInsightConfig()).since,
      values: { spend: 250, clicks: 100, purchases: 2.5, roas: 2 },
    },
  ],
  campaigns: [
    {
      id: "1",
      name: "Google PMax",
      type: "PERFORMANCE_MAX",
      status: "ENABLED",
      values: {
        spend: 250,
        clicks: 100,
        conversions: 5.5,
        purchaseValue: 500,
        roas: 2,
      },
    },
  ],
});
const adsData = () => ({
  summary: {
    spend: 200,
    impressions: 10000,
    clicks: 150,
    linkClicks: 100,
    purchases: 10,
    purchaseValue: 1000,
    roas: 5,
    leads: 3,
    registrations: 2,
  },
  currency: "USD",
  timezone: "America/New_York",
  daily: Array.from({ length: 7 }, (_, i) => ({
    date: `2026-10-${String(i + 8).padStart(2, "0")}`,
    spend: 20 + i * 5,
    impressions: 1000,
    clicks: 10,
    linkClicks: 9,
    purchases: i,
    purchaseValue: i * 100,
    roas: i,
  })),
  campaigns: Array.from({ length: 30 }, (_, i) => ({
    id: String(i),
    name: `Campaign ${i + 1} · Ready to ship workstations and gaming systems`,
    spend: 200 - i,
    impressions: 1000,
    clicks: 100,
    linkClicks: 90,
    purchases: 3,
    purchaseValue: 600,
    roas: 3,
  })),
  platforms: [],
  truncated: false,
  attribution:
    "Meta account attribution. Purchases are platform attributed, not deduplicated business sales.",
});
beforeAll(async () => {
  engine = new PGlite();
  for (const file of readdirSync("drizzle/postgres")
    .filter(f => f.endsWith(".sql"))
    .sort())
    await engine.exec(readFileSync("drizzle/postgres/" + file, "utf8"));
  state.db = drizzle(engine);
  const people = await state.db
    .insert(users)
    .values(
      ["owner", "reviewer", "outsider"].map(name => ({
        openId: `insight-${name}`,
        name,
        email: `${name}@example.test`,
      }))
    )
    .returning();
  ownerId = people[0].id;
  reviewerId = people[1].id;
  [owner, reviewer, outsider] = people.map((user: any) =>
    insightsRouter.createCaller({ user, req: {}, res: {} } as TrpcContext)
  );
  const orgs = await state.db
    .insert(organizations)
    .values(
      ["Insights main", "Insights other"].map((name, i) => ({
        name,
        slug: `insight-${i}`,
        createdByUserId: ownerId,
        createdAtMs: now,
      }))
    )
    .returning();
  org = orgs[0].id;
  other = orgs[1].id;
  await state.db.insert(organizationMemberships).values(
    people.map((p: any, i: number) => ({
      userId: p.id,
      organizationId: i === 2 || i === 4 ? other : org,
      role: i === 1 ? "reviewer" : "owner",
      status: "active",
      createdAtMs: now,
    }))
  );
  await state.db.insert(channelConnections).values(
    [adsId, pageId, foreignId, googleId, foreignGoogleId].map((id, i) => ({
      id,
      organizationId: i === 2 || i === 4 ? other : org,
      channel: i >= 3 ? "google_ads" : i === 1 ? "facebook" : "meta_ads",
      name: i === 1 ? "CLX Page" : "CLX Ads",
      accountId: String(100 + i),
      status: "connected",
      details: {
        capabilities: ["read", "insights"],
        permissions: [],
        tasks: [],
        warnings: [],
        currency: "USD",
        timezone: "America/New_York",
      },
      connectedByUserId: ownerId,
      verifiedAtMs: now,
      updatedAtMs: now,
    }))
  );
}, 60000);
beforeEach(async () => {
  await engine.exec(
    "TRUNCATE app_private.insight_dashboards, app_private.insight_runs, app_private.insight_reports CASCADE"
  );
  await state.db
    .update(organizationMemberships)
    .set({ status: "active" })
    .where(eq(organizationMemberships.organizationId, org));
  state.google.mockReset().mockImplementation(async () => googleData());
  state.ads.mockReset().mockImplementation(async () => adsData());
  state.social.mockReset().mockResolvedValue({
    followersNow: 1000,
    postCount: 2,
    series: [
      {
        metric: "page_media_view",
        total: 500,
        values: [{ date: "2026-10-09T07:00:00+0000", value: 500 }],
      },
      {
        metric: "page_post_engagements",
        total: 70,
        values: [{ date: "2026-10-09T07:00:00+0000", value: 70 }],
      },
    ],
    posts: [
      {
        message: "Ready for your next game?",
        reactions: 10,
        comments: 4,
        shares: 3,
      },
    ],
    warnings: [],
    note: "Post dates are UTC. Engagement totals are lifetime values.",
    truncated: false,
  });
  vi.stubEnv("APP_ORIGIN", "https://app.evokeloop.com");
  vi.stubEnv("CONTACT_RESEND_API_KEY", "test-only-key");
  vi.stubEnv("CONTACT_EMAIL_FROM", "EvokeLoop <reports@example.test>");
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});
afterAll(async () => {
  await engine?.close();
});
const config = () => ({
  ...defaultInsightConfig(),
  connectionIds: [adsId, pageId],
  metrics: [
    "spend",
    "purchaseValue",
    "purchases",
    "roas",
    "ctr",
    "cpa",
    "posts",
    "followers",
    "views",
    "engagements",
  ] as const,
});
async function saved(email = false) {
  const c = { ...config(), metrics: [...config().metrics] };
  c.delivery = {
    email,
    recipientUserIds: email ? [ownerId] : [],
    attachPdf: true,
    notifyFailure: true,
  };
  return owner.save({ organizationId: org, config: c });
}
async function completed(email = false) {
  const report = await saved(email);
  const queued = await owner.run({
    organizationId: org,
    id: report.id,
    revision: report.revision,
    notify: email,
  });
  await processNextInsight(state.db);
  return {
    report,
    run: await owner.runDetail({ organizationId: org, id: queued.id }),
  };
}
describe.sequential("Insights reports, worker, delivery and dashboards", () => {
  it("enforces workspace ownership, editor roles, and current recipients", async () => {
    const c = { ...config(), metrics: [...config().metrics] };
    await expect(outsider.list({ organizationId: org })).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    await expect(
      reviewer.save({ organizationId: org, config: c })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(
      owner.save({
        organizationId: org,
        config: { ...c, connectionIds: [foreignId] },
      })
    ).rejects.toThrow("belonging to this workspace");
    await expect(
      owner.save({
        organizationId: org,
        config: {
          ...c,
          delivery: {
            email: true,
            recipientUserIds: [999999],
            attachPdf: true,
            notifyFailure: true,
          },
        },
      })
    ).rejects.toThrow("active workspace members");
    const report = await saved();
    await expect(
      outsider.get({ organizationId: other, id: report.id })
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(
      reviewer.run({ organizationId: org, id: report.id, revision: 1 })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
  it("runs saved snapshots, calculates weighted ratios, and keeps sources separate", async () => {
    const { report, run } = await completed();
    expect(run.status).toBe("completed");
    expect(run.result?.accounts).toHaveLength(2);
    const account = run.result!.accounts[0];
    expect(account.metrics.find(m => m.key === "ctr")?.value).toBe(1);
    expect(account.metrics.find(m => m.key === "cpa")?.value).toBe(20);
    expect(
      run.result!.accounts[1].metrics.find(m => m.key === "followers")?.previous
    ).toBeNull();
    expect(run.deliveryState).toBe("disabled");
    await owner.save({
      organizationId: org,
      id: report.id,
      revision: 1,
      config: { ...report.config, name: "Changed report" },
    });
    expect(
      (await owner.runDetail({ organizationId: org, id: run.id })).config.name
    ).toBe(report.config.name);
    await expect(
      owner.save({
        organizationId: org,
        id: report.id,
        revision: 1,
        config: report.config,
      })
    ).rejects.toMatchObject({ code: "CONFLICT" });
  });
  it("retains partial data and does not replace provider failures with zeros", async () => {
    state.ads.mockRejectedValue(new Error("secret upstream text"));
    const { run } = await completed();
    expect(run.status).toBe("partial");
    expect(run.result!.accounts[0].metrics).toEqual([]);
    expect(JSON.stringify(run)).not.toContain("secret upstream text");
    expect(run.result!.accounts[1].metrics.some(m => m.value === 500)).toBe(
      true
    );
  });
  it("preserves current-period results when only the previous-period fetch fails", async () => {
    state.ads
      .mockResolvedValueOnce(adsData())
      .mockRejectedValueOnce(new Error("previous failed"));
    const { run } = await completed();
    expect(run.status).toBe("partial");
    expect(run.result!.accounts[0].metrics[0].value).toBe(200);
    expect(run.result!.accounts[0].metrics[0].previous).toBeNull();
  });
  it("queues a scheduled slot once and consolidates missed runs without a burst", async () => {
    const report = await saved();
    const c = {
      ...report.config,
      schedule: { ...report.config.schedule, enabled: true },
    };
    await state.db
      .update(insightReports)
      .set({ config: c, nextRunAtMs: now - 7 * 86400000 })
      .where(eq(insightReports.id, report.id));
    await scheduleInsights(state.db, now);
    await scheduleInsights(state.db, now);
    const rows = await state.db.select().from(insightRuns);
    expect(rows).toHaveLength(1);
    expect(rows[0].trigger).toBe("scheduled");
    expect(rows[0].createdAtMs).toBe(now);
    const [stored] = await state.db.select().from(insightReports);
    expect(stored.nextRunAtMs).toBeGreaterThan(now);
    const manual = await owner.run({
      organizationId: org,
      id: report.id,
      revision: 1,
    });
    expect(manual.alreadyRunning).toBe(true);
    expect(manual.id).toBe(rows[0].id);
  });
  it("recovers abandoned leases and stops a schedule when its editor loses access", async () => {
    const report = await saved();
    await state.db
      .update(insightReports)
      .set({
        config: {
          ...report.config,
          schedule: { ...report.config.schedule, enabled: true },
        },
        nextRunAtMs: now,
      })
      .where(eq(insightReports.id, report.id));
    await scheduleInsights(state.db, now);
    await state.db.update(insightRuns).set({
      status: "running",
      leaseUntilMs: now - 1,
      leaseId: randomUUID(),
      attempts: 1,
    });
    await state.db
      .update(organizationMemberships)
      .set({ status: "suspended" })
      .where(eq(organizationMemberships.userId, ownerId));
    await processNextInsight(state.db, now + 1);
    const [r] = await state.db.select().from(insightRuns);
    expect(r.status).toBe("failed");
    expect(state.ads).not.toHaveBeenCalled();
    const [s] = await state.db.select().from(insightReports);
    expect(s.nextRunAtMs).toBeNull();
    expect(s.scheduleError).toContain("paused");
  });
  it("exports a repeatable PDF with chart and detail pages from a saved result", async () => {
    const { run } = await completed();
    const full = (
      await state.db
        .select()
        .from(insightRuns)
        .where(eq(insightRuns.id, run.id))
    )[0];
    const a = await insightPdf(full),
      b = await insightPdf(full);
    expect(a.subarray(0, 5).toString()).toBe("%PDF-");
    expect(a.length).toBeGreaterThan(15000);
    expect(a.equals(b)).toBe(true);
    if (process.env.INSIGHT_PDF_QA)
      writeFileSync(process.env.INSIGHT_PDF_QA, a);
  });
  it("retries delivery with the same recipient snapshot and idempotency key, and records success", async () => {
    const { run } = await completed(true);
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(new Response("", { status: 503 }))
      .mockResolvedValueOnce(Response.json({ id: "sent-id" }));
    vi.stubGlobal("fetch", fetcher);
    await deliverNextInsight(state.db, now);
    await deliverNextInsight(state.db, now + 120000);
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(fetcher.mock.calls[0][1].body).toBe(fetcher.mock.calls[1][1].body);
    expect(fetcher.mock.calls[0][1].headers["Idempotency-Key"]).toBe(
      `evokeloop-insight/${run.id}`
    );
    const row = await owner.runDetail({ organizationId: org, id: run.id });
    expect(row.deliveryState).toBe("sent");
    expect(row).not.toHaveProperty("deliveryPayload");
  });
  it("does not email a removed recipient, and reports missing email configuration", async () => {
    const { run } = await completed(true);
    const fetcher = vi.fn();
    vi.stubGlobal("fetch", fetcher);
    await state.db
      .update(organizationMemberships)
      .set({ status: "suspended" })
      .where(eq(organizationMemberships.userId, ownerId));
    await deliverNextInsight(state.db, now);
    expect(fetcher).not.toHaveBeenCalled();
    const [r] = await state.db.select().from(insightRuns);
    expect(r.deliveryState).toBe("failed");
    await state.db
      .update(organizationMemberships)
      .set({ status: "active" })
      .where(eq(organizationMemberships.userId, ownerId));
    vi.stubEnv("CONTACT_RESEND_API_KEY", "");
    await expect(saved(true)).rejects.toThrow("not configured");
  });
  it("pauses disconnected schedules and cancels queued notifications without a new source read", async () => {
    const report = await saved(true);
    await state.db
      .update(insightReports)
      .set({
        config: {
          ...report.config,
          schedule: { ...report.config.schedule, enabled: true },
        },
        nextRunAtMs: now,
      })
      .where(eq(insightReports.id, report.id));
    await scheduleInsights(state.db, now);
    await state.db
      .update(channelConnections)
      .set({ status: "disconnected" })
      .where(eq(channelConnections.id, adsId));
    await owner.pause({ organizationId: org, id: report.id, revision: 1 });
    await processNextInsight(state.db, now);
    const [run] = await state.db.select().from(insightRuns);
    expect(run.status).toBe("cancelled");
    expect(run.deliveryState).toBe("disabled");
    expect(state.ads).not.toHaveBeenCalled();
    expect(
      (await owner.get({ organizationId: org, id: report.id })).nextRunAtMs
    ).toBeNull();
    await state.db
      .update(channelConnections)
      .set({ status: "connected" })
      .where(eq(channelConnections.id, adsId));
  });
  it("keeps revisions stable for unchanged settings and retains dashboard data while refreshing", async () => {
    const { report, run } = await completed();
    expect(
      (
        await owner.save({
          organizationId: org,
          id: report.id,
          revision: 1,
          config: report.config,
        })
      ).revision
    ).toBe(1);
    await state.db.insert(insightRuns).values({
      id: randomUUID(),
      reportId: report.id,
      organizationId: org,
      actorUserId: ownerId,
      revision: 1,
      config: report.config,
      trigger: "manual",
      createdAtMs: Date.now() + 1000,
    });
    const [data] = await owner.dashboardData({
      organizationId: org,
      reportIds: [report.id],
    });
    expect(data.latest?.status).toBe("queued");
    expect(data.snapshot?.id).toBe(run.id);
  });
  it("saves private independent widgets, enforces revisions, and survives source archival", async () => {
    const { report } = await completed();
    const layout = {
      name: "My KPI view",
      surface: "measure" as const,
      widgets: [
        {
          id: randomUUID(),
          reportId: report.id,
          kind: "kpi" as const,
          connectionId: adsId,
          metric: "roas" as const,
          size: "small" as const,
          height: "standard" as const,
        },
      ],
    };
    const savedLayout = await reviewer.saveDashboard({
      organizationId: org,
      layout,
    });
    expect(
      await owner.dashboards({ organizationId: org, surface: "measure" })
    ).toEqual([]);
    expect(
      (
        await reviewer.dashboards({ organizationId: org, surface: "measure" })
      )[0].widgets
    ).toEqual(savedLayout.widgets);
    expect(savedLayout.widgets[0].reportId).not.toBe(report.id);
    await expect(
      owner.saveDashboard({
        organizationId: org,
        id: savedLayout.id,
        revision: 1,
        layout,
      })
    ).rejects.toMatchObject({ code: "CONFLICT" });
    await expect(
      reviewer.saveDashboard({
        organizationId: org,
        layout: {
          ...layout,
          widgets: [{ ...layout.widgets[0], connectionId: foreignId }],
        },
      })
    ).rejects.toThrow("no longer matches");
    const rows = await reviewer.dashboardData({
      organizationId: org,
      reportIds: [savedLayout.widgets[0].reportId],
    });
    expect(rows[0].latest?.result?.accounts).toHaveLength(2);
    await owner.archive({
      organizationId: org,
      id: report.id,
      revision: report.revision,
    });
    expect(
      await reviewer.dashboardData({
        organizationId: org,
        reportIds: [savedLayout.widgets[0].reportId],
      })
    ).toHaveLength(1);
  });
  it("edits a widget's period and components without touching its source, siblings, or email delivery", async () => {
    const { report } = await completed(true);
    const widget = (id = randomUUID()) => ({
      id,
      reportId: report.id,
      kind: "report" as const,
      connectionId: null,
      metric: "spend" as const,
      size: "medium" as const,
      height: "standard" as const,
      components: ["summary", "metrics"] as (
        | "summary"
        | "metrics"
        | "trends"
      )[],
    });
    const layout = await owner.saveDashboard({
      organizationId: org,
      layout: {
        name: "Independent",
        surface: "measure",
        widgets: [widget(), widget()],
      },
    });
    expect(new Set(layout.widgets.map(w => w.reportId)).size).toBe(2);
    const [before] = await owner.dashboardData({
      organizationId: org,
      reportIds: [layout.widgets[0].reportId],
    });
    expect(before.report.config.delivery.email).toBe(false);
    const updated = await owner.saveDashboard({
      organizationId: org,
      id: layout.id,
      revision: 1,
      layout: {
        ...layout,
        widgets: layout.widgets.map((w, i) =>
          i
            ? w
            : {
                ...w,
                title: "Monthly ROI",
                height: "tall",
                components: ["trends"],
                appearance: { palette: "midnight" },
              }
        ),
      },
      widgetEdits: [
        {
          widgetId: layout.widgets[0].id,
          revision: 1,
          config: {
            ...independentWidgetConfig(report.config),
            period: "days",
            rollingDays: 21,
          },
        },
      ],
    });
    expect(updated.widgets[0]).toMatchObject({
      title: "Monthly ROI",
      components: ["trends"],
      appearance: { palette: "midnight" },
    });
    const [changed, sibling] = await Promise.all(
      layout.widgets.map(
        async w =>
          (
            await owner.dashboardData({
              organizationId: org,
              reportIds: [w.reportId],
            })
          )[0]
      )
    );
    expect(changed.report.config).toMatchObject({
      period: "days",
      rollingDays: 21,
      delivery: { email: false },
    });
    expect(changed.latest?.status).toBe("queued");
    expect(changed.snapshot?.result).toEqual(before.snapshot?.result);
    expect(sibling.report.revision).toBe(1);
    expect(sibling.report.config.period).toBe("7");
    expect(await owner.get({ organizationId: org, id: report.id })).toEqual(
      report
    );
    expect(await owner.list({ organizationId: org })).toHaveLength(1);
    await processNextInsight(state.db);
    const [after] = await owner.dashboardData({
      organizationId: org,
      reportIds: [changed.report.id],
    });
    const range = after.latest!.result!.range;
    expect(
      (Date.parse(range.until) - Date.parse(range.since)) / 86400000 + 1
    ).toBe(21);
    expect(
      (await owner.runDetail({ organizationId: org, id: after.latest!.id }))
        .deliveryState
    ).toBe("disabled");
    await expect(
      owner.saveDashboard({
        organizationId: org,
        id: layout.id,
        revision: 1,
        layout: updated,
      })
    ).rejects.toMatchObject({ code: "CONFLICT" });
  });
  it("keeps widget runs and settings private while allowing reviewers to refresh their own data", async () => {
    const report = await saved();
    const layout = await reviewer.saveDashboard({
      organizationId: org,
      layout: {
        name: "My metrics",
        surface: "main",
        widgets: [
          {
            id: randomUUID(),
            reportId: report.id,
            kind: "kpi",
            connectionId: adsId,
            metric: "roas",
            size: "small",
            height: "compact",
          },
        ],
      },
    });
    const id = layout.widgets[0].reportId;
    const [data] = await reviewer.dashboardData({
      organizationId: org,
      reportIds: [id],
    });
    expect(
      await owner.dashboardData({ organizationId: org, reportIds: [id] })
    ).toEqual([]);
    await expect(
      owner.refreshWidget({ organizationId: org, id, revision: 1 })
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(
      owner.runDetail({ organizationId: org, id: data.latest!.id })
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    await processNextInsight(state.db);
    expect(
      (
        await reviewer.dashboardData({ organizationId: org, reportIds: [id] })
      )[0].latest?.status
    ).toBe("completed");
    await expect(
      owner.pdf({ organizationId: org, id: data.latest!.id })
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(
      reviewer.refreshWidget({ organizationId: other, id, revision: 1 })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    // Report changes do not flow back into the private widget.
    await owner.save({
      organizationId: org,
      id: report.id,
      revision: 1,
      config: { ...report.config, period: "90" },
    });
    expect(
      (
        await reviewer.dashboardData({ organizationId: org, reportIds: [id] })
      )[0].report.config.period
    ).toBe("7");
  });
  it("stops a removed widget's jobs and schedule without changing the original report", async () => {
    const report = await saved();
    const config = independentWidgetConfig(report.config);
    config.schedule.enabled = true;
    const widgetId = randomUUID();
    const layout = await reviewer.saveDashboard({
      organizationId: org,
      layout: {
        name: "Scheduled",
        surface: "measure",
        widgets: [
          {
            id: widgetId,
            reportId: report.id,
            kind: "report",
            connectionId: null,
            metric: "spend",
            size: "half",
            height: "standard",
          },
        ],
      },
      widgetEdits: [{ widgetId, config }],
    });
    const [before] = await reviewer.dashboardData({
      organizationId: org,
      reportIds: [layout.widgets[0].reportId],
    });
    expect(before.report.nextRunAtMs).toBeTypeOf("number");
    await reviewer.deleteDashboard({ organizationId: org, id: layout.id });
    await processNextInsight(state.db);
    expect(state.ads).not.toHaveBeenCalled();
    const [entity] = await state.db
      .select()
      .from(insightReports)
      .where(eq(insightReports.id, layout.widgets[0].reportId));
    expect(entity.archived).toBe(1);
    expect(entity.nextRunAtMs).toBeNull();
    expect(await owner.get({ organizationId: org, id: report.id })).toEqual(
      report
    );
  });
  it("migrates existing tiles to separate entities and preserves their snapshots and layout", async () => {
    const { report, run } = await completed(true);
    const original = [
      {
        id: randomUUID(),
        reportId: report.id,
        kind: "trend" as const,
        connectionId: adsId,
        metric: "roas" as const,
        size: "medium" as const,
        height: "tall" as const,
      },
    ];
    const [layout] = await state.db
      .insert(insightDashboards)
      .values({
        id: randomUUID(),
        organizationId: org,
        userId: reviewerId,
        surface: "measure",
        name: "Existing layout",
        widgets: original,
        createdAtMs: now,
        updatedAtMs: now,
      })
      .returning();
    const migration = readFileSync(
      "drizzle/postgres/0017_independent_dashboard_widgets.sql",
      "utf8"
    );
    await engine.exec(migration.slice(migration.indexOf("DO $$")));
    const [migrated] = await reviewer.dashboards({
      organizationId: org,
      surface: "measure",
    });
    expect(migrated.id).toBe(layout.id);
    expect(migrated.revision).toBe(2);
    expect(migrated.widgets[0]).toEqual({
      ...original[0],
      reportId: expect.any(String),
    });
    expect(migrated.widgets[0].reportId).not.toBe(report.id);
    const [tile] = await reviewer.dashboardData({
      organizationId: org,
      reportIds: [migrated.widgets[0].reportId],
    });
    expect(tile.snapshot?.result).toEqual(run.result);
    expect(tile.report.config.delivery.email).toBe(false);
    expect(tile.report.widgetOwnerUserId).toBe(reviewerId);
    expect(await owner.get({ organizationId: org, id: report.id })).toEqual(
      report
    );
    // Migration replay does not clone an already detached entity.
    await engine.exec(migration.slice(migration.indexOf("DO $$")));
    expect(
      (
        await reviewer.dashboards({ organizationId: org, surface: "measure" })
      )[0].widgets[0].reportId
    ).toBe(tile.report.id);
  });
});

describe("Google Ads reports through the existing Insights pipeline", () => {
  const googleConfig = () => ({
    ...defaultInsightConfig(),
    connectionIds: [googleId],
    metrics: [
      "spend",
      "clicks",
      "conversions",
      "purchaseValue",
      "purchases",
      "roas",
    ] as import("../shared/insights").InsightMetric[],
  });
  it("includes connected Google sources, enforces workspace ownership and rejects Meta-only metrics", async () => {
    expect(
      (await owner.options({ organizationId: org })).connections.some(
        c => c.id === googleId && c.channel === "google_ads"
      )
    ).toBe(true);
    await expect(
      owner.save({
        organizationId: org,
        config: { ...googleConfig(), connectionIds: [foreignGoogleId] },
      })
    ).rejects.toThrow("belonging to this workspace");
    await expect(
      owner.save({
        organizationId: org,
        config: {
          ...googleConfig(),
          metrics: ["linkClicks"],
          chartMetric: "linkClicks",
        },
      })
    ).rejects.toThrow("every selected channel");
    expect(state.google).not.toHaveBeenCalled();
  });
  it("runs Google reports with comparisons, PDFs and independent dashboard metrics", async () => {
    const report = await owner.save({
      organizationId: org,
      config: googleConfig(),
    });
    const queued = await owner.run({
      organizationId: org,
      id: report.id,
      revision: 1,
    });
    await processNextInsight(state.db);
    const run = await owner.runDetail({ organizationId: org, id: queued.id });
    expect(run.status).toBe("completed");
    expect(run.result!.accounts[0]).toMatchObject({
      channel: "google_ads",
      currency: "EUR",
      timezone: "Europe/Paris",
    });
    expect(
      run.result!.accounts[0].metrics.find(m => m.key === "purchases")
    ).toMatchObject({ value: 2.5, previous: 2.5, change: 0 });
    expect(run.result!.accounts[0].details[0].name).toContain(
      "PERFORMANCE MAX"
    );
    expect(state.ads).not.toHaveBeenCalled();
    expect(state.social).not.toHaveBeenCalled();
    expect(state.google).toHaveBeenCalledTimes(2);
    expect(state.google.mock.calls[0].slice(1, 3)).toEqual([org, googleId]);
    const [stored] = await state.db
      .select()
      .from(insightRuns)
      .where(eq(insightRuns.id, queued.id));
    const pdf = await insightPdf(stored);
    expect(pdf.subarray(0, 5).toString()).toBe("%PDF-");
    if (process.env.GOOGLE_INSIGHT_PDF_QA)
      writeFileSync(process.env.GOOGLE_INSIGHT_PDF_QA, pdf);
    const dashboard = await owner.saveDashboard({
      organizationId: org,
      layout: {
        name: "Google overview",
        surface: "measure",
        widgets: [
          {
            id: randomUUID(),
            reportId: report.id,
            kind: "kpi",
            connectionId: googleId,
            metric: "spend",
            size: "medium",
            height: "standard",
          },
        ],
      },
    });
    expect(dashboard.widgets[0].reportId).not.toBe(report.id);
    expect(dashboard.widgets[0].metric).toBe("spend");
  });
  it("keeps current Google results when comparison fails and isolates failures in mixed reports", async () => {
    state.google
      .mockResolvedValueOnce(googleData())
      .mockRejectedValueOnce(new Error("private upstream data"));
    const report = await owner.save({
      organizationId: org,
      config: { ...googleConfig(), connectionIds: [googleId, adsId] },
    });
    const queued = await owner.run({
      organizationId: org,
      id: report.id,
      revision: 1,
    });
    await processNextInsight(state.db);
    const run = await owner.runDetail({ organizationId: org, id: queued.id });
    expect(run.status).toBe("partial");
    expect(run.result!.accounts[0].metrics[0]).toMatchObject({
      value: 250,
      previous: null,
    });
    expect(run.result!.accounts[1]).toMatchObject({
      channel: "meta_ads",
      currency: "USD",
      status: "ready",
    });
    expect(JSON.stringify(run)).not.toContain("private upstream");
  });
});
