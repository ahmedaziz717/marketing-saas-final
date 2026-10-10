import { optimizerOutputSchema } from "@shared/optimizerLibrary";
const probability = (n: number) =>
  n >= 0.9995 ? ">99.9%" : n < 0.0005 ? "<0.1%" : `${(n * 100).toFixed(1)}%`;
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
          {live
            ? r.decision === "propose_test"
              ? "Test candidate identified"
              : "Observations · review evidence"
            : `${r.decision.replaceAll("_", " ")} · ${r.confidence === null ? "Confidence not estimable" : `${Math.round(r.confidence * 100)}% confidence`}`}
        </span>
      </div>
      <p className="text-sm text-muted-foreground">
        {live
          ? `Live Meta account-level report · ${String(data.accountName)} · ${String(data.timezone)}`
          : `${r.sourceAdIds.length} source ads`}{" "}
        · Human approval required for production or campaign changes
      </p>
      {live && data.statisticsVersion !== 2 && (
        <p className="text-sm text-amber-700 dark:text-amber-400">
          This saved result used the previous heuristic. Run the workflow again
          for calculated confidence and hourly conversion retrieval.
        </p>
      )}
      <ul className="list-disc pl-5 text-sm space-y-2">
        {r.observations.map((o, i) => (
          <li key={i}>{o}</li>
        ))}
      </ul>
      {dimensions.map((d, i) => (
        <details className="border rounded-lg p-3" key={i}>
          <summary className="font-medium capitalize">
            {String(d.dimension).replaceAll("_", " ")} ·{" "}
            {live
              ? typeof d.statistics?.confidence === "number"
                ? `${probability(d.statistics.confidence)} confidence in lowest CPA · ${d.statistics.candidate}`
                : "Purchase confidence not estimable"
              : String(d.decision).replaceAll("_", " ")}
          </summary>
          {live && (
            <div className="mt-3 space-y-2 text-sm">
              <p>{d.explanation}</p>
              {typeof d.statistics?.confidence === "number" && (
                <p>
                  Estimated probability that {d.statistics.candidate} has the
                  lowest cost per purchase among the{" "}
                  {d.statistics.comparisons.length} observed periods, under the
                  stated model. This is not confidence in ROAS or a future
                  schedule change.
                </p>
              )}
            </div>
          )}
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
                    ...(live ? ["Revenue", "CPA"] : []),
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
                      ...(live ? [g.purchaseValue, g.cpa] : []),
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
          {live && d.statistics?.comparisons?.length > 0 && (
            <details className="mt-3 rounded border p-3">
              <summary className="text-sm font-medium">
                Confidence calculation and 95% CPA credible intervals
              </summary>
              <p className="text-xs my-3">
                Bayesian Gamma–Poisson model; spend is exposure, purchases are
                counts. Jeffreys prior: p(rate) ∝ rate⁻½. Posterior:
                Gamma(purchases + ½, rate = spend). All observed periods are
                compared together using 40,000 reproducible draws. Monte Carlo
                error is at most 0.25 percentage points; model uncertainty is
                separate.
              </p>
              <div className="overflow-x-auto">
                <table className="text-xs w-full">
                  <thead>
                    <tr>
                      <th className="text-left p-2">Period</th>
                      <th className="text-left p-2">
                        Probability of lowest CPA
                      </th>
                      <th className="text-left p-2">
                        95% CPA credible interval (
                        {String(data.currency ?? "account currency")})
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {d.statistics.comparisons.map((c: any) => (
                      <tr className="border-t" key={c.label}>
                        <td className="p-2">{c.label}</td>
                        <td className="p-2">
                          {probability(c.probabilityBest)}
                        </td>
                        <td className="p-2">
                          {c.cpaInterval95
                            .map((n: number) =>
                              n.toLocaleString(undefined, {
                                maximumFractionDigits: 2,
                              })
                            )
                            .join(" – ")}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="text-xs mt-3">
                Assumes independent purchases and a stable purchase rate per
                unit of spend within each period. Campaign mix, repeated users,
                attribution modelling and day-to-day variation are not
                controlled. ROAS uncertainty requires additional order-value
                information; no ROAS confidence is manufactured.
              </p>
            </details>
          )}
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
