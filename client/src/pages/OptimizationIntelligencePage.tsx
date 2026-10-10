import { useState } from "react";
import { Link } from "wouter";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { useWorkspace } from "@/hooks/useWorkspace";
import { WorkspaceGate } from "@/components/WorkspaceGate";
import { DateRangeFilter } from "@/components/DateRangeFilter";
import { Button } from "@/components/ui/button";
import { channelInput } from "@/components/ChannelConnections";
import {
  dimensionNames,
  dimensionOptions,
  type Dimension,
  type AnalysisQuery,
} from "@shared/optimization";
const title = (v: string) =>
  v.replaceAll("_", " ").replace(/^./, c => c.toUpperCase());
const number = (v: unknown) =>
  typeof v === "number"
    ? v.toLocaleString(undefined, { maximumFractionDigits: 2 })
    : "Unavailable";
export default function OptimizationIntelligencePage() {
  return (
    <WorkspaceGate>
      <Intelligence />
    </WorkspaceGate>
  );
}
function Intelligence() {
  const { organizationId, membership } = useWorkspace();
  const [connectionId, setConnection] = useState("");
  const [query, setQuery] = useState<AnalysisQuery>({
    range: {
      since: "2026-01-01",
      until: new Date().toISOString().slice(0, 10),
    },
    grain: "daily",
    dimensions: ["messaging_style"],
    filters: [],
    minimumConfidence: 0,
  });
  const [filterDimension, setFilterDimension] =
      useState<Dimension>("messaging_style"),
    [filterValue, setFilterValue] = useState("");
  const [selectedAd, setSelectedAd] = useState(""),
    [overrideDimension, setOverrideDimension] = useState<Dimension>("theme"),
    [overrideValue, setOverrideValue] = useState(""),
    [overrideEvidence, setOverrideEvidence] = useState("");
  const [classifying, setClassifying] = useState(false);
  const available = trpc.optimization.availability.useQuery(
    { organizationId: organizationId! },
    { enabled: !!organizationId }
  );
  const connections = trpc.channels.connections.useQuery(
    { organizationId: organizationId! },
    { enabled: !!organizationId }
  );
  const args = { organizationId: organizationId!, connectionId };
  const enabled =
    !!organizationId && !!connectionId && !!available.data?.enabled;
  const progress = trpc.optimization.progress.useQuery(args, {
    enabled,
    refetchInterval: 5000,
  });
  const report = trpc.optimization.analyze.useQuery(
    { ...args, query },
    { enabled, retry: false }
  );
  const sync = trpc.optimization.sync.useMutation({
    onSuccess: () => {
      progress.refetch();
      toast.success("Read-only Meta sync queued");
    },
    onError: e => toast.error(e.message),
  });
  const resume = trpc.optimization.resume.useMutation({
    onSuccess: () => progress.refetch(),
    onError: e => toast.error(e.message),
  });
  const classify = trpc.optimization.classify.useMutation();
  const override = trpc.optimization.override.useMutation({
    onSuccess: () => {
      report.refetch();
      toast.success(
        "Classification saved; imported suggestions cannot replace it."
      );
    },
    onError: e => toast.error(e.message),
  });
  const exp = trpc.optimization.export.useMutation({
    onSuccess: r => {
      const url = URL.createObjectURL(
        new Blob([r.csv], { type: "text/csv;charset=utf-8" })
      );
      const a = document.createElement("a");
      a.href = url;
      a.download = r.filename;
      a.click();
      URL.revokeObjectURL(url);
    },
    onError: e => toast.error(e.message),
  });
  const canEdit = ["owner", "admin", "creator", "publisher"].includes(
    membership?.role ?? ""
  );
  const data = report.data;
  return (
    <main className="mx-auto max-w-7xl space-y-6 p-4 sm:p-8">
      <header>
        <Link className="text-sm text-primary" href="/app/optimize/apps">
          ← Optimize Apps
        </Link>
        <h1 className="mt-3 text-3xl font-semibold">
          Optimization intelligence
        </h1>
        <p className="mt-2 text-muted-foreground">
          Explore historical evidence, understand its limits, and choose what to
          test next.
        </p>
      </header>
      {!available.data?.enabled ? (
        <p role="status">
          This workspace is not in the optimization rollout yet.
        </p>
      ) : (
        <>
          <section className="rounded-xl border bg-card p-4 space-y-4">
            <label className="block text-sm">
              Connected Meta ad account
              <select
                className={channelInput + " mt-1 w-full"}
                value={connectionId}
                onChange={e => {
                  setConnection(e.target.value);
                  setSelectedAd("");
                }}
              >
                <option value="">Choose an account</option>
                {connections.data?.items
                  .filter(
                    c => c.channel === "meta_ads" && c.status === "connected"
                  )
                  .map(c => (
                    <option value={c.id} key={c.id}>
                      {c.name}
                    </option>
                  ))}
              </select>
            </label>
            {connectionId && (
              <>
                <div className="flex flex-wrap gap-2">
                  <Button
                    disabled={!canEdit || sync.isPending}
                    onClick={() => sync.mutate({ ...args, incremental: false })}
                  >
                    Import 2026 history
                  </Button>
                  <Button
                    variant="outline"
                    disabled={!canEdit || sync.isPending}
                    onClick={() => sync.mutate({ ...args, incremental: true })}
                  >
                    Sync recent changes
                  </Button>
                  <Button
                    variant="outline"
                    disabled={!canEdit || classifying}
                    onClick={async () => {
                      setClassifying(true);
                      try {
                        let after = "";
                        do {
                          const r = await classify.mutateAsync({
                            ...args,
                            after,
                          });
                          after = r.next ?? "";
                        } while (after);
                        await report.refetch();
                        toast.success("Imported classifications updated");
                      } catch (e) {
                        toast.error((e as Error).message);
                      } finally {
                        setClassifying(false);
                      }
                    }}
                  >
                    {classifying ? "Classifying…" : "Classify imported ads"}
                  </Button>
                  <Button variant="outline" onClick={() => report.refetch()}>
                    Refresh evidence
                  </Button>
                </div>
                {progress.data && (
                  <div className="text-sm space-y-2" role="status">
                    <p>
                      {title(progress.data.status)} ·{" "}
                      {progress.data.completedTasks}/{progress.data.totalTasks}{" "}
                      slices · {progress.data.rows.toLocaleString()} rows ·{" "}
                      {progress.data.pages} pages
                    </p>
                    <progress
                      className="w-full"
                      max={progress.data.totalTasks}
                      value={progress.data.completedTasks}
                    />
                    {progress.data.error && (
                      <p className="text-destructive">{progress.data.error}</p>
                    )}
                    {progress.data.status === "failed" && (
                      <Button
                        variant="outline"
                        onClick={() => resume.mutate(args)}
                      >
                        Resume from checkpoint
                      </Button>
                    )}
                    {progress.data.warnings.map((w, i) => (
                      <p key={i}>{w}</p>
                    ))}
                  </div>
                )}
              </>
            )}
          </section>
          {connectionId && (
            <>
              <section className="rounded-xl border bg-card p-4 space-y-4">
                <DateRangeFilter
                  value={query.range}
                  timezone={data?.account.timezone ?? "UTC"}
                  onChange={range => range && setQuery({ ...query, range })}
                />
                <div className="grid gap-4 sm:grid-cols-2">
                  <label className="text-sm">
                    Granularity
                    <select
                      className={channelInput + " mt-1 w-full"}
                      value={query.grain}
                      onChange={e =>
                        setQuery({
                          ...query,
                          grain: e.target.value as AnalysisQuery["grain"],
                          dimensions: query.dimensions.filter(
                            d => d !== "hour" && d !== "placement"
                          ),
                          filters: query.filters.filter(
                            f =>
                              f.dimension !== "hour" &&
                              f.dimension !== "placement"
                          ),
                        })
                      }
                    >
                      <option value="daily">Ad / day</option>
                      <option value="placement">Ad / placement / day</option>
                      <option value="hourly">
                        Ad / hour / day (account timezone)
                      </option>
                    </select>
                  </label>
                  <label className="text-sm">
                    Minimum label confidence
                    <select
                      className={channelInput + " mt-1 w-full"}
                      value={query.minimumConfidence}
                      onChange={e =>
                        setQuery({
                          ...query,
                          minimumConfidence: Number(e.target.value),
                        })
                      }
                    >
                      <option value={0}>All evidence</option>
                      <option value={0.6}>60%+</option>
                      <option value={0.8}>80%+</option>
                      <option value={1}>Verified / exact</option>
                    </select>
                  </label>
                </div>
                <fieldset>
                  <legend className="text-sm font-medium">
                    Group by dimensions (up to four)
                  </legend>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {query.dimensions.map(d => (
                      <Button
                        key={d}
                        variant="secondary"
                        size="sm"
                        onClick={() =>
                          setQuery({
                            ...query,
                            dimensions: query.dimensions.filter(v => v !== d),
                          })
                        }
                      >
                        {title(d)} ×
                      </Button>
                    ))}
                    <select
                      aria-label="Add dimension"
                      className={channelInput}
                      value=""
                      disabled={query.dimensions.length >= 4}
                      onChange={e =>
                        e.target.value &&
                        setQuery({
                          ...query,
                          dimensions: [
                            ...query.dimensions,
                            e.target.value as Dimension,
                          ],
                        })
                      }
                    >
                      <option value="">Add dimension…</option>
                      {dimensionNames
                        .filter(
                          d =>
                            !query.dimensions.includes(d) &&
                            (d !== "hour" || query.grain === "hourly") &&
                            (d !== "placement" || query.grain === "placement")
                        )
                        .map(d => (
                          <option key={d} value={d}>
                            {title(d)}
                          </option>
                        ))}
                    </select>
                  </div>
                </fieldset>
                <fieldset>
                  <legend className="text-sm font-medium">
                    Filter combinations (AND between dimensions)
                  </legend>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <select
                      aria-label="Filter dimension"
                      className={channelInput}
                      value={filterDimension}
                      onChange={e =>
                        setFilterDimension(e.target.value as Dimension)
                      }
                    >
                      {dimensionNames.map(d => (
                        <option key={d} value={d}>
                          {title(d)}
                        </option>
                      ))}
                    </select>
                    <input
                      aria-label="Filter values"
                      className={channelInput}
                      placeholder="IDs separated by commas"
                      list="dimension-values"
                      value={filterValue}
                      onChange={e => setFilterValue(e.target.value)}
                    />
                    <datalist id="dimension-values">
                      {dimensionOptions[filterDimension]?.map(o => (
                        <option key={o.id} value={o.id}>
                          {o.name}
                        </option>
                      ))}
                    </datalist>
                    <Button
                      variant="outline"
                      disabled={!filterValue.trim()}
                      onClick={() => {
                        setQuery({
                          ...query,
                          filters: [
                            ...query.filters,
                            {
                              dimension: filterDimension,
                              values: filterValue
                                .split(",")
                                .map(s => s.trim())
                                .filter(Boolean),
                            },
                          ],
                        });
                        setFilterValue("");
                      }}
                    >
                      Add filter
                    </Button>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {query.filters.map((f, i) => (
                      <Button
                        variant="secondary"
                        size="sm"
                        key={i}
                        onClick={() =>
                          setQuery({
                            ...query,
                            filters: query.filters.filter((_, n) => i !== n),
                          })
                        }
                      >
                        {title(f.dimension)}: {f.values.join(", ")} ×
                      </Button>
                    ))}
                  </div>
                </fieldset>
              </section>
              {report.error && (
                <p role="alert" className="text-destructive">
                  {report.error.message}
                </p>
              )}
              {report.isFetching && <p role="status">Loading evidence…</p>}
              {data && (
                <>
                  <section className="rounded-xl border bg-card p-4">
                    <div className="flex flex-wrap justify-between gap-3">
                      <h2 className="text-xl font-semibold">
                        Performance evidence
                      </h2>
                      <Button
                        variant="outline"
                        disabled={exp.isPending}
                        onClick={() => exp.mutate({ ...args, query })}
                      >
                        Export report CSV
                      </Button>
                    </div>
                    <p className="my-3 text-sm text-muted-foreground">
                      {data.account.currency ?? "Currency unavailable"} ·{" "}
                      {data.account.timezone ?? "Timezone unavailable"} ·{" "}
                      {data.summary.adCount} source ads · {data.summary.samples}{" "}
                      observations · {data.summary.evidenceStrength} evidence
                    </p>
                    {data.coverage.incomplete && (
                      <p
                        role="status"
                        className="mb-3 rounded-lg bg-amber-500/10 p-3 text-sm"
                      >
                        Partial evidence. Sync status: {data.coverage.status}.{" "}
                        {data.coverage.truncated
                          ? "Result limit reached: narrow the range or dimensions before drawing conclusions."
                          : "Complete the import before relying on these totals."}
                      </p>
                    )}
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr>
                            {[
                              ...query.dimensions.map(title),
                              "Spend",
                              "Impressions",
                              "Purchases",
                              "Value",
                              "CTR %",
                              "CPC",
                              "CPA",
                              "ROAS",
                              "Ads",
                              "Evidence",
                            ].map((h, i) => (
                              <th
                                className="p-2 text-left whitespace-nowrap"
                                key={i}
                              >
                                {h}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {data.groups.map((g, i) => (
                            <tr className="border-t" key={i}>
                              {g.labels.map((label, j) => (
                                <td className="p-2" key={j}>
                                  <button
                                    className="text-primary underline"
                                    onClick={() =>
                                      setQuery({
                                        ...query,
                                        filters: [
                                          ...query.filters,
                                          {
                                            dimension: query.dimensions[j],
                                            values: [label],
                                          },
                                        ],
                                      })
                                    }
                                  >
                                    {label}
                                  </button>
                                </td>
                              ))}
                              {[
                                g.spend,
                                g.impressions,
                                g.purchases,
                                g.purchaseValue,
                                g.ctr,
                                g.cpc,
                                g.cpa,
                                g.roas,
                                g.adCount,
                              ].map((v, j) => (
                                <td className="p-2 whitespace-nowrap" key={j}>
                                  {number(v)}
                                </td>
                              ))}
                              <td className="p-2">{g.evidenceStrength}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    {!data.groups.length && (
                      <p className="py-4 text-muted-foreground">
                        No evidence matches this range and these filters.
                      </p>
                    )}
                  </section>
                  <section className="rounded-xl border bg-card p-4 space-y-3">
                    <h2 className="text-xl font-semibold">
                      Source ads and classifications
                    </h2>
                    <select
                      aria-label="Source ad"
                      className={channelInput + " w-full"}
                      value={selectedAd}
                      onChange={e => setSelectedAd(e.target.value)}
                    >
                      <option value="">Choose a source ad</option>
                      {data.sourceAds.map(a => (
                        <option key={a.id} value={a.id}>
                          {a.name} · {a.id}
                        </option>
                      ))}
                    </select>
                    {data.sourceAds
                      .filter(a => a.id === selectedAd)
                      .map(a => (
                        <div key={a.id} className="space-y-3">
                          <p className="text-sm">
                            Ad {a.id} · Campaign {a.campaignId ?? "unavailable"}{" "}
                            · Creative {a.creativeId ?? "unavailable"} ·
                            Snapshot {new Date(a.observedAtMs).toLocaleString()}
                          </p>
                          <div className="grid gap-3 sm:grid-cols-2">
                            {Object.entries(a.classifications).map(([d, v]) => (
                              <details
                                className="rounded-lg border p-3"
                                key={d}
                              >
                                <summary>
                                  {title(d)}:{" "}
                                  {v?.labels.map(l => l.label).join(", ") ||
                                    "Unknown"}
                                </summary>
                                <p className="text-xs mt-2">
                                  {v?.source} · taxonomy v{v?.version} ·
                                  revision {v?.revision}
                                </p>
                                {v?.labels.map(l => (
                                  <p className="text-sm mt-2" key={l.id}>
                                    {Math.round(l.confidence * 100)}% ·{" "}
                                    {l.evidence}
                                  </p>
                                ))}
                                {v?.unknownReason && (
                                  <p className="text-sm">{v.unknownReason}</p>
                                )}
                              </details>
                            ))}
                          </div>
                          {canEdit && (
                            <div className="space-y-2 border-t pt-4">
                              <h3 className="font-medium">
                                Reviewed classification
                              </h3>
                              <select
                                aria-label="Override dimension"
                                className={channelInput + " w-full"}
                                value={overrideDimension}
                                onChange={e =>
                                  setOverrideDimension(
                                    e.target.value as Dimension
                                  )
                                }
                              >
                                {dimensionNames.map(d => (
                                  <option key={d} value={d}>
                                    {title(d)}
                                  </option>
                                ))}
                              </select>
                              <input
                                aria-label="Reviewed labels"
                                className={channelInput + " w-full"}
                                placeholder="Labels / canonical IDs, separated by commas; blank means unknown"
                                value={overrideValue}
                                onChange={e => setOverrideValue(e.target.value)}
                              />
                              <input
                                aria-label="Classification evidence"
                                className={channelInput + " w-full"}
                                placeholder="What supports this classification?"
                                value={overrideEvidence}
                                onChange={e =>
                                  setOverrideEvidence(e.target.value)
                                }
                              />
                              <Button
                                disabled={
                                  override.isPending || !overrideEvidence.trim()
                                }
                                onClick={() =>
                                  override.mutate({
                                    ...args,
                                    adId: a.id,
                                    assertion: {
                                      dimension: overrideDimension,
                                      labels: overrideValue
                                        .split(",")
                                        .map(s => s.trim())
                                        .filter(Boolean)
                                        .map(id => ({
                                          id,
                                          label: id,
                                          confidence: 1,
                                          evidence: overrideEvidence,
                                        })),
                                      unknownReason: overrideValue.trim()
                                        ? undefined
                                        : overrideEvidence,
                                    },
                                  })
                                }
                              >
                                Save reviewed classification
                              </Button>
                            </div>
                          )}
                        </div>
                      ))}
                  </section>
                  <section className="rounded-xl border bg-card p-4">
                    <h2 className="font-semibold">
                      Interpretation and limitations
                    </h2>
                    <p className="mt-2 text-sm">
                      Attribution: {data.summary.attribution ?? "Not available"}
                      . Counts are aggregated before ratios are calculated;
                      unknown metrics are not treated as zero.
                    </p>
                    <ul className="mt-3 list-disc pl-5 space-y-2 text-sm text-muted-foreground">
                      {data.caveats.map(c => (
                        <li key={c}>{c}</li>
                      ))}
                    </ul>
                  </section>
                </>
              )}
            </>
          )}
        </>
      )}
    </main>
  );
}
