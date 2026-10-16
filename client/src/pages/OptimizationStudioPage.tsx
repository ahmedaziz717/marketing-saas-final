import { useEffect, useRef, useState } from "react";
import { Link, useLocation, useSearch } from "wouter";
import {
  ArrowLeft,
  ArrowRight,
  BarChart3,
  ClipboardCheck,
  FlaskConical,
  Lightbulb,
  Save,
  Target,
} from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { useWorkspace } from "@/hooks/useWorkspace";
import { WorkspaceGate } from "@/components/WorkspaceGate";
import { Button } from "@/components/ui/button";
import { StudioSections } from "@/components/configurator/StudioSections";
import { StudioCategories } from "@/components/configurator/StudioCategories";
import {
  useStudioNavigation,
  scrollStudioChoices,
} from "@/components/configurator/studioNavigation";
import { OptimizationResult } from "@/components/OptimizationResult";
import { OptimizationExperiments } from "@/components/OptimizationExperiments";
import { DateRangeFilter } from "@/components/DateRangeFilter";
import { WorkflowConnectionInput } from "@/components/WorkflowConnectionInput";
import { WorkflowRunReview } from "@/components/WorkflowRunReview";
import { WorkflowRunProgress } from "@/components/WorkflowRunProgress";
import {
  defaultOptimizationSettings,
  optimizationStudioGraph,
  readOptimizationStudio,
  type OptimizationSettings,
} from "@shared/optimizationStudio";
import {
  experimentSchema,
  optimizationStudioSchema,
  type OptimizationStudio,
} from "@shared/optimizationStudioSchema";
import { optimizerKinds } from "@shared/optimization";
import {
  optimizerLibrary,
  optimizerOutputSchema,
} from "@shared/optimizerLibrary";
import { availableWorkflowResults } from "@shared/workflowResults";
import { workflowRunStatusLabel } from "@shared/workflowRunActivity";
import "@/styles/configurator.css";
import "@/styles/insights.css";
import "@/styles/optimizationStudio.css";

const sections = [
  {
    id: "goal",
    title: "Goal",
    subtitle: "Purpose & focus",
    icon: Target,
    categories: [
      { id: "purpose", title: "What to improve" },
      { id: "focus", title: "Areas to analyze" },
    ],
  },
  {
    id: "evidence",
    title: "Evidence",
    subtitle: "Account & coverage",
    icon: BarChart3,
    categories: [
      { id: "source", title: "Account & dates" },
      { id: "quality", title: "Evidence quality" },
    ],
  },
  {
    id: "review",
    title: "Review & run",
    subtitle: "Confirm your analysis",
    icon: ClipboardCheck,
    categories: [{ id: "review", title: "Summary & run" }],
  },
  {
    id: "results",
    title: "Recommendations",
    subtitle: "Findings & run history",
    icon: Lightbulb,
    categories: [
      { id: "results", title: "Opportunities" },
      { id: "history", title: "Run history" },
    ],
  },
  {
    id: "experiments",
    title: "Experiments",
    subtitle: "Plan & track tests",
    icon: FlaskConical,
    categories: [{ id: "plans", title: "Experiment plans" }],
  },
] as const;
const pages = sections.flatMap(s => [...s.categories]);

function Studio({
  organizationId,
  role,
  workflowId,
  initialPage,
}: {
  organizationId: number;
  role: string;
  workflowId?: string;
  initialPage?: string;
}) {
  const [, navigate] = useLocation();
  const root = useStudioNavigation();
  const [page, setPage] = useState(
    initialPage && pages.some(p => p.id === initialPage)
      ? initialPage
      : "purpose"
  );
  const [name, setName] = useState("My optimization plan");
  const [settings, setSettings] = useState<OptimizationSettings>(
    defaultOptimizationSettings
  );
  const [studio, setStudio] = useState<OptimizationStudio>(() =>
    optimizationStudioSchema.parse({ version: 1 })
  );
  const [revision, setRevision] = useState<number>();
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState("");
  const [selectedRunId, setSelectedRunId] = useState("");
  const [loaded, setLoaded] = useState(!workflowId);
  const [incompatible, setIncompatible] = useState(false);
  const submitting = useRef(false);
  const availability = trpc.optimization.availability.useQuery({
    organizationId,
  });
  const saved = trpc.workflows.list.useQuery({
    organizationId,
    family: "optimize",
    studio: "optimization",
  });
  const detail = trpc.workflows.get.useQuery(
    { organizationId, id: workflowId ?? "" },
    { enabled: !!workflowId, refetchInterval: 4000 }
  );
  const progress = trpc.optimization.progress.useQuery(
    { organizationId, connectionId: settings.connectionId },
    {
      enabled: !!settings.connectionId && !!availability.data?.enabled,
      refetchInterval: 5000,
    }
  );
  const connections = trpc.channels.connections.useQuery({ organizationId });
  const save = trpc.workflows.save.useMutation(),
    quote = trpc.workflows.quote.useMutation(),
    run = trpc.workflows.run.useMutation(),
    stop = trpc.workflows.stop.useMutation();
  const sourceRun = trpc.workflows.getRun.useQuery(
    { organizationId, workflowId: workflowId ?? "", id: selectedRunId },
    {
      enabled:
        !!workflowId &&
        !!selectedRunId &&
        !detail.data?.runs.some(r => r.id === selectedRunId),
    }
  );
  useEffect(() => {
    if (!detail.data || loaded) return;
    const state = readOptimizationStudio(detail.data.graph);
    if (!state) setIncompatible(true);
    else {
      setSettings(state.settings);
      setStudio(state.studio);
      setName(detail.data.name);
      setRevision(detail.data.revision);
    }
    setLoaded(true);
  }, [detail.data, loaded]);
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);
  const update = (patch: Partial<OptimizationSettings>) => {
    setSettings(s => ({ ...s, ...patch }));
    setDirty(true);
    setError("");
  };
  const updateStudio = (patch: Partial<OptimizationStudio>) => {
    setStudio(s => ({ ...s, ...patch }));
    setDirty(true);
    setError("");
  };
  const select = (next: string) => {
    setPage(next);
    scrollStudioChoices(root.current);
  };
  const section =
    sections.find(s => s.categories.some(p => p.id === page)) ?? sections[0];
  const index = pages.findIndex(p => p.id === page);
  const runs = detail.data?.runs ?? [];
  const active = runs.find(r => ["queued", "running"].includes(r.status));
  const latest = selectedRunId
    ? (runs.find(r => r.id === selectedRunId) ?? sourceRun.data)
    : (active ?? runs[0]);
  const results = availableWorkflowResults(latest).flatMap(v =>
    v.type === "data" && optimizerOutputSchema.safeParse(v.data).success
      ? [v.data]
      : []
  );
  const account = connections.data?.items.find(
    c => c.id === settings.connectionId
  );
  const busy = save.isPending || quote.isPending || run.isPending;
  const go = (id?: string) => {
    if (
      !dirty ||
      window.confirm("Leave this plan without saving your changes?")
    )
      navigate(`/app/optimize/studio${id ? `?id=${id}` : ""}`);
  };
  const persist = async (analyze = false) => {
    if (submitting.current || incompatible || (analyze && active)) return;
    submitting.current = true;
    setError("");
    let savedId = workflowId;
    try {
      if (!name.trim()) throw new Error("Give this optimization plan a name.");
      if (
        analyze &&
        (!studio.objective.trim() ||
          !account ||
          account.status !== "connected" ||
          !availability.data?.enabled)
      )
        throw new Error(
          "Add your goal and choose a connected Meta ad account before running analysis."
        );
      const graph = optimizationStudioGraph(settings, studio);
      const item = await save.mutateAsync({
        organizationId,
        id: workflowId,
        revision,
        name,
        family: "optimize",
        graph,
      });
      savedId = item.id;
      setRevision(item.revision);
      setDirty(false);
      await saved.refetch();
      if (analyze) {
        const request = {
          organizationId,
          id: item.id,
          revision: item.revision,
        };
        const estimate = await quote.mutateAsync(request);
        if (estimate.credits !== 0)
          throw new Error(
            "This workflow now includes paid generation. Review and run it from the workflow editor."
          );
        const result = await run.mutateAsync({
          ...request,
          requestId: crypto.randomUUID(),
          quotedCredits: 0,
        });
        setSelectedRunId(result.id);
        select("results");
        toast.success(
          "Analysis started. Follow its progress in Recommendations."
        );
      } else toast.success("Optimization plan saved");
      if (workflowId) await detail.refetch();
      else
        navigate(
          `/app/optimize/studio?id=${item.id}&step=${analyze ? "results" : page}`,
          { replace: true }
        );
    } catch (e) {
      const message = (e as Error).message;
      setError(message);
      toast.error(message);
      if (!workflowId && savedId)
        navigate(`/app/optimize/studio?id=${savedId}&step=review`, {
          replace: true,
        });
    } finally {
      submitting.current = false;
    }
  };
  const addPlan = (data?: Record<string, unknown>) => {
    if (studio.experiments.length >= 30) {
      setError("This plan already contains 30 experiments.");
      return;
    }
    const result = data ? optimizerOutputSchema.parse(data) : null;
    const plan = experimentSchema.parse({
      id: crypto.randomUUID(),
      title: result
        ? `${optimizerLibrary[result.kind].name.replace(" optimizer", "")} test`
        : "New experiment",
      source:
        result && latest ? { runId: latest.id, kind: result.kind } : undefined,
      variant: result?.suggestedTests[0] ?? "",
    });
    updateStudio({ experiments: [...studio.experiments, plan] });
    select("plans");
  };
  if (workflowId && detail.error)
    return (
      <p role="alert">
        {detail.error.message}{" "}
        <Link href="/app/optimize/studio">Start a new plan</Link>
      </p>
    );
  if (!loaded) return <p role="status">Opening optimization plan…</p>;
  if (incompatible)
    return (
      <div className="surface p-6 space-y-4">
        <h1>Open this plan in Workflows</h1>
        <p>
          Its processing steps were customized beyond the Studio format.
          Continue in the workflow editor to preserve those changes.
        </p>
        <Button asChild>
          <Link href={`/app/optimize/workflows?workflow=${workflowId}`}>
            Open workflow
          </Link>
        </Button>
        <Button variant="outline" onClick={() => go()}>
          New Studio plan
        </Button>
      </div>
    );
  return (
    <div
      ref={root}
      className="cfg-root insight-studio optimization-studio"
      data-workflow="Optimize"
    >
      <header className="cfg-heading">
        <div>
          <span className="insight-eyebrow">Optimize</span>
          <div className="cfg-title">
            <h1>Optimization Studio</h1>
            <span className="insight-badge">
              {dirty
                ? "Unsaved changes"
                : workflowId
                  ? "Saved plan"
                  : "New plan"}
            </span>
          </div>
          <p className="insight-subtitle">
            Turn measured results into a clear next test.
          </p>
        </div>
        <div className="optimization-header-actions">
          <select
            aria-label="Saved optimization plans"
            value={workflowId ?? ""}
            onChange={e => go(e.target.value || undefined)}
          >
            <option value="">New optimization plan</option>
            {saved.data?.map(p => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          <Button variant="outline" disabled={busy} onClick={() => persist()}>
            <Save size={16} /> Save plan
          </Button>
        </div>
      </header>
      <StudioSections
        label="Optimization Studio sections"
        items={sections}
        current={section.id}
        onSelect={id =>
          select(sections.find(s => s.id === id)!.categories[0].id)
        }
      />
      <div className="cfg-body">
        <StudioCategories
          items={section.categories}
          current={page}
          onSelect={select}
        />
        {error && (
          <p role="alert" className="insight-notice">
            {error}
          </p>
        )}
        {saved.error && (
          <p role="alert" className="insight-notice">
            Saved plans could not be loaded. {saved.error.message}
          </p>
        )}
        {availability.error && (
          <p role="alert" className="insight-notice">
            {availability.error.message}
          </p>
        )}
        {availability.data?.enabled === false && (
          <p className="insight-notice">
            Historical optimization analysis is not enabled for this workspace.
            You can save goals and experiment plans; an administrator can enable
            the existing optimization service.
          </p>
        )}
        {detail.data && revision && detail.data.revision > revision && (
          <p role="alert" className="insight-notice">
            This plan changed in another tab. Reopen it before saving to keep
            both edits safe.
          </p>
        )}
        <fieldset disabled={busy} className="insight-form">
          {page === "purpose" && (
            <section>
              <div className="cfg-content-title">
                <div>
                  <h2>What would you like to improve?</h2>
                  <p>
                    Give this plan a question that your evidence can answer.
                  </p>
                </div>
              </div>
              <div className="insight-form-grid">
                <label className="insight-label">
                  Plan title
                  <input
                    aria-label="Plan title"
                    value={name}
                    maxLength={100}
                    onChange={e => {
                      setName(e.target.value);
                      setDirty(true);
                    }}
                  />
                </label>
                <label className="insight-label insight-full">
                  Goal & context
                  <textarea
                    aria-label="Goal & context"
                    rows={5}
                    maxLength={5000}
                    placeholder="For example: Which headline approaches deserve a controlled test to improve purchase efficiency?"
                    value={studio.objective}
                    onChange={e => updateStudio({ objective: e.target.value })}
                  />
                </label>
              </div>
              <div className="optimization-explainer">
                <Lightbulb size={22} />
                <p>
                  Choose an account and areas to analyze. Review the observed
                  patterns and evidence limits, then turn a finding into an
                  editable experiment plan.
                </p>
              </div>
            </section>
          )}
          {page === "focus" && (
            <section>
              <div className="cfg-content-title">
                <div>
                  <h2>Choose up to three areas</h2>
                  <p>
                    Each area gets its own recommendation and supporting
                    evidence.
                  </p>
                </div>
              </div>
              <div className="optimization-focus-grid">
                {optimizerKinds.map(kind => (
                  <label
                    key={kind}
                    className="optimization-focus"
                    data-selected={settings.focus.includes(kind)}
                  >
                    <input
                      type="checkbox"
                      checked={settings.focus.includes(kind)}
                      disabled={
                        !settings.focus.includes(kind) &&
                        settings.focus.length >= 3
                      }
                      onChange={e =>
                        update({
                          focus: e.target.checked
                            ? [...settings.focus, kind]
                            : settings.focus.filter(k => k !== kind),
                        })
                      }
                    />
                    <span>
                      <strong>
                        {optimizerLibrary[kind].name.replace(" optimizer", "")}
                      </strong>
                      <small>{optimizerLibrary[kind].test}</small>
                    </span>
                  </label>
                ))}
              </div>
            </section>
          )}
          {page === "source" && (
            <section>
              <div className="cfg-content-title">
                <div>
                  <h2>Choose the evidence</h2>
                  <p>
                    Analyze imported Meta ad results from January 2026 onward.
                  </p>
                </div>
              </div>
              <div className="space-y-6">
                <label className="insight-label">
                  Meta ad account
                  <WorkflowConnectionInput
                    title="Meta ad account"
                    channel="meta_ads"
                    organizationId={organizationId}
                    value={settings.connectionId}
                    onChange={connectionId => update({ connectionId })}
                  />
                </label>
                <DateRangeFilter
                  value={settings.range}
                  timezone={account?.details.timezone ?? "UTC"}
                  onChange={range => range && update({ range })}
                />
                <p className="insight-caption">
                  Dates use the account timezone:{" "}
                  {account?.details.timezone ?? "UTC"}. Only the selected period
                  is analyzed.
                </p>
                <label className="insight-check">
                  <input
                    type="checkbox"
                    checked={settings.refreshHistory}
                    onChange={e => update({ refreshHistory: e.target.checked })}
                  />
                  <span>
                    Refresh Meta history before this analysis
                    <small>
                      Runs a read-only import first. An initial import can take
                      longer; progress appears with the run.
                    </small>
                  </span>
                </label>
              </div>
            </section>
          )}
          {page === "quality" && (
            <section>
              <div className="cfg-content-title">
                <div>
                  <h2>Know what the evidence supports</h2>
                  <p>
                    Coverage and classification quality stay visible beside your
                    results.
                  </p>
                </div>
              </div>
              {progress.error && <p role="alert">{progress.error.message}</p>}
              <div className="optimization-evidence-card">
                <strong>
                  {!settings.connectionId
                    ? "Choose an account first"
                    : progress.isLoading
                      ? "Checking imported evidence…"
                      : progress.data
                        ? `History import: ${progress.data.status}`
                        : "No imported history yet"}
                </strong>
                {progress.data ? (
                  <>
                    <p>
                      {progress.data.range.since} – {progress.data.range.until}{" "}
                      · {progress.data.rows.toLocaleString()} imported records
                    </p>
                    <p>
                      {progress.data.completedTasks} /{" "}
                      {progress.data.totalTasks} slices · Updated{" "}
                      {new Date(progress.data.updatedAtMs).toLocaleString()}
                    </p>
                    {progress.data.error && (
                      <p role="alert">{progress.data.error}</p>
                    )}
                    {progress.data.warnings.map((w, i) => (
                      <p key={i}>{w}</p>
                    ))}
                  </>
                ) : (
                  <p>
                    Enable “Refresh Meta history” in Account & dates to import
                    evidence on the next run.
                  </p>
                )}
                <Link href="/app/optimize/intelligence">
                  Inspect or manage imported history →
                </Link>
              </div>
              <label className="insight-label">
                Minimum classification confidence
                <select
                  aria-label="Minimum classification confidence"
                  value={settings.minimumConfidence}
                  onChange={e =>
                    update({ minimumConfidence: Number(e.target.value) })
                  }
                >
                  <option value={0}>Include all classifications</option>
                  <option value={0.5}>50% · moderate and above</option>
                  <option value={0.8}>80% · high confidence only</option>
                </select>
              </label>
              <p className="insight-caption">
                This filters how confidently an ad was classified. It is
                separate from confidence in a performance result. Missing
                coverage and unknown values remain explicit; observed
                associations do not establish causal lift.
              </p>
            </section>
          )}
          {page === "review" && (
            <section>
              <div className="cfg-content-title">
                <div>
                  <h2>Ready to analyze?</h2>
                  <p>Save the setup and run the connected analysis workflow.</p>
                </div>
              </div>
              <dl className="optimization-summary">
                <div>
                  <dt>Plan</dt>
                  <dd>{name}</dd>
                </div>
                <div>
                  <dt>Goal</dt>
                  <dd>
                    {studio.objective || "Add a goal in the Goal section"}
                  </dd>
                </div>
                <div>
                  <dt>Source</dt>
                  <dd>
                    {account?.name ?? "Choose a connected account"} ·{" "}
                    {settings.range.since} – {settings.range.until}
                  </dd>
                </div>
                <div>
                  <dt>Focus</dt>
                  <dd>
                    {settings.focus
                      .map(k =>
                        optimizerLibrary[k].name.replace(" optimizer", "")
                      )
                      .join(", ") || "Choose at least one area"}
                  </dd>
                </div>
                <div>
                  <dt>History</dt>
                  <dd>
                    {settings.refreshHistory
                      ? "Refresh before analysis"
                      : "Use currently imported evidence"}
                  </dd>
                </div>
                <div>
                  <dt>Output</dt>
                  <dd>
                    Recommendations, coverage notes and editable experiment
                    plans · 0 AI generation credits
                  </dd>
                </div>
              </dl>
              <p className="insight-caption">
                This run reads performance and prepares recommendations.
                Campaign changes and experiment launches remain separate actions
                requiring review.
              </p>
              <Button
                disabled={
                  !!active ||
                  !availability.data?.enabled ||
                  !studio.objective.trim() ||
                  !settings.connectionId ||
                  !settings.focus.length
                }
                onClick={() => persist(true)}
              >
                {busy
                  ? "Starting analysis…"
                  : active
                    ? "Analysis already in progress"
                    : "Save & run analysis"}
              </Button>
              {active && (
                <Button
                  variant="outline"
                  onClick={() => {
                    setSelectedRunId("");
                    select("results");
                  }}
                >
                  View progress
                </Button>
              )}
              {workflowId && (
                <p className="mt-4">
                  <Link href={`/app/optimize/workflows?workflow=${workflowId}`}>
                    View the underlying workflow →
                  </Link>
                </p>
              )}
            </section>
          )}
          {(page === "results" || page === "history") && (
            <section>
              <div className="cfg-content-title">
                <div>
                  <h2>
                    {page === "history"
                      ? "Analysis history"
                      : "Your next opportunities"}
                  </h2>
                  <p>
                    Each run retains the evidence and settings used at that
                    time.
                  </p>
                </div>
              </div>
              {sourceRun.error && <p role="alert">{sourceRun.error.message}</p>}
              {!latest && (
                <div className="insight-empty">
                  <Lightbulb size={28} />
                  <h3>
                    {sourceRun.isLoading
                      ? "Loading saved run…"
                      : "Your findings will appear here"}
                  </h3>
                  <p>
                    Complete your goal and evidence setup, then run the
                    analysis.
                  </p>
                  <Button onClick={() => select("review")}>
                    Review analysis setup
                  </Button>
                </div>
              )}
              {page === "history" && (
                <div className="optimization-history">
                  {runs.map(r => (
                    <button
                      type="button"
                      key={r.id}
                      onClick={() => {
                        setSelectedRunId(r.id);
                        select("results");
                      }}
                    >
                      <span>
                        {new Date(r.createdAtMs).toLocaleString()}
                        <small>Saved analysis settings & evidence</small>
                      </span>
                      <strong>{workflowRunStatusLabel(r)}</strong>
                      <ArrowRight size={16} />
                    </button>
                  ))}
                  {runs.length === 20 && (
                    <p className="insight-caption">
                      Showing the latest 20 runs. Older evidence remains
                      accessible from linked experiments.
                    </p>
                  )}
                </div>
              )}
              {page === "results" && latest && (
                <>
                  <div className="optimization-run-banner">
                    <div>
                      <strong>{workflowRunStatusLabel(latest)}</strong>
                      <p>
                        {new Date(latest.createdAtMs).toLocaleString()} ·{" "}
                        {
                          latest.graph.nodes.find(
                            n => n.type === "analyze_history"
                          )?.config.analysis?.range.since
                        }{" "}
                        –{" "}
                        {
                          latest.graph.nodes.find(
                            n => n.type === "analyze_history"
                          )?.config.analysis?.range.until
                        }
                      </p>
                      <p>{latest.graph.optimizationStudio?.objective}</p>
                    </div>
                    <Button variant="outline" onClick={() => select("history")}>
                      Run history
                    </Button>
                  </div>
                  {dirty && (
                    <p className="insight-notice">
                      These results belong to the saved run shown above. Run
                      again to analyze your edited settings.
                    </p>
                  )}
                  {latest.error && (
                    <p role="alert" className="insight-notice">
                      {latest.error}
                    </p>
                  )}
                  <WorkflowRunProgress
                    run={latest}
                    refreshError={!!detail.error || !!sourceRun.error}
                    refreshing={detail.isFetching}
                    onRefresh={() => detail.refetch()}
                  />
                  <WorkflowRunReview
                    hideBackgroundWaits
                    organizationId={organizationId}
                    role={role}
                    run={latest}
                    onRefresh={() => detail.refetch()}
                  />
                  {results.map(data => {
                    const r = optimizerOutputSchema.parse(data);
                    return (
                      <article
                        key={r.kind}
                        className="optimization-recommendation"
                      >
                        <OptimizationResult data={data} />
                        <div className="optimization-recommendation-action">
                          <p>
                            {r.decision === "propose_test"
                              ? "Turn this finding into a controlled test with a clear decision rule."
                              : "Evidence is not sufficient for a supported recommendation. You can draft an exploratory test and gather more data."}
                          </p>
                          <Button
                            variant="outline"
                            disabled={
                              latest.status !== "completed" ||
                              r.decision === "unsupported_channel" ||
                              studio.experiments.length >= 30
                            }
                            onClick={() => addPlan(data)}
                          >
                            {r.decision === "propose_test"
                              ? "Create experiment plan"
                              : "Plan exploratory test"}
                          </Button>
                        </div>
                      </article>
                    );
                  })}
                  {latest.status === "completed" && !results.length && (
                    <p className="insight-notice">
                      This run has no compatible recommendation output. Open the
                      underlying workflow to inspect its steps.
                    </p>
                  )}
                </>
              )}
              {active && (
                <Button
                  className="mt-4"
                  variant="outline"
                  disabled={stop.isPending || active.stopRequested}
                  onClick={async () => {
                    try {
                      await stop.mutateAsync({ organizationId, id: active.id });
                      await detail.refetch();
                    } catch (e) {
                      setError((e as Error).message);
                    }
                  }}
                >
                  {active.stopRequested
                    ? "Stopping after current step…"
                    : "Stop active analysis"}
                </Button>
              )}
            </section>
          )}
          {page === "plans" && (
            <OptimizationExperiments
              plans={studio.experiments}
              onChange={experiments => updateStudio({ experiments })}
              onAdd={() => addPlan()}
              onSource={id => {
                setSelectedRunId(id);
                select("results");
              }}
              onSave={() => persist()}
            />
          )}
        </fieldset>
        <footer className="optimization-footer">
          <Button
            variant="outline"
            disabled={index <= 0 || busy}
            onClick={() => select(pages[index - 1].id)}
          >
            <ArrowLeft size={16} /> Previous
          </Button>
          <span>
            {section.title} · {index + 1} of {pages.length}
          </span>
          <Button
            variant="outline"
            disabled={index >= pages.length - 1 || busy}
            onClick={() => select(pages[index + 1].id)}
          >
            Continue <ArrowRight size={16} />
          </Button>
        </footer>
      </div>
    </div>
  );
}

export default function OptimizationStudioPage() {
  const workspace = useWorkspace();
  const params = new URLSearchParams(useSearch());
  const id = params.get("id") || undefined;
  const allowed = ["owner", "admin", "creator", "publisher"].includes(
    workspace.membership?.role ?? ""
  );
  return (
    <WorkspaceGate>
      {workspace.organizationId &&
        (allowed ? (
          <Studio
            key={`${workspace.organizationId}:${id ?? "new"}`}
            organizationId={workspace.organizationId}
            role={workspace.membership!.role}
            workflowId={id}
            initialPage={params.get("step") ?? undefined}
          />
        ) : (
          <p>
            Your workspace role can view performance in Insights Studio. Ask an
            administrator for workflow access to create optimization plans.
          </p>
        ))}
    </WorkspaceGate>
  );
}
