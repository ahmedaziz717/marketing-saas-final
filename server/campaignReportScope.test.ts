import { afterEach, expect, it, vi } from "vitest";
import type { ChannelConnection } from "../drizzle/channelSchema";
const mocks = vi.hoisted(() => ({ collection: vi.fn() }));
vi.mock("./lib/channelConnections", () => ({
  connectionToken: () => "test-token",
}));
vi.mock("./lib/channelGraph", async original => ({
  ...(await original<any>()),
  graphCollection: mocks.collection,
}));
import { adsReport } from "./lib/channelReports";
import { readGoogleAdsReport } from "./lib/googleAdsReports";
const connection = {
  id: "fixture",
  accountId: "2222222222",
  details: { currency: "USD", timezone: "UTC", google: {} },
} as ChannelConnection;
const range = { since: "2026-10-01", until: "2026-10-07" };
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});
it("uses the active Meta campaign scope for totals, daily charts, platforms and rows by default, with an explicit opt-in", async () => {
  mocks.collection.mockImplementation(async (_path, _token, params) => {
    const active = !!params.filtering;
    if (active)
      expect(JSON.parse(params.filtering)).toEqual([
        {
          field: "campaign.effective_status",
          operator: "IN",
          value: ["ACTIVE"],
        },
      ]);
    return {
      data: [
        {
          spend: active ? "10" : "30",
          impressions: "100",
          clicks: "4",
          campaign_id: "1",
          campaign_name: "Example",
          publisher_platform: "facebook",
          date_start: range.since,
          actions: [],
          action_values: [],
        },
      ],
      truncated: false,
    };
  });
  for (const [include, spend] of [
    [undefined, 10],
    [true, 30],
  ] as const) {
    const report = await adsReport(connection, range, include);
    expect(report.summary.spend).toBe(spend);
    expect(report.daily[0].spend).toBe(spend);
    expect(report.platforms[0].spend).toBe(spend);
    expect(report.campaigns[0].spend).toBe(spend);
  }
  expect(mocks.collection).toHaveBeenCalledTimes(8);
  expect(mocks.collection.mock.calls.slice(4).every(c => !c[2].filtering)).toBe(
    true
  );
});
it("keeps Google totals, daily charts, campaign rows and PURCHASE conversions in the same active/default or all-status scope", async () => {
  vi.stubEnv("GOOGLE_ADS_CLIENT_ID", "test-client");
  vi.stubEnv("GOOGLE_ADS_CLIENT_SECRET", "test-secret");
  vi.stubEnv("INTEGRATION_TOKEN_ENCRYPTION_SECRET", "test-encryption");
  vi.stubEnv("APP_ORIGIN", "https://app.example.test");
  const queries: string[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url, init) => {
      const query = JSON.parse(init.body).query as string;
      queries.push(query);
      const active = query.includes("campaign.status = 'ENABLED'");
      const purchase = query.includes("conversion_action_category");
      return Response.json({
        results: [
          {
            campaign: {
              id: "1",
              name: "Search",
              status: "ENABLED",
              advertisingChannelType: "SEARCH",
            },
            segments: { date: range.since },
            metrics: purchase
              ? {
                  conversions: active ? 0.5 : 1.5,
                  conversionsValue: active ? 100 : 300,
                }
              : {
                  costMicros: active ? "10000000" : "30000000",
                  clicks: "4",
                  impressions: "100",
                  conversions: 2,
                  conversionsValue: 400,
                },
          },
        ],
      });
    })
  );
  for (const [include, spend, purchases] of [
    [undefined, 10, 0.5],
    [true, 30, 1.5],
  ] as const) {
    const report = await readGoogleAdsReport(
      connection,
      "test",
      range,
      include
    );
    for (const values of [
      report.summary,
      report.daily[0].values,
      report.campaigns[0].values,
    ])
      expect(values).toMatchObject({
        spend,
        purchases,
        purchaseValue: purchases * 200,
        roas: 10,
      });
  }
  expect(queries).toHaveLength(12);
  expect(
    queries
      .slice(0, 6)
      .every(
        q =>
          q.includes("campaign.status = 'ENABLED'") &&
          q.includes("FROM campaign")
      )
  ).toBe(true);
  expect(queries.slice(6).every(q => !q.includes("campaign.status ="))).toBe(
    true
  );
});
