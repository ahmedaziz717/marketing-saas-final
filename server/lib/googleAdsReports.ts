import { rangeSchema, type DateRange } from "../../shared/channels";
import type { InsightMetric } from "../../shared/insights";
import type { ChannelConnection } from "../../drizzle/channelSchema";
import {
  GoogleAdsError,
  googleAdsRows,
  googleOAuthConfigured,
} from "./googleAdsApi";
import { withGoogleAdsAccess } from "./googleAdsConnections";
import type { LibraryDatabase } from "./assetLibrary";

type Values = Partial<Record<InsightMetric, number | null>>;
type Row = {
  metrics?: Record<string, unknown>;
  segments?: { date?: string };
  campaign?: {
    id?: string;
    name?: string;
    status?: string;
    advertisingChannelType?: string;
  };
};
// Protobuf JSON can omit zero-valued numeric fields. Invalid values stay unavailable.
function number(value: unknown): number | null {
  if (value === undefined) return 0;
  if (typeof value !== "string" && typeof value !== "number") return null;
  if (value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}
function total(rows: Row[] | undefined, key: string): number | null {
  if (!rows) return null;
  let sum = 0;
  for (const row of rows) {
    const value = number(row.metrics?.[key]);
    if (value === null) return null;
    sum += value;
  }
  return sum;
}
const ratio = (a: number | null, b: number | null) =>
  a !== null && b !== null && b > 0 ? a / b : null;
export function googleAdValues(
  rows: Row[] | undefined,
  purchases: Row[] | undefined
): Values {
  const micros = total(rows, "costMicros");
  const spend = micros === null ? null : micros / 1_000_000;
  const impressions = total(rows, "impressions");
  const clicks = total(rows, "clicks");
  const conversions = total(rows, "conversions");
  const conversionValue = total(rows, "conversionsValue");
  const purchaseCount = total(purchases, "conversions");
  const purchaseValue = total(purchases, "conversionsValue");
  const ctr = ratio(clicks, impressions);
  return {
    spend,
    impressions,
    clicks,
    conversions,
    conversionValue,
    purchases: purchaseCount,
    purchaseValue,
    roas: ratio(purchaseValue, spend),
    cpa: ratio(spend, purchaseCount),
    clickCtr: ctr === null ? null : ctr * 100,
    cpc: ratio(spend, clicks),
    costPerConversion: ratio(spend, conversions),
    conversionRoas: ratio(conversionValue, spend),
  };
}

/** Only SELECT queries. Conversion segments never multiply spend, clicks or impressions. */
export async function readGoogleAdsReport(
  connection: ChannelConnection,
  accessToken: string,
  range: DateRange
) {
  const dates = rangeSchema.parse(range);
  const where = `segments.date BETWEEN '${dates.since}' AND '${dates.until}'`;
  const metrics =
    "metrics.cost_micros, metrics.impressions, metrics.clicks, metrics.conversions, metrics.conversions_value";
  const purchaseMetrics =
    "segments.conversion_action_category, metrics.conversions, metrics.conversions_value";
  const purchaseWhere = `${where} AND segments.conversion_action_category = 'PURCHASE'`;
  const queries = [
    `SELECT ${metrics} FROM customer WHERE ${where}`,
    `SELECT segments.date, ${metrics} FROM customer WHERE ${where} ORDER BY segments.date`,
    `SELECT campaign.id, campaign.name, campaign.status, campaign.advertising_channel_type, ${metrics} FROM campaign WHERE ${where} ORDER BY metrics.cost_micros DESC`,
    `SELECT ${purchaseMetrics} FROM customer WHERE ${purchaseWhere}`,
    `SELECT segments.date, ${purchaseMetrics} FROM customer WHERE ${purchaseWhere} ORDER BY segments.date`,
    `SELECT campaign.id, ${purchaseMetrics} FROM campaign WHERE ${purchaseWhere}`,
  ];
  const results = await Promise.allSettled(
    queries.map(query =>
      googleAdsRows(
        accessToken,
        connection.accountId,
        query,
        connection.details.google?.loginCustomerId
      )
    )
  );
  // Let the access wrapper refresh and retry if Google invalidated the access token.
  for (const result of results)
    if (
      result.status === "rejected" &&
      result.reason instanceof GoogleAdsError &&
      result.reason.reason === "expired"
    )
      throw result.reason;
  if (results[0].status === "rejected") throw results[0].reason;
  const labels = [
    "Account totals",
    "Daily performance",
    "Campaign performance",
    "Purchase totals",
    "Daily purchases",
    "Campaign purchases",
  ];
  const warnings = results.flatMap((result, i) =>
    result.status === "rejected"
      ? [`${labels[i]} are unavailable. Refresh the report to try again.`]
      : []
  );
  const rows = results.map(result =>
    result.status === "fulfilled" ? (result.value as Row[]) : undefined
  );
  const [
    summary,
    daily,
    campaigns,
    purchases,
    dailyPurchases,
    campaignPurchases,
  ] = rows;
  const days = Array.from(
    new Set(
      [...(daily ?? []), ...(dailyPurchases ?? [])].flatMap(row =>
        row.segments?.date ? [row.segments.date] : []
      )
    )
  ).sort();
  return {
    summary: googleAdValues(summary, purchases),
    currency: connection.details.currency || null,
    timezone: connection.details.timezone || null,
    daily: days.map(date => ({
      date,
      values: googleAdValues(
        daily?.filter(row => row.segments?.date === date),
        dailyPurchases?.filter(row => row.segments?.date === date)
      ),
    })),
    campaigns: (campaigns ?? []).map(row => ({
      id: String(row.campaign?.id ?? ""),
      name: row.campaign?.name || `Campaign ${row.campaign?.id ?? ""}`,
      type: row.campaign?.advertisingChannelType || "UNKNOWN",
      status: row.campaign?.status || "UNKNOWN",
      values: googleAdValues(
        [row],
        campaignPurchases?.filter(p => p.campaign?.id === row.campaign?.id)
      ),
    })),
    warnings,
    attribution:
      "Google Ads attribution in the account timezone, reported by ad interaction date. Conversions and conversion value use Google's Conversions columns; purchases include only PURCHASE-category conversions in those columns. Values may be fractional or adjusted as delayed conversions arrive. These are platform-attributed results, not deduplicated business sales.",
  };
}

export function googleAdsReport(
  db: LibraryDatabase,
  organizationId: number,
  id: string,
  range: DateRange
) {
  if (!googleOAuthConfigured()) throw new GoogleAdsError("reporting");
  return withGoogleAdsAccess(
    db,
    organizationId,
    id,
    (connection, accessToken) =>
      readGoogleAdsReport(connection, accessToken, range)
  );
}
