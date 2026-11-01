import { beforeEach, expect, it, vi } from "vitest";
const api = vi.hoisted(() => ({
  connection: vi.fn(),
  report: vi.fn(),
  inventory: vi.fn(),
}));
vi.mock("./lib/workflowConnections", () => ({
  getWorkflowConnection: api.connection,
}));
vi.mock("./lib/googleAdsReports", () => ({ googleAdsReport: api.report }));
vi.mock("./lib/googleCampaigns", () => ({
  googleCampaignInventory: api.inventory,
}));
vi.mock("./lib/optimizationWorkflow", () => ({
  optimizationStep: async () => null,
}));
import { executeWorkflowBusinessStep } from "./lib/workflowBusinessSteps";
import { newWorkflowNode } from "../shared/creativeWorkflow";
import { availableWorkflowNode } from "../shared/workflowChannels";
const db = {} as any;
const run = {
  organizationId: 42,
  steps: {},
  graph: { nodes: [], edges: [] },
} as any;
beforeEach(() => {
  vi.clearAllMocks();
  api.connection.mockResolvedValue({
    id: "google",
    channel: "google_ads",
    status: "connected",
    name: "Google account",
    accountId: "123",
    details: { timezone: "America/New_York" },
  });
  api.report.mockResolvedValue({
    currency: "USD",
    timezone: "America/New_York",
    attribution: "Google conversion attribution",
    summary: { spend: 100 },
    campaigns: [{ id: "10", values: { spend: 25, roas: null } }],
    warnings: [],
  });
  api.inventory.mockResolvedValue({
    campaigns: [
      { campaign: { id: "10", advertisingChannelType: "PERFORMANCE_MAX" } },
    ],
    groups: [{ assetGroup: { id: "20" } }],
    assets: [{ assetGroup: { id: "20" }, asset: { id: "30" } }],
    ads: [],
    limited: false,
  });
});
it("uses the Google registry to discover relevant operations and shared analysis upon connection", () => {
  expect(availableWorkflowNode("google_report", [], "measure")).toBe(false);
  expect(availableWorkflowNode("google_report", ["meta_ads"], "measure")).toBe(
    false
  );
  expect(
    availableWorkflowNode("google_report", ["google_ads"], "measure")
  ).toBe(true);
  expect(
    availableWorkflowNode("google_inventory", ["google_ads"], "activate")
  ).toBe(true);
  expect(
    availableWorkflowNode("classify_history", ["google_ads"], "optimize")
  ).toBe(true);
  expect(availableWorkflowNode("google_report", ["google_ads"], "create")).toBe(
    false
  );
});
it("runs Google reporting with active campaigns by default and preserves currency, attribution and unavailable values", async () => {
  const node = newWorkflowNode("google_report", "report");
  node.config = {
    ...node.config,
    connectionId: "google",
    campaignId: "10",
    datePreset: "custom",
    range: { since: "2026-10-01", until: "2026-10-07" },
    googleDetail: "asset_group",
  };
  const result = await executeWorkflowBusinessStep(db, run, node, []);
  expect(api.connection).toHaveBeenCalledWith(db, 42, "google", "google_ads");
  expect(api.report).toHaveBeenCalledWith(
    db,
    42,
    "google",
    node.config.range,
    false,
    "asset_group"
  );
  expect(result?.outputs?.[0]).toMatchObject({
    type: "data",
    data: {
      channel: "google_ads",
      accountId: "123",
      currency: "USD",
      attribution: "Google conversion attribution",
      metrics: { spend: 25, roas: null },
      incomplete: false,
    },
  });
  node.config.campaignId = "missing";
  expect(
    (await executeWorkflowBusinessStep(db, run, node, []))?.outputs?.[0]
  ).toMatchObject({ data: { incomplete: true, metrics: {} } });
});
it("passes explicit inactive and previous-period choices without changing native asset-group structure", async () => {
  const node = newWorkflowNode("google_report", "report");
  node.config = {
    ...node.config,
    connectionId: "google",
    includeInactiveCampaigns: true,
    datePreset: "custom",
    previousPeriod: true,
    range: { since: "2026-10-08", until: "2026-10-14" },
  };
  await executeWorkflowBusinessStep(db, run, node, []);
  expect(api.report).toHaveBeenCalledWith(
    db,
    42,
    "google",
    { since: "2026-10-01", until: "2026-10-07" },
    true,
    "campaign"
  );
  const inventory = newWorkflowNode("google_inventory", "inventory");
  inventory.config = {
    ...inventory.config,
    connectionId: "google",
    campaignId: "10",
  };
  expect(
    (await executeWorkflowBusinessStep(db, run, inventory, []))?.outputs?.[0]
  ).toMatchObject({
    data: {
      source: "google_campaign_inventory",
      groups: [{ assetGroup: { id: "20" } }],
      assets: [{ asset: { id: "30" } }],
    },
  });
  expect(api.inventory).toHaveBeenCalledWith(db, 42, "google", false, "10");
});
it("refuses reporting for disconnected accounts before calling Google", async () => {
  api.connection.mockResolvedValue({ status: "disconnected" });
  const node = newWorkflowNode("google_report", "report");
  node.config.connectionId = "google";
  await expect(executeWorkflowBusinessStep(db, run, node, [])).rejects.toThrow(
    /Reconnect/
  );
  expect(api.report).not.toHaveBeenCalled();
});
