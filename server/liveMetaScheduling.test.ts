import { expect, it, vi, beforeEach } from "vitest";
const state = vi.hoisted(() => ({ fetch: vi.fn(), token: vi.fn() }));
vi.mock("./lib/channelConnections", () => ({ connectionToken: state.token }));
vi.mock("./lib/channelGraph", async original => ({
  ...(await original<typeof import("./lib/channelGraph")>()),
  graphCollection: state.fetch,
}));
import { ChannelGraphError } from "./lib/channelGraph";
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
const range = { since: "2026-10-03", until: "2026-10-09" };
const actions = (value: number) => [
  { action_type: "offsite_conversion.fb_pixel_purchase", value: String(value) },
];
const row = (date: string, spend: number, n: number, hour?: string) => ({
  date_start: date,
  spend: String(spend),
  impressions: "1000",
  clicks: "100",
  actions: actions(n),
  action_values: actions(n * 100),
  ...(hour ? { hourly_stats_aggregated_by_advertiser_time_zone: hour } : {}),
});
beforeEach(() => {
  state.fetch.mockReset();
  state.token.mockReturnValue("fixture-token");
});
it("requests purchases and revenue hourly, uses delivery attribution, reconciles real metrics", async () => {
  state.fetch
    .mockResolvedValueOnce({
      data: [row("2026-10-03", 100, 3), row("2026-10-04", 100, 1)],
      truncated: false,
    })
    .mockResolvedValueOnce({
      data: [
        row("2026-10-03", 100, 3, "10:00"),
        row("2026-10-03", 100, 1, "11:00"),
      ],
      truncated: false,
    });
  const r = await liveSchedulingReport(account, range);
  for (const call of state.fetch.mock.calls) {
    expect(call[2]).toMatchObject({
      level: "account",
      time_range: JSON.stringify(range),
      action_report_time: "impression",
    });
    expect(call[2].fields).toContain("actions,action_values");
  }
  expect(r.hourlyConversionsReconciled).toBe(true);
  expect(r.hour[0]).toMatchObject({
    purchases: 3,
    purchaseValue: 300,
    roas: 3,
  });
  const out = schedulingRecommendation(r);
  expect(out.confidence).toBeNull();
  expect(out.dimensionReports[0].statistics.confidence).toBeGreaterThan(0.5);
  expect(out.dimensionReports[1].statistics.confidence).toBeGreaterThan(0.5);
  expect(out.dimensionReports[0].repeatedWeekdays).toBe(false);
});
it("keeps suppressed conversions unknown and withholds hourly probability", async () => {
  state.fetch
    .mockResolvedValueOnce({
      data: [row("2026-10-03", 100, 3)],
      truncated: false,
    })
    .mockResolvedValueOnce({
      data: [
        {
          date_start: "2026-10-03",
          spend: "100",
          impressions: "1000",
          clicks: "100",
          hourly_stats_aggregated_by_advertiser_time_zone: "10:00",
        },
      ],
      truncated: false,
    });
  const r = await liveSchedulingReport(account, range);
  expect(r.hour[0].purchases).toBeNull();
  expect(r.hourlyWarning).toMatch(/requested.*did not return/);
  expect(
    schedulingRecommendation(r).dimensionReports[1].statistics.confidence
  ).toBeNull();
});
it("only fills omitted zero-action hours after totals reconcile", async () => {
  state.fetch
    .mockResolvedValueOnce({
      data: [
        { ...row("2026-10-03", 200, 3), impressions: "2000", clicks: "200" },
      ],
      truncated: false,
    })
    .mockResolvedValueOnce({
      data: [
        row("2026-10-03", 100, 3, "10:00"),
        {
          ...row("2026-10-03", 100, 0, "11:00"),
          actions: undefined,
          action_values: undefined,
        },
      ],
      truncated: false,
    });
  const r = await liveSchedulingReport(account, range);
  expect(r.hour[1]).toMatchObject({ purchases: 0, purchaseValue: 0, roas: 0 });
  expect(r.hourlyConversionsReconciled).toBe(true);
});
it("does not infer valid confidence from mismatched hourly purchase totals", async () => {
  state.fetch
    .mockResolvedValueOnce({
      data: [row("2026-10-03", 200, 3)],
      truncated: false,
    })
    .mockResolvedValueOnce({
      data: [
        row("2026-10-03", 100, 1, "10:00"),
        row("2026-10-03", 100, 1, "11:00"),
      ],
      truncated: false,
    });
  const r = await liveSchedulingReport(account, range);
  expect(r.hourlyConversionsReconciled).toBe(false);
  expect(r.hourlyWarning).toMatch(/do not reconcile/);
  expect(
    schedulingRecommendation(r).dimensionReports[1].statistics.confidence
  ).toBeNull();
});
it("returns clear empty results without imported history", async () => {
  state.fetch.mockResolvedValue({ data: [], truncated: false });
  const r = schedulingRecommendation(
    await liveSchedulingReport(account, range)
  );
  expect(r.message).toMatch(/no daily/);
  expect(r.suggestedTests).toEqual([]);
  expect(r.confidence).toBeNull();
});
it("only falls back for unsupported action/breakdown fields and explains why", async () => {
  state.fetch
    .mockResolvedValueOnce({
      data: [row("2026-10-03", 100, 3)],
      truncated: false,
    })
    .mockRejectedValueOnce(
      new ChannelGraphError("actions not supported with breakdown", true, 100)
    )
    .mockResolvedValueOnce({ data: [], truncated: false });
  const r = await liveSchedulingReport(account, range);
  expect(state.fetch).toHaveBeenCalledTimes(3);
  expect(r.hourlyWarning).toMatch(/Meta rejected/);
});
it.each([
  new ChannelGraphError("rate limit", true, 4),
  new ChannelGraphError("token expired", true, 190),
  new Error("network"),
])(
  "propagates provider failures without hidden traffic or history fallback",
  async error => {
    state.fetch
      .mockResolvedValueOnce({ data: [], truncated: false })
      .mockRejectedValueOnce(error);
    await expect(liveSchedulingReport(account, range)).rejects.toThrow();
    expect(state.fetch).toHaveBeenCalledTimes(2);
  }
);
it("partial reports withhold confidence and recommendations", () => {
  const groups = [
    {
      labels: ["Friday"],
      spend: 100,
      purchases: 20,
      dates: ["2026-10-02", "2026-10-09"],
    },
    {
      labels: ["Monday"],
      spend: 100,
      purchases: 1,
      dates: ["2026-09-28", "2026-10-05"],
    },
  ];
  const source = {
    weekday: groups,
    hour: groups,
    dailyRowCount: 4,
    range,
    hourlyConversionsReconciled: true,
  };
  expect(
    schedulingRecommendation(source).suggestedTests.length
  ).toBeGreaterThan(0);
  const r = schedulingRecommendation({ ...source, truncated: true });
  expect(r.suggestedTests).toEqual([]);
  r.dimensionReports.forEach(d => expect(d.statistics.confidence).toBeNull());
});

it("fetches only daily data when hourly is disabled and refuses mismatched analysis settings", async () => {
  state.fetch.mockResolvedValue({
    data: [row("2026-10-03", 100, 3)],
    truncated: false,
  });
  const source = await liveSchedulingReport(account, range, {
    includeHourly: false,
  });
  expect(state.fetch).toHaveBeenCalledTimes(1);
  expect(source.includeHourly).toBe(false);
  expect(source.hourlyWarning).toBeNull();
  expect(() => schedulingRecommendation(source)).toThrow(
    /Hourly data was turned off/
  );
  const r = schedulingRecommendation(source, {
    comparison: "weekday",
    objective: "cost_per_purchase",
    testProbability: 0.9,
    minimumWeekdayObservations: 3,
  });
  expect(r.dimensions).toEqual(["weekday"]);
  expect(r.analysisSettings.testProbability).toBe(0.9);
});

it("uses saved test rules without altering the scientific probability", () => {
  const groups = [
    {
      labels: ["Friday"],
      spend: 1083.52,
      purchases: 7,
      dates: ["2026-10-02", "2026-10-09"],
    },
    {
      labels: ["Thursday"],
      spend: 1519.95,
      purchases: 4,
      dates: ["2026-10-01", "2026-10-08"],
    },
  ];
  const source = {
    weekday: groups,
    hour: groups,
    dailyRowCount: 4,
    range,
    hourlyConversionsReconciled: true,
  };
  const base = {
    comparison: "weekday" as const,
    objective: "cost_per_purchase" as const,
    testProbability: 0.95,
    minimumWeekdayObservations: 2,
  };
  const strict = schedulingRecommendation(source, base);
  const relaxed = schedulingRecommendation(source, {
    ...base,
    testProbability: 0.9,
  });
  expect(strict.decision).toBe("insufficient_evidence");
  expect(relaxed.decision).toBe("propose_test");
  expect(strict.dimensionReports[0].statistics).toEqual(
    relaxed.dimensionReports[0].statistics
  );
  expect(
    schedulingRecommendation(source, {
      ...base,
      testProbability: 0.9,
      minimumWeekdayObservations: 3,
    }).decision
  ).toBe("insufficient_evidence");
  expect(
    schedulingRecommendation(source, { ...base, comparison: "hour" }).dimensions
  ).toEqual(["hour"]);
});
