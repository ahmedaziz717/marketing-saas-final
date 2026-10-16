import { useEffect, useState } from "react";
import { Link } from "wouter";
import {
  ArrowDown,
  ArrowUp,
  ArrowUpRight,
  BarChart3,
  GripVertical,
  LayoutDashboard,
  Plus,
  RefreshCw,
  Settings2,
  Trash2,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { trpc } from "@/lib/trpc";
import {
  insightMetrics,
  insightNumber,
  scheduleDescription,
  type DashboardWidget,
  type InsightMetric,
} from "@shared/insights";
import { InsightChart, InsightMetricCard } from "./InsightReport";
import { toast } from "sonner";
import "@/styles/insights.css";

const date = (value: number | null | undefined) =>
  value ? new Date(value).toLocaleString() : "Not run yet";
export function InsightsDashboard({
  organizationId,
  surface,
}: {
  organizationId: number;
  surface: "main" | "measure";
}) {
  const layouts = trpc.insights.dashboards.useQuery({
    organizationId,
    surface,
  });
  const reports = trpc.insights.list.useQuery({ organizationId });
  const options = trpc.insights.options.useQuery({ organizationId });
  const [id, setId] = useState("");
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState("");
  const [widgets, setWidgets] = useState<DashboardWidget[]>([]);
  const [revision, setRevision] = useState<number | undefined>();
  const [adding, setAdding] = useState(false);
  const [reportChoice, setReportChoice] = useState("");
  const [kind, setKind] = useState<DashboardWidget["kind"]>("report");
  const [accountChoice, setAccountChoice] = useState("");
  const [metric, setMetric] = useState<InsightMetric>("spend");
  const [dragging, setDragging] = useState<string | null>(null);
  const utils = trpc.useUtils();
  const save = trpc.insights.saveDashboard.useMutation();
  const remove = trpc.insights.deleteDashboard.useMutation();
  const refresh = trpc.insights.run.useMutation();
  const current = layouts.data?.find(l => l.id === id) ?? layouts.data?.[0];
  useEffect(() => {
    if (editing) return;
    setWidgets(current?.widgets ?? []);
    setName(
      current?.name ??
        (surface === "main" ? "My main dashboard" : "My Measure dashboard")
    );
    setRevision(current?.revision);
  }, [current, editing, surface]);
  const data = trpc.insights.dashboardData.useQuery(
    {
      organizationId,
      reportIds: Array.from(new Set(widgets.map(w => w.reportId))),
    },
    {
      enabled: !!widgets.length,
      refetchInterval: query =>
        query.state.data?.some(
          d => d.latest && ["queued", "running"].includes(d.latest.status)
        )
          ? 3000
          : 30000,
    }
  );
  const chosenReport =
    reports.data?.find(r => r.id === reportChoice) ?? reports.data?.[0];
  const accounts =
    options.data?.connections.filter(c =>
      chosenReport?.config.connectionIds.includes(c.id)
    ) ?? [];
  const chosenAccount =
    accounts.find(c => c.id === accountChoice) ?? accounts[0];
  const metrics =
    chosenReport?.config.metrics.filter(
      m => insightMetrics[m].channel === chosenAccount?.channel
    ) ?? [];
  const chosenMetric = metrics.includes(metric) ? metric : metrics[0];
  const persist = async () => {
    try {
      const row = await save.mutateAsync({
        organizationId,
        id: id === "new" ? undefined : current?.id,
        revision,
        layout: { name, surface, widgets },
      });
      setId(row.id);
      await utils.insights.dashboards.invalidate({ organizationId, surface });
      setEditing(false);
      toast.success("Dashboard layout saved");
    } catch (e) {
      toast.error(
        e instanceof Error ? e.message : "Could not save this layout."
      );
    }
  };
  const move = (from: number, to: number) =>
    setWidgets(previous => {
      const list = [...previous];
      const [item] = list.splice(from, 1);
      list.splice(to, 0, item);
      return list;
    });
  const changeWidget = (wid: string, patch: Partial<DashboardWidget>) =>
    setWidgets(list => list.map(w => (w.id === wid ? { ...w, ...patch } : w)));
  const add = () => {
    if (
      !chosenReport ||
      (kind !== "report" && (!chosenAccount || !chosenMetric))
    )
      return;
    setWidgets(list => [
      ...list,
      {
        id: crypto.randomUUID(),
        reportId: chosenReport.id,
        kind,
        connectionId: kind === "report" ? null : chosenAccount!.id,
        metric: chosenMetric ?? chosenReport.config.chartMetric,
        size: kind === "kpi" ? "small" : "medium",
        height: "standard",
      },
    ]);
    setAdding(false);
  };
  if (layouts.isLoading)
    return (
      <div className="insight-loading" role="status">
        Loading your dashboard…
      </div>
    );
  if (layouts.error)
    return (
      <p role="alert" className="insight-notice">
        Your dashboard could not be loaded.{" "}
        <button onClick={() => layouts.refetch()}>Try again</button>
      </p>
    );
  return (
    <section
      className="insights-dashboard"
      aria-label={
        surface === "measure" ? "Measure dashboard" : "Dashboard insights"
      }
    >
      <div className="insight-dashboard-toolbar">
        <div>
          <span className="insight-eyebrow">
            {surface === "main"
              ? "Your performance"
              : "Your view, your priorities"}
          </span>
          <h2>
            {surface === "main"
              ? "Dashboard insights"
              : "Performance dashboard"}
          </h2>
          <p>Reports, charts, and KPIs that stay connected to their source.</p>
        </div>
        <div className="insight-actions">
          {!editing && !!layouts.data?.length && (
            <select
              aria-label="Saved dashboard layout"
              value={current?.id || ""}
              onChange={e => setId(e.target.value)}
            >
              {layouts.data.map(l => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
            </select>
          )}
          {!editing ? (
            <Button variant="outline" onClick={() => setEditing(true)}>
              <Settings2 size={16} />
              Customize
            </Button>
          ) : (
            <>
              <Button
                variant="outline"
                onClick={() => {
                  setEditing(false);
                  if (id === "new") setId("");
                }}
              >
                Cancel
              </Button>
              <Button
                disabled={save.isPending || !name.trim()}
                onClick={persist}
              >
                {save.isPending ? "Saving…" : "Save layout"}
              </Button>
            </>
          )}
        </div>
      </div>
      {editing && (
        <div className="insight-layout-editor">
          <label className="insight-label">
            Layout name
            <input
              value={name}
              maxLength={80}
              onChange={e => setName(e.target.value)}
            />
          </label>
          <div className="insight-actions">
            <Button
              variant="outline"
              disabled={widgets.length >= 30}
              onClick={() => setAdding(true)}
            >
              <Plus size={16} />
              Add widget
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                setId("new");
                setName("New dashboard layout");
                setRevision(undefined);
                setWidgets([]);
              }}
            >
              New layout
            </Button>
            {current && id !== "new" && (
              <Button
                variant="ghost"
                disabled={remove.isPending}
                onClick={async () => {
                  if (
                    !window.confirm(
                      `Delete the saved layout “${current.name}”? Your reports will remain available.`
                    )
                  )
                    return;
                  try {
                    await remove.mutateAsync({
                      organizationId,
                      id: current.id,
                    });
                    await utils.insights.dashboards.invalidate();
                    setId("");
                    setEditing(false);
                  } catch (e) {
                    toast.error(
                      e instanceof Error
                        ? e.message
                        : "Could not delete layout."
                    );
                  }
                }}
              >
                <Trash2 size={15} />
                Delete layout
              </Button>
            )}
          </div>
          <p>
            Drag widgets or use the arrow buttons to reorder. Choose width and
            height below each widget. Layouts are saved for your account.
          </p>
        </div>
      )}
      {!widgets.length ? (
        <div
          className={`insight-dashboard-empty ${surface === "main" ? "compact" : ""}`}
        >
          <div className="insight-empty-visual" aria-hidden="true">
            <BarChart3 size={48} />
            <span />
            <span />
            <span />
          </div>
          <div>
            <span className="insight-eyebrow">
              Make your numbers work for you
            </span>
            <h3>Build a dashboard around what matters.</h3>
            <p>
              Create a report in Insights Studio, then add its summary,
              individual KPIs, or charts here. Each widget follows the report’s
              schedule.
            </p>
            <div className="insight-actions">
              <Button asChild>
                <Link href="/app/analytics/studio">
                  <Plus size={16} />
                  Create a report
                </Link>
              </Button>
              <Button
                variant="outline"
                onClick={() => {
                  setEditing(true);
                  setAdding(true);
                }}
              >
                <LayoutDashboard size={16} />
                Add a saved report
              </Button>
            </div>
          </div>
        </div>
      ) : (
        <>
          {data.error && (
            <p role="alert" className="insight-notice">
              Report data could not be loaded.{" "}
              <button onClick={() => data.refetch()}>Try again</button>
            </p>
          )}
          <div className="insight-dashboard-grid">
            {widgets.map((w, index) => {
              const entry = data.data?.find(d => d.report.id === w.reportId),
                report = entry?.report,
                latest = entry?.latest,
                run = entry?.snapshot ?? latest;
              const account = run?.result?.accounts.find(
                a => a.connectionId === w.connectionId
              );
              const value = account?.metrics.find(m => m.key === w.metric);
              const title =
                w.kind === "report"
                  ? report?.config.name || "Report"
                  : insightMetrics[w.metric].label;
              return (
                <article
                  key={w.id}
                  className="insight-widget"
                  data-size={w.size}
                  data-height={w.height}
                  draggable={editing}
                  onDragStart={e => {
                    setDragging(w.id);
                    e.dataTransfer.effectAllowed = "move";
                  }}
                  onDragOver={e => {
                    if (editing) e.preventDefault();
                  }}
                  onDrop={e => {
                    e.preventDefault();
                    const from = widgets.findIndex(x => x.id === dragging);
                    if (from >= 0 && from !== index) move(from, index);
                    setDragging(null);
                  }}
                >
                  <header>
                    <div>
                      {editing && <GripVertical size={16} aria-hidden="true" />}
                      <span>
                        {w.kind === "report"
                          ? "Report"
                          : w.kind === "trend"
                            ? "Trend"
                            : "Key metric"}
                      </span>
                      <h3>{title}</h3>
                    </div>
                    {!editing && report && (
                      <Link
                        aria-label={`Open ${report.config.name}`}
                        href={`/app/analytics/studio?id=${report.id}${run ? `&run=${run.id}` : ""}`}
                      >
                        <ArrowUpRight size={18} />
                      </Link>
                    )}
                  </header>
                  <div className="insight-widget-content">
                    {data.isLoading ? (
                      <p role="status">Loading report…</p>
                    ) : !report ? (
                      <p>
                        This report was archived or is no longer available.
                        Remove this widget in Customize.
                      </p>
                    ) : !run ? (
                      <p>
                        This report has not run yet. Open it in Insights Studio
                        to generate its first result.
                      </p>
                    ) : !run.result ? (
                      <p role="status">
                        {["queued", "running"].includes(run.status)
                          ? "Refreshing this report…"
                          : run.error || "No result is available."}
                      </p>
                    ) : w.kind === "report" ? (
                      <>
                        <p className="insight-widget-period">
                          {run.result.range.since} — {run.result.range.until}
                        </p>
                        <ul>
                          {run.result.findings
                            .slice(0, w.height === "compact" ? 2 : 4)
                            .map((f, i) => (
                              <li key={i}>{f}</li>
                            ))}
                        </ul>
                      </>
                    ) : !account || !value ? (
                      <p>
                        This metric is not in the latest result. Open the report
                        to review its settings and run it again.
                      </p>
                    ) : w.kind === "kpi" ? (
                      <>
                        <p className="insight-widget-account">{account.name}</p>
                        <InsightMetricCard
                          account={account}
                          metric={value}
                          compare={run.config.compare}
                        />
                      </>
                    ) : (
                      <>
                        <p className="insight-widget-account">{account.name}</p>
                        <InsightChart account={account} metric={w.metric} />
                      </>
                    )}
                  </div>
                  {report && (
                    <footer>
                      <p>
                        Data refreshed: {date(run?.finishedAtMs)}{" "}
                        {latest && (
                          <span
                            className="insight-status"
                            data-status={latest.status}
                          >
                            {latest.status}
                          </span>
                        )}
                      </p>
                      {latest?.error && (
                        <p className="insight-stale">
                          Latest run: {latest.error}{" "}
                          {run?.result
                            ? "Showing the last available result."
                            : ""}
                        </p>
                      )}
                      {run && run.revision !== report.revision && (
                        <p className="insight-stale">
                          Settings changed since this result. Run the report to
                          update it.
                        </p>
                      )}
                      <p>
                        {report.nextRunAtMs
                          ? `Next: ${new Date(report.nextRunAtMs).toLocaleString(undefined, { timeZone: report.config.timezone })} · ${report.config.timezone}`
                          : report.scheduleError || "Manual refresh"}
                      </p>
                      {options.data?.canEdit && !editing && (
                        <button
                          className="insight-text-button"
                          disabled={
                            refresh.isPending ||
                            (!!latest &&
                              ["queued", "running"].includes(latest.status))
                          }
                          onClick={async () => {
                            try {
                              await refresh.mutateAsync({
                                organizationId,
                                id: report.id,
                                revision: report.revision,
                                notify: false,
                              });
                              await data.refetch();
                            } catch (e) {
                              toast.error(
                                e instanceof Error
                                  ? e.message
                                  : "Refresh failed."
                              );
                            }
                          }}
                        >
                          <RefreshCw size={13} />
                          Refresh report
                        </button>
                      )}
                    </footer>
                  )}
                  {editing && (
                    <div className="insight-widget-controls">
                      <div className="insight-actions">
                        <button
                          aria-label={`Move ${title} earlier`}
                          disabled={index === 0}
                          onClick={() => move(index, index - 1)}
                        >
                          <ArrowUp size={16} />
                        </button>
                        <button
                          aria-label={`Move ${title} later`}
                          disabled={index === widgets.length - 1}
                          onClick={() => move(index, index + 1)}
                        >
                          <ArrowDown size={16} />
                        </button>
                        <button
                          aria-label={`Remove ${title}`}
                          onClick={() =>
                            setWidgets(list => list.filter(x => x.id !== w.id))
                          }
                        >
                          <X size={16} />
                        </button>
                      </div>
                      <label>
                        Width
                        <select
                          aria-label={`${title} width`}
                          value={w.size}
                          onChange={e =>
                            changeWidget(w.id, {
                              size: e.target.value as DashboardWidget["size"],
                            })
                          }
                        >
                          <option value="small">Small</option>
                          <option value="medium">Medium</option>
                          <option value="wide">Full width</option>
                        </select>
                      </label>
                      <label>
                        Height
                        <select
                          aria-label={`${title} height`}
                          value={w.height}
                          onChange={e =>
                            changeWidget(w.id, {
                              height: e.target
                                .value as DashboardWidget["height"],
                            })
                          }
                        >
                          <option value="compact">Compact</option>
                          <option value="standard">Standard</option>
                          <option value="tall">Tall</option>
                        </select>
                      </label>
                    </div>
                  )}
                </article>
              );
            })}
          </div>
        </>
      )}
      <Dialog open={adding} onOpenChange={setAdding}>
        <DialogContent className="insight-pin-dialog">
          <DialogHeader>
            <DialogTitle>Add a dashboard widget</DialogTitle>
            <DialogDescription>
              Choose a saved report. Its filters and schedule will power this
              widget.
            </DialogDescription>
          </DialogHeader>
          {reports.isLoading ? (
            <p>Loading reports…</p>
          ) : !reports.data?.length ? (
            <p>
              No saved reports yet.{" "}
              <Link href="/app/analytics/studio">Create your first report</Link>
              .
            </p>
          ) : (
            <>
              <label className="insight-label">
                Report
                <select
                  value={chosenReport?.id || ""}
                  onChange={e => {
                    setReportChoice(e.target.value);
                    setAccountChoice("");
                  }}
                >
                  {reports.data.map(r => (
                    <option key={r.id} value={r.id}>
                      {r.config.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="insight-label">
                Widget type
                <select
                  value={kind}
                  onChange={e =>
                    setKind(e.target.value as DashboardWidget["kind"])
                  }
                >
                  <option value="report">Report summary</option>
                  <option value="kpi">Key metric</option>
                  <option value="trend">Trend chart</option>
                </select>
              </label>
              {kind !== "report" && (
                <>
                  <label className="insight-label">
                    Account / Page
                    <select
                      value={chosenAccount?.id || ""}
                      onChange={e => setAccountChoice(e.target.value)}
                    >
                      {accounts.map(a => (
                        <option key={a.id} value={a.id}>
                          {a.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="insight-label">
                    Metric
                    <select
                      value={chosenMetric || ""}
                      onChange={e => setMetric(e.target.value as InsightMetric)}
                    >
                      {metrics.map(m => (
                        <option key={m} value={m}>
                          {insightMetrics[m].label}
                        </option>
                      ))}
                    </select>
                  </label>
                </>
              )}
              <p className="insight-caption">
                {chosenReport && scheduleDescription(chosenReport.config)}.
                Charts require daily data for the chosen metric.
              </p>
              <Button
                onClick={add}
                disabled={!chosenReport || (kind !== "report" && !chosenMetric)}
              >
                Add to layout
              </Button>
            </>
          )}
        </DialogContent>
      </Dialog>
    </section>
  );
}
