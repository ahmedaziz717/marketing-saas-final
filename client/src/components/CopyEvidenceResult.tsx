import { copyFieldNames, copyFields } from "@shared/copyEvidence";
import type { LiveCopyAnalysis } from "../../../server/lib/liveMetaCopy";

const number = (v: unknown) =>
  typeof v === "number"
    ? v.toLocaleString(undefined, { maximumFractionDigits: 2 })
    : "Unavailable";
export function CopyEvidenceResult({
  data,
}: {
  data: Record<string, unknown>;
}) {
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
                  {ad.copy[field].length ? (
                    ad.copy[field].map((text, i) => (
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
