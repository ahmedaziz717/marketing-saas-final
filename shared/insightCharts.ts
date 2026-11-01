import {
  insightMetrics,
  type InsightMetric,
  type InsightAccount,
} from "./insights";

export const chartTypes = [
  ["area", "Area trend"],
  ["line", "Line trend"],
  ["bar", "Column trend"],
  ["combo", "Spend & purchase value"],
  ["ranking", "Campaign ranking"],
  ["distribution", "Campaign share"],
  ["table", "Performance table"],
  ["platform", "Account comparison"],
] as const;

const ratios: Partial<
  Record<InsightMetric, [InsightMetric, InsightMetric, number]>
> = {
  roas: ["purchaseValue", "spend", 1],
  cpa: ["spend", "purchases", 1],
  ctr: ["linkClicks", "impressions", 100],
  clickCtr: ["clicks", "impressions", 100],
  cpc: ["spend", "clicks", 1],
  costPerConversion: ["spend", "conversions", 1],
  conversionRoas: ["conversionValue", "spend", 1],
};
export function aggregateInsightSeries(
  account: InsightAccount,
  grain: "day" | "week" | "month" = "day"
) {
  if (grain === "day") return account.series;
  const buckets = new Map<string, InsightAccount["series"]>();
  for (const point of account.series) {
    const day = point.date.slice(0, 10);
    let key = day.slice(0, 7) + "-01";
    if (grain === "week") {
      const date = new Date(day + "T12:00:00Z");
      date.setUTCDate(date.getUTCDate() - ((date.getUTCDay() + 6) % 7));
      key = date.toISOString().slice(0, 10);
    }
    buckets.set(key, [...(buckets.get(key) ?? []), point]);
  }
  return Array.from(buckets, ([date, points]) => {
    const values: Partial<Record<InsightMetric, number | null>> = {};
    for (const key of Object.keys(insightMetrics) as InsightMetric[]) {
      if (ratios[key]) continue;
      const parts = points.map(p => p.values[key]);
      // Missing source values remain unavailable; never replace missing data with zero.
      values[key] = parts.some(v => v == null)
        ? null
        : parts.reduce<number>((sum, v) => sum + v!, 0);
    }
    for (const [key, ratio] of Object.entries(ratios)) {
      const [numerator, denominator, scale] = ratio!;
      const n = values[numerator],
        d = values[denominator];
      values[key as InsightMetric] =
        n != null && d != null && d > 0 ? (n / d) * scale : null;
    }
    return { date, values };
  }).sort((a, b) => a.date.localeCompare(b.date));
}

export function campaignChartRows(
  account: InsightAccount,
  metric: InsightMetric
) {
  return account.details
    .map(d => ({ name: d.name, value: d.values[metric] ?? null }))
    .sort((a, b) => (b.value ?? -Infinity) - (a.value ?? -Infinity));
}

export function alignedPreviousSeries(
  account: InsightAccount,
  range?: { since: string; until: string },
  previousRange?: { since: string; until: string } | null
) {
  if (!range || !previousRange || !account.previousSeries) return [];
  const offset =
    Date.parse(`${range.since}T12:00:00Z`) -
    Date.parse(`${previousRange.since}T12:00:00Z`);
  return account.previousSeries
    .map(p => ({
      ...p,
      date: new Date(Date.parse(`${p.date.slice(0, 10)}T12:00:00Z`) + offset)
        .toISOString()
        .slice(0, 10),
    }))
    .filter(p => p.date >= range.since && p.date <= range.until);
}
