import { creativeCopy } from "../../shared/metaCreativeCopy";
export { creativeCopy } from "../../shared/metaCreativeCopy";
import {
  classifyCopy,
  copyTaxonomy,
  type CopyDimension,
} from "../../shared/copyTaxonomy";
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
    a => !copyFields.some(f => (a.copy[f] ?? []).length)
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
  const taggedAds = source.ads.map(ad => ({
    adId: ad.id,
    tags: classifyCopy(ad.copy),
  }));
  const tagsByAd = new Map(taggedAds.map(ad => [ad.adId, ad.tags]));
  const compare = (
    field: (typeof copyFields)[number],
    dimension: CopyDimension
  ) => {
    const candidates = source.ads.filter(
      a => !a.ambiguous && !a.warning && (a.copy[field] ?? []).length === 1
    );
    const buckets = new Map<
      string,
      { label: string; ads: typeof candidates }
    >();
    for (const ad of candidates) {
      const tag = tagsByAd
        .get(ad.id)!
        .fields[field][0].dimensions.find(d => d.dimension === dimension)!;
      for (const label of tag.labels.length
        ? tag.labels
        : [{ value: "unknown", label: "Unclassified" }]) {
        const bucket = buckets.get(label.value) ?? {
          label: label.label,
          ads: [],
        };
        bucket.ads.push(ad);
        buckets.set(label.value, bucket);
      }
    }
    const groups = Array.from(buckets, ([value, { label, ads }]) => {
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
      return { value, label, ...metrics };
    })
      .map(group => ({
        ...group,
        eligible:
          group.value !== "unknown" &&
          group.impressions !== null &&
          group.impressions >= settings.minimumImpressions &&
          group.purchases !== null &&
          group.purchases >= settings.minimumPurchases &&
          group.spend !== null &&
          group.spend > 0 &&
          group[settings.objective] !== null,
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
    const distinctMembership =
      eligible.length >= 2 &&
      eligible[0].sourceAdIds.slice().sort().join() !==
        eligible[1].sourceAdIds.slice().sort().join();
    const observedLeader =
      !source.coverage.truncated &&
      !source.coverage.missingCreativeAds &&
      distinctMembership &&
      eligible[0][settings.objective] !== eligible[1][settings.objective]
        ? eligible[0].label
        : null;
    return {
      field,
      dimension,
      groups,
      observedLeader,
      comparedAds: candidates.length,
      excludedAds: source.ads.length - candidates.length,
      taggedAds: candidates.filter(
        a =>
          tagsByAd
            .get(a.id)!
            .fields[field][0].dimensions.find(d => d.dimension === dimension)!
            .labels.length
      ).length,
      classifications: candidates.map(ad => {
        const tag = tagsByAd
          .get(ad.id)!
          .fields[field][0].dimensions.find(d => d.dimension === dimension)!;
        return {
          adId: ad.id,
          label: tag.labels.map(l => l.label).join(" + ") || "Unclassified",
          evidence: tag.labels.flatMap(l => l.evidence),
        };
      }),
    };
  };
  const comparisons = copyFields.flatMap(field =>
    Array.from(new Set(settings.dimensions)).map(d => compare(field, d))
  );
  return {
    source: "live_meta_copy_analysis",
    schemaVersion: 2,
    settings,
    evidence: source,
    taggedAds,
    comparisons,
    // Preserve the legacy field projection for clients and exports that use it.
    fields: copyFields.map(
      field =>
        comparisons.find(
          c => c.field === field && c.dimension === "messaging_style"
        ) ?? compare(field, "messaging_style")
    ),
    confidence: null,
    summary: comparisons.some(f => f.observedLeader)
      ? "Observed copy differences are available across the selected dimensions. These associations do not establish what caused sales."
      : "Copy is classified across the selected dimensions. There is not enough comparable evidence to identify a performance leader.",
    limitations: [
      "This is a descriptive comparison, not an A/B test. Creative, audience, placement, offer and budget differences can explain performance.",
      "No statistically calibrated confidence percentage is available for copy effects. It is not reported as 0% or a fixed score.",
      "Automatic tags use explicit English text signals and measured word/character counts, not an AI semantic judgment. Unsupported interpretations remain Unclassified; review the matched text before drawing conclusions.",
      "An ad can have multiple values within a dimension. Each value counts that ad once; value groups and copy-field tables overlap and must not be added together. These are ad-level results, not isolated headline or description effects.",
      "All variants are tagged. Multi-variant and carousel ads are excluded from performance ranking because individual text performance is not established.",
      "Subheadlines require authored EL image text with a matching published creative. External image text is not inferred from the Meta primary text.",
    ],
  };
}
export type LiveCopyAnalysis = ReturnType<typeof compareLiveCopy>;
