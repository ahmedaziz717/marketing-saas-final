import type { ChannelConnection } from "../../drizzle/channelSchema";
import {
  actionValue,
  rangeSchema,
  type DateRange,
} from "../../shared/channels";
import {
  copyComparisonSchema,
  copyEvidenceSchema,
  copyFields,
  type CopyEvidence,
} from "../../shared/copyEvidence";
import { connectionToken } from "./channelConnections";
import {
  ChannelGraphError,
  graphCollection,
  graphRequest,
  remoteId,
} from "./channelGraph";
import { adMetrics } from "./channelReports";
import { aggregateEvidence, classifyImported } from "./optimizationAnalysis";

const MAX_ADS = 100;
const purchaseActions = [
  "offsite_conversion.fb_pixel_purchase",
  "omni_purchase",
  "purchase",
];
const attribution =
  "Meta account attribution setting; conversion-date reporting. Platform-attributed purchases are not deduplicated business sales.";

/** Extract only supplied creative text; never infer image text or dynamic variant results. */
export function creativeCopy(creative: Record<string, any>) {
  const story = creative.object_story_spec ?? {};
  const link = story.link_data ?? {};
  const video = story.video_data ?? {};
  const feed = creative.asset_feed_spec ?? {};
  const children = Array.isArray(link.child_attachments)
    ? link.child_attachments
    : [];
  const texts = (values: unknown[]) =>
    Array.from(
      new Set(
        values
          .filter((v): v is string => typeof v === "string" && !!v.trim())
          .map(v => v.trim())
      )
    );
  const feedTexts = (v: unknown) =>
    Array.isArray(v) ? v.map(i => i?.text) : [];
  const copy = {
    headline: texts([
      creative.title,
      link.name,
      video.title,
      ...feedTexts(feed.titles),
      ...children.map((c: any) => c.name),
    ]),
    primary_text: texts([
      creative.body,
      link.message,
      video.message,
      story.photo_data?.message,
      ...feedTexts(feed.bodies),
    ]),
    description: texts([
      link.description,
      video.link_description,
      ...feedTexts(feed.descriptions),
      ...children.map((c: any) => c.description),
    ]),
  };
  const oversized = copyFields.some(
    f => copy[f].length > 20 || copy[f].some(t => t.length > 4000)
  );
  const ambiguous =
    children.length > 0 ||
    copyFields.some(f => copy[f].length > 1) ||
    oversized;
  for (const field of copyFields)
    copy[field] = copy[field].slice(0, 20).map(t => t.slice(0, 4000));
  return {
    copy,
    ambiguous,
    warning: oversized
      ? "Creative text exceeded the inspection limit; excluded from style comparisons."
      : ambiguous
        ? "Multiple variants or carousel cards: ad-level results cannot identify the winning individual text."
        : null,
  };
}

/** Bounded, read-only, fresh queries. Does not enqueue or resume historical ingestion. */
export async function liveMetaCopyReport(
  c: ChannelConnection,
  supplied: DateRange
): Promise<CopyEvidence> {
  const range = rangeSchema.parse(supplied);
  const token = connectionToken(c);
  const accountId = c.accountId.replace(/^act_/, "");
  const insights = await graphCollection(
    `act_${remoteId(accountId)}/insights`,
    token,
    {
      level: "ad",
      time_range: JSON.stringify(range),
      use_account_attribution_setting: "true",
      action_report_time: "conversion",
      fields:
        "ad_id,ad_name,campaign_id,adset_id,spend,impressions,clicks,inline_link_clicks,actions,action_values",
    },
    5
  );
  // No status filter: historical performance must include ads that are now paused.
  const rows = insights.data.filter(
    r => Number(r.impressions) > 0 || Number(r.spend) > 0
  );
  if (new Set(rows.map(r => String(r.ad_id))).size !== rows.length)
    throw new Error(
      "Meta returned duplicate ad totals. Narrow the date range and retry; duplicate results are not added together."
    );
  const purchaseAction =
    purchaseActions.find(name =>
      rows.some(
        r =>
          Array.isArray(r.actions) &&
          r.actions.some((a: any) => a.action_type === name)
      )
    ) ?? null;
  const selected = rows
    .slice()
    .sort((a, b) => Number(b.spend ?? 0) - Number(a.spend ?? 0))
    .slice(0, MAX_ADS);
  const ads: CopyEvidence["ads"] = [];
  // Five concurrent object reads keep this synchronous step within its worker lease.
  for (let offset = 0; offset < selected.length; offset += 5) {
    const batch = await Promise.all(
      selected.slice(offset, offset + 5).map(async row => {
        let ad: Record<string, any> | null = null;
        let warning: string | null = null;
        try {
          const fetched = await graphRequest(
            remoteId(String(row.ad_id)),
            token,
            {
              fields:
                "id,name,account_id,campaign_id,adset_id,creative{id,title,body,object_story_spec,asset_feed_spec}",
            }
          );
          if (String(fetched.account_id) !== accountId)
            throw new Error(
              "Meta returned an ad outside the selected account."
            );
          ad = fetched;
        } catch (error) {
          // Deleted/inaccessible individual creatives can be disclosed as missing.
          // Auth, transport, throttling and account mismatches must fail/retry the read.
          if (
            !(error instanceof ChannelGraphError) ||
            ![100, 10, 200].includes(error.code ?? 0)
          )
            throw error;
          warning =
            "Ad creative could not be read from Meta. Its performance remains visible; it is excluded from style comparisons.";
        }
        const extracted = creativeCopy(ad?.creative ?? {});
        const metrics = adMetrics(row);
        metrics.purchases = purchaseAction
          ? actionValue(row.actions, [purchaseAction])
          : null;
        metrics.purchaseValue = purchaseAction
          ? actionValue(row.action_values, [purchaseAction])
          : null;
        metrics.roas =
          metrics.spend !== null &&
          metrics.spend > 0 &&
          metrics.purchaseValue !== null
            ? metrics.purchaseValue / metrics.spend
            : null;
        return {
          id: String(row.ad_id),
          name: String(row.ad_name ?? ad?.name ?? row.ad_id),
          campaignId: String(row.campaign_id ?? ""),
          adsetId: String(row.adset_id ?? ""),
          creativeId: ad?.creative?.id ? String(ad.creative.id) : null,
          ...extracted,
          warning: warning ?? extracted.warning,
          metrics,
        };
      })
    );
    ads.push(...batch);
  }
  const missingCreativeAds = ads.filter(
    a => !copyFields.some(f => a.copy[f].length)
  ).length;
  const truncated = insights.truncated || rows.length > MAX_ADS;
  return copyEvidenceSchema.parse({
    source: "live_meta_ad_copy",
    schemaVersion: 1,
    connectionId: c.id,
    accountId,
    accountName: c.name,
    range,
    currency: c.details.currency ?? null,
    timezone: c.details.timezone ?? "UTC",
    fetchedAtMs: Date.now(),
    purchaseAction,
    attribution,
    ads,
    coverage: {
      insightsReturned: rows.length,
      inspectedAds: ads.length,
      missingCreativeAds,
      truncated,
    },
    warnings: [
      ...(truncated
        ? [
            "Partial coverage: at most 500 insight rows and the 100 highest-spend returned ads are inspected. Narrow the date range for complete coverage; no overall winner is declared.",
          ]
        : []),
      ...(missingCreativeAds
        ? [`${missingCreativeAds} ads have no readable creative text.`]
        : []),
      "Creative text is the current Meta snapshot joined to performance for the selected dates, not a historical revision of the text.",
      "Subheadlines embedded in images are not extracted. Primary text is a separate Meta field, not an image subheadline.",
      "Missing or suppressed purchase metrics remain unavailable, not zero. One purchase action definition is used for the whole report.",
    ],
  });
}

/** Existing deterministic text rules; exclusive style signatures prevent double counting. */
export function copyStyle(text: string) {
  const styles =
    classifyImported({}, { body: text }).find(
      a => a.dimension === "messaging_style"
    )?.labels ?? [];
  return {
    label: styles.length
      ? styles
          .map(s => s.label)
          .sort()
          .join(" + ")
      : "Unclassified",
    evidence: styles.map(s => s.evidence),
  };
}

export function compareLiveCopy(value: unknown, supplied: unknown = {}) {
  const source = copyEvidenceSchema.parse(value);
  const settings = copyComparisonSchema.parse(supplied);
  const fields = copyFields.map(field => {
    const candidates = source.ads.filter(
      a => !a.ambiguous && !a.warning && a.copy[field].length === 1
    );
    const buckets = new Map<string, typeof candidates>();
    for (const ad of candidates) {
      const label = copyStyle(ad.copy[field][0]).label;
      buckets.set(label, [...(buckets.get(label) ?? []), ad]);
    }
    const groups = Array.from(buckets, ([label, ads]) => {
      // Reuse metric aggregation, not the legacy classifier-confidence score or daily sample labels.
      const {
        confidence: _confidence,
        dates: _dates,
        samples: _samples,
        evidenceStrength: _strength,
        ...metrics
      } = aggregateEvidence(
        ads.map(ad => ({
          adId: ad.id,
          date: source.range.since,
          metrics: ad.metrics,
          dimensions: {},
          confidence: 1,
          currency: source.currency,
          attribution: source.attribution,
        }))
      );
      return { label, ...metrics };
    })
      .map(group => ({
        ...group,
        eligible:
          group.label !== "Unclassified" &&
          group.impressions !== null &&
          group.impressions >= settings.minimumImpressions &&
          group.purchases !== null &&
          group.purchases >= settings.minimumPurchases &&
          group.spend !== null &&
          group.spend > 0 &&
          (settings.objective === "cpa"
            ? group.cpa !== null
            : group.roas !== null),
      }))
      .sort(
        (a, b) =>
          (a.eligible === b.eligible ? 0 : a.eligible ? -1 : 1) ||
          (settings.objective === "cpa"
            ? (a.cpa ?? Infinity) - (b.cpa ?? Infinity)
            : (b.roas ?? -Infinity) - (a.roas ?? -Infinity)) ||
          a.label.localeCompare(b.label)
      );
    const eligible = groups.filter(g => g.eligible);
    const metric = settings.objective;
    const tied =
      eligible.length >= 2 && eligible[0][metric] === eligible[1][metric];
    const observedLeader =
      !source.coverage.truncated &&
      !source.coverage.missingCreativeAds &&
      eligible.length >= 2 &&
      !tied
        ? eligible[0].label
        : null;
    return {
      field,
      groups,
      observedLeader,
      comparedAds: candidates.length,
      excludedAds: source.ads.length - candidates.length,
      classifications: candidates.map(ad => ({
        adId: ad.id,
        ...copyStyle(ad.copy[field][0]),
      })),
    };
  });
  return {
    source: "live_meta_copy_analysis",
    schemaVersion: 1,
    settings,
    evidence: source,
    fields,
    confidence: null,
    summary: fields.some(f => f.observedLeader)
      ? "Observed style differences are available for review. They do not establish that the copy caused the results."
      : "Insufficient comparable evidence to identify a style leader. Inspect source ads, missing fields, and coverage below.",
    limitations: [
      "This is a descriptive comparison, not an A/B test. Creative, audience, placement, offer and budget differences can explain performance.",
      "No statistically calibrated confidence percentage is available for this copy-style comparison. It is not reported as 0% or a fixed score.",
      "Styles use existing explicit text rules (educational, direct, reassuring); unmatched text stays Unclassified. Rule matches are shown with each source ad and are not proof of a winning style.",
      "Each ad contributes once within each field. Headline, primary-text and description tables overlap and must not be added together.",
      "Multi-variant and carousel ads are shown as evidence but excluded from style ranking because individual text performance is not established.",
    ],
  };
}
export type LiveCopyAnalysis = ReturnType<typeof compareLiveCopy>;
