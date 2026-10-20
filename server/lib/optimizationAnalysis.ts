import { learningWeight, snapshotAssertions, type CreativeIntelligence } from "../../shared/creativeIntelligence";
import { classifyCopyText } from "../../shared/copyTaxonomy";
import { creativeCopy } from "../../shared/metaCreativeCopy";
import { saveCopySnapshots } from "./copyClassificationStore";
import { publications } from "../../drizzle/channelSchema";
import {
  activityEvents,
  brandAssets,
  creativeVariants,
  creativeJobs,
} from "../../drizzle/schema";
import { randomUUID } from "node:crypto";
import { and, eq, desc, gte, lte, gt, inArray, sql } from "drizzle-orm";
import {
  optimizationRecords,
  optimizationClassifications,
  optimizationSyncs,
} from "../../drizzle/optimizationSchema";
import {
  assertionSchema,
  canonicalLabel,
  dimensionNames,
  effectiveClassifications,
  TAXONOMY_VERSION,
  evidenceCaveats,
  type AnalysisQuery,
  type Assertion,
  type Classification,
  type Dimension,
} from "../../shared/optimization";
import type { LibraryDatabase } from "./assetLibrary";
import { adMetrics } from "./channelReports";
import { getConnection } from "./channelConnections";
import { stableHash } from "./policy";
import { withOrganizationTransaction } from "./activity";

export function classifyImported(
  ad: Record<string, any>,
  creative: Record<string, any> = {},
  adset: Record<string, any> = {}
): Assertion[] {
  const assertions = new Map<Dimension, Assertion>(
    dimensionNames.map(d => [
      d,
      {
        dimension: d,
        labels: [],
        status: "unknown", basis: "observed",
        unknownReason:
          "No reliable source evidence. Add a reviewed classification.",
      },
    ])
  );
  const add = (
    dimension: Dimension,
    value: unknown,
    evidence: string,
    confidence = 1
  ) => {
    if (value === undefined || value === null || value === "") return;
    const label = String(value);
    const a = assertions.get(dimension)!;
    a.unknownReason = undefined;
    a.status = "known";
    a.labels.push({
      id: canonicalLabel(dimension, label),
      label,
      confidence,
      evidence,
    });
  };
  add("channel", "meta_ads", "Connected Meta ad account");
  add(
    "asset_type",
    creative.video_id ? "video" : creative.image_url ? "image" : undefined,
    "Meta creative video_id/image_url"
  );
  add(
    "cta",
    creative.call_to_action_type ??
      creative.object_story_spec?.link_data?.call_to_action?.type,
    "Meta creative CTA"
  );
  add(
    "bid_strategy",
    adset.bid_strategy,
    "Current ad-set snapshot, not historical bid settings"
  );
  add(
    "budget",
    adset.daily_budget
      ? `daily_minor_units:${adset.daily_budget}`
      : adset.lifetime_budget
        ? `lifetime_minor_units:${adset.lifetime_budget}`
        : undefined,
    "Current ad-set budget in account currency minor units"
  );
  if (adset.targeting)
    add(
      "audience",
      `targeting:${stableHash(adset.targeting).slice(0, 12)}`,
      JSON.stringify(adset.targeting).slice(0, 1800)
    );
  const copy = Object.values(creativeCopy(creative).copy).flat().join("\n");
  for (const tag of classifyCopyText(copy).dimensions) {
    const assertion = assertions.get(tag.dimension)!;
    assertion.unknownReason = tag.unknownReason;
    assertion.status = tag.labels.length ? "known" : "unknown";
    assertion.labels = tag.labels.map(label => ({
      id: label.value,
      label: label.label,
      confidence: 0.65,
      evidence: label.evidence.length
        ? `Text signals: ${label.evidence.join("; ")}. Review interpretation.`
        : "No explicit signal detected by the current text rules.",
    }));
  }
  if (/\b(financing|monthly payments|pay over time|APR)\b/i.test(copy))
    add(
      "financing",
      "financing_mentioned",
      "Explicit financing language.",
      0.65
    );
  return Array.from(assertions.values());
}
export async function saveClassification(
  db: LibraryDatabase,
  organizationId: number,
  connectionId: string,
  adId: string,
  assertion: Assertion,
  source: "human" | "rule" | "import",
  actorUserId?: number
) {
  const parsed = assertionSchema.parse(assertion);
  parsed.labels = parsed.labels.map(l => ({
    ...l,
    id: canonicalLabel(parsed.dimension, l.id),
  }));
  return withOrganizationTransaction(db, organizationId, async tx => {
    const [ad] = await tx
      .select({ id: optimizationRecords.id })
      .from(optimizationRecords)
      .where(
        and(
          eq(optimizationRecords.organizationId, organizationId),
          eq(optimizationRecords.connectionId, connectionId),
          eq(optimizationRecords.kind, "ad"),
          eq(optimizationRecords.remoteId, adId)
        )
      )
      .limit(1);
    if (!ad) throw new Error("Choose an imported ad in this workspace.");
    const [prior] = await tx
      .select()
      .from(optimizationClassifications)
      .where(
        and(
          eq(optimizationClassifications.organizationId, organizationId),
          eq(optimizationClassifications.connectionId, connectionId),
          eq(optimizationClassifications.adId, adId),
          eq(optimizationClassifications.dimension, parsed.dimension),
          eq(optimizationClassifications.source, source)
        )
      )
      .orderBy(desc(optimizationClassifications.revision))
      .limit(1);
    const fingerprint = stableHash({ parsed, version: TAXONOMY_VERSION });
    if (prior?.fingerprint === fingerprint) return prior;
    const revision = (prior?.revision ?? 0) + 1;
    const [row] = await tx
      .insert(optimizationClassifications)
      .values({
        id: randomUUID(),
        organizationId,
        connectionId,
        adId,
        dimension: parsed.dimension,
        source,
        revision,
        fingerprint,
        assertion: {
          ...parsed,
          source,
          version: TAXONOMY_VERSION,
          observedAtMs: Date.now(),
          actorUserId,
          revision,
        },
      })
      .returning();
    return row;
  });
}
export type EvidenceRow = {
  adId: string;
  date: string;
  metrics: ReturnType<typeof adMetrics>;
  dimensions: Partial<Record<Dimension, string[]>>;
  confidence: number;
  currency: string | null;
  attribution: string;
  learning?: ReturnType<typeof learningWeight>;
};
const metricNames = [
  "spend",
  "impressions",
  "clicks",
  "purchases",
  "purchaseValue",
] as const;
export function aggregateEvidence(rows: EvidenceRow[]) {
  const totals = Object.fromEntries(
    metricNames.map(k => [
      k,
      rows.length && rows.every(r => r.metrics[k] !== null)
        ? rows.reduce((n, r) => n + (r.metrics[k] ?? 0), 0)
        : null,
    ])
  ) as Record<(typeof metricNames)[number], number | null>;
  const ratio = (a: number | null, b: number | null) =>
    a !== null && b !== null && b > 0 ? a / b : null;
  const ads = Array.from(new Set(rows.map(r => r.adId)));
  const currencies = Array.from(new Set(rows.map(r => r.currency))),
    attributions = Array.from(new Set(rows.map(r => r.attribution)));
  // Different currencies/attribution definitions cannot form one valid performance total.
  const comparable = currencies.length <= 1 && attributions.length <= 1;
  if (!comparable) for (const k of metricNames) totals[k] = null;
  const weights = rows.map(r => r.learning?.weight ?? r.confidence);
  const weightSum = weights.reduce((a, b) => a + b, 0);
  const weighted = Object.fromEntries(metricNames.map(k => [k, comparable && rows.length && rows.every(r => r.metrics[k] !== null) ? rows.reduce((n, r, i) => n + (r.metrics[k] ?? 0) * weights[i], 0) : null])) as Record<(typeof metricNames)[number], number | null>;
  return {
    ...totals,
    learning: {
      averageWeight: rows.length ? weightSum / rows.length : 0,
      effectiveObservations: weights.some(w => w > 0) ? weightSum ** 2 / weights.reduce((n, w) => n + w * w, 0) : 0,
      weightedRoas: ratio(weighted.purchaseValue, weighted.spend),
      weightedCpa: ratio(weighted.spend, weighted.purchases),
      factors: Object.fromEntries(["recency", "relevance", "confidence", "completeness", "versionReliability"].map(k => [k, rows.length ? rows.reduce((n, r) => n + ((r.learning as any)?.[k] ?? (k === "confidence" ? r.confidence : 1)), 0) / rows.length : 0])),
    },
    ctr:
      ratio(totals.clicks, totals.impressions) === null
        ? null
        : 100 * ratio(totals.clicks, totals.impressions)!,
    cpc: ratio(totals.spend, totals.clicks),
    cpa: ratio(totals.spend, totals.purchases),
    roas: ratio(totals.purchaseValue, totals.spend),
    samples: rows.length,
    adCount: ads.length,
    sourceAdIds: ads,
    dates: Array.from(new Set(rows.map(r => r.date))).sort(),
    currency: currencies[0] ?? null,
    attribution: attributions[0] ?? null,
    comparable,
    missing: Object.fromEntries(
      metricNames.map(k => [k, rows.filter(r => r.metrics[k] === null).length])
    ),
    evidenceStrength:
      ads.length >= 3 &&
      (totals.impressions ?? 0) >= 1000 &&
      (totals.clicks ?? 0) >= 50
        ? "directional"
        : "limited",
    confidence: rows.length ? Math.min(...rows.map(r => r.confidence)) : 0,
  };
}
export function dimensionAnalysis(rows: EvidenceRow[], query: AnalysisQuery) {
  if (
    (query.dimensions.includes("placement") && query.grain !== "placement") ||
    (query.dimensions.includes("hour") && query.grain !== "hourly") ||
    query.filters.some(
      f =>
        (f.dimension === "placement" && query.grain !== "placement") ||
        (f.dimension === "hour" && query.grain !== "hourly")
    )
  )
    throw new Error(
      "Use placement or hourly granularity for the corresponding dimension."
    );
  const selected = rows.filter(
    r =>
      r.confidence >= query.minimumConfidence &&
      query.filters.every(f =>
        f.values.some(v =>
          (r.dimensions[f.dimension] ?? ["unknown"]).includes(v)
        )
      )
  );
  const groups = new Map<string, EvidenceRow[]>();
  let combinationsTruncated = false;
  for (const row of selected) {
    let keys: string[][] = [[]];
    for (const d of query.dimensions) {
      const expanded = keys.flatMap(k =>
        (row.dimensions[d]?.length ? row.dimensions[d]! : ["unknown"]).map(
          v => [...k, v]
        )
      );
      if (expanded.length > 256) combinationsTruncated = true;
      keys = expanded.slice(0, 256);
    }
    for (const key of keys) {
      const id = JSON.stringify(key);
      const group = groups.get(id) ?? [];
      group.push(row);
      groups.set(id, group);
    }
  }
  return {
    summary: aggregateEvidence(selected),
    groups: Array.from(groups).map(([key, values]) => ({
      labels: JSON.parse(key) as string[],
      ...aggregateEvidence(values),
    })),
    combinationsTruncated,
  };
}
export async function analyzeHistory(
  db: LibraryDatabase,
  organizationId: number,
  connectionId: string,
  query: AnalysisQuery
) {
  const c = await getConnection(db, organizationId, connectionId, "meta_ads");
  const scope = and(
    eq(optimizationRecords.organizationId, organizationId),
    eq(optimizationRecords.connectionId, connectionId)
  );
  const [insights, syncs] = await Promise.all([
    db
      .select()
      .from(optimizationRecords)
      .where(
        and(
          scope,
          eq(optimizationRecords.kind, "insight"),
          eq(optimizationRecords.grain, query.grain),
          query.adIds
            ? inArray(optimizationRecords.remoteId, query.adIds)
            : undefined,
          gte(optimizationRecords.date, query.range.since),
          lte(optimizationRecords.date, query.range.until)
        )
      )
      .orderBy(optimizationRecords.date, optimizationRecords.id)
      .limit(50001),
    db
      .select()
      .from(optimizationSyncs)
      .where(
        and(
          eq(optimizationSyncs.organizationId, organizationId),
          eq(optimizationSyncs.connectionId, connectionId)
        )
      ),
  ]);
  const relevantIds = Array.from(new Set(insights.map(r => r.remoteId)));
  // Accounts can contain years of inactive ads. Fetch metadata for this report's
  // source ads so unrelated inventory cannot truncate an otherwise complete report.
  const objects = relevantIds.length
    ? await db
        .select()
        .from(optimizationRecords)
        .where(
          and(
            scope,
            eq(optimizationRecords.kind, "ad"),
            inArray(optimizationRecords.remoteId, relevantIds)
          )
        )
    : [];
  const classifications = relevantIds.length
    ? await db
        .select()
        .from(optimizationClassifications)
        .where(
          and(
            eq(optimizationClassifications.organizationId, organizationId),
            eq(optimizationClassifications.connectionId, connectionId),
            inArray(optimizationClassifications.adId, relevantIds)
          )
        )
        .orderBy(desc(optimizationClassifications.revision))
        .limit(100001)
    : [];
  const byAd = new Map<string, Classification[]>();
  for (const row of classifications) {
    const a = byAd.get(row.adId) ?? [];
    a.push(row.assertion);
    byAd.set(row.adId, a);
  }
  const rows: EvidenceRow[] = insights.slice(0, 50000).map(r => {
    const labels = effectiveClassifications((byAd.get(r.remoteId) ?? []).filter(a => a.basis !== "requested" && !a.labels.some(l => l.evidence.includes("selected settings, not a visual inference")) && (!a.validSince || a.validSince <= r.date) && (!a.validUntil || a.validUntil >= r.date)));
    const dimensions: EvidenceRow["dimensions"] = {};
    for (const [d, a] of Object.entries(labels))
      dimensions[d as Dimension] = a.labels
        .filter(l => l.confidence >= query.minimumConfidence)
        .map(l => l.id);
    dimensions.weekday = [String(new Date(r.date + "T12:00:00Z").getUTCDay())];
    dimensions.timezone = [r.provenance.timezone ?? "unknown"];
    if (query.grain === "placement")
      dimensions.placement = [
        `${r.data.publisher_platform ?? "unknown"}/${r.data.platform_position ?? "unknown"}`,
      ];
    if (query.grain === "hourly")
      dimensions.hour = [
        r.data.hourly_stats_aggregated_by_advertiser_time_zone ?? "unknown",
      ];
    const evidence: EvidenceRow = {
      adId: r.remoteId,
      date: r.date,
      metrics: adMetrics(r.data),
      dimensions,
      confidence: query.dimensions.length
        ? Math.min(
            ...query.dimensions.map(d =>
              ["weekday", "hour", "placement", "timezone"].includes(d)
                ? dimensions[d]?.some(v => v !== "unknown")
                  ? 1
                  : 0
                : Math.max(
                    0,
                    ...(labels[d]?.labels ?? []).map(l => l.confidence)
                  )
            )
          )
        : 1,
      currency: r.provenance.currency,
      attribution: r.provenance.attribution,
    };
    const ad = objects.find(o => o.remoteId === r.remoteId);
    const updated = typeof ad?.data.updated_time === "string" ? ad.data.updated_time.slice(0, 10) : null;
    const relevant = [...query.dimensions, ...query.filters.map(f => f.dimension)];
    const dateFacts = ["weekday", "hour", "placement", "timezone"];
    const exactVersion = relevant.length > 0 && relevant.every(d => dateFacts.includes(d) || (labels[d]?.validSince && (labels[d]?.assetVersion || (labels[d]?.source === "human" && labels[d]?.validUntil))));
    const confidence = relevant.length ? Math.min(evidence.confidence, ...relevant.map(d => dateFacts.includes(d) ? 1 : Math.max(0, ...(labels[d]?.labels ?? []).map(l => l.confidence)))) : evidence.confidence;
    evidence.learning = learningWeight({ date: r.date, referenceDate: query.range.until, confidence,
      completeness: metricNames.filter(k => evidence.metrics[k] !== null).length / metricNames.length,
      versionReliability: exactVersion ? 1 : updated && r.date < updated ? .35 : .6,
      dimensions }, query.learning);
    return evidence;
  });
  const result = dimensionAnalysis(rows, query),
    sync = syncs[0];
  const truncated =
    insights.length > 50000 ||
    classifications.length > 100000 ||
    result.combinationsTruncated;
  return {
    ...result,
    query,
    connectionId,
    account: {
      id: c.accountId,
      name: c.name,
      currency: c.details.currency,
      timezone: c.details.timezone,
    },
    sourceAds: objects
      .filter(o => result.summary.sourceAdIds.includes(o.remoteId))
      .map(o => ({
        id: o.remoteId,
        name: String(o.data.name ?? o.remoteId),
        campaignId: o.data.campaign_id,
        adsetId: o.data.adset_id,
        creativeId: o.data.creative?.id,
        observedAtMs: o.updatedAtMs,
        classifications: effectiveClassifications(byAd.get(o.remoteId) ?? []),
      })),
    coverage: {
      status: sync?.status ?? "not_synced",
      since: sync?.checkpoint.coverage?.since ?? sync?.since ?? null,
      until: sync?.checkpoint.coverage?.until ?? sync?.until ?? null,
      updatedAtMs: sync?.updatedAtMs ?? null,
      truncated,
      incomplete:
        !sync ||
        sync.status !== "completed" ||
        truncated ||
        !!sync.checkpoint.warnings.length ||
        query.range.since < (sync.checkpoint.coverage?.since ?? sync.since) ||
        query.range.until > (sync.checkpoint.coverage?.until ?? sync.until),
      warnings: sync?.checkpoint.warnings ?? [],
    },
    caveats: evidenceCaveats,
    taxonomyVersion: TAXONOMY_VERSION,
    learningExplanation: "Learning weight = relevance × label confidence × metric completeness × version reliability × recency. Recency halves over the chosen half-life, measured from the report end date. Legacy and new records use the same rules. Reported metrics remain unweighted.",
  };
}
export function evidenceCsv(
  report: Awaited<ReturnType<typeof analyzeHistory>>
) {
  const cell = (v: unknown) =>
    '"' +
    String(v ?? "Unavailable")
      .replace(/^[=+@-]/, "'$&")
      .replaceAll('"', '""') +
    '"';
  const header = [
    ...report.query.dimensions,
    "spend",
    "impressions",
    "clicks",
    "purchases",
    "purchaseValue",
    "ctr",
    "cpc",
    "cpa",
    "roas",
    "adCount",
    "samples",
    "currency",
    "evidenceStrength",
    "learningWeight",
    "sourceAdIds",
  ];
  const meta = [
    ["Account", report.account.name],
    ["Range", report.query.range.since, report.query.range.until],
    ["Grain", report.query.grain],
    ["Coverage", JSON.stringify(report.coverage)],
    ...report.caveats.map(c => ["Caution", c]),
  ];
  return [
    ...meta.map(r => r.map(cell).join(",")),
    header.map(cell).join(","),
    ...report.groups.map(g =>
      [
        ...g.labels,
        ...header
          .slice(report.query.dimensions.length)
          .map(k =>
            k === "sourceAdIds" ? g.sourceAdIds.join(";") : k === "learningWeight" ? g.learning.averageWeight : (g as any)[k]
          ),
      ]
        .map(cell)
        .join(",")
    ),
  ].join("\r\n");
}

async function saveImportedBatch(
  db: LibraryDatabase,
  organizationId: number,
  connectionId: string,
  pending: Array<{
    adId: string;
    assertion: Assertion;
    source: "rule" | "import";
  }>
) {
  if (!pending.length) return;
  await withOrganizationTransaction(db, organizationId, async tx => {
    const ids = Array.from(new Set(pending.map(p => p.adId)));
    const prior = await tx
      .select()
      .from(optimizationClassifications)
      .where(
        and(
          eq(optimizationClassifications.organizationId, organizationId),
          eq(optimizationClassifications.connectionId, connectionId),
          inArray(optimizationClassifications.adId, ids)
        )
      )
      .orderBy(desc(optimizationClassifications.revision));
    const latest = new Map<
      string,
      typeof optimizationClassifications.$inferSelect
    >();
    const key = (adId: string, dimension: string, source: string) =>
      `${adId}:${dimension}:${source}`;
    for (const row of prior)
      if (!latest.has(key(row.adId, row.dimension, row.source)))
        latest.set(key(row.adId, row.dimension, row.source), row);
    const imported = new Set(pending.filter(p => p.source === "import").map(p => key(p.adId, p.assertion.dimension, p.source)));
    for (const row of Array.from(latest.values())) if (row.source === "import" && !imported.has(key(row.adId, row.dimension, row.source))) {
      pending.push({ adId: row.adId, source: "import", assertion: { dimension: row.dimension as Dimension, labels: [], retired: true, unknownReason: "The delivery creative no longer matches the captured asset version." } });
    }
    const values: Array<typeof optimizationClassifications.$inferInsert> = [];
    for (const item of pending) {
      const parsed = assertionSchema.parse(item.assertion);
      parsed.labels = parsed.labels.map(l => ({
        ...l,
        id: canonicalLabel(parsed.dimension, l.id),
      }));
      const previous = latest.get(
        key(item.adId, parsed.dimension, item.source)
      );
      // Persist explicit unknown/N/A coverage for every dimension, without fabricating a label.
      const fingerprint = stableHash({ parsed, version: TAXONOMY_VERSION });
      if (previous?.fingerprint === fingerprint) continue;
      const revision = (previous?.revision ?? 0) + 1;
      values.push({
        id: randomUUID(),
        organizationId,
        connectionId,
        adId: item.adId,
        dimension: parsed.dimension,
        source: item.source,
        revision,
        fingerprint,
        assertion: {
          ...parsed,
          source: item.source,
          version: TAXONOMY_VERSION,
          observedAtMs: Date.now(),
          revision,
        },
      });
    }
    for (let start = 0; start < values.length; start += 1000)
      await tx.insert(optimizationClassifications).values(values.slice(start, start + 1000));
  });
}
export async function classifyHistoryBatch(
  db: LibraryDatabase,
  organizationId: number,
  connectionId: string,
  after = ""
) {
  const batchSize = 100;
  await getConnection(db, organizationId, connectionId, "meta_ads");
  const scope = and(
    eq(optimizationRecords.organizationId, organizationId),
    eq(optimizationRecords.connectionId, connectionId)
  );
  const ads = await db
    .select()
    .from(optimizationRecords)
    .where(
      and(
        scope,
        eq(optimizationRecords.kind, "ad"),
        gt(optimizationRecords.remoteId, after)
      )
    )
    .orderBy(optimizationRecords.remoteId)
    .limit(batchSize + 1);
  const page = ads.slice(0, batchSize);
  const ids = page
    .flatMap(a => [
      String(a.data.creative?.id ?? ""),
      String(a.data.adset_id ?? ""),
    ])
    .filter(Boolean);
  const related = ids.length
    ? await db
        .select()
        .from(optimizationRecords)
        .where(
          and(
            scope,
            inArray(optimizationRecords.kind, ["creative", "adset"]),
            inArray(optimizationRecords.remoteId, ids)
          )
        )
    : [];
  const pending: Array<{
    adId: string;
    assertion: Assertion;
    source: "rule" | "import";
  }> = [];
  const published = page.length
    ? await db
        .select()
        .from(publications)
        .where(
          and(
            eq(publications.organizationId, organizationId),
            eq(publications.connectionId, connectionId),
            inArray(
              publications.externalId,
              page.map(a => a.remoteId)
            )
          )
        )
    : [];
  const publicationEvents = published.length ? await db.select().from(activityEvents).where(and(
    eq(activityEvents.organizationId, organizationId), eq(activityEvents.entityType, "publication"),
    inArray(activityEvents.entityId, published.map(p => p.id)),
    inArray(activityEvents.action, ["publication.approved", "publication.draft_saved"])
  )).orderBy(desc(activityEvents.id)) : [];
  for (const ad of page) {
    for (const assertion of classifyImported(
      ad.data,
      related.find(
        r => r.kind === "creative" && r.remoteId === ad.data.creative?.id
      )?.data,
      related.find(r => r.kind === "adset" && r.remoteId === ad.data.adset_id)
        ?.data
    ))
      pending.push({ adId: ad.remoteId, assertion, source: "rule" });
    const publication = published.find(p => p.externalId === ad.remoteId);
    const frozen = publication && publicationEvents.find(e => e.entityId === publication.id && Array.isArray(e.payload?.creativeSnapshots));
    const snapshots = (frozen?.payload?.creativeSnapshots ?? []) as CreativeIntelligence[];
    const uniqueVersions = Array.from(new Set(snapshots.map(v => v.assetVersion)));
    if (publication && uniqueVersions.length === 1 && String(publication.result?.creativeId ?? "") === String(ad.data.creative?.id ?? "unverified")) {
      const snapshot = snapshots[0];
      for (const assertion of snapshotAssertions(snapshot)) {
        // Delivered copy/channel are classified from Meta; do not overwrite them with image copy.
        if (["channel", "cta", "messaging_style", "emotional_appeal", "emotional_tone", "benefit_feature", "specificity", "copy_length", "urgency", "messaging_angle"].includes(assertion.dimension)) continue;
        if (!assertion.labels.length && assertion.status !== "not_applicable") continue;
        assertion.validSince = new Date(frozen!.createdAtMs).toISOString().slice(0, 10);
        pending.push({ adId: ad.remoteId, assertion, source: "import" });
      }
    } else if (publication?.assetKey && !snapshots.length) {
      const [kind, id] = publication.assetKey.split(":");
      let authored: Record<string, any> | undefined,
        width: number | undefined,
        height: number | undefined;
      if (kind === "creative") {
        const [asset] = await db
          .select({ variant: creativeVariants, job: creativeJobs })
          .from(creativeVariants)
          .innerJoin(
            creativeJobs,
            and(
              eq(creativeJobs.id, creativeVariants.jobId),
              eq(creativeJobs.organizationId, organizationId)
            )
          )
          .where(
            and(
              eq(creativeVariants.organizationId, organizationId),
              eq(creativeVariants.id, Number(id))
            )
          )
          .limit(1);
        if (asset) {
          authored = (asset.job.briefSnapshot as any)?.setup;
          width = asset.variant.renderMetadata?.width;
          height = asset.variant.renderMetadata?.height;
        }
      } else if (kind === "asset") {
        const [asset] = await db
          .select()
          .from(brandAssets)
          .where(
            and(
              eq(brandAssets.organizationId, organizationId),
              eq(brandAssets.id, Number(id))
            )
          )
          .limit(1);
        if (asset) {
          authored = asset.metadata?.direction as any;
          width = Number(asset.metadata?.width) || undefined;
          height = Number(asset.metadata?.height) || undefined;
        }
      }
      const scene = authored?.shot ?? authored?.setting;
      const metadata: Partial<Record<Dimension, unknown>> = {
        theme: authored?.theme,
        art_style: authored?.artStyle,
        scene:
          scene === "product"
            ? "product_only"
            : scene === "lifestyle"
              ? "lifestyle_without_person"
              : scene
                ? ["female", "male", "people", "multiple"].includes(scene)
                  ? "lifestyle_with_people"
                  : undefined
                : undefined,
      };
      if (width && height) {
        const gcd = (a: number, b: number): number => (b ? gcd(b, a % b) : a);
        const g = gcd(width, height);
        metadata.aspect_ratio = `${width / g}:${height / g}`;
      }
      for (const [dimension, value] of Object.entries(metadata))
        if (value)
          pending.push({
            adId: ad.remoteId,
            source: "import",
            assertion: {
              dimension: dimension as Dimension,
              basis: dimension === "aspect_ratio" ? "observed" : "requested",
              labels: [
                {
                  id: String(value),
                  label: String(value),
                  confidence: 1,
                  evidence: `Authored EL asset ${publication.assetKey}; selected settings, not a visual inference.`,
                },
              ],
            },
          });
    }
  }
  await saveImportedBatch(db, organizationId, connectionId, pending);
  await saveCopySnapshots(
    db,
    organizationId,
    connectionId,
    page.map(ad => ({
      id: ad.remoteId,
      observedAtMs: Math.max(
        ad.updatedAtMs,
        related.find(
          r => r.kind === "creative" && r.remoteId === ad.data.creative?.id
        )?.updatedAtMs ?? 0
      ),
      name: String(ad.data.name ?? "Untitled ad"),
      copy: creativeCopy(
        related.find(
          r => r.kind === "creative" && r.remoteId === ad.data.creative?.id
        )?.data ??
          ad.data.creative ??
          {}
      ).copy,
    })),
    "imported_meta",
    Date.now()
  );
  // Count against the persisted cursor, including runs created before progress
  // metadata existed. Never infer completed work from elapsed time.
  const cursor = page.at(-1)?.remoteId ?? after;
  const [counts] = await db
    .select({
      total: sql<number>`count(*)::int`,
      completed: sql<number>`count(*) filter (where ${optimizationRecords.remoteId} <= ${cursor})::int`,
    })
    .from(optimizationRecords)
    .where(and(scope, eq(optimizationRecords.kind, "ad")));
  return {
    processed: page.length,
    next: ads.length > batchSize ? page.at(-1)!.remoteId : null,
    progress: {
      completed: counts.completed,
      total: counts.total,
      unit: "ads" as const,
      updatedAtMs: Date.now(),
    },
  };
}
