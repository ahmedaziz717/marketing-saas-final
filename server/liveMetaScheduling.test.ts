import { expect, it, vi, beforeEach } from "vitest";
const state = vi.hoisted(() => ({ fetch: vi.fn(), token: vi.fn() }));
vi.mock("./lib/channelConnections", () => ({ connectionToken: state.token }));
vi.mock("./lib/channelGraph", async original => ({
  ...(await original<typeof import("./lib/channelGraph")>()),
  graphCollection: state.fetch,
}));
import {
  liveSchedulingReport,
  schedulingRecommendation,
} from "./lib/liveMetaScheduling";
const account = {
  id: "cid",
  accountId: "123",
  name: "Fixture",
  details: { timezone: "America/Los_Angeles", currency: "USD" },
} as any;
beforeEach(() => {
  state.fetch.mockReset();
  state.token.mockReset();
  state.token.mockReturnValue("fixture-token");
});
it("fetches the requested dates live, aggregates weighted metrics, and does not invent hourly purchases", async () => {
  state.fetch
    .mockResolvedValueOnce({
      data: [
        {
          date_start: "2026-09-07",
          spend: "10",
          impressions: "100",
          clicks: "10",
        },
        {
          date_start: "2026-09-14",
          spend: "90",
          impressions: "900",
          clicks: "9",
        },
      ],
      truncated: false,
    })
    .mockResolvedValueOnce({
      data: [
        {
          date_start: "2026-09-01",
          spend: "10",
          impressions: "100",
          clicks: "10",
          hourly_stats_aggregated_by_advertiser_time_zone:
            "10:00:00 - 10:59:59",
        },
      ],
      truncated: false,
    });
  const range = { since: "2026-09-01", until: "2026-09-30" };
  const result = await liveSchedulingReport(account, range);
  expect(state.fetch).toHaveBeenCalledTimes(2);
  expect(state.fetch.mock.calls[0][2]).toMatchObject({
    level: "account",
    time_range: JSON.stringify(range),
    time_increment: "1",
  });
  expect(state.fetch.mock.calls[1][2].breakdowns).toBe(
    "hourly_stats_aggregated_by_advertiser_time_zone"
  );
  expect(state.fetch.mock.calls[1][2].fields).not.toContain("actions");
  expect(result.weekday[0]).toMatchObject({
    labels: ["Monday"],
    impressions: 1000,
    clicks: 19,
    ctr: 1.9,
  });
  expect(result.hour[0].purchases).toBeNull();
  expect(result.timezone).toBe("America/Los_Angeles");
  expect(schedulingRecommendation(result).decision).toBe(
    "insufficient_evidence"
  );
});
it("returns an explicit empty result without reading any historical dataset", async () => {
  state.fetch.mockResolvedValue({ data: [], truncated: false });
  const result = await liveSchedulingReport(account, {
    since: "2025-12-01",
    until: "2025-12-31",
  });
  const recommendation = schedulingRecommendation(result);
  expect(recommendation.message).toMatch(/Meta returned no daily/);
  expect(recommendation.suggestedTests).toEqual([]);
});
it("propagates provider errors instead of substituting cached or imported results", async () => {
  state.fetch.mockRejectedValue(new Error("Meta rate limit"));
  await expect(
    liveSchedulingReport(account, { since: "2026-09-01", until: "2026-09-30" })
  ).rejects.toThrow(/rate limit/);
  expect(state.fetch).toHaveBeenCalledTimes(1);
});
it("only proposes observational tests after minimum support and rejects partial reports", () => {
  const groups = [1, 2].map(i => ({
    labels: [`bucket${i}`],
    impressions: 5000,
    clicks: 100,
    ctr: 2,
    cpc: i,
  }));
  const source = {
    source: "live_meta_scheduling",
    weekday: groups,
    hour: groups,
    dailyRowCount: 20,
    range: { since: "2026-09-01", until: "2026-09-30" },
    truncated: false,
  };
  expect(schedulingRecommendation(source).decision).toBe("propose_test");
  expect(
    schedulingRecommendation({ ...source, truncated: true }).suggestedTests
  ).toEqual([]);
  expect(schedulingRecommendation({ ...source, hour: [] }).decision).toBe(
    "insufficient_evidence"
  );
});
