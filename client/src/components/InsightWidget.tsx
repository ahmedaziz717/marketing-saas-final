import type { inferRouterOutputs } from "@trpc/server";
import { useLayoutEffect, useRef, useState } from "react";
import type { AppRouter } from "../../../server/routers";
import {
  ArrowDown,
  ArrowUp,
  GripVertical,
  Pencil,
  RefreshCw,
  X,
  Copy,
} from "lucide-react";
import {
  insightChartMetric,
  insightPeriodLabel,
  insightMetrics,
  insightNumber,
  widgetTitle,
  type DashboardWidget,
} from "@shared/insights";
import { InsightChart, InsightMetricCard } from "./InsightReport";
import { widgetStyle } from "./InsightWidgetEditor";
import { InsightDateControls, type InsightDates } from "./InsightDateControls";
import { InsightVisualization } from "./InsightVisualization";

type Entry = inferRouterOutputs<AppRouter>["insights"]["dashboardData"][number];
export function InsightWidget({
  widget: w,
  entry,
  loading,
  editing,
  first,
  last,
  refreshing,
  onEdit,
  onMove,
  onRemove,
  onRefresh,
  onDrag,
  onDrop,
  onDates,
  onDateMode,
  onDuplicate,
}: {
  widget: DashboardWidget;
  entry?: Entry;
  loading: boolean;
  editing: boolean;
  first: boolean;
  last: boolean;
  refreshing: boolean;
  onEdit: () => void;
  onMove: (direction: number) => void;
  onRemove: () => void;
  onRefresh: () => void;
  onDrag: () => void;
  onDrop: () => void;
  onDates?: (patch: Partial<InsightDates>) => void;
  onDateMode?: (mode: "dashboard" | "custom") => void;
  onDuplicate?: () => void;
}) {
  const report = entry?.report,
    latest = entry?.latest,
    run = entry?.snapshot ?? latest;
  const title = widgetTitle(w, report?.config);
  const account = run?.result?.accounts.find(
    a => a.connectionId === w.connectionId
  );
  const value = account?.metrics.find(m => m.key === w.metric);
  const running = !!latest && ["queued", "running"].includes(latest.status);
  const components = w.components ?? ["summary"];
  const legacyCampaignScope =
    !!run &&
    run.config.includeInactiveCampaigns === undefined &&
    account?.channel !== "facebook";
  const stale =
    !!run &&
    !!report &&
    (run.revision !== report.revision || legacyCampaignScope);
  const frame = useRef<HTMLElement>(null);
  const body = useRef<HTMLDivElement>(null);
  const [rows, setRows] = useState(8);
  useLayoutEffect(() => {
    if (
      !w.autoSize ||
      !frame.current ||
      !body.current ||
      typeof ResizeObserver === "undefined"
    )
      return;
    const measure = () => {
      const node = frame.current!;
      const grid = node.parentElement;
      if (!grid) return;
      const css = getComputedStyle(grid);
      const unit = parseFloat(css.getPropertyValue("--widget-unit")) || 58;
      const gap = parseFloat(css.rowGap) || 16;
      const chrome = Array.from(node.children)
        .filter(el => !el.classList.contains("insight-widget-content"))
        .reduce((total, el) => total + el.getBoundingClientRect().height, 0);
      const needed = body.current!.getBoundingClientRect().height + chrome + 24;
      setRows(Math.max(1, Math.ceil((needed + gap) / (unit + gap))));
    };
    const observer = new ResizeObserver(measure);
    observer.observe(body.current);
    for (const child of Array.from(frame.current.children))
      if (!child.classList.contains("insight-widget-content"))
        observer.observe(child);
    measure();
    return () => observer.disconnect();
  }, [w.autoSize, w.size, editing, run, report]);
  return (
    <article
      ref={frame}
      className="insight-widget"
      data-size={w.size}
      data-height={w.height}
      data-kind={w.kind}
      data-auto-size={w.autoSize || undefined}
      data-widget-id={w.id}
      style={{
        ...widgetStyle(w),
        ...(w.autoSize ? { gridRow: `span ${rows}` } : {}),
      }}
      draggable={editing}
      onDragStart={e => {
        if ((e.target as HTMLElement).closest("button, a")) {
          e.preventDefault();
          return;
        }
        onDrag();
        e.dataTransfer.effectAllowed = "move";
      }}
      onDragOver={e => {
        if (editing) e.preventDefault();
      }}
      onDrop={e => {
        e.preventDefault();
        if (editing) onDrop();
      }}
    >
      <header>
        <div className="insight-widget-heading">
          <span>
            {w.kind === "report"
              ? "Report"
              : w.kind === "trend"
                ? "Trend"
                : "Key metric"}
          </span>
          <h3 title={title}>{title}</h3>
          <p>
            {w.kind !== "report" && account?.name ? `${account.name} · ` : ""}
            {report ? insightPeriodLabel(run?.config ?? report.config) : ""}
            {stale ? " · Previous result" : ""}
          </p>
        </div>
        <div className="insight-widget-actions">
          {editing && onDuplicate && (
            <button
              aria-label={`Duplicate ${title}`}
              title="Duplicate widget"
              onClick={onDuplicate}
            >
              <Copy size={15} />
            </button>
          )}
          <button
            aria-label={`Edit ${title}`}
            title="Edit widget"
            disabled={!report}
            onClick={onEdit}
          >
            <Pencil size={15} />
          </button>
          {editing ? (
            <GripVertical size={16} aria-label="Drag to reorder" />
          ) : (
            <button
              aria-label={`Refresh ${title}`}
              title="Refresh widget"
              disabled={!report || refreshing || running}
              onClick={onRefresh}
            >
              <RefreshCw size={15} className={running ? "animate-spin" : ""} />
            </button>
          )}
        </div>
      </header>
      {report && onDates && (
        <div className="px-3 py-2">
          <label className="text-xs">
            Date source{" "}
            <select
              aria-label={`Date source for ${title}`}
              value={w.dateMode ?? "custom"}
              disabled={refreshing || editing}
              onChange={e =>
                onDateMode?.(e.target.value as "dashboard" | "custom")
              }
            >
              <option value="dashboard">Follow dashboard</option>
              <option value="custom">Custom range</option>
            </select>
          </label>
          <InsightDateControls
            key={report.revision}
            label="Chart timeframe"
            config={report.config}
            disabled={refreshing || editing}
            onChange={onDates}
          />
        </div>
      )}
      <div
        className="insight-widget-content"
        tabIndex={0}
        aria-label={`${title} content`}
      >
        <div ref={body} className="insight-widget-body">
          {loading ? (
            <p role="status">Loading widget…</p>
          ) : !report ? (
            <p>This widget is no longer available. Remove it in Customize.</p>
          ) : !run ? (
            <p>Refresh this widget to load its first result.</p>
          ) : !run.result ? (
            <p role="status">
              {running
                ? "Loading this widget’s data…"
                : run.error || "No result is available."}
            </p>
          ) : w.kind === "report" ? (
            <div className="insight-widget-report">
              {components.includes("summary") && (
                <section aria-label="Executive summary">
                  <h4>Executive summary</h4>
                  <ul>
                    {run.result.findings.map((f, i) => (
                      <li key={i}>{f}</li>
                    ))}
                  </ul>
                </section>
              )}
              {components.includes("metrics") && (
                <section aria-label="Key metrics">
                  <h4>Key metrics</h4>
                  {run.result.accounts
                    .filter(a => a.metrics.length)
                    .map(a => (
                      <div key={a.connectionId}>
                        <p className="insight-widget-account">{a.name}</p>
                        <div className="insight-widget-metric-grid">
                          {a.metrics
                            .filter(m => report.config.metrics.includes(m.key))
                            .map(m => (
                              <InsightMetricCard
                                key={m.key}
                                account={a}
                                metric={m}
                                compare={run.config.compare}
                              />
                            ))}
                        </div>
                      </div>
                    ))}
                </section>
              )}
              {components.includes("trends") && (
                <section aria-label="Trend charts">
                  <h4>Trend charts</h4>
                  {run.result.accounts
                    .filter(a => a.metrics.length)
                    .map(a => (
                      <div key={a.connectionId}>
                        <p className="insight-widget-account">{a.name}</p>
                        <InsightChart
                          account={a}
                          metric={insightChartMetric(
                            report.config.chartMetric,
                            a
                          )}
                        />
                      </div>
                    ))}
                </section>
              )}
              {components.includes("details") && (
                <section aria-label="Detail tables">
                  <h4>Detail tables</h4>
                  {run.result.accounts.map(a => (
                    <div key={a.connectionId} className="insight-widget-table">
                      <table>
                        <caption>
                          {a.name} · {a.detailLabel}
                        </caption>
                        <thead>
                          <tr>
                            <th>Name</th>
                            {a.detailMetrics.map(m => (
                              <th key={m}>{insightMetrics[m].label}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {a.details.map((d, i) => (
                            <tr key={i}>
                              <td>{d.name}</td>
                              {a.detailMetrics.map(m => (
                                <td key={m}>
                                  {insightNumber(
                                    d.values[m] ?? null,
                                    m,
                                    a.currency
                                  )}
                                </td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      {!a.details.length && (
                        <p>No detail rows are available for this period.</p>
                      )}
                    </div>
                  ))}
                </section>
              )}
            </div>
          ) : !account || !value ? (
            <p>
              This metric is unavailable in the current result. Refresh the
              widget or edit its content.
            </p>
          ) : w.kind === "kpi" ? (
            <InsightMetricCard
              account={account}
              metric={value}
              compare={run.config.compare}
            />
          ) : (
            <InsightVisualization
              account={account}
              accounts={run.result!.accounts}
              widget={w}
              range={run.result!.range}
              previousRange={run.result!.previousRange}
            />
          )}
        </div>
      </div>
      <footer>
        <details>
          <summary>
            <span className="insight-widget-dot" data-status={latest?.status} />
            {running
              ? "Refreshing…"
              : latest?.status === "failed"
                ? "Refresh failed"
                : stale
                  ? "Settings changed"
                  : latest?.status === "partial"
                    ? "Partial data"
                    : run?.finishedAtMs
                      ? "Updated " +
                        new Date(run.finishedAtMs).toLocaleDateString()
                      : "Not refreshed"}
            <span>Details</span>
          </summary>
          <div>
            {run?.result && (
              <p>
                Data period: {run.result.range.since} – {run.result.range.until}
              </p>
            )}
            <p>
              Updated:{" "}
              {run?.finishedAtMs
                ? new Date(run.finishedAtMs).toLocaleString()
                : "Not yet"}
            </p>
            {report && (
              <p>
                {report.nextRunAtMs
                  ? `Next: ${new Date(report.nextRunAtMs).toLocaleString(undefined, { timeZone: report.config.timezone })} · ${report.config.timezone}`
                  : report.scheduleError || "Manual refresh"}
              </p>
            )}
            {stale && (
              <p>
                {running
                  ? "Showing the previous result while your updated settings refresh."
                  : "Showing the previous result. Refresh to apply your updated settings."}
              </p>
            )}
            {legacyCampaignScope && (
              <p>
                This saved result includes inactive campaigns. Refresh to apply
                the active-campaign default.
              </p>
            )}
            {latest?.error && <p role="alert">{latest.error}</p>}
          </div>
        </details>
        {editing && (
          <div className="insight-widget-order">
            <button
              aria-label={`Move ${title} earlier`}
              disabled={first}
              onClick={() => onMove(-1)}
            >
              <ArrowUp size={14} />
            </button>
            <button
              aria-label={`Move ${title} later`}
              disabled={last}
              onClick={() => onMove(1)}
            >
              <ArrowDown size={14} />
            </button>
            <button aria-label={`Remove ${title}`} onClick={onRemove}>
              <X size={14} />
            </button>
          </div>
        )}
      </footer>
    </article>
  );
}
