import { describe, expect, it } from "vitest";
import {
  canonicalLabel,
  effectiveClassifications,
  analysisQuerySchema,
  type Classification,
} from "../shared/optimization";
import {
  aggregateEvidence,
  classifyImported,
  dimensionAnalysis,
  type EvidenceRow,
} from "./lib/optimizationAnalysis";
import {
  historyTasks,
  retryDelay,
  usageDelay,
} from "./lib/optimizationIngestion";
import { ChannelGraphError } from "./lib/channelGraph";
const row = (
  id: string,
  spend: number,
  clicks: number,
  impressions: number
): EvidenceRow => ({
  adId: id,
  date: "2026-01-01",
  metrics: {
    spend,
    clicks,
    impressions,
    purchases: 2,
    purchaseValue: 100,
    linkClicks: clicks,
    roas: 100 / spend,
  },
  dimensions: { messaging_style: ["direct", "playful"] },
  confidence: 1,
  currency: "USD",
  attribution: "account",
});
describe("optimization evidence", () => {
  it("weights ratios by base counts, not averages, and preserves missing metrics", () => {
    const rows = [row("1", 10, 10, 100), row("2", 90, 10, 900)];
    const a = aggregateEvidence(rows);
    expect(a.ctr).toBe(2);
    expect(a.cpc).toBe(5);
    expect(a.roas).toBe(2);
    expect(a.cpa).toBe(25);
    rows[0].metrics.purchases = null;
    expect(aggregateEvidence(rows).cpa).toBeNull();
    rows[1].currency = "EUR";
    expect(aggregateEvidence(rows).spend).toBeNull();
  });
  it("keeps cohort overlap out of the overall total", () => {
    const r = dimensionAnalysis(
      [row("1", 10, 1, 10)],
      analysisQuerySchema.parse({
        range: { since: "2026-01-01", until: "2026-01-01" },
        dimensions: ["messaging_style"],
      })
    );
    expect(r.groups).toHaveLength(2);
    expect(r.summary.spend).toBe(10);
  });
  it("rejects incompatible grain filters", () => {
    expect(() =>
      dimensionAnalysis(
        [],
        analysisQuerySchema.parse({
          range: { since: "2026-01-01", until: "2026-01-01" },
          dimensions: ["hour"],
        })
      )
    ).toThrow(/granularity/);
  });
  it("preserves authored labels and explicit unknown overrides", () => {
    const base: Classification = {
      dimension: "theme",
      labels: [],
      source: "human",
      version: 1,
      observedAtMs: 1,
      revision: 1,
    };
    expect(
      effectiveClassifications([
        base,
        {
          ...base,
          source: "rule",
          revision: 10,
          observedAtMs: 10,
          labels: [
            { id: "new", label: "New", confidence: 1, evidence: "test" },
          ],
        },
      ]).theme
    ).toEqual(base);
    expect(canonicalLabel("background_color", "#ff00aa")).toBe("#FF00AA");
    expect(() => canonicalLabel("background_color", "red")).toThrow();
  });
  it("separates urgency from style and does not invent image colors", () => {
    const a = classifyImported({}, { body: "Shop now. Today only." });
    expect(a.find(r => r.dimension === "urgency")?.labels[0].id).toBe(
      "time_limited"
    );
    expect(a.find(r => r.dimension === "messaging_style")?.labels[0].id).toBe(
      "direct"
    );
    expect(a.find(r => r.dimension === "background_color")?.labels).toEqual([]);
  });
  it("plans bounded complete slices including the final day", () => {
    const tasks = historyTasks({ since: "2026-01-01", until: "2026-01-09" });
    expect(tasks.filter(t => t.grain === "daily").map(t => t.range)).toEqual([
      { since: "2026-01-01", until: "2026-01-07" },
      { since: "2026-01-08", until: "2026-01-09" },
    ]);
    expect(tasks.some(t => t.grain === "hourly")).toBe(true);
  });
  it("backs off throttling without retrying permission failures forever", () => {
    expect(
      retryDelay(new ChannelGraphError("rate", true, 80004), 0)
    ).toBeGreaterThan(0);
    expect(
      retryDelay(new ChannelGraphError("denied", true, 200), 0)
    ).toBeNull();
    expect(retryDelay(new ChannelGraphError("transient", false), 8)).toBeNull();
    expect(
      usageDelay(
        new Headers({ "x-app-usage": JSON.stringify({ call_count: 95 }) })
      )
    ).toBe(60000);
  });
});
