import type { ChannelConnection } from "../../drizzle/channelSchema";
import {
  finiteMetric,
  actionValue,
  moveDate,
  type DateRange,
} from "../../shared/channels";
import { connectionToken } from "./channelConnections";
import { graphCollection, graphRequest, remoteId } from "./channelGraph";

export type AdMetrics = {
  spend: number | null;
  impressions: number | null;
  clicks: number | null;
  linkClicks: number | null;
  purchases: number | null;
  purchaseValue: number | null;
  roas: number | null;
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
  const posts = await graphCollection(
    `${remoteId(c.accountId)}/published_posts`,
    connectionToken(c),
    {
      fields:
        "id,message,created_time,permalink_url,full_picture,reactions.limit(0).summary(true),comments.limit(0).summary(true),shares",
      since: range.since + "T00:00:00Z",
      until: moveDate(range.until, 1) + "T00:00:00Z",
    }
  );
  return {
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
        const response = await graphCollection<{
          name: string;
          values: Array<{ value: unknown; end_time: string }>;
        }>(`${remoteId(c.accountId)}/insights`, token, {
          metric,
          period: "day",
          since: range.since + "T00:00:00Z",
          until: moveDate(range.until, 1) + "T00:00:00Z",
        });
        const item = response.data.find(v => v.name === metric);
        const values = (item?.values ?? []).flatMap(v => {
          const value = finiteMetric(v.value);
          return value === null ? [] : [{ date: v.end_time, value }];
        });
        if (!values.length)
          warnings.push(`${metric}: No data returned for this period.`);
        if (response.truncated)
          warnings.push(`${metric}: Provider response was truncated.`);
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
export async function advertisingObjects(c: ChannelConnection) {
  const token = connectionToken(c);
  const [campaigns, adsets, ads] = await Promise.all([
    graphCollection(`act_${remoteId(c.accountId)}/campaigns`, token, {
      fields:
        "id,name,objective,status,effective_status,daily_budget,lifetime_budget",
    }),
    graphCollection(`act_${remoteId(c.accountId)}/adsets`, token, {
      fields:
        "id,name,campaign_id,status,effective_status,daily_budget,lifetime_budget,targeting,optimization_goal",
    }),
    graphCollection(`act_${remoteId(c.accountId)}/ads`, token, {
      fields: "id,name,adset_id,campaign_id,status,effective_status",
    }),
  ]);
  return {
    campaigns: campaigns.data,
    adsets: adsets.data,
    ads: ads.data,
    truncated: campaigns.truncated || adsets.truncated || ads.truncated,
    currency: c.details.currency ?? null,
  };
}
