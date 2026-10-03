import { splitDateRange } from "../../shared/reportDates";
import type { ChannelConnection } from "../../drizzle/channelSchema";
import {
  finiteMetric,
  actionValue,
  moveDate,
  type DateRange,
  type AdBrowseFilters,
} from "../../shared/channels";
import { connectionToken } from "./channelConnections";
import {
  ChannelGraphError,
  graphCollection,
  graphRequest,
  remoteId,
} from "./channelGraph";

export type AdMetrics = {
  spend: number | null;
  impressions: number | null;
  clicks: number | null;
  linkClicks: number | null;
  purchases: number | null;
  purchaseValue: number | null;
  roas: number | null;
  registrations?: number | null;
  leads?: number | null;
  trials?: number | null;
  subscriptions?: number | null;
};
export function adMetrics(row: Record<string, unknown>): AdMetrics {
  const spend = finiteMetric(row.spend);
  const names = [
    "offsite_conversion.fb_pixel_purchase",
    "omni_purchase",
    "purchase",
  ];
  const purchaseValue = actionValue(row.action_values, names);
  return {
    spend,
    registrations: actionValue(row.actions, [
      "offsite_conversion.fb_pixel_complete_registration",
      "complete_registration",
    ]),
    leads: actionValue(row.actions, [
      "lead",
      "offsite_conversion.fb_pixel_lead",
    ]),
    trials: actionValue(row.actions, [
      "offsite_conversion.fb_pixel_start_trial",
      "start_trial",
    ]),
    subscriptions: actionValue(row.actions, [
      "offsite_conversion.fb_pixel_subscribe",
      "subscribe",
    ]),
    impressions: finiteMetric(row.impressions),
    clicks: finiteMetric(row.clicks),
    linkClicks: finiteMetric(row.inline_link_clicks),
    purchases: actionValue(row.actions, names),
    purchaseValue,
    roas:
      spend !== null && spend > 0 && purchaseValue !== null
        ? purchaseValue / spend
        : null,
  };
}
const fields =
  "spend,impressions,clicks,inline_link_clicks,actions,action_values";
export async function adsReport(c: ChannelConnection, range: DateRange) {
  const token = connectionToken(c);
  const params = {
    time_range: JSON.stringify(range),
    use_account_attribution_setting: "true",
    action_report_time: "conversion",
  };
  const [total, daily, platforms, campaigns] = await Promise.all([
    graphCollection(`act_${remoteId(c.accountId)}/insights`, token, {
      ...params,
      fields,
      level: "account",
    }),
    graphCollection(`act_${remoteId(c.accountId)}/insights`, token, {
      ...params,
      fields,
      level: "account",
      time_increment: "1",
    }),
    graphCollection(`act_${remoteId(c.accountId)}/insights`, token, {
      ...params,
      fields: "spend,impressions,clicks",
      level: "account",
      breakdowns: "publisher_platform",
    }),
    graphCollection(`act_${remoteId(c.accountId)}/insights`, token, {
      ...params,
      fields: "campaign_id,campaign_name," + fields,
      level: "campaign",
    }),
  ]);
  return {
    summary: adMetrics(
      total.data[0] ?? {
        spend: 0,
        impressions: 0,
        clicks: 0,
        inline_link_clicks: 0,
        actions: [],
        action_values: [],
      }
    ),
    currency: c.details.currency ?? null,
    timezone: c.details.timezone ?? null,
    daily: daily.data.map(r => ({
      date: String(r.date_start),
      ...adMetrics(r),
    })),
    platforms: platforms.data.map(r => ({
      name: String(r.publisher_platform),
      ...adMetrics(r),
    })),
    campaigns: campaigns.data.map(r => ({
      id: String(r.campaign_id),
      name: String(r.campaign_name),
      ...adMetrics(r),
    })),
    truncated:
      total.truncated ||
      daily.truncated ||
      platforms.truncated ||
      campaigns.truncated,
    attribution:
      "Meta ad-account attribution setting; conversions reported on conversion date. Platform-attributed purchases are not deduplicated business sales.",
  };
}
export async function facebookPosts(c: ChannelConnection, range: DateRange) {
  const path = `${remoteId(c.accountId)}/published_posts`;
  const token = connectionToken(c);
  const params = {
    since: range.since + "T00:00:00Z",
    until: moveDate(range.until, 1) + "T00:00:00Z",
  };
  const baseFields = "id,message,created_time,permalink_url,full_picture";
  let posts: Awaited<ReturnType<typeof graphCollection<Record<string, any>>>>;
  let engagementUnavailable = false;
  try {
    posts = await graphCollection(path, token, {
      ...params,
      fields: `${baseFields},reactions.limit(0).summary(true),comments.limit(0).summary(true),shares`,
    });
  } catch (error) {
    // An optional engagement expansion must not hide otherwise readable Page posts.
    // Retry only this specific permission failure; auth and provider failures remain errors.
    if (
      !(error instanceof ChannelGraphError) ||
      error.code !== 10 ||
      !error.message.includes("pages_read_user_content")
    )
      throw error;
    posts = await graphCollection(path, token, {
      ...params,
      fields: baseFields,
    });
    engagementUnavailable = true;
  }
  return {
    engagementUnavailable,
    data: posts.data.map(p => ({
      id: String(p.id),
      message: String(p.message ?? ""),
      createdAt: String(p.created_time),
      url: typeof p.permalink_url === "string" ? p.permalink_url : null,
      image: typeof p.full_picture === "string" ? p.full_picture : null,
      reactions: finiteMetric(p.reactions?.summary?.total_count),
      comments: finiteMetric(p.comments?.summary?.total_count),
      shares: finiteMetric(p.shares?.count),
    })),
    truncated: posts.truncated,
  };
}
export async function facebookReport(c: ChannelConnection, range: DateRange) {
  const token = connectionToken(c),
    warnings: string[] = [];
  const profile = await graphRequest<{
    id: string;
    name: string;
    followers_count?: number;
  }>(remoteId(c.accountId), token, { fields: "id,name,followers_count" });
  const posts = await facebookPosts(c, range);
  const metrics = ["page_media_view", "page_post_engagements"];
  const series = await Promise.all(
    metrics.map(async metric => {
      if (!c.details.capabilities.includes("insights")) {
        warnings.push(`${metric}: Insights permission not granted.`);
        return {
          metric,
          values: [] as Array<{ date: string; value: number }>,
          total: null as number | null,
        };
      }
      try {
        const valuesByDate = new Map<string, number>();
        for (const chunk of splitDateRange(range)) {
          const response = await graphCollection<{
            name: string;
            values: Array<{ value: unknown; end_time: string }>;
          }>(`${remoteId(c.accountId)}/insights`, token, {
            metric,
            period: "day",
            since: chunk.since + "T00:00:00Z",
            until: moveDate(chunk.until, 1) + "T00:00:00Z",
          });
          for (const item of response.data.filter(v => v.name === metric)) {
            for (const v of item.values ?? []) {
              const value = finiteMetric(v.value);
              if (value !== null) valuesByDate.set(v.end_time, value);
            }
          }
          if (response.truncated)
            warnings.push(`${metric}: Provider response was truncated.`);
        }
        const values = Array.from(valuesByDate, ([date, value]) => ({
          date,
          value,
        })).sort((a, b) => a.date.localeCompare(b.date));
        if (!values.length)
          warnings.push(`${metric}: No data returned for this period.`);
        return {
          metric,
          values,
          total: values.length
            ? values.reduce((sum, v) => sum + v.value, 0)
            : null,
        };
      } catch {
        warnings.push(
          `${metric}: Unavailable for this Page, date range or permission set.`
        );
        return { metric, values: [], total: null };
      }
    })
  );
  return {
    followersNow: finiteMetric(profile.followers_count),
    posts: posts.data,
    postCount: posts.data.length,
    truncated: posts.truncated,
    series,
    warnings,
    note: "Post dates are filtered in UTC. Reactions/comments/shares are current lifetime totals on those posts, not engagement earned only within the selected period. Page views may include paid distribution and must not be added to ad impressions.",
  };
}
export async function advertisingObjects(
  c: ChannelConnection,
  filters?: AdBrowseFilters
) {
  const token = connectionToken(c);
  const status = filters?.status ?? "all";
  const statuses =
    status === "paused"
      ? ["PAUSED", "CAMPAIGN_PAUSED", "ADSET_PAUSED"]
      : [status.toUpperCase()];
  const account = `act_${remoteId(c.accountId)}`;
  const definitions = [
    {
      edge: "campaigns",
      level: "campaign",
      id: "campaign_id",
      fields:
        "id,name,objective,status,effective_status,daily_budget,lifetime_budget",
    },
    {
      edge: "adsets",
      level: "adset",
      id: "adset_id",
      fields:
        "id,name,campaign_id,status,effective_status,daily_budget,lifetime_budget,targeting,optimization_goal",
    },
    {
      edge: "ads",
      level: "ad",
      id: "ad_id",
      fields:
        "id,name,adset_id,campaign_id,status,effective_status,creative{id,name,thumbnail_url}",
    },
  ];
  const results = await Promise.all(
    definitions.map(async definition => {
      // Campaigns cannot inherit a parent's paused status.
      const allowed =
        status === "paused"
          ? definition.level === "campaign"
            ? ["PAUSED"]
            : definition.level === "adset"
              ? ["PAUSED", "CAMPAIGN_PAUSED"]
              : statuses
          : statuses;
      const objects = await graphCollection(
        `${account}/${definition.edge}`,
        token,
        {
          fields: definition.fields,
          ...(status === "all"
            ? {}
            : { effective_status: JSON.stringify(allowed) }),
        }
      );
      let data = objects.data.filter(
        row =>
          status === "all" ||
          allowed.includes(String(row.effective_status || row.status))
      );
      const reportRange = filters?.performanceRange ?? filters?.range;
      if (!reportRange) return { ...objects, data };
      const delivery = await graphCollection(`${account}/insights`, token, {
        level: definition.level,
        fields: `${definition.id},${fields},reach,frequency`,
        time_range: JSON.stringify(reportRange),
      });
      const delivered = new Set(
        delivery.data
          .filter(row => Number(row.impressions) > 0)
          .map(row => String(row[definition.id]))
      );
      if (filters?.range)
        data = data.filter(row => delivered.has(String(row.id)));
      const metrics = new Map(
        delivery.data.map(row => [
          String(row[definition.id]),
          {
            ...adMetrics(row),
            reach: finiteMetric(row.reach),
            frequency: finiteMetric(row.frequency),
          },
        ])
      );
      data = data.map(row => ({
        ...row,
        performance: metrics.get(String(row.id)) ?? null,
      }));
      return { data, truncated: objects.truncated || delivery.truncated };
    })
  );
  return {
    campaigns: results[0].data,
    adsets: results[1].data,
    ads: results[2].data,
    truncated: results.some(result => result.truncated),
    currency: c.details.currency ?? null,
  };
}
