import { beforeEach, expect, it, vi } from "vitest";
const f = vi.hoisted(() => ({
  read: vi.fn(),
  access: vi.fn(),
  timezone: "America/Los_Angeles" as string | undefined,
}));
vi.mock("./lib/googleAdsApi", async original => ({
  ...(await original<any>()),
  googleAdsRows: (...args: unknown[]) => f.read(...args),
}));
vi.mock("./lib/googleAdsConnections", () => ({
  withGoogleAdsAccess: (...args: any[]) => f.access(...args),
}));
import {
  assetMetricsPeriod,
  assetPerformance,
  googleAssetMetrics,
} from "./lib/googleAssetMetrics";
import { GoogleAdsError } from "./lib/googleAdsApi";
const resource = "customers/222/assetGroupAssets/22~33~MARKETING_IMAGE";
const row = () => ({
  campaign: { id: "11" },
  assetGroup: { id: "22" },
  assetGroupAsset: { resourceName: resource },
  metrics: {
    impressions: "100",
    clicks: "5",
    ctr: 0.05,
    conversions: 1.5,
    interactions: "10",
    conversionsFromInteractionsRate: 0.15,
  },
});
beforeEach(() => {
  f.read.mockReset();
  f.access.mockReset();
  f.timezone = "America/Los_Angeles";
  f.access.mockImplementation(async (_db, org, id, work) => {
    if (org !== 3 || id !== "owned")
      throw new Error("Connection not in workspace");
    return work(
      {
        accountId: "222",
        details: { timezone: f.timezone, google: { loginCustomerId: "999" } },
      },
      "token"
    );
  });
  f.read.mockImplementation(async (_token, _customer, query) =>
    query.includes("FROM asset_group WHERE")
      ? [{ assetGroup: { id: "22" } }]
      : [row()]
  );
});
it("queries exact account/campaign/group and complete account-timezone dates without segmenting rows", async () => {
  const result = await googleAssetMetrics(
    {} as any,
    3,
    "owned",
    "11",
    "22",
    30,
    Date.parse("2026-10-26T02:00:00Z")
  );
  expect(result).toMatchObject({
    status: "available",
    since: "2026-09-25",
    until: "2026-10-24",
    timezone: "America/Los_Angeles",
  });
  const query = f.read.mock.calls[1][2];
  expect(query).toContain("campaign.id = 11 AND asset_group.id = 22");
  expect(query).toContain("metrics.conversions_from_interactions_rate");
  expect(query.split("FROM")[0]).not.toContain("segments.date");
  expect(f.read.mock.calls[1].slice(0, 2)).toEqual(["token", "222"]);
  expect(f.read.mock.calls[1][3]).toBe("999");
  expect(result.rows[0]).toMatchObject({
    conversions: 1.5,
    conversionRate: 0.15,
    ctr: 0.05,
  });
});
it("preserves measured zero but never invents ratios for zero denominator", () => {
  expect(assetPerformance({ ...row(), metrics: {} })).toMatchObject({
    impressions: 0,
    conversions: 0,
    ctr: null,
    conversionRate: null,
  });
  expect(
    assetPerformance({ ...row(), metrics: undefined }).impressions
  ).toBeNull();
  expect(
    assetPerformance({
      ...row(),
      metrics: { impressions: "bad", conversions: null },
    }).conversions
  ).toBeNull();
});
it("keeps reporting failures unavailable rather than zero and does not throw away inventory", async () => {
  f.read.mockRejectedValueOnce(new Error("Reporting unavailable"));
  expect(
    await googleAssetMetrics({} as any, 3, "owned", "11", "22")
  ).toMatchObject({ status: "unavailable", rows: [] });
});
it("missing rows are not fabricated and foreign association rows cannot join", async () => {
  f.read.mockImplementation(async (_t, _c, q) =>
    q.includes("FROM asset_group WHERE")
      ? [{}]
      : [
          {
            ...row(),
            assetGroupAsset: {
              resourceName:
                "customers/777/assetGroupAssets/22~33~MARKETING_IMAGE",
            },
          },
        ]
  );
  expect(
    await googleAssetMetrics({} as any, 3, "owned", "11", "22")
  ).toMatchObject({ status: "unavailable", rows: [] });
});
it("does not turn workspace denial or missing destination into reporting zeros", async () => {
  await expect(
    googleAssetMetrics({} as any, 4, "owned", "11", "22")
  ).rejects.toThrow("Connection not in workspace");
  f.read.mockResolvedValue([]);
  await expect(
    googleAssetMetrics({} as any, 3, "owned", "11", "22")
  ).rejects.toThrow("Asset group not found");
});
it("rejects interpolated IDs before access", async () => {
  await expect(
    googleAssetMetrics({} as any, 3, "owned", "11 OR TRUE", "22")
  ).rejects.toThrow("valid campaign");
  expect(f.access).not.toHaveBeenCalled();
});
it("calculates complete days across daylight saving without client timezone assumptions", () => {
  expect(
    assetMetricsPeriod(
      Date.parse("2026-11-02T01:00:00Z"),
      "America/New_York",
      7
    )
  ).toEqual({ since: "2026-10-25", until: "2026-10-31" });
});
it("reads the account timezone if connection metadata lacks it", async () => {
  f.timezone = undefined;
  f.read.mockImplementation(async (_t, _c, q) =>
    q.includes("FROM customer")
      ? [{ customer: { timeZone: "Asia/Tokyo" } }]
      : q.includes("FROM asset_group WHERE")
        ? [{}]
        : [row()]
  );
  expect(
    (
      await googleAssetMetrics(
        {} as any,
        3,
        "owned",
        "11",
        "22",
        7,
        Date.parse("2026-10-26T23:00:00Z")
      )
    ).until
  ).toBe("2026-10-26");
});

it("preserves expired auth errors for the access wrapper's token-refresh retry", async () => {
  f.read.mockRejectedValueOnce(new GoogleAdsError("expired"));
  await expect(
    googleAssetMetrics({} as any, 3, "owned", "11", "22")
  ).rejects.toMatchObject({ reason: "expired" });
});
