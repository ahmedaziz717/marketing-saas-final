import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  collection: vi.fn(),
  request: vi.fn(),
  connection: vi.fn(),
}));
vi.mock("./lib/channelConnections", () => ({
  connectionToken: () => "test-token",
  getConnection: mocks.connection,
}));
vi.mock("./lib/channelGraph", async original => ({
  ...(await original<typeof import("./lib/channelGraph")>()),
  graphCollection: mocks.collection,
  graphRequest: mocks.request,
}));
vi.mock("./lib/optimizationFlags", () => ({ requireOptimization: vi.fn() }));
import { ChannelGraphError } from "./lib/channelGraph";
import {
  creativeCopy,
  liveMetaCopyReport,
  compareLiveCopy,
} from "./lib/liveMetaCopy";
import { optimizationStep } from "./lib/optimizationWorkflow";
import { validateWorkflowConnections } from "./lib/workflowApps";
import { workflowNodeCredits } from "./lib/creativeWorkflows";
import { copyEvidenceSchema } from "../shared/copyEvidence";
import {
  newWorkflowNode,
  workflowGraphProblem,
  workflowRunProblem,
  isGenerationNode,
} from "../shared/creativeWorkflow";
import { copyEvidenceWorkflowTemplate } from "../shared/workflowPerformanceInputs";
const connection = {
  id: "00000000-0000-4000-8000-000000000099",
  accountId: "act_123",
  name: "Chosen account",
  status: "connected",
  details: { currency: "USD", timezone: "America/Los_Angeles" },
} as any;
const range = { since: "2026-10-01", until: "2026-10-07" };
const insight = (id = "11", spend = "100") => ({
  ad_id: id,
  ad_name: `Ad ${id}`,
  campaign_id: "21",
  adset_id: "31",
  spend,
  impressions: "2000",
  clicks: "100",
  inline_link_clicks: "80",
  actions: [
    { action_type: "offsite_conversion.fb_pixel_purchase", value: "10" },
    { action_type: "omni_purchase", value: "20" },
  ],
  action_values: [
    { action_type: "offsite_conversion.fb_pixel_purchase", value: "300" },
    { action_type: "omni_purchase", value: "600" },
  ],
});
beforeEach(() => {
  vi.resetAllMocks();
  mocks.collection.mockResolvedValue({ data: [insight()], truncated: false });
  mocks.request.mockImplementation(async (id: string) => ({
    id,
    account_id: "123",
    creative: {
      id: `4${id}`,
      title: "Shop now",
      body: "Learn how to pick a PC",
      object_story_spec: { link_data: { description: "Warranty included" } },
    },
  }));
  mocks.connection.mockResolvedValue(connection);
});
it("extracts actual copy without inventing image subheadlines and excludes ambiguous variants", () => {
  expect(
    creativeCopy({
      title: " Shop now ",
      object_story_spec: { link_data: { name: "Shop now" } },
    })
  ).toEqual({
    copy: { headline: ["Shop now"], primary_text: [], description: [] },
    ambiguous: false,
    warning: null,
  });
  expect(
    creativeCopy({
      asset_feed_spec: { titles: [{ text: "One" }, { text: "Two" }] },
    }).ambiguous
  ).toBe(true);
  expect(
    creativeCopy({
      object_story_spec: {
        link_data: { child_attachments: [{ name: "One" }] },
      },
    }).ambiguous
  ).toBe(true);
  expect(creativeCopy({ body: "x".repeat(4001) }).warning).toMatch(/limit/);
});
it("fetches fresh selected-period ad totals and joins copy by ID without a status filter or action alias double count", async () => {
  const r = await liveMetaCopyReport(connection, range);
  expect(mocks.collection).toHaveBeenCalledWith(
    "act_123/insights",
    "test-token",
    expect.objectContaining({
      level: "ad",
      time_range: JSON.stringify(range),
      use_account_attribution_setting: "true",
      action_report_time: "conversion",
    }),
    5
  );
  expect(mocks.collection.mock.calls[0][2]).not.toHaveProperty("filtering");
  expect(mocks.request.mock.calls[0][0]).toBe("11");
  expect(mocks.request.mock.calls[0]).toHaveLength(3); // GET, no write body
  expect(r.ads[0]).toMatchObject({
    id: "11",
    creativeId: "411",
    metrics: { purchases: 10, purchaseValue: 300, roas: 3 },
  });
  expect(r.range).toEqual(range);
  expect(r.timezone).toBe("America/Los_Angeles");
});
it("keeps missing purchases null and inaccessible creative performance visible", async () => {
  mocks.collection.mockResolvedValue({
    data: [{ ...insight(), actions: [], action_values: [] }],
    truncated: false,
  });
  mocks.request.mockRejectedValue(
    new ChannelGraphError("Unavailable", true, 100)
  );
  const r = await liveMetaCopyReport(connection, range);
  expect(r.ads[0].metrics).toMatchObject({
    spend: 100,
    purchases: null,
    purchaseValue: null,
    roas: null,
  });
  expect(r.coverage.missingCreativeAds).toBe(1);
  expect(r.ads[0].warning).toMatch(/excluded/);
});
it("propagates token, throttling and account mismatch errors rather than presenting them as empty results", async () => {
  for (const code of [190, 4, 613]) {
    mocks.request.mockRejectedValueOnce(
      new ChannelGraphError("Meta failed", false, code)
    );
    await expect(liveMetaCopyReport(connection, range)).rejects.toThrow(
      "Meta failed"
    );
  }
  mocks.request.mockResolvedValueOnce({ account_id: "999" });
  await expect(liveMetaCopyReport(connection, range)).rejects.toThrow(
    /outside/
  );
});
it("bounds inspection to 100 highest-spend returned ads and exposes partial coverage", async () => {
  mocks.collection.mockResolvedValue({
    data: Array.from({ length: 101 }, (_, i) =>
      insight(String(1000 + i), String(i + 1))
    ),
    truncated: false,
  });
  const r = await liveMetaCopyReport(connection, range);
  expect(r.ads).toHaveLength(100);
  expect(r.ads[0].id).toBe("1100");
  expect(r.coverage).toMatchObject({ truncated: true, insightsReturned: 101 });
  expect(mocks.request).toHaveBeenCalledTimes(100);
});
it("rejects duplicate insight rows rather than adding performance twice", async () => {
  mocks.collection.mockResolvedValue({
    data: [insight(), insight()],
    truncated: false,
  });
  await expect(liveMetaCopyReport(connection, range)).rejects.toThrow(
    /duplicate/
  );
  expect(mocks.request).not.toHaveBeenCalled();
});
async function evidence() {
  const r = await liveMetaCopyReport(connection, range);
  const first = r.ads[0];
  r.ads = [
    first,
    {
      ...first,
      id: "12",
      metrics: {
        ...first.metrics,
        spend: 300,
        purchases: 5,
        purchaseValue: 100,
      },
      copy: { ...first.copy, headline: ["Buy now"] },
    },
    {
      ...first,
      id: "13",
      metrics: {
        ...first.metrics,
        spend: 50,
        purchases: 10,
        purchaseValue: 500,
      },
      copy: { ...first.copy, headline: ["A warranty for peace of mind"] },
    },
  ];
  r.coverage.inspectedAds = r.coverage.insightsReturned = 3;
  return r;
}
it("uses weighted purchase efficiency and explicit rule matches with traceable source IDs", async () => {
  const result = compareLiveCopy(await evidence());
  const headline = result.fields[0];
  expect(headline.groups.find(g => g.label === "direct")).toMatchObject({
    spend: 400,
    purchases: 15,
    cpa: 400 / 15,
    roas: 1,
    sourceAdIds: ["11", "12"],
  });
  expect(headline.observedLeader).toBe("reassuring");
  expect(headline.classifications[0].evidence[0]).toContain("Shop now");
  expect(result.confidence).toBeNull();
  expect(headline.groups[0]).not.toHaveProperty("confidence");
  expect(
    compareLiveCopy(await evidence(), { objective: "roas" }).fields[0]
      .observedLeader
  ).toBe("reassuring");
});
it("does not declare a leader from partial, missing, tied or single-style evidence", async () => {
  const r = await evidence();
  r.coverage.truncated = true;
  expect(compareLiveCopy(r).fields[0].observedLeader).toBeNull();
  r.coverage.truncated = false;
  r.coverage.missingCreativeAds = 1;
  expect(compareLiveCopy(r).fields[0].observedLeader).toBeNull();
  r.coverage.missingCreativeAds = 0;
  r.ads = [
    r.ads[0],
    {
      ...r.ads[0],
      id: "14",
      copy: { ...r.ads[0].copy, headline: ["Warranty"] },
    },
  ];
  expect(compareLiveCopy(r).fields[0].observedLeader).toBeNull();
  r.ads.pop();
  expect(compareLiveCopy(r).fields[0].observedLeader).toBeNull();
});
it("keeps unclassified and multi-variant evidence visible without attributing their results to individual text", async () => {
  const r = await evidence();
  r.ads[0].copy.headline = ["An excellent PC"];
  r.ads[1].ambiguous = true;
  r.ads[2].metrics.purchases = null;
  const result = compareLiveCopy(r);
  expect(result.evidence.ads).toHaveLength(3);
  expect(result.fields[0]).toMatchObject({
    comparedAds: 2,
    excludedAds: 1,
    observedLeader: null,
  });
  expect(
    result.fields[0].groups.find(g => g.label === "Unclassified")?.eligible
  ).toBe(false);
  expect(
    result.fields[0].groups.find(g => g.label === "reassuring")?.cpa
  ).toBeNull();
});
it("validates all four typed connections and rejects trigger metadata and scheduling totals", () => {
  const graph = copyEvidenceWorkflowTemplate();
  expect(workflowGraphProblem(graph)).toBeNull();
  expect(graph.nodes.map(n => n.type)).toEqual([
    "app_input",
    "meta_copy_performance",
    "compare_copy_styles",
    "output",
  ]);
  expect(graph.nodes.some(n => isGenerationNode(n.type))).toBe(false);
  graph.nodes[0] = newWorkflowNode("start_trigger", "account_dates");
  expect(workflowRunProblem(graph)).toMatch(/trigger metadata/i);
  expect(
    copyEvidenceSchema.safeParse({ source: "live_meta_scheduling" }).success
  ).toBe(false);
});
it("accepts dynamic account selection at preflight and quotes every step at zero credits", async () => {
  const graph = copyEvidenceWorkflowTemplate();
  await expect(
    validateWorkflowConnections({} as any, 7, graph)
  ).resolves.toBeUndefined();
  expect(mocks.connection).not.toHaveBeenCalled(); // The input resolver and fetch check the selected tenant account.
  for (const node of graph.nodes)
    expect(await workflowNodeCredits({} as any, node, 7)).toBe(0);
});
it("checks tenant connection, connected status and exact evidence contracts at execution", async () => {
  const graph = copyEvidenceWorkflowTemplate(),
    run = { organizationId: 7, graph, steps: {} } as any;
  const request = {
    type: "data",
    name: "Selection",
    data: {
      source: "meta_performance_request",
      connectionId: connection.id,
      range,
    },
  } as any;
  const result = await optimizationStep({} as any, run, graph.nodes[1], [
    request,
  ]);
  expect(mocks.connection).toHaveBeenCalledWith(
    {},
    7,
    connection.id,
    "meta_ads"
  );
  expect(result?.status).toBe("completed");
  await expect(
    optimizationStep({} as any, run, graph.nodes[1], [
      { ...request, data: { kind: "manual" } },
    ])
  ).rejects.toThrow(/Trigger metadata/);
  await expect(
    optimizationStep({} as any, run, graph.nodes[2], [request])
  ).rejects.toThrow(/individual ads/);
  mocks.connection.mockResolvedValueOnce({
    ...connection,
    status: "disconnected",
  });
  await expect(
    optimizationStep({} as any, run, graph.nodes[1], [request])
  ).rejects.toThrow(/Reconnect/);
  const r = await evidence();
  mocks.connection.mockResolvedValueOnce({ ...connection, accountId: "999" });
  await expect(
    optimizationStep({} as any, run, graph.nodes[2], [
      { type: "data", name: "Evidence", data: r },
    ])
  ).rejects.toThrow(/does not match/);
});
