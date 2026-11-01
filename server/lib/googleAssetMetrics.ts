import { TRPCError } from "@trpc/server";
import { dateInZone } from "../../shared/channels";
import {
  googleAssetMetricsDays,
  type GoogleAssetMetricsDays,
  type GoogleAssetMetricsResult,
  type GoogleAssetPerformance,
} from "../../shared/googleAssetMetrics";
import type { LibraryDatabase } from "./assetLibrary";
import { withGoogleAdsAccess } from "./googleAdsConnections";
import { GoogleAdsError, googleAdsRows } from "./googleAdsApi";

export function assetMetricsPeriod(
  now: number,
  timezone: string,
  days: GoogleAssetMetricsDays
) {
  const today = dateInZone(now, timezone).slice(0, 10);
  const midnight = Date.parse(`${today}T00:00:00Z`);
  const day = 86400000;
  return {
    since: new Date(midnight - days * day).toISOString().slice(0, 10),
    until: new Date(midnight - day).toISOString().slice(0, 10),
  };
}
// Protobuf may omit selected numeric zero fields, but only in a successful row.
function value(raw: unknown): number | null {
  if (raw === undefined) return 0;
  if ((typeof raw !== "string" && typeof raw !== "number") || raw === "")
    return null;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? n : null;
}
export function assetPerformance(row: any): GoogleAssetPerformance {
  const metrics = row.metrics;
  const get = (key: string) =>
    metrics && typeof metrics === "object" ? value(metrics[key]) : null;
  const impressions = get("impressions"),
    interactions = get("interactions");
  return {
    resourceName: row.assetGroupAsset.resourceName,
    impressions,
    clicks: get("clicks"),
    ctr: impressions !== null && impressions > 0 ? get("ctr") : null,
    conversions: get("conversions"),
    conversionRate:
      interactions !== null && interactions > 0
        ? get("conversionsFromInteractionsRate")
        : null,
  };
}
/** Separate read-only reporting: an unavailable report never changes selectable inventory. */
export async function googleAssetMetrics(
  db: LibraryDatabase,
  organizationId: number,
  connectionId: string,
  campaignId: string,
  assetGroupId: string,
  days: GoogleAssetMetricsDays = 30,
  now = Date.now()
): Promise<GoogleAssetMetricsResult> {
  if (!/^\d{1,20}$/.test(campaignId) || !/^\d{1,20}$/.test(assetGroupId))
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Choose a valid campaign and asset group.",
    });
  googleAssetMetricsDays.parse(days);
  return withGoogleAdsAccess(
    db,
    organizationId,
    connectionId,
    async (connection, token) => {
      let timezone = connection.details.timezone || null;
      let period: { since: string; until: string } | null = null;
      const read = (query: string) =>
        googleAdsRows(
          token,
          connection.accountId,
          query,
          connection.details.google?.loginCustomerId
        );
      try {
        const groups = await read(
          `SELECT asset_group.id FROM asset_group WHERE campaign.id = ${campaignId} AND asset_group.id = ${assetGroupId} AND campaign.advertising_channel_type = 'PERFORMANCE_MAX' AND asset_group.status != 'REMOVED'`
        );
        if (!groups.length)
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Asset group not found in this account and campaign.",
          });
        if (!timezone) {
          const customers = await read(
            "SELECT customer.time_zone FROM customer LIMIT 1"
          );
          timezone = customers[0]?.customer?.timeZone || null;
        }
        if (!timezone)
          return {
            status: "unavailable",
            since: null,
            until: null,
            timezone,
            days,
            rows: [],
          };
        period = assetMetricsPeriod(now, timezone, days);
        const rows = await read(
          `SELECT campaign.id, asset_group.id, asset_group_asset.resource_name, asset_group_asset.asset, asset_group_asset.field_type, metrics.impressions, metrics.clicks, metrics.ctr, metrics.conversions, metrics.interactions, metrics.conversions_from_interactions_rate FROM asset_group_asset WHERE campaign.id = ${campaignId} AND asset_group.id = ${assetGroupId} AND asset_group_asset.status != 'REMOVED' AND segments.date BETWEEN '${period.since}' AND '${period.until}'`
        );
        const prefix = `customers/${connection.accountId}/assetGroupAssets/${assetGroupId}~`;
        const performance = rows
          .filter(
            row =>
              String(row.campaign?.id) === campaignId &&
              String(row.assetGroup?.id) === assetGroupId &&
              typeof row.assetGroupAsset?.resourceName === "string" &&
              row.assetGroupAsset.resourceName.startsWith(prefix)
          )
          .map(assetPerformance);
        if (performance.length !== rows.length)
          throw new Error("Unexpected asset metrics scope");
        return {
          status: "available",
          ...period,
          timezone,
          days,
          rows: performance,
        };
      } catch (error) {
        if (
          error instanceof TRPCError ||
          (error instanceof GoogleAdsError && error.reason === "expired")
        )
          throw error;
        return {
          status: "unavailable",
          since: period?.since ?? null,
          until: period?.until ?? null,
          timezone,
          days,
          rows: [],
        };
      }
    }
  );
}
