import { rangeSchema, validDate, type DateRange } from "../../shared/channels";
import type { ChannelConnection } from "../../drizzle/channelSchema";
import { connectionToken } from "./channelConnections";
import { graphCollection } from "./channelGraph";
import { adMetrics } from "./channelReports";
import { aggregateEvidence, type EvidenceRow } from "./optimizationAnalysis";

const weekdays = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];
function rowsToGroups(
  rows: Record<string, any>[],
  dimension: "weekday" | "hour",
  currency: string | null
) {
  const grouped = new Map<string, EvidenceRow[]>();
  for (const row of rows) {
    const label =
      dimension === "weekday"
        ? validDate(String(row.date_start))
          ? weekdays[new Date(row.date_start + "T12:00:00Z").getUTCDay()]
          : "Unknown weekday"
        : String(
            row.hourly_stats_aggregated_by_advertiser_time_zone ??
              "Unknown hour"
          );
    const list = grouped.get(label) ?? [];
    list.push({
      adId: "account-total",
      date: String(row.date_start),
      metrics: adMetrics(row),
      dimensions: {},
      confidence: 1,
      currency,
      attribution: "Meta account attribution; conversion-date reporting",
    });
    grouped.set(label, list);
  }
  return Array.from(grouped)
    .map(([label, rows]) => ({
      ...aggregateEvidence(rows),
      labels: [label],
      sourceAdIds: [],
      adCount: null,
      // Hourly requests deliberately do not ask for conversion fields.
      ...(dimension === "hour"
        ? { purchases: null, purchaseValue: null, roas: null, cpa: null }
        : {}),
    }))
    .sort((a, b) =>
      dimension === "weekday"
        ? weekdays.indexOf(a.labels[0]) - weekdays.indexOf(b.labels[0])
        : a.labels[0].localeCompare(b.labels[0])
    );
}

/** Small account-level live reads, independent of the historical import and its checkpoint. */
export async function liveSchedulingReport(
  c: ChannelConnection,
  supplied: DateRange
) {
  const range = rangeSchema.parse(supplied),
    token = connectionToken(c);
  const path = `act_${c.accountId.replace(/^act_/, "")}/insights`;
  const base = {
    level: "account",
    time_range: JSON.stringify(range),
    use_account_attribution_setting: "true",
    action_report_time: "conversion",
  };
  // A year produces at most 366 daily rows and 24 hour-of-day rows, not every historical ad/creative.
  const daily = await graphCollection(
    path,
    token,
    {
      ...base,
      time_increment: "1",
      fields:
        "date_start,date_stop,spend,impressions,clicks,inline_link_clicks,actions,action_values",
    },
    5
  );
  const hourly = await graphCollection(
    path,
    token,
    {
      ...base,
      breakdowns: "hourly_stats_aggregated_by_advertiser_time_zone",
      fields:
        "date_start,date_stop,spend,impressions,clicks,inline_link_clicks",
    },
    2
  );
  return {
    source: "live_meta_scheduling",
    schemaVersion: 1,
    accountName: c.name,
    connectionId: c.id,
    range,
    timezone: c.details.timezone ?? "Unknown account timezone",
    currency: c.details.currency ?? null,
    fetchedAtMs: Date.now(),
    level: "account",
    dailyRowCount: daily.data.length,
    truncated: daily.truncated || hourly.truncated,
    weekday: rowsToGroups(daily.data, "weekday", c.details.currency ?? null),
    hour: rowsToGroups(hourly.data, "hour", c.details.currency ?? null),
  };
}
export function schedulingRecommendation(source: Record<string, any>) {
  const reports = ["weekday", "hour"].map(dimension => {
    const groups = (source[dimension] ?? []) as ReturnType<typeof rowsToGroups>;
    const eligible = groups.filter(
      g =>
        (g.impressions ?? 0) >= 1000 &&
        (g.clicks ?? 0) >= 50 &&
        g.ctr !== null &&
        g.cpc !== null
    );
    const enough =
      !source.truncated && source.dailyRowCount >= 14 && eligible.length >= 2;
    const ordered = [...eligible].sort((a, b) => (b.ctr ?? 0) - (a.ctr ?? 0));
    return {
      dimension,
      decision: enough ? "propose_test" : "insufficient_evidence",
      sourceAdIds: [],
      candidate: enough ? ordered[0].labels[0] : null,
      evidence: {
        groups,
        coverage: {
          incomplete: source.truncated || !groups.length,
          truncated: source.truncated,
        },
      },
    };
  });
  const enough = reports.every(r => r.decision === "propose_test");
  const message = !source.dailyRowCount
    ? "Meta returned no daily performance for this account and date range. Choose another range or an account with delivery."
    : source.truncated
      ? "Meta returned a partial report. Choose a shorter date range; no schedule is recommended from incomplete results."
      : !enough
        ? "Live performance loaded, but there is not enough evidence to propose delivery windows. We require 14 days with delivery and at least two comparable buckets with 1,000 impressions and 50 clicks each."
        : "Live performance loaded. The strongest observed click-through periods are candidates for a controlled test, not proven best times to buy.";
  return {
    schemaVersion: 1,
    source: source.source,
    kind: "weekday_time",
    channel: "meta_ads",
    decision: enough ? "propose_test" : "insufficient_evidence",
    confidence: enough ? 0.5 : 0,
    message,
    sourceAdIds: [],
    dimensions: ["weekday", "hour"],
    requiresHumanApproval: true,
    accountName: source.accountName,
    range: source.range,
    timezone: source.timezone,
    currency: source.currency,
    fetchedAtMs: source.fetchedAtMs,
    level: "account",
    observations: [
      message,
      `Account: ${source.accountName}. Dates: ${source.range.since} through ${source.range.until}. Time zone: ${source.timezone}.`,
      "Weekday and hour results are separate comparisons; they do not establish a winning weekday-and-hour combination.",
      "Candidate ranking uses weighted CTR (total clicks / total impressions); CPC and conversion metrics remain visible for review.",
    ],
    suggestedTests: enough
      ? reports.map(
          r =>
            `Consider a controlled ${r.dimension} test around ${r.candidate}, keeping audience, creative and budget stable.`
        )
      : [],
    generationBrief: "",
    dimensionReports: reports,
    caveats: [
      "Account-level live Meta Insights, not the previously imported historical dataset. No individual ad counts are inferred.",
      "Hourly purchase, revenue, CPA and ROAS metrics are not requested and remain unavailable; hourly candidates reflect clicks, not purchase profitability.",
      "Daily conversions use the account attribution setting and conversion-date reporting. Purchases are not deduplicated business sales.",
      "Observed differences can reflect existing delivery, budgets, audiences and campaigns. Statistical significance and causal lift have not been established.",
      "This report does not change ad schedules, publish ads or change budgets.",
    ],
  };
}
