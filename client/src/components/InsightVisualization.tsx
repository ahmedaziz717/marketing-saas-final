import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  ComposedChart,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  Legend,
  Pie,
  PieChart,
  Cell,
} from "recharts";
import {
  aggregateInsightSeries,
  alignedPreviousSeries,
  campaignChartRows,
} from "@shared/insightCharts";
import {
  insightMetrics,
  insightNumber,
  type DashboardWidget,
  type InsightAccount,
} from "@shared/insights";

export function InsightVisualization({
  account,
  accounts,
  widget,
  range,
  previousRange,
}: {
  account: InsightAccount;
  accounts: InsightAccount[];
  widget: DashboardWidget;
  range?: { since: string; until: string };
  previousRange?: { since: string; until: string } | null;
}) {
  const kind = widget.visualization ?? "area",
    metric = widget.metric;
  const previous = aggregateInsightSeries(
    {
      ...account,
      series: alignedPreviousSeries(account, range, previousRange),
    },
    widget.aggregation
  );
  const trend = aggregateInsightSeries(account, widget.aggregation).map(p => ({
    date: p.date,
    value: p.values[metric],
    spend: p.values.spend,
    valueTotal: p.values.purchaseValue,
    previous: previous.find(old => old.date === p.date)?.values[metric] ?? null,
  }));
  const rank = campaignChartRows(account, metric).filter(r => r.value !== null);
  const format = (value: number) =>
    insightNumber(value, kind === "combo" ? "spend" : metric, account.currency);
  const colors = [
    "#8464df",
    "#09a5a0",
    "#ee9e38",
    "#dc6799",
    "#6588e8",
    "#7cad4c",
  ];
  if (kind === "table")
    return (
      <div className="insight-table-scroll">
        <table>
          <thead>
            <tr>
              <th>{account.detailLabel}</th>
              {account.detailMetrics.map(m => (
                <th key={m}>{insightMetrics[m].label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {account.details.map((r, i) => (
              <tr key={i}>
                <td>{r.name}</td>
                {account.detailMetrics.map(m => (
                  <td key={m}>
                    {insightNumber(r.values[m] ?? null, m, account.currency)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        {!account.details.length && <p>No rows for this period.</p>}
      </div>
    );
  if (
    kind === "platform" &&
    insightMetrics[metric].unit === "currency" &&
    (accounts.some(a => !a.currency) ||
      new Set(accounts.map(a => a.currency)).size > 1)
  )
    return (
      <p>Choose accounts with the same currency to compare monetary amounts.</p>
    );
  if (
    kind === "distribution" &&
    (["percent", "ratio"].includes(insightMetrics[metric].unit) ||
      ["cpc", "cpa", "costPerConversion"].includes(metric))
  )
    return (
      <p>
        Choose an additive metric, such as spend or purchases, to show a
        distribution.
      </p>
    );
  if (["area", "line", "bar", "combo"].includes(kind) && !trend.length)
    return <p>No daily data for this period.</p>;
  const rows =
    kind === "platform"
      ? accounts
          .filter(a => a.status === "ready")
          .map(a => ({
            name: `${a.name} · ${a.currency ?? "currency unavailable"}`,
            value: a.metrics.find(m => m.key === metric)?.value ?? null,
          }))
      : rank.slice(0, 10);
  const axes = (
    <>
      <CartesianGrid vertical={false} strokeDasharray="4 5" />
      <XAxis
        dataKey="date"
        tickFormatter={v => String(v).slice(5)}
        minTickGap={30}
      />
      <YAxis
        width={55}
        tickFormatter={v =>
          new Intl.NumberFormat("en-US", { notation: "compact" }).format(v)
        }
      />
      <Tooltip formatter={(v: number) => format(v)} />
    </>
  );
  let chart;
  const comparison = previous.length ? (
    <Line
      name="Previous period (aligned)"
      dataKey="previous"
      stroke="#ee9e38"
      strokeDasharray="5 4"
      dot={false}
      connectNulls={false}
      isAnimationActive={false}
    />
  ) : null;
  if (kind === "ranking" || kind === "platform")
    chart = (
      <BarChart data={rows} layout="vertical" margin={{ left: 15, right: 25 }}>
        <XAxis type="number" />
        <YAxis
          dataKey="name"
          type="category"
          width={135}
          tick={{ fontSize: 10 }}
        />
        <Tooltip formatter={(v: number) => format(v)} />
        <Bar
          dataKey="value"
          fill="var(--widget-accent, #8464df)"
          isAnimationActive={false}
        />
      </BarChart>
    );
  else if (kind === "distribution")
    chart = (
      <PieChart>
        <Pie
          data={rank.filter(r => r.value! > 0)}
          dataKey="value"
          nameKey="name"
          innerRadius="45%"
          outerRadius="75%"
          isAnimationActive={false}
        >
          {rank.map((_, i) => (
            <Cell key={i} fill={colors[i % colors.length]} />
          ))}
        </Pie>
        <Tooltip formatter={(v: number) => format(v)} />
      </PieChart>
    );
  else if (kind === "combo")
    chart = (
      <ComposedChart data={trend}>
        {axes}
        <Legend />
        <Bar
          name="Spend"
          dataKey="spend"
          fill="#8464df"
          isAnimationActive={false}
        />
        <Line
          name="Purchase value"
          dataKey="valueTotal"
          stroke="#09a5a0"
          dot={false}
          connectNulls={false}
          isAnimationActive={false}
        />
      </ComposedChart>
    );
  else if (kind === "bar")
    chart = (
      <ComposedChart data={trend}>
        {axes}
        <Legend />
        <Bar
          name="Current period"
          dataKey="value"
          fill="var(--widget-accent, #8464df)"
          isAnimationActive={false}
        />
        {comparison}
      </ComposedChart>
    );
  else if (kind === "line")
    chart = (
      <ComposedChart data={trend}>
        {axes}
        <Legend />
        <Line
          name="Current period"
          dataKey="value"
          stroke="var(--widget-accent, #8464df)"
          dot={false}
          connectNulls={false}
          isAnimationActive={false}
        />
        {comparison}
      </ComposedChart>
    );
  else
    chart = (
      <ComposedChart data={trend}>
        {axes}
        <Legend />
        <Area
          name="Current period"
          dataKey="value"
          stroke="var(--widget-accent, #8464df)"
          fill="var(--widget-accent, #8464df)"
          fillOpacity={0.15}
          connectNulls={false}
          isAnimationActive={false}
        />
        {comparison}
      </ComposedChart>
    );
  return (
    <>
      <div
        className="insight-chart"
        role="img"
        aria-label={`${insightMetrics[metric].label}: ${kind}`}
      >
        <ResponsiveContainer width="100%" height="100%">
          {chart}
        </ResponsiveContainer>
      </div>
      {["ranking", "distribution"].includes(kind) && (
        <p className="insight-caption">
          {account.detailLabel}. Share is relative to the displayed rows.
        </p>
      )}
      {kind === "platform" && (
        <p className="insight-caption">
          Provider-reported values; attribution differs and conversions can
          overlap.
        </p>
      )}
    </>
  );
}
