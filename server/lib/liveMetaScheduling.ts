import {
  rangeSchema,
  validDate,
  actionValue,
  type DateRange,
} from "../../shared/channels";
import type { ChannelConnection } from "../../drizzle/channelSchema";
import { connectionToken } from "./channelConnections";
import { graphCollection, ChannelGraphError } from "./channelGraph";
import { adMetrics } from "./channelReports";
import { aggregateEvidence, type EvidenceRow } from "./optimizationAnalysis";
import { purchaseEfficiencyConfidence } from "./schedulingStatistics";
import {
  schedulingSettingsSchema,
  type SchedulingSettings,
} from "../../shared/optimization";

const weekdays = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];
const purchaseTypes = [
  "offsite_conversion.fb_pixel_purchase",
  "omni_purchase",
  "purchase",
];
const trafficFields =
  "date_start,date_stop,spend,impressions,clicks,inline_link_clicks";
function rowsToGroups(
  rows: Record<string, any>[],
  dimension: "weekday" | "hour",
  currency: string | null,
  purchaseType: string | null
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
    const metrics = adMetrics(row);
    // One action definition for the whole report; never add overlapping aliases.
    metrics.purchases = purchaseType
      ? actionValue(row.actions, [purchaseType])
      : null;
    metrics.purchaseValue = purchaseType
      ? actionValue(row.action_values, [purchaseType])
      : null;
    const list = grouped.get(label) ?? [];
    list.push({
      adId: "account-total",
      date: String(row.date_start),
      metrics,
      dimensions: {},
      confidence: 1,
      currency,
      attribution: "Meta account attribution; impression-date reporting",
    });
    grouped.set(label, list);
  }
  return Array.from(grouped)
    .map(([label, rows]) => ({
      ...aggregateEvidence(rows),
      labels: [label],
      sourceAdIds: [],
      adCount: null,
    }))
    .sort((a, b) =>
      dimension === "weekday"
        ? weekdays.indexOf(a.labels[0]) - weekdays.indexOf(b.labels[0])
        : a.labels[0].localeCompare(b.labels[0])
    );
}

/** Fresh, bounded account-level reads; never starts/resumes a historical import. */
export async function liveSchedulingReport(
  c: ChannelConnection,
  supplied: DateRange,
  options: { includeHourly: boolean } = { includeHourly: true }
) {
  const range = rangeSchema.parse(supplied),
    token = connectionToken(c);
  const path = `act_${c.accountId.replace(/^act_/, "")}/insights`;
  // Scheduling asks when ads were delivered, not when a later purchase happened.
  const base = {
    level: "account",
    time_range: JSON.stringify(range),
    use_account_attribution_setting: "true",
    action_report_time: "impression",
  };
  const daily = await graphCollection(
    path,
    token,
    {
      ...base,
      time_increment: "1",
      fields: trafficFields + ",actions,action_values",
    },
    5
  );
  const hourlyParams = {
    ...base,
    breakdowns: "hourly_stats_aggregated_by_advertiser_time_zone",
  };
  let hourly: { data: Record<string, any>[]; truncated: boolean } = {
      data: [],
      truncated: false,
    },
    hourlyWarning: string | null = null;
  if (options.includeHourly)
    try {
      hourly = await graphCollection(
        path,
        token,
        { ...hourlyParams, fields: trafficFields + ",actions,action_values" },
        2
      );
    } catch (error) {
      // Only unsupported field/breakdown errors allow a traffic-only fallback.
      // Auth, throttling and transport failures must not look like valid reports.
      if (
        !(error instanceof ChannelGraphError) ||
        error.code !== 100 ||
        !/(actions|action_values|breakdown)/i.test(error.message)
      )
        throw error;
      hourlyWarning =
        "Meta rejected conversion fields with this hourly breakdown. Traffic metrics are shown; purchase confidence cannot be calculated. " +
        error.message;
      hourly = await graphCollection(
        path,
        token,
        { ...hourlyParams, fields: trafficFields },
        2
      );
    }
  const purchaseType =
    purchaseTypes.find(type =>
      daily.data.some(
        row =>
          Array.isArray(row.actions) &&
          row.actions.some((a: any) => a.action_type === type)
      )
    ) ?? null;
  const weekday = rowsToGroups(
    daily.data,
    "weekday",
    c.details.currency ?? null,
    purchaseType
  );
  const hour = rowsToGroups(
    hourly.data,
    "hour",
    c.details.currency ?? null,
    purchaseType
  );
  const completeDaily =
    weekday.length > 0 && weekday.every(g => g.purchases !== null);
  const dailyPurchases = completeDaily
    ? weekday.reduce((sum, g) => sum + g.purchases!, 0)
    : null;
  const knownHourly = hour.reduce((sum, g) => sum + (g.purchases ?? 0), 0);
  const trafficReconciles = ["spend", "impressions", "clicks"].every(key => {
    const k = key as "spend" | "impressions" | "clicks";
    if (!weekday.every(g => g[k] !== null) || !hour.every(g => g[k] !== null))
      return false;
    return (
      Math.abs(
        weekday.reduce((s, g) => s + g[k]!, 0) -
          hour.reduce((s, g) => s + g[k]!, 0)
      ) <= (key === "spend" ? 0.1 : 0.001)
    );
  });
  const reconciled =
    !daily.truncated &&
    !hourly.truncated &&
    trafficReconciles &&
    dailyPurchases !== null &&
    Math.abs(knownHourly - dailyPurchases) < 0.000001 &&
    hour.some(g => g.purchases !== null);
  // Meta can omit actions on zero-action rows. Treat omission as zero ONLY when
  // hourly conversion totals and delivery totals reconcile to the daily report.
  if (reconciled)
    for (const g of hour) {
      if (g.purchases === null) g.purchases = 0;
      g.cpa =
        g.purchases > 0 && g.spend !== null ? g.spend / g.purchases : null;
    }
  const dailyValue =
    weekday.length && weekday.every(g => g.purchaseValue !== null)
      ? weekday.reduce((s, g) => s + g.purchaseValue!, 0)
      : null;
  const valueReconciles =
    reconciled &&
    dailyValue !== null &&
    hour.some(g => g.purchaseValue !== null) &&
    Math.abs(
      hour.reduce((s, g) => s + (g.purchaseValue ?? 0), 0) - dailyValue
    ) <= 0.1;
  if (valueReconciles)
    for (const g of hour) {
      if (g.purchaseValue === null) g.purchaseValue = 0;
      g.roas =
        g.spend !== null && g.spend > 0 ? g.purchaseValue / g.spend : null;
    }
  if (options.includeHourly && !hourlyWarning && !reconciled)
    hourlyWarning = !hour.length
      ? "Meta returned no hourly rows for the selected period."
      : !hour.some(g => g.purchases !== null)
        ? "Purchase and revenue fields were requested, but Meta did not return usable hourly purchase counts. Traffic remains available; missing conversions are not zero."
        : "Hourly purchase or delivery totals do not reconcile with the daily report. Returned values are shown for inspection, but hourly purchase confidence is withheld.";
  return {
    source: "live_meta_scheduling",
    schemaVersion: 1,
    statisticsVersion: 2,
    accountName: c.name,
    connectionId: c.id,
    range,
    timezone: c.details.timezone ?? "Unknown account timezone",
    currency: c.details.currency ?? null,
    fetchedAtMs: Date.now(),
    level: "account",
    dailyRowCount: daily.data.length,
    includeHourly: options.includeHourly,
    truncated: daily.truncated || hourly.truncated,
    weekday,
    hour,
    purchaseType,
    hourlyWarning,
    hourlyConversionsReconciled: reconciled,
    hourlyValueReconciled: valueReconciles,
    actionReportTime: "impression",
  };
}

export function schedulingRecommendation(
  source: Record<string, any>,
  supplied?: SchedulingSettings
) {
  const settings = schedulingSettingsSchema.parse(supplied ?? {});
  const dimensions =
    settings.comparison === "both"
      ? ["weekday", "hour"]
      : [settings.comparison];
  if (dimensions.includes("hour") && source.includeHourly === false)
    throw new Error(
      "Hourly data was turned off in Fetch live Meta performance. Enable hourly data or choose Weekdays in Analyze scheduling."
    );
  const reports = dimensions.map(dimension => {
    const groups = (source[dimension] ?? []) as ReturnType<typeof rowsToGroups>;
    const incomplete =
      !!source.truncated ||
      !groups.length ||
      (dimension === "hour" && source.hourlyConversionsReconciled !== true);
    const statistics = purchaseEfficiencyConfidence(groups, incomplete);
    const repeated =
      dimension === "weekday" &&
      groups.length > 0 &&
      groups.every(g => g.dates?.length >= settings.minimumWeekdayObservations);
    // Test-readiness policy is SEPARATE from calculated probability. Hourly
    // aggregate data has no repeat-day stability estimate; never claim it does.
    const enough =
      statistics.confidence !== null &&
      statistics.confidence >= settings.testProbability &&
      (dimension !== "weekday" || repeated);
    return {
      dimension,
      decision: enough ? "propose_test" : "insufficient_evidence",
      sourceAdIds: [],
      candidate: statistics.candidate,
      statistics,
      repeatedWeekdays: repeated,
      evidence: {
        groups,
        coverage: { incomplete, truncated: !!source.truncated },
      },
      explanation:
        dimension === "hour" && source.hourlyWarning
          ? String(source.hourlyWarning)
          : (statistics.reason ??
            (!repeated && dimension === "weekday"
              ? `Probability can be estimated, but each weekday needs at least ${settings.minimumWeekdayObservations} observed dates before proposing a recurring schedule test.`
              : "The probability describes purchase efficiency under the model, not causal lift or profitability.")),
    };
  });
  const ready = reports.filter(r => r.decision === "propose_test");
  const message = !source.dailyRowCount
    ? "Meta returned no daily performance for this account and date range."
    : source.truncated
      ? "Meta returned a partial report; confidence is not estimable from incomplete results."
      : "Live performance loaded. Each comparison shows its own calculated purchase-efficiency confidence; there is no combined or fixed confidence score.";
  return {
    schemaVersion: 1,
    source: source.source,
    statisticsVersion: 2,
    kind: "weekday_time",
    channel: "meta_ads",
    decision: ready.length ? "propose_test" : "insufficient_evidence",
    confidence: null,
    message,
    sourceAdIds: [],
    dimensions,
    analysisSettings: settings,
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
      "Analysis objective: lowest cost per attributed purchase. ROAS is descriptive; no ROAS confidence is inferred from aggregate revenue.",
      dimensions.length === 2
        ? "Weekday and hour are separate comparisons, not a winning weekday-and-hour combination."
        : `Selected comparison: ${settings.comparison}.`,
      `Test-readiness policy: at least ${Math.round(settings.testProbability * 1000) / 10}% probability of best purchase efficiency; weekdays require ${settings.minimumWeekdayObservations} observed dates per compared weekday.`,
      "Conversions are attributed to impression dates for delivery analysis. Recent results can change as delayed conversions arrive.",
    ],
    suggestedTests: ready.map(
      r =>
        `Consider a controlled ${r.dimension} purchase-efficiency test around ${r.candidate}. Keep audience, creative and budget stable; do not restrict other periods based on this report alone.`
    ),
    generationBrief: "",
    dimensionReports: reports,
    caveats: [
      "Fresh account-level Meta Insights; no historical import or individual-ad counts. Purchase action: " +
        (source.purchaseType ?? "not returned") +
        ".",
      source.includeHourly === false
        ? "Daily performance was requested. Hourly fetching is turned off for this workflow."
        : "Both daily and hourly requests include purchase and revenue fields. Missing or unreconciled hourly conversions prevent hourly confidence; they are not silently replaced with clicks.",
      "Confidence = posterior probability that the observed lowest-CPA period has the highest purchase rate per unit of spend among compared periods. It is conditional on an independent, constant-rate Poisson model and Jeffreys prior.",
      "40,000 deterministic posterior draws; Monte Carlo standard error is at most 0.25 percentage points. 95% credible intervals describe model uncertainty, not future guaranteed performance.",
      "Repeated users, attribution modelling, changing campaigns/audiences, day-to-day variability and non-random delivery can violate model assumptions. This probability is not a p-value, causal confidence, or proof of future lift. Fractional purchase counts are not treated as independent events.",
      `The ${Math.round(settings.testProbability * 1000) / 10}% test-readiness threshold and ${settings.minimumWeekdayObservations}-observation weekday check are saved workflow decision rules, not the confidence calculation. No arbitrary 14-day cutoff is used.`,
      "Hourly buckets describe delivery hours, not purchase timestamps. Hourly totals cannot establish stability across individual days.",
      "No ad schedules, publications or budgets are changed by this report.",
    ],
  };
}
