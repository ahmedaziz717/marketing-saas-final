import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { readGoogleAdsReport, googleAdValues } from "./lib/googleAdsReports";
import { insightNumber } from "../shared/insights";
import type { ChannelConnection } from "../drizzle/channelSchema";

const request = vi.fn();
const connection = {
  id: "google-connection",
  channel: "google_ads",
  accountId: "2222222222",
  name: "Example Google Ads",
  details: {
    currency: "EUR",
    timezone: "Europe/Paris",
    google: { loginCustomerId: "1111111111" },
  },
} as ChannelConnection;
const range = { since: "2026-01-01", until: "2026-10-20" };
const base = {
  costMicros: "123500000",
  impressions: "10000",
  clicks: "250",
  conversions: 12.5,
  conversionsValue: 2000,
};
const purchase = { conversions: 2.5, conversionsValue: 1000 };
beforeEach(() => {
  vi.stubEnv("GOOGLE_ADS_CLIENT_ID", "test-web-client");
  vi.stubEnv("GOOGLE_ADS_CLIENT_SECRET", "test-secret");
  vi.stubEnv("INTEGRATION_TOKEN_ENCRYPTION_SECRET", "test-encryption");
  vi.stubEnv("APP_ORIGIN", "https://app.example.test");
  vi.stubGlobal("fetch", request);
  request.mockReset().mockImplementation(async (_url, init) => {
    const { query, pageToken } = JSON.parse(init.body);
    const purchases = query.includes("conversion_action_category");
    if (query.includes("FROM campaign")) {
      if (!purchases && !pageToken)
        return Response.json({
          results: [
            {
              campaign: {
                id: "1",
                name: "Search",
                status: "PAUSED",
                advertisingChannelType: "SEARCH",
              },
              metrics: base,
            },
          ],
          nextPageToken: "next",
        });
      if (!purchases)
        return Response.json({
          results: [
            {
              campaign: {
                id: "2",
                name: "PMax",
                status: "ENABLED",
                advertisingChannelType: "PERFORMANCE_MAX",
              },
              metrics: base,
            },
          ],
        });
      return Response.json({
        results: [{ campaign: { id: "1" }, metrics: purchase }],
      });
    }
    return Response.json({
      results: [
        {
          ...(query.includes("SELECT segments.date")
            ? { segments: { date: "2026-10-20" } }
            : {}),
          metrics: purchases ? purchase : base,
        },
      ],
    });
  });
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

it("reads paginated campaigns including PMax and preserves money, fractional conversions and purchase-only ROAS", async () => {
  const report = await readGoogleAdsReport(
    connection,
    "test-access",
    range,
    true
  );
  expect(report.summary).toMatchObject({
    spend: 123.5,
    impressions: 10000,
    clicks: 250,
    conversions: 12.5,
    conversionValue: 2000,
    purchases: 2.5,
    purchaseValue: 1000,
    clickCtr: 2.5,
    cpc: 0.494,
    cpa: 49.4,
  });
  expect(report.summary.roas).toBeCloseTo(1000 / 123.5);
  expect(report.summary.conversionRoas).toBeCloseTo(2000 / 123.5);
  expect(report.campaigns.map(c => c.type)).toEqual([
    "SEARCH",
    "PERFORMANCE_MAX",
  ]);
  expect(report.campaigns[1].values.purchases).toBe(0);
  expect(report.daily[0].values).toEqual(report.summary);
  expect(report).toMatchObject({
    currency: "EUR",
    timezone: "Europe/Paris",
    warnings: [],
  });
  expect(insightNumber(2.5, "purchases")).toBe("2.5");
  for (const [url, init] of request.mock.calls) {
    expect(url).toMatch(
      /^https:\/\/googleads.googleapis.com\/v\d+\/customers\/2222222222\/googleAds:search$/
    );
    expect(init.headers["login-customer-id"]).toBe("1111111111");
    const body = JSON.parse(init.body);
    expect(body.query).toMatch(/^SELECT /);
    expect(body.query).toContain("'2026-01-01' AND '2026-10-20'");
    expect(body).not.toHaveProperty("pageSize");
    if (body.query.includes("conversion_action_category")) {
      expect(body.query).toContain("= 'PURCHASE'");
      expect(body.query).not.toContain("cost_micros");
    }
  }
});
it("preserves primary totals and marks failed purchase data unavailable without leaking provider text", async () => {
  const original = request.getMockImplementation()!;
  request.mockImplementation(async (url, init) =>
    JSON.parse(init.body).query.includes("conversion_action_category")
      ? Response.json(
          {
            error: {
              message: "private provider token",
              status: "PERMISSION_DENIED",
            },
          },
          { status: 403 }
        )
      : original(url, init)
  );
  const report = await readGoogleAdsReport(
    connection,
    "test-access",
    range,
    true
  );
  expect(report.summary.spend).toBe(123.5);
  expect(report.summary.purchases).toBeNull();
  expect(report.summary.roas).toBeNull();
  expect(report.campaigns[0].values.purchaseValue).toBeNull();
  expect(report.warnings).toHaveLength(3);
  expect(JSON.stringify(report)).not.toContain("private provider");
});
it("distinguishes empty successful data from a failed report and keeps undefined ratios unavailable", async () => {
  request.mockImplementation(async () => Response.json({}));
  const report = await readGoogleAdsReport(connection, "test-access", range);
  expect(report.summary).toMatchObject({
    spend: 0,
    clicks: 0,
    purchases: 0,
    roas: null,
    cpc: null,
    clickCtr: null,
  });
  expect(report.daily).toEqual([]);
  request.mockImplementation(async () =>
    Response.json({ error: { message: "private" } }, { status: 401 })
  );
  await expect(
    readGoogleAdsReport(connection, "test-access", range)
  ).rejects.toMatchObject({ reason: "expired" });
  expect(
    googleAdValues([{ metrics: { costMicros: "invalid" } }], []).spend
  ).toBeNull();
});
it("validates dates and account identifiers before provider calls", async () => {
  await expect(
    readGoogleAdsReport(connection, "test-access", {
      ...range,
      since: "2026-01-01' OR 1=1",
    })
  ).rejects.toThrow();
  await expect(
    readGoogleAdsReport(
      { ...connection, accountId: "../foreign" },
      "test-access",
      range
    )
  ).rejects.toThrow();
  expect(request).not.toHaveBeenCalled();
});
