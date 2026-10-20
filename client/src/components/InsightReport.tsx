import { VisualSelect, ChoiceField } from "@/components/choices/VisualSelect";
import { useState } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Download, Pin, FileText, AlertCircle } from "lucide-react";
import { trpc } from "@/lib/trpc";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  insightChartMetric,
  insightChartPoints,
  insightMetrics,
  insightNumber,
  independentWidgetConfig,
  recommendedWidgetLayout,
  type DashboardWidget,
  type InsightAccount,
  type InsightConfig,
  type InsightMetric,
  type InsightResult,
} from "@shared/insights";
import { toast } from "sonner";
import "@/styles/insights.css";
import { ReportComponentPicker } from "./InsightWidgetEditor";

export function InsightChart({
  account,
  metric,
}: {
  account: InsightAccount;
  metric: InsightMetric;
}) {
  const values = insightChartPoints(account, metric);
  if (!values.some(p => p.value !== null))
    return (
      <p className="insight-empty">
        Daily data is unavailable for this metric. Select another metric in
        Report setup.
      </p>
    );
  return (
    <div
      className="insight-chart"
      role="img"
      aria-label={`${insightMetrics[metric].label} over time for ${account.name}`}
    >
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart
          data={values}
          margin={{ top: 12, right: 12, bottom: 3, left: 0 }}
        >
          <CartesianGrid
            vertical={false}
            strokeDasharray="4 5"
            stroke="var(--widget-border, var(--border))"
          />
          <XAxis
            dataKey="date"
            tickFormatter={v => String(v).slice(5)}
            minTickGap={28}
            tick={{
              fontSize: 11,
              fill: "var(--widget-muted, var(--muted-foreground))",
            }}
            tickLine={false}
            axisLine={false}
          />
          <YAxis
            width={48}
            tickFormatter={v =>
              new Intl.NumberFormat("en-US", { notation: "compact" }).format(v)
            }
            tick={{
              fontSize: 11,
              fill: "var(--widget-muted, var(--muted-foreground))",
            }}
            tickLine={false}
            axisLine={false}
          />
          <Tooltip
            formatter={(v: number) => [
              insightNumber(v, metric, account.currency),
              insightMetrics[metric].label,
            ]}
            contentStyle={{
              background: "var(--widget-bg, var(--card))",
              border: "1px solid var(--widget-border, var(--border))",
              borderRadius: 12,
              color: "var(--widget-fg, var(--foreground))",
            }}
          />
          <Area
            type="linear"
            dataKey="value"
            stroke="var(--widget-accent, #8464df)"
            fill="var(--widget-accent, #8464df)"
            fillOpacity={0.13}
            strokeWidth={2.5}
            connectNulls={false}
            dot={
              values.filter(p => p.value !== null).length <= 2
                ? { r: 4 }
                : false
            }
            isAnimationActive={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
type PinChoice = {
  kind: DashboardWidget["kind"];
  connectionId: string | null;
  metric: InsightMetric;
};
export function PinInsightDialog({
  organizationId,
  reportId,
  choice,
  onClose,
}: {
  organizationId: number;
  reportId: string;
  choice: PinChoice | null;
  onClose: () => void;
}) {
  const [surface, setSurface] = useState<"main" | "measure">("measure");
  const [layoutId, setLayoutId] = useState("");
  const [components, setComponents] = useState<
    NonNullable<DashboardWidget["components"]>
  >(["summary", "metrics"]);
  const [selectedMetrics, setSelectedMetrics] = useState<
    InsightMetric[] | null
  >(null);
  const report = trpc.insights.get.useQuery(
    { organizationId, id: reportId },
    { enabled: !!choice && choice.kind === "report" }
  );
  const metrics = selectedMetrics ?? report.data?.config.metrics ?? [];
  const layouts = trpc.insights.dashboards.useQuery(
    { organizationId, surface },
    { enabled: !!choice }
  );
  const save = trpc.insights.saveDashboard.useMutation();
  const utils = trpc.useUtils();
  const pin = async () => {
    if (!choice) return;
    const current =
      layouts.data?.find(l => l.id === layoutId) ?? layouts.data?.[0];
    try {
      const widgetId = crypto.randomUUID();
      const config = report.data && independentWidgetConfig(report.data.config);
      if (config) {
        config.metrics = metrics;
        if (!metrics.includes(config.chartMetric))
          config.chartMetric = metrics[0];
      }
      await save.mutateAsync({
        organizationId,
        id: current?.id,
        revision: current?.revision,
        layout: {
          name:
            current?.name ??
            (surface === "main" ? "My main dashboard" : "My Measure dashboard"),
          surface,
          widgets: [
            ...(current?.widgets ?? []),
            {
              id: widgetId,
              reportId,
              ...choice,
              ...recommendedWidgetLayout(
                choice.kind,
                components,
                metrics.length
              ),
              components: choice.kind === "report" ? components : undefined,
            },
          ],
        },
        widgetEdits:
          choice.kind === "report" && config ? [{ widgetId, config }] : [],
      });
      await utils.insights.dashboards.invalidate();
      toast.success("Added to dashboard");
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not add the widget.");
    }
  };
  return (
    <Dialog
      open={!!choice}
      onOpenChange={open => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="insight-pin-dialog">
        <DialogHeader>
          <DialogTitle>Add to dashboard</DialogTitle>
          <DialogDescription>
            Choose what to show. Your widget gets its own settings, and you can
            edit its components from the dashboard.
          </DialogDescription>
        </DialogHeader>
        {choice?.kind === "report" && (
          <>
            <ReportComponentPicker
              components={components}
              onChange={setComponents}
            />
            {(components.includes("metrics") ||
              components.includes("trends")) && (
              <fieldset className="insight-widget-metrics">
                <legend>Metrics to include</legend>
                {report.data?.config.metrics.map(m => (
                  <label key={m}>
                    <input
                      type="checkbox"
                      checked={metrics.includes(m)}
                      onChange={e =>
                        setSelectedMetrics(
                          e.target.checked
                            ? [...metrics, m]
                            : metrics.filter(k => k !== m)
                        )
                      }
                    />
                    {insightMetrics[m].label}
                  </label>
                ))}
              </fieldset>
            )}
            {report.error && (
              <p role="alert">
                Report settings could not be loaded. Close this dialog and try
                again.
              </p>
            )}
          </>
        )}
        <ChoiceField className="insight-label">
          Dashboard
          <VisualSelect
            aria-label="Dashboard"
            value={surface}
            onChange={e => {
              setSurface(e.target.value as "main" | "measure");
              setLayoutId("");
            }}
          >
            <option value="measure">Measure dashboard</option>
            <option value="main">Main dashboard</option>
          </VisualSelect>
        </ChoiceField>
        {!!layouts.data?.length && (
          <ChoiceField className="insight-label">
            Saved layout
            <VisualSelect
              aria-label="Saved layout"
              value={layoutId || layouts.data[0].id}
              onChange={e => setLayoutId(e.target.value)}
            >
              {layouts.data.map(l => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
            </VisualSelect>
          </ChoiceField>
        )}
        {layouts.error && (
          <p role="alert">Layouts could not be loaded. Try again.</p>
        )}
        <Button
          onClick={pin}
          disabled={
            save.isPending ||
            layouts.isLoading ||
            !!layouts.error ||
            (choice?.kind === "report" &&
              (report.isLoading ||
                !!report.error ||
                !components.length ||
                !metrics.length))
          }
        >
          <Pin size={16} /> {save.isPending ? "Adding…" : "Add widget"}
        </Button>
      </DialogContent>
    </Dialog>
  );
}
export function InsightMetricCard({
  account,
  metric,
  compare,
  onPin,
}: {
  account: InsightAccount;
  metric: InsightAccount["metrics"][number];
  compare: boolean;
  onPin?: () => void;
}) {
  const def = insightMetrics[metric.key];
  const improving =
    metric.change === null || metric.change === 0 || def.direction === "neutral"
      ? null
      : def.direction === "down"
        ? metric.change < 0
        : metric.change > 0;
  return (
    <article className="insight-metric">
      <div className="insight-metric-label">
        <span>{def.label}</span>
        {onPin && (
          <button
            type="button"
            className="insight-icon"
            aria-label={`Pin ${def.label}`}
            onClick={onPin}
          >
            <Pin size={14} />
          </button>
        )}
      </div>
      <strong title={insightNumber(metric.value, metric.key, account.currency)}>
        {insightNumber(metric.value, metric.key, account.currency)}
      </strong>
      {metric.key === "followers" ? (
        <small>Current snapshot · not period growth</small>
      ) : compare ? (
        <small>
          <span
            data-improving={improving === null ? undefined : String(improving)}
          >
            {metric.change === null
              ? "Change unavailable"
              : `${metric.change > 0 ? "+" : ""}${metric.change.toFixed(1)}%`}
          </span>{" "}
          vs previous period
          <br />
          Previous:{" "}
          {insightNumber(metric.previous, metric.key, account.currency)}
        </small>
      ) : (
        <small>Selected reporting period</small>
      )}
    </article>
  );
}
export function InsightReport({
  result,
  config,
  organizationId,
  reportId,
  runId,
  status,
  revision,
  allowPin = true,
}: {
  result: InsightResult;
  config: InsightConfig;
  organizationId: number;
  reportId: string;
  runId: string;
  status: string;
  revision: number;
  allowPin?: boolean;
}) {
  const utils = trpc.useUtils();
  const [exporting, setExporting] = useState(false);
  const [pin, setPin] = useState<PinChoice | null>(null);
  const download = async () => {
    setExporting(true);
    try {
      const pdf = await utils.client.insights.pdf.query({
        organizationId,
        id: runId,
      });
      const bytes = Uint8Array.from(atob(pdf.base64), c => c.charCodeAt(0));
      const url = URL.createObjectURL(
        new Blob([bytes], { type: "application/pdf" })
      );
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = pdf.filename;
      anchor.click();
      setTimeout(() => URL.revokeObjectURL(url), 10000);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "PDF export failed.");
    } finally {
      setExporting(false);
    }
  };
  return (
    <div className="insight-report">
      <header className="insight-report-cover">
        <div>
          <span className="insight-eyebrow">EvokeLoop / Insights Studio</span>
          <h2>{result.name}</h2>
          <p>
            {result.range.since} — {result.range.until}
          </p>
          {result.description && <p>{result.description}</p>}
          <small>
            Generated {new Date(result.generatedAtMs).toLocaleString()} ·
            Revision {revision}
          </small>
        </div>
        <div className="insight-actions">
          <Button variant="outline" disabled={exporting} onClick={download}>
            <Download size={16} />
            {exporting ? "Preparing PDF…" : "Download PDF"}
          </Button>
          {allowPin && (
            <Button
              variant="outline"
              onClick={() =>
                setPin({
                  kind: "report",
                  connectionId: null,
                  metric: config.chartMetric,
                })
              }
            >
              <Pin size={16} />
              Add report to dashboard
            </Button>
          )}
        </div>
      </header>
      {status !== "completed" && (
        <p className="insight-notice">
          <AlertCircle size={17} />
          {status === "partial"
            ? "Some data is unavailable. Review source notes before sharing this report."
            : "The run could not load all selected sources. Review the details below."}
        </p>
      )}
      {config.sections.summary && (
        <section className="insight-summary">
          <span className="insight-eyebrow">The story at a glance</span>
          <h3>Executive summary</h3>
          <ul>
            {result.findings.map((f, i) => (
              <li key={i}>{f}</li>
            ))}
          </ul>
        </section>
      )}
      {result.accounts.map(a => {
        const chartMetric = insightChartMetric(config.chartMetric, a);
        return (
          <section className="insight-account" key={a.connectionId}>
            <div className="insight-section-title">
              <div>
                <span className="insight-eyebrow">
                  {a.channel === "meta_ads"
                    ? "Meta advertising"
                    : "Facebook Page"}
                </span>
                <h3>{a.name}</h3>
                <small>
                  {a.currency ? `Currency: ${a.currency} · ` : ""}Source
                  timezone: {a.timezone || "Not supplied"}
                </small>
              </div>
            </div>
            {a.error ? (
              <p className="insight-notice">{a.error}</p>
            ) : (
              <>
                <div className="insight-metric-grid">
                  {a.metrics.map(m => (
                    <InsightMetricCard
                      key={m.key}
                      account={a}
                      metric={m}
                      compare={config.compare}
                      onPin={
                        allowPin
                          ? () =>
                              setPin({
                                kind: "kpi",
                                connectionId: a.connectionId,
                                metric: m.key,
                              })
                          : undefined
                      }
                    />
                  ))}
                </div>
                {config.sections.trends && (
                  <div className="insight-chart-card">
                    <div className="insight-section-title">
                      <h4>{insightMetrics[chartMetric].label} over time</h4>
                      {allowPin && (
                        <button
                          className="insight-text-button"
                          onClick={() =>
                            setPin({
                              kind: "trend",
                              connectionId: a.connectionId,
                              metric: chartMetric,
                            })
                          }
                        >
                          <Pin size={14} />
                          Pin chart
                        </button>
                      )}
                    </div>
                    <InsightChart account={a} metric={chartMetric} />
                    <p className="insight-caption">
                      Missing values are not treated as zero. Hover or tap a
                      point for its reported value.
                    </p>
                  </div>
                )}
                {config.sections.details && !!a.details.length && (
                  <div className="insight-table-scroll">
                    <table>
                      <caption>{a.detailLabel}</caption>
                      <thead>
                        <tr>
                          <th>
                            {a.channel === "meta_ads" ? "Campaign" : "Post"}
                          </th>
                          {a.detailMetrics.map(key => (
                            <th key={key}>{insightMetrics[key].label}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {a.details.map((row, i) => (
                          <tr key={i}>
                            <td>{row.name}</td>
                            {a.detailMetrics.map(key => (
                              <td key={key}>
                                {insightNumber(
                                  row.values[key],
                                  key,
                                  a.currency
                                )}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    <p className="insight-caption">
                      Up to 30 campaigns or posts per source.
                    </p>
                  </div>
                )}
              </>
            )}
            <details className="insight-source-notes">
              <summary>Source notes & data quality</summary>
              {a.warnings.map((w, i) => (
                <p key={i}>{w}</p>
              ))}
            </details>
          </section>
        );
      })}
      <footer className="insight-method">
        <h4>
          <FileText size={16} />
          Methodology
        </h4>
        {result.previousRange && (
          <p>
            Previous period: {result.previousRange.since} —{" "}
            {result.previousRange.until}.
          </p>
        )}
        <p>Report timezone: {result.timezone}.</p>
        {result.warnings.map(w => (
          <p key={w}>{w}</p>
        ))}
        <small>Run {runId}</small>
      </footer>
      <PinInsightDialog
        organizationId={organizationId}
        reportId={reportId}
        choice={pin}
        onClose={() => setPin(null)}
      />
    </div>
  );
}
