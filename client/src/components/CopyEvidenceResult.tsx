import { VisualSelect, ChoiceField } from "@/components/choices/VisualSelect";
import { useState } from "react";
import { copyTaxonomy, type CopyDimension } from "@shared/copyTaxonomy";
import { CopyTagTable, CopyTaxonomyReference } from "./CopyTags";
import { copyFieldNames, copyFields } from "@shared/copyEvidence";
import type { LiveCopyAnalysis } from "../../../server/lib/liveMetaCopy";

const number = (v: unknown) =>
  typeof v === "number"
    ? v.toLocaleString(undefined, { maximumFractionDigits: 2 })
    : "Unavailable";
function LegacyCopyEvidenceResult({ data }: { data: Record<string, unknown> }) {
  const r = data as unknown as LiveCopyAnalysis;
  if (
    r.source !== "live_meta_copy_analysis" ||
    !r.evidence?.ads ||
    !Array.isArray(r.fields)
  )
    return <p role="alert">This copy report could not be displayed.</p>;
  const source = r.evidence;
  return (
    <section className="space-y-4 text-sm">
      <h3 className="font-semibold text-lg">Copy evidence report</h3>
      <p>
        {source.accountName} · {source.range.since} to {source.range.until} ·{" "}
        {source.timezone} · {source.currency ?? "Currency unavailable"}
      </p>
      <p className="rounded-lg bg-muted p-3">{r.summary}</p>
      <p>
        Objective:{" "}
        <strong>
          {r.settings.objective === "cpa"
            ? "Lowest purchase CPA"
            : "Highest purchase ROAS"}
        </strong>
        . A style needs at least{" "}
        {r.settings.minimumImpressions.toLocaleString()} impressions and{" "}
        {r.settings.minimumPurchases} purchases to be eligible for comparison.
        These are comparison filters, not confidence estimates.
      </p>
      <p>
        <strong>Coverage:</strong> {source.coverage.inspectedAds} ads inspected
        / {source.coverage.insightsReturned} returned performance rows.{" "}
        {source.coverage.truncated
          ? "Partial dataset — no overall leader."
          : "Insight pagination complete."}{" "}
        {source.coverage.missingCreativeAds} ads without readable copy.
      </p>
      <p>
        <strong>Statistical confidence:</strong> Not estimable for copy effects
        from this descriptive comparison.
      </p>
      {r.fields.map(f => (
        <details open key={f.field} className="border rounded-lg p-3">
          <summary className="font-semibold">
            {copyFieldNames[f.field]} ·{" "}
            {f.observedLeader
              ? `Observed leader among eligible styles: ${f.observedLeader}`
              : "Insufficient comparable evidence"}
          </summary>
          <p className="my-2">
            {f.comparedAds} single-variant ads with this field; {f.excludedAds}{" "}
            excluded because the field is missing, unreadable, or ambiguous.
            Unclassified text remains visible but is not ranked.
          </p>
          {f.groups.length ? (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr>
                    {[
                      "Style",
                      "Eligible",
                      "Ads",
                      "Spend",
                      "Impressions",
                      "Clicks",
                      "CTR %",
                      "Purchases",
                      "Revenue",
                      "CPA",
                      "ROAS",
                    ].map(h => (
                      <th className="text-left p-2" key={h}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {f.groups.map(g => (
                    <tr key={g.label} className="border-t">
                      <td className="p-2">{g.label}</td>
                      <td className="p-2">{g.eligible ? "Yes" : "No"}</td>
                      {[
                        g.adCount,
                        g.spend,
                        g.impressions,
                        g.clicks,
                        g.ctr,
                        g.purchases,
                        g.purchaseValue,
                        g.cpa,
                        g.roas,
                      ].map((v, i) => (
                        <td className="p-2" key={i}>
                          {number(v)}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p>No comparable copy was available for this field.</p>
          )}
          {f.groups.map(g => (
            <details key={g.label} className="mt-2">
              <summary>
                Source ads for {g.label} ({g.sourceAdIds.length})
              </summary>
              <p className="break-all text-xs">{g.sourceAdIds.join(", ")}</p>
            </details>
          ))}
        </details>
      ))}
      <details className="border rounded-lg p-3">
        <summary className="font-semibold">
          Inspect actual ad copy and performance ({source.ads.length} ads)
        </summary>
        {source.ads.map(ad => (
          <details className="border-t mt-3 pt-3" key={ad.id}>
            <summary>
              {ad.name} · {ad.id}
            </summary>
            <p className="mt-2">
              Campaign {ad.campaignId} · Ad set {ad.adsetId} · Creative{" "}
              {ad.creativeId ?? "Unavailable"}
            </p>
            <p>
              Spend {number(ad.metrics.spend)} · Purchases{" "}
              {number(ad.metrics.purchases)} · Revenue{" "}
              {number(ad.metrics.purchaseValue)} · ROAS{" "}
              {number(ad.metrics.roas)}
            </p>
            {ad.warning && (
              <p className="my-2 text-amber-700 dark:text-amber-400">
                {ad.warning}
              </p>
            )}
            {copyFields.map(field => {
              const classification = r.fields
                .find(f => f.field === field)
                ?.classifications.find(c => c.adId === ad.id);
              return (
                <div key={field} className="mt-2">
                  <strong>{copyFieldNames[field]}</strong>
                  {(ad.copy[field] ?? []).length ? (
                    (ad.copy[field] ?? []).map((text, i) => (
                      <p
                        className="whitespace-pre-wrap rounded bg-muted p-2 mt-1"
                        key={i}
                      >
                        {text}
                      </p>
                    ))
                  ) : (
                    <p>Unavailable</p>
                  )}
                  {classification && (
                    <p className="mt-1 text-xs">
                      Style: {classification.label}.{" "}
                      {classification.evidence.length
                        ? classification.evidence.join(" ")
                        : "No text rule matched."}
                    </p>
                  )}
                </div>
              );
            })}
          </details>
        ))}
      </details>
      <details className="border rounded-lg p-3">
        <summary className="font-semibold">
          Rules, attribution and limitations
        </summary>
        <p className="mt-2">
          {source.attribution} Purchase action:{" "}
          {source.purchaseAction ?? "Unavailable"}.
        </p>
        <ul className="list-disc pl-5 space-y-2 mt-2">
          {[...source.warnings, ...r.limitations].map((text, i) => (
            <li key={i}>{text}</li>
          ))}
        </ul>
      </details>
      <p className="text-xs text-muted-foreground">
        Fetched {new Date(source.fetchedAtMs).toLocaleString()}. No copy
        generation, ad publication or budget change is part of this workflow.
      </p>
    </section>
  );
}

export function CopyEvidenceResult({
  data,
}: {
  data: Record<string, unknown>;
}) {
  return data.schemaVersion === 2 ? (
    <CopyDimensionReport data={data as unknown as LiveCopyAnalysis} />
  ) : (
    <LegacyCopyEvidenceResult data={data} />
  );
}
function CopyDimensionReport({ data: r }: { data: LiveCopyAnalysis }) {
  const [field, setField] = useState<(typeof copyFields)[number]>("headline");
  const [dimension, setDimension] = useState<CopyDimension>(
    r.settings?.dimensions?.[0] ?? "messaging_angle"
  );
  const [search, setSearch] = useState("");
  if (
    !r.evidence?.ads ||
    !Array.isArray(r.comparisons) ||
    !Array.isArray(r.taggedAds)
  )
    return <p role="alert">This copy report could not be displayed.</p>;
  const source = r.evidence;
  const current = r.comparisons.find(
    c => c.field === field && c.dimension === dimension
  );
  const tags = new Map(r.taggedAds.map(ad => [ad.adId, ad.tags]));
  const visibleAds = source.ads.filter(ad =>
    `${ad.name} ${Object.values(ad.copy).flat().join(" ")}`
      .toLowerCase()
      .includes(search.toLowerCase())
  );
  const sourceAd = (id: string) => source.ads.find(a => a.id === id);
  return (
    <section className="space-y-4 text-sm">
      <div>
        <h3 className="text-lg font-semibold">Copy analysis</h3>
        <p className="text-muted-foreground">
          {source.accountName} · {source.range.since} – {source.range.until} ·{" "}
          {source.currency ?? "Currency unavailable"} · {source.timezone}
        </p>
      </div>
      <p className="rounded-lg bg-muted p-3">{r.summary}</p>
      <div className="grid gap-2 sm:grid-cols-3">
        <div className="rounded-lg border p-3">
          <strong>{source.ads.length}</strong> ads inspected
          <p className="text-xs text-muted-foreground">
            {source.coverage.insightsReturned} performance rows returned
          </p>
        </div>
        <div className="rounded-lg border p-3">
          <strong>{r.settings.dimensions.length}</strong> dimensions
          <p className="text-xs text-muted-foreground">
            Each text field and variant tagged separately
          </p>
        </div>
        <div className="rounded-lg border p-3">
          <strong>
            {r.settings.objective === "cpa"
              ? "Lowest purchase CPA"
              : "Highest purchase ROAS"}
          </strong>
          <p className="text-xs text-muted-foreground">
            Minimum {number(r.settings.minimumImpressions)} impressions /{" "}
            {r.settings.minimumPurchases} purchases per value
          </p>
        </div>
      </div>
      {(source.coverage.truncated ||
        source.coverage.missingCreativeAds > 0) && (
        <p role="status" className="rounded-lg border border-amber-400 p-3">
          Partial evidence: {source.coverage.missingCreativeAds} ads without
          readable copy.{" "}
          {source.coverage.truncated &&
            "The inspection limit was reached; narrow the date range."}{" "}
          No overall performance leader is declared.
        </p>
      )}
      <p className="text-xs text-muted-foreground">
        Descriptive associations, not a causal test. Statistical confidence in a
        copy effect is not estimable here. Multiple-value groups overlap; do not
        add their totals.
      </p>
      <ChoiceField className="block font-medium">
        Copy field
        <VisualSelect
          aria-label="Copy field"
          className="ml-3 rounded border bg-background p-2"
          value={field}
          onChange={e => setField(e.target.value as typeof field)}
        >
          {copyFields.map(f => (
            <option key={f} value={f}>
              {copyFieldNames[f]}
            </option>
          ))}
        </VisualSelect>
      </ChoiceField>
      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-left text-sm">
          <thead className="bg-muted">
            <tr>
              <th className="p-3">Dimension</th>
              <th className="p-3">Detected values</th>
              <th className="p-3">Classified ads</th>
              <th className="p-3">Observed performance</th>
            </tr>
          </thead>
          <tbody>
            {r.comparisons
              .filter(c => c.field === field)
              .map(c => (
                <tr key={c.dimension} className="border-t">
                  <th className="p-3 font-medium">
                    <button
                      className="text-primary underline underline-offset-2"
                      onClick={() => setDimension(c.dimension)}
                    >
                      {copyTaxonomy[c.dimension].label}
                    </button>
                  </th>
                  <td className="p-3">
                    {c.groups.filter(g => g.value !== "unknown").length}
                  </td>
                  <td className="p-3">
                    {c.taggedAds} / {c.comparedAds}
                  </td>
                  <td className="p-3">
                    {c.observedLeader ?? "Insufficient comparable evidence"}
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
      <div className="rounded-lg border p-4 space-y-3">
        <ChoiceField className="font-medium">
          Compare by
          <VisualSelect
            aria-label="Copy dimension"
            className="ml-3 rounded border bg-background p-2"
            value={dimension}
            onChange={e => setDimension(e.target.value as CopyDimension)}
          >
            {r.settings.dimensions.map(d => (
              <option key={d} value={d}>
                {copyTaxonomy[d].label}
              </option>
            ))}
          </VisualSelect>
        </ChoiceField>
        <p className="text-xs text-muted-foreground">
          {copyTaxonomy[dimension].question}{" "}
          {current?.excludedAds ?? source.ads.length} ads excluded because this
          field is missing, unreadable or has ambiguous variant performance.
        </p>
        {current?.groups.length ? (
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead>
                <tr>
                  {[
                    "Value",
                    "Ads",
                    "Spend",
                    "Impressions",
                    "CTR %",
                    "Purchases",
                    "CPA",
                    "ROAS",
                    "Comparable",
                  ].map(h => (
                    <th className="p-2" key={h}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {current.groups.map(g => (
                  <tr key={g.value} className="border-t">
                    <td className="p-2">
                      <details>
                        <summary className="cursor-pointer font-medium">
                          {g.label}
                        </summary>
                        <ul className="space-y-2 mt-2">
                          {g.sourceAdIds.map(id => (
                            <li key={id}>
                              <strong>
                                {sourceAd(id)?.name ?? "Unavailable ad"}
                              </strong>
                              <p className="max-w-sm text-muted-foreground">
                                {sourceAd(id)?.copy[field]?.[0]}
                              </p>
                            </li>
                          ))}
                        </ul>
                      </details>
                    </td>
                    {[
                      g.adCount,
                      g.spend,
                      g.impressions,
                      g.ctr,
                      g.purchases,
                      g.cpa,
                      g.roas,
                    ].map((value, i) => (
                      <td key={i} className="p-2">
                        {number(value)}
                      </td>
                    ))}
                    <td className="p-2">
                      {g.eligible ? "Yes" : "Below threshold or unavailable"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p>
            No comparable copy for this field.{" "}
            {field === "subheadline" &&
              "External image subheadlines are not extracted. Primary text is a separate field."}
          </p>
        )}
      </div>
      <details className="rounded-lg border p-4">
        <summary className="cursor-pointer font-semibold">
          Ad copy & assigned attributes ({source.ads.length})
        </summary>
        <input
          aria-label="Search classified ads"
          placeholder="Search ad name or copy"
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="my-3 w-full rounded border bg-background p-2"
        />
        {visibleAds.map(ad => (
          <details key={ad.id} className="border-t py-3">
            <summary className="cursor-pointer font-medium">
              {ad.name} · Spend {number(ad.metrics.spend)} · Purchases{" "}
              {number(ad.metrics.purchases)} · ROAS {number(ad.metrics.roas)}
            </summary>
            {ad.warning && (
              <p className="my-2 text-amber-700 dark:text-amber-400">
                {ad.warning} Tags remain available for each text variant.
              </p>
            )}
            {copyFields.map(f => (
              <div key={f} className="mt-4">
                <h4 className="font-semibold">{copyFieldNames[f]}</h4>
                {tags.get(ad.id)?.fields[f].length ? (
                  tags.get(ad.id)!.fields[f].map((t, i) => (
                    <div key={i} className="my-3">
                      <p className="rounded bg-muted p-3 whitespace-pre-wrap">
                        {t.text}
                      </p>
                      <p className="my-2 text-xs text-muted-foreground">
                        {t.words} words · {t.characters} characters
                        {tags.get(ad.id)!.fields[f].length > 1
                          ? ` · Variant ${i + 1}`
                          : ""}
                      </p>
                      <CopyTagTable tags={t} />
                    </div>
                  ))
                ) : (
                  <p className="text-xs text-muted-foreground">
                    Unavailable — no source text supplied.
                  </p>
                )}
              </div>
            ))}
            <details className="mt-3 text-xs">
              <summary>Technical references</summary>
              <p className="break-all">
                Ad: {ad.id} · Campaign: {ad.campaignId} · Ad set: {ad.adsetId} ·
                Creative: {ad.creativeId ?? "Unavailable"}
              </p>
            </details>
          </details>
        ))}
        {!visibleAds.length && <p>No ads match this search.</p>}
      </details>
      <CopyTaxonomyReference />
      <details className="rounded-lg border p-3">
        <summary className="cursor-pointer font-medium">
          Coverage, attribution & limitations
        </summary>
        <p className="my-2">{source.attribution}</p>
        <ul className="list-disc pl-5 space-y-2">
          {[...source.warnings, ...r.limitations].map((text, i) => (
            <li key={i}>{text}</li>
          ))}
        </ul>
        <p className="mt-3 text-xs">
          Fetched {new Date(source.fetchedAtMs).toLocaleString()}. Taxonomy v2 ·
          automatic text signals · 0 AI credits.
        </p>
      </details>
    </section>
  );
}
