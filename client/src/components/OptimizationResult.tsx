import { optimizerOutputSchema } from "@shared/optimizerLibrary";
export function OptimizationResult({
  data,
}: {
  data: Record<string, unknown>;
}) {
  const parsed = optimizerOutputSchema.safeParse(data);
  if (!parsed.success) return null;
  const r = parsed.data;
  const live = data.source === "live_meta_scheduling";
  const dimensions = Array.isArray(data.dimensionReports)
    ? (data.dimensionReports as Array<Record<string, any>>)
    : [];
  return (
    <section className="space-y-4 min-w-0">
      <div className="flex flex-wrap justify-between gap-2">
        <h3 className="font-semibold capitalize">
          {r.kind.replaceAll("_", " ")}
        </h3>
        <span className="rounded-full bg-violet-500/10 px-3 py-1 text-xs">
          {r.decision.replaceAll("_", " ")} · {Math.round(r.confidence * 100)}%
          confidence
        </span>
      </div>
      <p className="text-sm text-muted-foreground">
        {live
          ? `Live Meta account-level report · ${String(data.accountName)} · ${String(data.timezone)}`
          : `${r.sourceAdIds.length} source ads`}{" "}
        · Human approval required for production or campaign changes
      </p>
      <ul className="list-disc pl-5 text-sm space-y-2">
        {r.observations.map((o, i) => (
          <li key={i}>{o}</li>
        ))}
      </ul>
      {dimensions.map((d, i) => (
        <details className="border rounded-lg p-3" key={i}>
          <summary className="font-medium capitalize">
            {String(d.dimension).replaceAll("_", " ")} ·{" "}
            {String(d.decision).replaceAll("_", " ")}
          </summary>
          <div className="mt-3 overflow-x-auto">
            <table className="text-xs w-full">
              <thead>
                <tr>
                  {[
                    "Cohort",
                    "Spend",
                    "Impressions",
                    "Clicks",
                    "CTR %",
                    "CPC",
                    "Purchases",
                    "ROAS",
                    ...(live ? [] : ["Ads"]),
                  ].map(h => (
                    <th key={h} className="text-left p-2">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {(d.evidence?.groups ?? []).map((g: any, j: number) => (
                  <tr className="border-t" key={j}>
                    <td className="p-2">{g.labels.join(" / ")}</td>
                    {[
                      g.spend,
                      g.impressions,
                      g.clicks,
                      g.ctr,
                      g.cpc,
                      g.purchases,
                      g.roas,
                      ...(live ? [] : [g.adCount]),
                    ].map((v, k) => (
                      <td className="p-2" key={k}>
                        {typeof v === "number"
                          ? v.toLocaleString(undefined, {
                              maximumFractionDigits: 2,
                            })
                          : "Unavailable"}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-xs mt-2">
            {live
              ? "Source: Meta Insights, selected account and date range"
              : `Sources: ${d.sourceAdIds?.join(", ") || "No source ads"}`}
          </p>
          {d.evidence?.coverage?.incomplete && (
            <p className="text-xs text-amber-700 dark:text-amber-400">
              Incomplete coverage; no performance conclusion.
            </p>
          )}
        </details>
      ))}
      {typeof data.fetchedAtMs === "number" && (
        <p className="text-xs text-muted-foreground">
          Fetched {new Date(data.fetchedAtMs).toLocaleString()} · Currency:{" "}
          {String(data.currency ?? "Unavailable")}
        </p>
      )}
      <div className="rounded-lg bg-primary/5 p-3">
        <h4 className="text-sm font-medium">Suggested test</h4>
        {!r.suggestedTests.length && (
          <p className="text-sm mt-2">
            No schedule change recommended from the available evidence.
          </p>
        )}
        {r.suggestedTests.map(t => (
          <p className="text-sm mt-2" key={t}>
            {t}
          </p>
        ))}
      </div>
      <details>
        <summary className="text-sm">
          Attribution and interpretation limits
        </summary>
        <ul className="text-xs space-y-2 mt-2">
          {r.caveats.map(c => (
            <li key={c}>{c}</li>
          ))}
        </ul>
      </details>
    </section>
  );
}
