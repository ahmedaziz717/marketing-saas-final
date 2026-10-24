import { googleAdValues } from "./googleAdsReports";
import { googleAdsRows } from "./googleAdsApi";
import {
  googleReportDetails,
  type GoogleDetailLevel,
} from "../../shared/googleReportDetails";
import type { ChannelConnection } from "../../drizzle/channelSchema";
import { rangeSchema, type DateRange } from "../../shared/channels";
export async function readGoogleReportDetails(
  connection: ChannelConnection,
  token: string,
  range: DateRange,
  level: Exclude<GoogleDetailLevel, "campaign">,
  includeInactive: boolean
) {
  rangeSchema.parse(range);
  const definitions = {
    ad_group: {
      resource: "ad_group",
      fields: "campaign.name, ad_group.id, ad_group.name",
      key: (r: any) => String(r.adGroup.id),
      name: (r: any) => `${r.adGroup.name} · ${r.campaign.name}`,
    },
    asset_group: {
      resource: "asset_group",
      fields: "campaign.name, asset_group.id, asset_group.name",
      key: (r: any) => String(r.assetGroup.id),
      name: (r: any) => `${r.assetGroup.name} · ${r.campaign.name}`,
    },
    ad: {
      resource: "ad_group_ad",
      fields:
        "campaign.name, ad_group.id, ad_group_ad.ad.id, ad_group_ad.ad.name",
      key: (r: any) => `${r.adGroup.id}~${r.adGroupAd.ad.id}`,
      name: (r: any) =>
        `${r.adGroupAd.ad.name || `Ad ${r.adGroupAd.ad.id}`} · ${r.campaign.name}`,
    },
    device: {
      resource: "campaign",
      fields: "segments.device",
      key: (r: any) => r.segments.device || "UNKNOWN",
      name: (r: any) => (r.segments.device || "Unknown").replaceAll("_", " "),
    },
    country: {
      resource: "user_location_view",
      fields: "user_location_view.country_criterion_id",
      key: (r: any) => String(r.userLocationView.countryCriterionId),
      name: (r: any) => `Country ${r.userLocationView.countryCriterionId}`,
    },
    hour: {
      resource: "campaign",
      fields: "segments.hour",
      key: (r: any) => String(r.segments.hour ?? 0),
      name: (r: any) =>
        `${String(r.segments.hour ?? 0).padStart(2, "0")}:00 · account time`,
    },
  };
  const definition = definitions[level];
  const where = `segments.date BETWEEN '${range.since}' AND '${range.until}'${includeInactive ? "" : " AND campaign.status = 'ENABLED'"}`;
  const read = (fields: string, purchases = false) =>
    googleAdsRows(
      token,
      connection.accountId,
      `SELECT ${definition.fields}, ${fields} FROM ${definition.resource} WHERE ${where}${purchases ? " AND segments.conversion_action_category = 'PURCHASE'" : ""}`,
      connection.details.google?.loginCustomerId
    );
  const [rows, purchaseRows] = await Promise.all([
    read(
      "metrics.cost_micros, metrics.impressions, metrics.clicks, metrics.conversions, metrics.conversions_value"
    ),
    read(
      "segments.conversion_action_category, metrics.conversions, metrics.conversions_value",
      true
    ),
  ]);
  const grouped = new Map<string, any[]>(),
    purchases = new Map<string, any[]>();
  for (const row of rows) {
    const key = definition.key(row);
    grouped.set(key, [...(grouped.get(key) ?? []), row]);
  }
  for (const row of purchaseRows) {
    const key = definition.key(row);
    purchases.set(key, [...(purchases.get(key) ?? []), row]);
  }
  const names = new Map<string, string>();
  if (level === "country" && grouped.size) {
    const ids = Array.from(grouped.keys()).filter(id => /^\d+$/.test(id));
    if (ids.length)
      for (const row of await googleAdsRows(
        token,
        connection.accountId,
        `SELECT geo_target_constant.id, geo_target_constant.name FROM geo_target_constant WHERE geo_target_constant.id IN (${ids.join(",")})`,
        connection.details.google?.loginCustomerId
      ))
        names.set(String(row.geoTargetConstant.id), row.geoTargetConstant.name);
  }
  return {
    label: `${googleReportDetails[level]} · top 30 by spend${["ad_group", "ad"].includes(level) ? " · Performance Max uses asset groups" : level === "asset_group" ? " · group totals do not measure individual assets" : ""}`,
    rows: Array.from(grouped, ([id, group]) => ({
      name: names.get(id) ?? definition.name(group[0]),
      values: googleAdValues(group, purchases.get(id) ?? []),
    })),
  };
}
