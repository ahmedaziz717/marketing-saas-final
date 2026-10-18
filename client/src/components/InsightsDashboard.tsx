import { VisualSelect, ChoiceField } from "@/components/choices/VisualSelect";
import { useEffect, useState } from "react";
import { Link } from "wouter";
import {
  BarChart3,
  LayoutDashboard,
  Plus,
  Settings2,
  Trash2,
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
  scheduleDescription,
  independentWidgetConfig,
  type InsightConfig,
  type DashboardWidget,
  type InsightMetric,
} from "@shared/insights";
import { InsightWidget } from "./InsightWidget";
import {
  InsightWidgetEditor,
  ReportComponentPicker,
} from "./InsightWidgetEditor";
import { toast } from "sonner";
import "@/styles/insights.css";

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
  const [selectedMetrics, setSelectedMetrics] = useState<
    InsightMetric[] | null
  >(null);
  const [components, setComponents] = useState<
    NonNullable<DashboardWidget["components"]>
  >(["summary", "metrics"]);
  const [activeWidget, setActiveWidget] = useState<string | null>(null);
  const [widgetEdits, setWidgetEdits] = useState<
    Record<string, { config: InsightConfig; revision?: number }>
  >({});
  const [dragging, setDragging] = useState<string | null>(null);
  const utils = trpc.useUtils();
  const save = trpc.insights.saveDashboard.useMutation();
  const remove = trpc.insights.deleteDashboard.useMutation();
  const refresh = trpc.insights.refreshWidget.useMutation();
  const current = layouts.data?.find(l => l.id === id) ?? layouts.data?.[0];
  useEffect(() => {
    if (editing) return;
    setWidgets(current?.widgets ?? []);
    setName(
      current?.name ??
        (surface === "main" ? "My main dashboard" : "My Measure dashboard")
    );
    setRevision(current?.revision);
    setWidgetEdits({});
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
        widgetEdits: Object.entries(widgetEdits).map(([widgetId, edit]) => ({
          widgetId,
          ...edit,
        })),
      });
      setId(row.id);
      await Promise.all([
        utils.insights.dashboards.invalidate({ organizationId, surface }),
        utils.insights.dashboardData.invalidate(),
      ]);
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

  const add = () => {
    if (
      !chosenReport ||
      (kind !== "report" && (!chosenAccount || !chosenMetric))
    )
      return;
    const widgetId = crypto.randomUUID();
    if (kind === "report" && selectedMetrics) {
      const config = independentWidgetConfig(chosenReport.config);
      config.metrics = selectedMetrics;
      if (!selectedMetrics.includes(config.chartMetric))
        config.chartMetric = selectedMetrics[0];
      setWidgetEdits(previous => ({ ...previous, [widgetId]: { config } }));
    }
    setWidgets(list => [
      ...list,
      {
        id: widgetId,
        reportId: chosenReport.id,
        kind,
        connectionId: kind === "report" ? null : chosenAccount!.id,
        metric: chosenMetric ?? chosenReport.config.chartMetric,
        size: kind === "kpi" ? "small" : "medium",
        height: kind === "kpi" ? "compact" : "standard",
        components: kind === "report" ? components : undefined,
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
          <p>Your own widgets, with independent dates, content, and style.</p>
        </div>
        <div className="insight-actions">
          {!editing && !!layouts.data?.length && (
            <VisualSelect
              aria-label="Saved dashboard layout"
              value={current?.id || ""}
              onChange={e => setId(e.target.value)}
            >
              {layouts.data.map(l => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
            </VisualSelect>
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
                setWidgetEdits({});
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
            Drag widgets or use the arrows to reorder. Edit a tile to choose its
            content, dates, style, and size. Two compact tiles fit beside one
            standard; three fit beside one tall.
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
              individual KPIs, or charts here. Each widget has its own settings
              and refresh schedule.
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
            {widgets.map((w, index) => (
              <InsightWidget
                key={w.id}
                widget={w}
                entry={data.data?.find(d => d.report.id === w.reportId)}
                loading={data.isLoading}
                editing={editing}
                first={index === 0}
                last={index === widgets.length - 1}
                refreshing={refresh.isPending}
                onEdit={() => setActiveWidget(w.id)}
                onMove={direction => move(index, index + direction)}
                onRemove={() => {
                  setWidgets(list => list.filter(x => x.id !== w.id));
                  setWidgetEdits(edits => {
                    const next = { ...edits };
                    delete next[w.id];
                    return next;
                  });
                }}
                onDrag={() => setDragging(w.id)}
                onDrop={() => {
                  const from = widgets.findIndex(x => x.id === dragging);
                  if (from >= 0 && from !== index) move(from, index);
                  setDragging(null);
                }}
                onRefresh={async () => {
                  const report = data.data?.find(
                    d => d.report.id === w.reportId
                  )?.report;
                  if (!report) return;
                  try {
                    await refresh.mutateAsync({
                      organizationId,
                      id: report.id,
                      revision: report.revision,
                    });
                    await data.refetch();
                  } catch (e) {
                    toast.error(
                      e instanceof Error ? e.message : "Refresh failed."
                    );
                  }
                }}
              />
            ))}
          </div>
        </>
      )}
      <Dialog open={adding} onOpenChange={setAdding}>
        <DialogContent className="insight-pin-dialog">
          <DialogHeader>
            <DialogTitle>Add a dashboard widget</DialogTitle>
            <DialogDescription>
              Start from a saved report, then choose what to show. This widget
              will have its own editable settings.
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
              <ChoiceField className="insight-label">
                Report
                <VisualSelect
                  aria-label="Report"
                  value={chosenReport?.id || ""}
                  onChange={e => {
                    setReportChoice(e.target.value);
                    setAccountChoice("");
                    setSelectedMetrics(null);
                  }}
                >
                  {reports.data.map(r => (
                    <option key={r.id} value={r.id}>
                      {r.config.name}
                    </option>
                  ))}
                </VisualSelect>
              </ChoiceField>
              <ChoiceField className="insight-label">
                Widget type
                <VisualSelect
                  aria-label="Widget type"
                  value={kind}
                  onChange={e =>
                    setKind(e.target.value as DashboardWidget["kind"])
                  }
                >
                  <option value="report">Report components</option>
                  <option value="kpi">Key metric</option>
                  <option value="trend">Trend chart</option>
                </VisualSelect>
              </ChoiceField>
              {kind === "report" && (
                <>
                  <ReportComponentPicker
                    components={components}
                    onChange={setComponents}
                  />
                  {(components.includes("metrics") ||
                    components.includes("trends")) && (
                    <fieldset className="insight-widget-metrics">
                      <legend>Metrics to include</legend>
                      {chosenReport?.config.metrics.map(m => (
                        <label key={m}>
                          <input
                            type="checkbox"
                            checked={(
                              selectedMetrics ?? chosenReport.config.metrics
                            ).includes(m)}
                            onChange={e =>
                              setSelectedMetrics(
                                e.target.checked
                                  ? [
                                      ...(selectedMetrics ??
                                        chosenReport.config.metrics),
                                      m,
                                    ]
                                  : (
                                      selectedMetrics ??
                                      chosenReport.config.metrics
                                    ).filter(k => k !== m)
                              )
                            }
                          />
                          {insightMetrics[m].label}
                        </label>
                      ))}
                    </fieldset>
                  )}
                </>
              )}
              {kind !== "report" && (
                <>
                  <ChoiceField className="insight-label">
                    Account / Page
                    <VisualSelect
                      aria-label="Account / Page"
                      value={chosenAccount?.id || ""}
                      onChange={e => setAccountChoice(e.target.value)}
                    >
                      {accounts.map(a => (
                        <option key={a.id} value={a.id}>
                          {a.name}
                        </option>
                      ))}
                    </VisualSelect>
                  </ChoiceField>
                  <ChoiceField className="insight-label">
                    Metric
                    <VisualSelect
                      aria-label="Metric"
                      value={chosenMetric || ""}
                      onChange={e => setMetric(e.target.value as InsightMetric)}
                    >
                      {metrics.map(m => (
                        <option key={m} value={m}>
                          {insightMetrics[m].label}
                        </option>
                      ))}
                    </VisualSelect>
                  </ChoiceField>
                </>
              )}
              <p className="insight-caption">
                {chosenReport && scheduleDescription(chosenReport.config)}.
                Charts require daily data for the chosen metric.
              </p>
              <Button
                onClick={add}
                disabled={
                  !chosenReport ||
                  (kind !== "report" && !chosenMetric) ||
                  (kind === "report" &&
                    (!components.length || selectedMetrics?.length === 0))
                }
              >
                Add to layout
              </Button>
            </>
          )}
        </DialogContent>
      </Dialog>
      {(() => {
        const widget = widgets.find(w => w.id === activeWidget);
        const report =
          widget &&
          data.data?.find(d => d.report.id === widget.reportId)?.report;
        if (!widget || !report) return null;
        return (
          <InsightWidgetEditor
            key={widget.id}
            widget={widget}
            config={widgetEdits[widget.id]?.config ?? report.config}
            connections={options.data?.connections ?? []}
            saving={save.isPending}
            layoutEditing={editing}
            onClose={() => setActiveWidget(null)}
            onSave={async (updated, config) => {
              const next = widgets.map(w =>
                w.id === updated.id ? updated : w
              );
              const edits = {
                ...widgetEdits,
                [updated.id]: {
                  config: independentWidgetConfig(config),
                  revision: report.revision,
                },
              };
              if (editing) {
                setWidgets(next);
                setWidgetEdits(edits);
                setActiveWidget(null);
                return;
              }
              const row = await save.mutateAsync({
                organizationId,
                id: current?.id,
                revision: current?.revision,
                layout: { name, surface, widgets: next },
                widgetEdits: Object.entries(edits).map(([widgetId, edit]) => ({
                  widgetId,
                  ...edit,
                })),
              });
              setId(row.id);
              await Promise.all([
                utils.insights.dashboards.invalidate({
                  organizationId,
                  surface,
                }),
                utils.insights.dashboardData.invalidate(),
              ]);
              setActiveWidget(null);
              toast.success("Widget saved");
            }}
          />
        );
      })()}
    </section>
  );
}
