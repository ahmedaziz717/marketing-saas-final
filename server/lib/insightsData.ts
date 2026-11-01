import { and, eq, inArray } from "drizzle-orm";
import {
  channelConnections,
  type ChannelConnection,
} from "../../drizzle/channelSchema";
import {
  insightMetrics,
  TODAY_REPORT_NOTE,
  supportsInsightMetric,
  isInsightChannel,
  type InsightChannel,
  insightNumber,
  insightRange,
  metricChange,
  reportPreviousRange,
  type InsightAccount,
  type InsightConfig,
  type InsightMetric,
  type InsightResult,
} from "../../shared/insights";
import { getDb } from "../db";
import { adsReport, facebookReport, type AdMetrics } from "./channelReports";
import { googleAdsReport } from "./googleAdsReports";
import { GoogleAdsError } from "./googleAdsApi";

type Database = NonNullable<Awaited<ReturnType<typeof getDb>>>;
const finite = (v: number | null | undefined) =>
  typeof v === "number" && Number.isFinite(v) ? v : null;
export function insightAdValues(
  row: AdMetrics
): Partial<Record<InsightMetric, number | null>> {
  return {
    ...row,
    ctr:
      row.impressions && row.linkClicks !== null
        ? (row.linkClicks / row.impressions) * 100
        : null,
    cpa: row.purchases && row.spend !== null ? row.spend / row.purchases : null,
  };
}
const metricsFor = (
  config: InsightConfig,
  channel: InsightChannel,
  current: Partial<Record<InsightMetric, number | null>>,
  prior: Partial<Record<InsightMetric, number | null>>
) =>
  config.metrics
    .filter(key => supportsInsightMetric(key, channel))
    .map(key => {
      const value = finite(current[key]),
        previous =
          config.compare && key !== "followers" ? finite(prior[key]) : null;
      return { key, value, previous, change: metricChange(value, previous) };
    });

export function normalizeAdInsight(
  connection: ChannelConnection,
  config: InsightConfig,
  data: Awaited<ReturnType<typeof adsReport>>,
  prior?: Awaited<ReturnType<typeof adsReport>>
): InsightAccount {
  return {
    connectionId: connection.id,
    name: connection.name,
    channel: "meta_ads",
    status: "ready",
    currency: data.currency,
    timezone: data.timezone,
    warnings: [
      data.attribution,
      ...(data.truncated
        ? [
            "Some breakdowns are partial because the provider pagination limit was reached.",
          ]
        : []),
      ...(!data.currency
        ? [
            "Account currency was not supplied. Monetary amounts are not combined with another account.",
          ]
        : []),
    ],
    metrics: metricsFor(
      config,
      "meta_ads",
      insightAdValues(data.summary),
      prior ? insightAdValues(prior.summary) : {}
    ),
    series: data.daily.map(d => ({ date: d.date, values: insightAdValues(d) })),
    previousSeries: prior?.daily.map(d => ({
      date: d.date,
      values: insightAdValues(d),
    })),
    detailLabel: "Campaign performance · ordered by spend",
    detailMetrics: ["spend", "purchases", "purchaseValue", "roas"],
    details: [...data.campaigns]
      .sort((a, b) => (b.spend ?? -1) - (a.spend ?? -1))
      .slice(0, 30)
      .map(d => ({ name: d.name, values: insightAdValues(d) })),
  };
}
export function normalizeGoogleInsight(
  connection: ChannelConnection,
  config: InsightConfig,
  data: Awaited<ReturnType<typeof googleAdsReport>>,
  prior?: Awaited<ReturnType<typeof googleAdsReport>>
): InsightAccount {
  return {
    connectionId: connection.id,
    name: connection.name,
    channel: "google_ads",
    status: "ready",
    currency: data.currency,
    timezone: data.timezone,
    warnings: [
      data.attribution,
      ...data.warnings,
      ...(prior?.warnings.map(w => `Previous period: ${w}`) ?? []),
      ...(!data.currency
        ? [
            "Account currency was not supplied. Monetary amounts are not combined with another account.",
          ]
        : []),
    ],
    metrics: metricsFor(
      config,
      "google_ads",
      data.summary,
      prior?.summary ?? {}
    ),
    series: data.daily,
    previousSeries: prior?.daily,
    detailLabel:
      data.breakdown?.label ??
      "Campaign performance · top 30 by spend · includes Performance Max",
    detailMetrics: ["spend", "clicks", "conversions", "purchaseValue", "roas"],
    details: data.breakdown
      ? data.breakdown.rows
          .sort((a, b) => (b.values.spend ?? -1) - (a.values.spend ?? -1))
          .slice(0, 30)
      : [...data.campaigns]
          .sort((a, b) => (b.values.spend ?? -1) - (a.values.spend ?? -1))
          .slice(0, 30)
          .map(c => ({
            name: `${c.name} · ${c.type.replaceAll("_", " ")} · ${c.status.toLowerCase()}`,
            values: c.values,
          })),
  };
}
function socialValues(data: Awaited<ReturnType<typeof facebookReport>>) {
  return {
    posts: data.postCount,
    followers: data.followersNow,
    views: data.series.find(s => s.metric === "page_media_view")?.total ?? null,
    engagements:
      data.series.find(s => s.metric === "page_post_engagements")?.total ??
      null,
  };
}
export function normalizeSocialInsight(
  connection: ChannelConnection,
  config: InsightConfig,
  data: Awaited<ReturnType<typeof facebookReport>>,
  prior?: Awaited<ReturnType<typeof facebookReport>>
): InsightAccount {
  const days = new Map<string, Partial<Record<InsightMetric, number | null>>>();
  for (const s of data.series) {
    const metric: InsightMetric =
      s.metric === "page_media_view" ? "views" : "engagements";
    for (const v of s.values) {
      // Preserve the provider's end_time. It is a period boundary, not a UTC post date.
      const day = v.date;
      days.set(day, { ...days.get(day), [metric]: v.value });
    }
  }
  return {
    connectionId: connection.id,
    name: connection.name,
    channel: "facebook",
    status: "ready",
    currency: null,
    timezone: "UTC",
    warnings: [
      data.note,
      "Daily Page chart dates are provider period end times. Followers are a current snapshot, not period growth.",
      ...data.warnings,
      ...(data.truncated
        ? [
            "Post list and count are partial because the provider pagination limit was reached.",
          ]
        : []),
    ],
    metrics: metricsFor(
      config,
      "facebook",
      socialValues(data),
      prior ? socialValues(prior) : {}
    ),
    series: Array.from(days, ([date, values]) => ({ date, values })).sort(
      (a, b) => a.date.localeCompare(b.date)
    ),
    detailLabel: "Published posts · current lifetime engagement",
    detailMetrics: ["reactions", "comments", "shares"],
    details: data.posts.slice(0, 30).map(p => ({
      name: (p.message || "Media post").slice(0, 200),
      values: {
        reactions: p.reactions,
        comments: p.comments,
        shares: p.shares,
      },
    })),
  };
}
export function insightFindings(
  accounts: InsightAccount[],
  compare: boolean
): string[] {
  const findings: string[] = [];
  for (const a of accounts) {
    if (a.status === "unavailable") {
      findings.push(
        `${a.name}: data could not be loaded. Review the connection before drawing conclusions.`
      );
      continue;
    }
    const ranked = a.metrics
      .filter(m => m.value !== null && m.key !== "followers")
      .sort((a, b) => Math.abs(b.change ?? 0) - Math.abs(a.change ?? 0));
    for (const m of ranked.slice(0, 2)) {
      const change =
        m.change === null
          ? compare
            ? " The previous-period change is unavailable or has a zero baseline."
            : ""
          : m.change === 0
            ? " Unchanged from the previous period."
            : ` ${Math.abs(m.change).toFixed(1)}% ${m.change > 0 ? "higher" : "lower"} than the previous period.`;
      findings.push(
        `${a.name}: ${insightMetrics[m.key].label.toLowerCase()} is ${insightNumber(m.value, m.key, a.currency)}.${change}`
      );
    }
    if (!ranked.length)
      findings.push(
        `${a.name}: no selected period metrics are available. Review metric selection and account permissions.`
      );
  }
  return findings;
}
export async function buildInsightResult(
  db: Database,
  organizationId: number,
  config: InsightConfig,
  at: number
): Promise<InsightResult> {
  const range = insightRange(config, at),
    previousRange = config.compare ? reportPreviousRange(range) : null;
  const connections = await db
    .select()
    .from(channelConnections)
    .where(
      and(
        eq(channelConnections.organizationId, organizationId),
        inArray(channelConnections.id, config.connectionIds)
      )
    );
  const accounts: InsightAccount[] = [];
  for (const id of config.connectionIds) {
    const c = connections.find(
      (c): c is typeof c & { channel: InsightChannel } =>
        c.id === id && isInsightChannel(c.channel)
    );
    try {
      if (!c || c.status !== "connected")
        throw new Error("connection unavailable");
      let account: InsightAccount,
        comparisonFailed = false;
      if (c.channel === "meta_ads") {
        const data = await adsReport(
          c,
          range,
          config.includeInactiveCampaigns === true
        );
        const previous = previousRange
          ? await adsReport(
              c,
              previousRange,
              config.includeInactiveCampaigns === true
            ).catch(() => {
              comparisonFailed = true;
              return undefined;
            })
          : undefined;
        account = normalizeAdInsight(c, config, data, previous);
      } else if (c.channel === "google_ads") {
        const data = await googleAdsReport(
          db,
          organizationId,
          c.id,
          range,
          config.includeInactiveCampaigns === true,
          config.googleDetailLevel
        );
        const previous = previousRange
          ? await googleAdsReport(
              db,
              organizationId,
              c.id,
              previousRange,
              config.includeInactiveCampaigns === true
            ).catch(() => {
              comparisonFailed = true;
              return undefined;
            })
          : undefined;
        account = normalizeGoogleInsight(c, config, data, previous);
      } else {
        const data = await facebookReport(c, range);
        const previous = previousRange
          ? await facebookReport(c, previousRange).catch(() => {
              comparisonFailed = true;
              return undefined;
            })
          : undefined;
        account = normalizeSocialInsight(c, config, data, previous);
      }
      if (comparisonFailed)
        account.warnings.push(
          "Previous-period data could not be loaded. Current-period values remain available."
        );
      if (c.channel !== "facebook")
        account.warnings.push(
          config.includeInactiveCampaigns
            ? "Campaign scope: all statuses, including inactive campaigns."
            : "Campaign scope: currently active campaigns only. The same current-status rule applies to both date ranges."
        );
      accounts.push(account);
    } catch (error) {
      accounts.push({
        connectionId: id,
        name: c?.name ?? "Unavailable account",
        channel: c?.channel ?? "meta_ads",
        currency: c?.details.currency ?? null,
        timezone: c?.details.timezone ?? null,
        status: "unavailable",
        error:
          error instanceof GoogleAdsError
            ? error.message
            : "Data could not be loaded. Check the account connection, reporting permissions, and date range, then run again.",
        warnings: [],
        metrics: [],
        series: [],
        detailLabel: "",
        detailMetrics: [],
        details: [],
      });
    }
  }
  return {
    version: 1,
    name: config.name,
    description: config.description,
    generatedAtMs: Date.now(),
    range,
    previousRange,
    timezone: config.timezone,
    accounts,
    findings: insightFindings(accounts, config.compare),
    warnings: [
      ...(config.period === "today"
        ? [
            TODAY_REPORT_NOTE,
            ...(config.compare
              ? ["Today is a partial day compared with the full previous day."]
              : []),
          ]
        : []),
      "Accounts are reported separately. Currencies and overlapping audiences are never added together.",
      "Comparisons describe observed changes and do not establish causation. Missing values are unavailable, not zero.",
      "Reporting dates are resolved in the report timezone; each source retains its own reporting timezone and attribution rules.",
    ],
  };
}
