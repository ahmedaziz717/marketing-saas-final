import { randomUUID } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { and, eq } from "drizzle-orm";
import { beforeAll, afterAll, expect, it, vi } from "vitest";
const f = vi.hoisted(() => ({ db: null as any, read: vi.fn() }));
vi.mock("./db", () => ({ getDb: async () => f.db }));
vi.mock("./lib/googleAdsApi", async original => ({
  ...(await original<any>()),
  googleAdsRows: (...args: any[]) => f.read(...args),
}));
import {
  users,
  organizations,
  organizationMemberships,
} from "../drizzle/schema";
import { channelConnections } from "../drizzle/channelSchema";
import {
  optimizationSyncs,
  optimizationRecords,
} from "../drizzle/optimizationSchema";
import { encryptToken } from "./lib/secureToken";
import { queueHistory, processHistoryPage } from "./lib/optimizationIngestion";
import {
  analyzeHistory,
  classifyHistoryBatch,
  saveClassification,
} from "./lib/optimizationAnalysis";
import { analysisQuerySchema } from "../shared/optimization";
import {
  optimizationStudioGraph,
  defaultOptimizationSettings,
  readOptimizationStudio,
} from "../shared/optimizationStudio";
import { optimizationStudioSchema } from "../shared/optimizationStudioSchema";
import { newWorkflowNode } from "../shared/creativeWorkflow";
import { appFieldSchema } from "../shared/workflowInputs";
import { resolveWorkflowInputs } from "./lib/workflowInputs";
import { validateWorkflowConnections } from "./lib/workflowApps";
import { getWorkflowConnection } from "./lib/workflowConnections";
let engine: PGlite, org: number, owner: number;
const cid = randomUUID(),
  range = { since: "2026-01-01", until: "2026-01-07" };
beforeAll(async () => {
  for (const [key, value] of Object.entries({
    GOOGLE_ADS_CLIENT_ID: "test-web",
    GOOGLE_ADS_CLIENT_SECRET: "test-secret",
    APP_ORIGIN: "https://app.example.test",
    INTEGRATION_TOKEN_ENCRYPTION_SECRET: "test-encryption",
    OPTIMIZATION_WORKER_ENABLED: "true",
    OPTIMIZATION_INTELLIGENCE_ENABLED: "true",
  }))
    vi.stubEnv(key, value);
  engine = new PGlite();
  for (const file of readdirSync("drizzle/postgres")
    .filter(f => f.endsWith(".sql"))
    .sort())
    await engine.exec(readFileSync(`drizzle/postgres/${file}`, "utf8"));
  f.db = drizzle(engine);
  const [user] = await f.db
    .insert(users)
    .values({ openId: "google-evidence" })
    .returning();
  owner = user.id;
  const [workspace] = await f.db
    .insert(organizations)
    .values({
      name: "Google evidence",
      slug: "google-evidence",
      createdByUserId: owner,
      createdAtMs: 1,
    })
    .returning();
  org = workspace.id;
  vi.stubEnv("OPTIMIZATION_TENANT_IDS", String(org));
  await f.db.insert(organizationMemberships).values({
    organizationId: org,
    userId: owner,
    role: "owner",
    status: "active",
    createdAtMs: 1,
  });
  await f.db.insert(channelConnections).values({
    id: cid,
    organizationId: org,
    channel: "google_ads",
    accountId: "2222222222",
    name: "Google evidence",
    status: "connected",
    credentials: encryptToken(
      JSON.stringify({
        provider: "google_ads",
        clientId: "test-web",
        accessToken: "secret-access",
        refreshToken: "secret-refresh",
        scope: "https://www.googleapis.com/auth/adwords",
        expiresAtMs: Date.now() + 3600000,
      })
    ),
    details: {
      currency: "USD",
      timezone: "America/Chicago",
      capabilities: ["report"],
    },
    connectedByUserId: owner,
    verifiedAtMs: 1,
    updatedAtMs: 1,
  });
  f.read.mockImplementation(async (_token, _customer, q: string) => {
    const campaign = {
        id: "11",
        name: "Example",
        biddingStrategyType: "MAXIMIZE_CONVERSION_VALUE",
      },
      campaignBudget = { amountMicros: "20000000" },
      adGroup = { id: "9", name: "Search group", status: "ENABLED" },
      assetGroup = { id: "7", name: "PMax group", status: "ENABLED" },
      adGroupAd = {
        status: "ENABLED",
        ad: {
          id: "101",
          type: "RESPONSIVE_SEARCH_AD",
          responsiveSearchAd: {
            headlines: [{ text: "Save on examples" }],
            descriptions: [{ text: "Buy today" }],
          },
        },
      };
    if (q.includes("metrics.")) {
      const pmax = q.includes("FROM asset_group"),
        purchase = q.includes("conversion_action_category");
      return [
        {
          campaign,
          ...(pmax ? { assetGroup } : { adGroup, adGroupAd }),
          segments: {
            date: "2026-01-02",
            ...(q.includes("segments.device") ? { device: "DESKTOP" } : {}),
          },
          metrics: purchase
            ? {
                conversions: pmax ? 2.5 : 0.5,
                conversionsValue: pmax ? 250 : 50,
              }
            : {
                costMicros: pmax ? "20000000" : "10000000",
                impressions: "1000",
                clicks: "100",
                conversions: 4,
                conversionsValue: 400,
              },
        },
      ];
    }
    if (q.includes("FROM customer"))
      return [
        {
          customer: {
            id: "2222222222",
            descriptiveName: "Google evidence",
            currencyCode: "USD",
            timeZone: "America/Chicago",
          },
        },
      ];
    if (q.includes("FROM asset_group_asset"))
      return [
        {
          assetGroup,
          asset: { textAsset: { text: "Discover premium quality" } },
        },
      ];
    if (q.includes("FROM ad_group_ad"))
      return [{ campaign, adGroup, adGroupAd }];
    if (q.includes("FROM ad_group"))
      return [{ campaign, campaignBudget, adGroup }];
    if (q.includes("FROM asset_group"))
      return [{ campaign, campaignBudget, assetGroup }];
    return [{ campaign, campaignBudget }];
  });
});
afterAll(async () => {
  await engine.close();
  vi.unstubAllEnvs();
});
async function sync() {
  const job = await queueHistory(f.db, org, owner, cid, false, range);
  for (let i = 0; i < job.tasks.length; i++) {
    await f.db
      .update(optimizationSyncs)
      .set({ nextAtMs: 0 })
      .where(eq(optimizationSyncs.id, job.id));
    await processHistoryPage(f.db, job.id);
  }
  return (
    await f.db
      .select()
      .from(optimizationSyncs)
      .where(eq(optimizationSyncs.id, job.id))
  )[0];
}
it("ingests, checkpoints and analyzes Google ads and PMax groups without duplicating spend", async () => {
  const job = await sync();
  expect(job.status).toBe("completed");
  expect(job.checkpoint.rows).toBeGreaterThan(0);
  await classifyHistoryBatch(f.db, org, cid);
  const report = await analyzeHistory(
    f.db,
    org,
    cid,
    analysisQuerySchema.parse({ range, dimensions: ["channel"] })
  );
  expect(report.account.channel).toBe("google_ads");
  expect(report.summary).toMatchObject({
    spend: 30,
    purchases: 3,
    purchaseValue: 300,
    roas: 10,
    adCount: 2,
  });
  expect(report.sourceAds.map(a => a.id).sort()).toEqual([
    "g_ad_9_101",
    "g_asset_group_7",
  ]);
  expect(report.groups[0].labels).toEqual(["google_ads"]);
  expect(report.coverage.incomplete).toBe(false);
  expect(report.caveats.join(" ")).toContain(
    "cannot establish the performance of individual assets"
  );
  const hours = await analyzeHistory(
    f.db,
    org,
    cid,
    analysisQuerySchema.parse({ range, grain: "hourly", dimensions: ["hour"] })
  );
  expect(hours.groups[0].labels).toEqual(["00"]);
  const rows = await f.db
    .select()
    .from(optimizationRecords)
    .where(
      and(
        eq(optimizationRecords.connectionId, cid),
        eq(optimizationRecords.kind, "insight")
      )
    );
  expect(
    rows.every((r: any) => r.provenance.attribution.includes("PURCHASE"))
  ).toBe(true);
  expect(JSON.stringify(rows)).not.toContain("secret-access");
});
it("replaces overlapping slices idempotently and preserves reviewed classifications", async () => {
  await saveClassification(
    f.db,
    org,
    cid,
    "g_ad_9_101",
    {
      dimension: "theme",
      labels: [
        {
          id: "reviewed",
          label: "Reviewed",
          confidence: 1,
          evidence: "Reviewed from the ad",
        },
      ],
    },
    "human",
    owner
  );
  await sync();
  await classifyHistoryBatch(f.db, org, cid);
  const report = await analyzeHistory(
    f.db,
    org,
    cid,
    analysisQuerySchema.parse({ range, dimensions: ["theme"] })
  );
  expect(report.summary.spend).toBe(30);
  expect(
    report.sourceAds.find(a => a.id === "g_ad_9_101")?.classifications.theme
      ?.source
  ).toBe("human");
  await expect(
    analyzeHistory(f.db, org + 1000, cid, analysisQuerySchema.parse({ range }))
  ).rejects.toMatchObject({ code: "NOT_FOUND" });
});
it("round trips a Google Optimization Studio graph with matching engines and a history step", () => {
  const graph = optimizationStudioGraph(
    {
      ...defaultOptimizationSettings(),
      channel: "google_ads",
      connectionId: cid,
      refreshHistory: true,
    },
    optimizationStudioSchema.parse({ version: 1 })
  );
  expect(
    graph.nodes
      .filter(n => n.config.optimizer)
      .every(n => n.config.optimizer?.channel === "google_ads")
  ).toBe(true);
  expect(readOptimizationStudio(graph)?.settings.channel).toBe("google_ads");
});

it("resolves typed Google workflow account fields and enforces workspace and provider boundaries", async () => {
  const account = newWorkflowNode("app_input", "account");
  account.config.field = appFieldSchema.parse({
    kind: "connection",
    connectionChannel: "google_ads",
    required: true,
  });
  account.config.fieldValue = cid;
  const report = newWorkflowNode("google_report", "report");
  const graph = {
    nodes: [account, report],
    edges: [
      {
        id: "destination",
        source: account.id,
        target: report.id,
        port: "destination",
      },
    ],
  };
  const resolved = await resolveWorkflowInputs(f.db, org, graph);
  expect(resolved.nodes[1].config.connectionId).toBe(cid);
  expect(graph.nodes[1].config.connectionId).toBeUndefined();
  await expect(
    validateWorkflowConnections(f.db, org, resolved)
  ).resolves.toBeUndefined();
  await expect(
    getWorkflowConnection(f.db, org + 999, cid, "google_ads")
  ).rejects.toThrow(/workspace/);
  await expect(
    getWorkflowConnection(f.db, org, cid, "meta_ads")
  ).rejects.toThrow();
  await expect(
    resolveWorkflowInputs(f.db, org, {
      ...graph,
      nodes: [account, newWorkflowNode("meta_ad", "report")],
    })
  ).rejects.toThrow(/matching channel/);
  await f.db
    .update(channelConnections)
    .set({ status: "disconnected" })
    .where(eq(channelConnections.id, cid));
  await expect(
    validateWorkflowConnections(f.db, org, resolved)
  ).rejects.toThrow(/Reconnect/);
  await f.db
    .update(channelConnections)
    .set({ status: "connected" })
    .where(eq(channelConnections.id, cid));
});
