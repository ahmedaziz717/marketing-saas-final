import type { ChannelConnection } from "../../drizzle/channelSchema";
import { historyRangeSchema, type SyncTask } from "../../shared/optimization";
import { moveDate } from "../../shared/channels";
import { googleAdsRows } from "./googleAdsApi";
import { withGoogleAdsAccess } from "./googleAdsConnections";
import { googleAdValues } from "./googleAdsReports";
import type { LibraryDatabase } from "./assetLibrary";

export function googleHistoryTasks(range: {
  since: string;
  until: string;
}): SyncTask[] {
  historyRangeSchema.parse(range);
  const tasks: SyncTask[] = [
    "account",
    "campaign",
    "adset",
    "ad",
    "creative",
  ].map(kind => ({
    kind: kind as SyncTask["kind"],
    edge: `google/${kind}`,
    fields: "id,name,channel",
  }));
  for (
    let since = range.since;
    since <= range.until;
    since = moveDate(since, 7)
  ) {
    const until = [moveDate(since, 6), range.until].sort()[0];
    for (const grain of ["daily", "placement", "hourly"] as const)
      tasks.push({
        kind: "insight",
        edge: `google/${grain}`,
        fields: "ad_id,campaign_id,adset_id,date_start,googleValues",
        range: { since, until },
        grain,
      });
  }
  return tasks;
}
const adId = (row: any) => `g_ad_${row.adGroup.id}_${row.adGroupAd.ad.id}`;
const groupId = (id: unknown) => `g_asset_group_${id}`;
function textAssets(ad: any) {
  const content =
    ad.responsiveSearchAd ??
    ad.responsiveDisplayAd ??
    ad.demandGenMultiAssetAd ??
    ad.appAd ??
    {};
  return [
    ...(content.headlines ?? []),
    ...(content.descriptions ?? []),
    ...(content.longHeadline ? [content.longHeadline] : []),
  ]
    .map(v => v.text)
    .filter((v): v is string => typeof v === "string");
}
export async function readGoogleHistory(
  db: LibraryDatabase,
  organizationId: number,
  connection: ChannelConnection,
  task: SyncTask
): Promise<Record<string, any>> {
  return withGoogleAdsAccess(
    db,
    organizationId,
    connection.id,
    async (c, token) => {
      const read = (q: string) =>
        googleAdsRows(token, c.accountId, q, c.details.google?.loginCustomerId);
      if (task.kind === "account") {
        const [row] = await read(
          "SELECT customer.id, customer.descriptive_name, customer.currency_code, customer.time_zone FROM customer"
        );
        return {
          id: String(row.customer.id),
          name: row.customer.descriptiveName,
          currency: row.customer.currencyCode,
          timezone_name: row.customer.timeZone,
          channel: "google_ads",
        };
      }
      if (task.kind === "campaign")
        return {
          data: (
            await read(
              "SELECT campaign.id, campaign.name, campaign.status, campaign.advertising_channel_type, campaign.bidding_strategy_type, campaign_budget.amount_micros FROM campaign WHERE campaign.status != 'REMOVED'"
            )
          ).map(r => ({
            id: String(r.campaign.id),
            name: r.campaign.name,
            status: r.campaign.status,
            channel: "google_ads",
            campaign_type: r.campaign.advertisingChannelType,
            bidding_strategy: r.campaign.biddingStrategyType,
            budget_micros: r.campaignBudget.amountMicros,
          })),
        };
      if (task.kind === "adset") {
        const [groups, assets] = await Promise.all([
          read(
            "SELECT ad_group.id, ad_group.name, ad_group.status, campaign.id, campaign.bidding_strategy_type, campaign_budget.amount_micros FROM ad_group WHERE ad_group.status != 'REMOVED'"
          ),
          read(
            "SELECT asset_group.id, asset_group.name, asset_group.status, campaign.id, campaign.bidding_strategy_type, campaign_budget.amount_micros FROM asset_group WHERE asset_group.status != 'REMOVED'"
          ),
        ]);
        return {
          data: [
            ...groups.map(r => ({
              ...r,
              group: r.adGroup,
              id: `g_ad_group_${r.adGroup.id}`,
            })),
            ...assets.map(r => ({
              ...r,
              group: r.assetGroup,
              id: groupId(r.assetGroup.id),
            })),
          ].map(r => ({
            id: r.id,
            name: r.group.name,
            status: r.group.status,
            campaign_id: String(r.campaign.id),
            channel: "google_ads",
            bidding_strategy: r.campaign.biddingStrategyType,
            budget_micros: r.campaignBudget.amountMicros,
          })),
        };
      }
      if (task.kind === "ad" || task.kind === "creative") {
        const [ads, groups, texts] = await Promise.all([
          read(
            "SELECT ad_group.id, campaign.id, ad_group_ad.status, ad_group_ad.ad.id, ad_group_ad.ad.name, ad_group_ad.ad.type, ad_group_ad.ad.responsive_search_ad.headlines, ad_group_ad.ad.responsive_search_ad.descriptions, ad_group_ad.ad.responsive_display_ad.headlines, ad_group_ad.ad.responsive_display_ad.long_headline, ad_group_ad.ad.responsive_display_ad.descriptions, ad_group_ad.ad.demand_gen_multi_asset_ad.headlines, ad_group_ad.ad.demand_gen_multi_asset_ad.descriptions, ad_group_ad.ad.app_ad.headlines, ad_group_ad.ad.app_ad.descriptions FROM ad_group_ad WHERE ad_group_ad.status != 'REMOVED'"
          ),
          read(
            "SELECT campaign.id, asset_group.id, asset_group.name, asset_group.status FROM asset_group WHERE asset_group.status != 'REMOVED'"
          ),
          read(
            "SELECT asset_group.id, asset.text_asset.text FROM asset_group_asset WHERE asset.type = 'TEXT' AND asset_group_asset.status != 'REMOVED'"
          ),
        ]);
        return {
          data: [
            ...ads.map(r => {
              const id = adId(r);
              return {
                id,
                name: r.adGroupAd.ad.name || `Ad ${r.adGroupAd.ad.id}`,
                channel: "google_ads",
                entity_type: "ad",
                asset_type: r.adGroupAd.ad.type,
                campaign_id: String(r.campaign.id),
                adset_id: `g_ad_group_${r.adGroup.id}`,
                creative: { id },
                status: r.adGroupAd.status,
                google_copy: textAssets(r.adGroupAd.ad),
              };
            }),
            ...groups.map(r => {
              const id = groupId(r.assetGroup.id);
              return {
                id,
                name: r.assetGroup.name,
                channel: "google_ads",
                entity_type: "asset_group",
                asset_type: "PERFORMANCE_MAX_ASSET_GROUP",
                campaign_id: String(r.campaign.id),
                adset_id: id,
                creative: { id },
                status: r.assetGroup.status,
                google_copy: texts
                  .filter(
                    t => String(t.assetGroup.id) === String(r.assetGroup.id)
                  )
                  .map(t => t.asset.textAsset?.text)
                  .filter(Boolean),
              };
            }),
          ],
        };
      }
      const range = historyRangeSchema.parse(task.range);
      const where = `segments.date BETWEEN '${range.since}' AND '${range.until}'`;
      const breakdown =
        task.grain === "hourly"
          ? ", segments.hour"
          : task.grain === "placement"
            ? ", segments.device"
            : "";
      const metrics =
        "metrics.cost_micros, metrics.impressions, metrics.clicks, metrics.conversions, metrics.conversions_value";
      const data: Record<string, unknown>[] = [];
      // Ad rows exclude PMax. PMax is measured at asset-group level, never copied onto individual assets.
      for (const pmax of [false, true]) {
        const resource = pmax ? "asset_group" : "ad_group_ad";
        const identity = pmax
          ? "asset_group.id, campaign.id"
          : "ad_group.id, ad_group_ad.ad.id, campaign.id";
        const [base, purchases] = await Promise.all([
          read(
            `SELECT ${identity}, segments.date${breakdown}, ${metrics} FROM ${resource} WHERE ${where}`
          ),
          read(
            `SELECT ${identity}, segments.date${breakdown}, segments.conversion_action_category, metrics.conversions, metrics.conversions_value FROM ${resource} WHERE ${where} AND segments.conversion_action_category = 'PURCHASE'`
          ),
        ]);
        const identityKey = (r: any) =>
          `${pmax ? groupId(r.assetGroup.id) : adId(r)}|${r.segments.date}|${task.grain === "hourly" ? (r.segments.hour ?? 0) : ""}|${r.segments.device ?? ""}`;
        const purchaseRows = new Map<string, any[]>();
        for (const row of purchases) {
          const key = identityKey(row);
          purchaseRows.set(key, [...(purchaseRows.get(key) ?? []), row]);
        }
        for (const row of base) {
          const values = googleAdValues(
            [row],
            purchaseRows.get(identityKey(row)) ?? []
          );
          data.push({
            ad_id: pmax ? groupId(row.assetGroup.id) : adId(row),
            campaign_id: String(row.campaign.id),
            adset_id: pmax
              ? groupId(row.assetGroup.id)
              : `g_ad_group_${row.adGroup.id}`,
            date_start: row.segments.date,
            date_stop: row.segments.date,
            channel: "google_ads",
            entity_type: pmax ? "asset_group" : "ad",
            googleValues: values,
            publisher_platform: "google_ads",
            platform_position: row.segments.device
              ? `device:${row.segments.device}`
              : undefined,
            hourly_stats_aggregated_by_advertiser_time_zone:
              task.grain === "hourly"
                ? String(row.segments.hour ?? 0).padStart(2, "0")
                : undefined,
          });
        }
      }
      return { data };
    }
  );
}
