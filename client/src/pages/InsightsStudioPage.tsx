import { VisualSelect, ChoiceField } from "@/components/choices/VisualSelect";
import { useEffect, useState } from "react";
import { Link, useLocation, useSearch } from "wouter";
import {
  ArrowLeft,
  ArrowRight,
  BarChart3,
  CalendarClock,
  Check,
  ClipboardCheck,
  FileText,
  Layers,
  Mail,
  Play,
  Save,
  Target,
} from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { useWorkspace } from "@/hooks/useWorkspace";
import { WorkspaceGate } from "@/components/WorkspaceGate";
import { Button } from "@/components/ui/button";
import {
  StudioJourney,
  StudioSetupSummary,
  useStudioJourney,
} from "@/components/configurator/StudioJourney";
import { StudioCategories } from "@/components/configurator/StudioCategories";
import {
  useStudioNavigation,
  scrollStudioChoices,
} from "@/components/configurator/studioNavigation";
import { InsightReport } from "@/components/InsightReport";
import {
  defaultInsightConfig,
  insightConfigSchema,
  insightMetrics,
  insightRange,
  nextInsightRun,
  reportPeriods,
  reportPreviousRange,
  scheduleDescription,
  selectableMetrics,
  type InsightConfig,
  type InsightMetric,
} from "@shared/insights";
import "@/styles/configurator.css";
import "@/styles/insights.css";

const sections = [
  {
    id: "scope",
    title: "Scope",
    subtitle: "Purpose & sources",
    icon: Target,
    categories: [
      { id: "purpose", title: "Report purpose" },
      { id: "sources", title: "Accounts & dates" },
    ],
  },
  {
    id: "setup",
    title: "Report setup",
    subtitle: "Metrics & presentation",
    icon: BarChart3,
    categories: [
      { id: "metrics", title: "Key metrics" },
      { id: "layout", title: "Report layout" },
    ],
  },
  {
    id: "schedule",
    title: "Schedule & delivery",
    subtitle: "When & who",
    icon: CalendarClock,
    categories: [
      { id: "schedule", title: "Run schedule" },
      { id: "delivery", title: "Notifications & PDF" },
    ],
  },
  {
    id: "review",
    title: "Review & run",
    subtitle: "Confirm your report",
    icon: ClipboardCheck,
    categories: [{ id: "review", title: "Summary & run" }],
  },
  {
    id: "results",
    title: "Results",
    subtitle: "Reports & run history",
    icon: FileText,
    categories: [
      { id: "results", title: "Report output" },
      { id: "history", title: "Run history" },
    ],
  },
] as const;
const pages = sections.flatMap(s => [...s.categories]);
const timezones = [
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "Europe/London",
  "Europe/Paris",
  "Africa/Cairo",
  "Asia/Dubai",
  "Asia/Kolkata",
  "Asia/Singapore",
  "Australia/Sydney",
  "UTC",
];
function Studio({
  organizationId,
  reportId,
  initialRun,
}: {
  organizationId: number;
  reportId?: string;
  initialRun?: string;
}) {
  const [, navigate] = useLocation();
  const workspace = useWorkspace();
  const root = useStudioNavigation();
  const options = trpc.insights.options.useQuery({ organizationId });
  const report = trpc.insights.get.useQuery(
    { organizationId, id: reportId! },
    { enabled: !!reportId, refetchOnWindowFocus: false }
  );
  const [config, setConfig] = useState<InsightConfig>(() =>
    defaultInsightConfig(
      Intl.DateTimeFormat().resolvedOptions().timeZone || "America/New_York"
    )
  );
  const [revision, setRevision] = useState<number>();
  const [loaded, setLoaded] = useState(!reportId);
  const [dirty, setDirty] = useState(false);
  const [page, setPage] = useState(initialRun ? "results" : "purpose");
  const [selectedRun, setSelectedRun] = useState(initialRun || "");
  const [notifyNow, setNotifyNow] = useState(false);
  const [error, setError] = useState("");
  const [metricFilter, setMetricFilter] = useState("all");
  const utils = trpc.useUtils();
  const save = trpc.insights.save.useMutation();
  const run = trpc.insights.run.useMutation();
  const runs = trpc.insights.runs.useQuery(
    { organizationId, id: reportId! },
    {
      enabled: !!reportId,
      refetchInterval: query =>
        query.state.data?.some(r => ["queued", "running"].includes(r.status))
          ? 3000
          : 15000,
    }
  );
  const runId = selectedRun || runs.data?.[0]?.id;
  const output = trpc.insights.runDetail.useQuery(
    { organizationId, id: runId! },
    {
      enabled: !!runId,
      refetchInterval: query =>
        query.state.data &&
        (["queued", "running"].includes(query.state.data.status) ||
          ["waiting", "pending", "sending"].includes(
            query.state.data.deliveryState
          ))
          ? 3000
          : false,
    }
  );
  useEffect(() => {
    if (report.data && !loaded) {
      setConfig(report.data.config);
      setRevision(report.data.revision);
      setLoaded(true);
    }
  }, [report.data, loaded]);
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);
  const update = (patch: Partial<InsightConfig>) => {
    setConfig(c => ({ ...c, ...patch }));
    setDirty(true);
    setError("");
  };
  const select = (id: string) => {
    const target = sections.find(s => s.categories.some(c => c.id === id));
    if (target) journey.navigate(target.id, id);
  };
  const currentSection =
    sections.find(s => s.categories.some(c => c.id === page)) ?? sections[0];
  const pageIndex = pages.findIndex(p => p.id === page);
  const busy = save.isPending || run.isPending;
  const canEdit = !!options.data?.canEdit;
  const validation = insightConfigSchema.safeParse(config);
  let range: ReturnType<typeof insightRange> | undefined,
    rangeError = "",
    next: number | null = null;
  try {
    range = insightRange(config);
    next = nextInsightRun(config);
  } catch (e) {
    rangeError = e instanceof Error ? e.message : "Check your reporting dates.";
  }
  const accounts =
    options.data?.connections.filter(c =>
      config.connectionIds.includes(c.id)
    ) ?? [];
  const categoryValues: Record<string, string> = {
    purpose: config.name || "Name your report",
    sources: `${config.connectionIds.length} accounts · ${reportPeriods.find(p => p[0] === config.period)?.[1] || config.period}`,
    metrics: `${config.metrics.length} metrics selected`,
    layout:
      Object.entries(config.sections)
        .filter(([, enabled]) => enabled)
        .map(([name]) => name)
        .join(", ") || "No sections selected",
    schedule: scheduleDescription(config),
    delivery: config.delivery.email
      ? `${config.delivery.recipientUserIds.length} recipients${config.delivery.attachPdf ? " · PDF" : ""}`
      : "Email off",
    review:
      validation.success && !rangeError
        ? "Ready to review"
        : "Inputs to complete",
    results: output.data ? "Report available" : "No report selected",
    history: `${runs.data?.length ?? 0} runs`,
  };
  const journey = useStudioJourney({
    storageKey: `insights:${organizationId}:${reportId || "new"}`,
    sections: sections.map(s => ({
      ...s,
      categories: s.categories.map(c => ({
        ...c,
        value: categoryValues[c.id],
        needsInput:
          (c.id === "sources" && !config.connectionIds.length) ||
          (c.id === "review" && !validation.success),
      })),
    })),
    section: currentSection.id,
    category: page,
    initialFocus: !!initialRun,
    onNavigate: (_, id) => {
      setPage(id);
      scrollStudioChoices(root.current);
    },
  });
  const saveReport = async (execute = false) => {
    setError("");
    if (!validation.success) {
      setError(validation.error.issues.map(i => i.message).join(" "));
      return;
    }
    if (rangeError) {
      setError(rangeError);
      return;
    }
    try {
      const saved = await save.mutateAsync({
        organizationId,
        id: reportId,
        revision,
        config: validation.data,
      });
      setRevision(saved.revision);
      setConfig(saved.config);
      setDirty(false);
      let resultId = "";
      if (execute) {
        const queued = await run.mutateAsync({
          organizationId,
          id: saved.id,
          revision: saved.revision,
          notify: notifyNow,
        });
        resultId = queued.id;
        setSelectedRun(resultId);
        setPage("results");
      }
      await Promise.all([
        utils.insights.list.invalidate(),
        utils.insights.runs.invalidate(),
        utils.insights.dashboardData.invalidate(),
      ]);
      toast.success(
        execute ? "Report queued. Results will appear here." : "Report saved"
      );
      if (!reportId)
        navigate(
          `/app/analytics/studio?id=${saved.id}${resultId ? `&run=${resultId}` : ""}`
        );
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "The report could not be saved."
      );
    }
  };
  const metricToggle = (key: InsightMetric) => {
    const metrics = config.metrics.includes(key)
      ? config.metrics.filter(m => m !== key)
      : [...config.metrics, key];
    update({
      metrics,
      chartMetric: metrics.includes(config.chartMetric)
        ? config.chartMetric
        : (metrics[0] ?? "spend"),
    });
  };
  const goBack = () => {
    if (
      !dirty ||
      window.confirm("Leave this report without saving your changes?")
    )
      navigate("/app/analytics/reports");
  };
  if (!loaded && report.isLoading) return <p role="status">Loading report…</p>;
  if (reportId && report.error)
    return (
      <p role="alert">
        {report.error.message}{" "}
        <Link href="/app/analytics/reports">Back to reports</Link>
      </p>
    );
  return (
    <div ref={root} className="cfg-root insight-studio">
      <header className="cfg-heading">
        <div>
          <button className="cfg-back" onClick={goBack}>
            <ArrowLeft size={15} />
            Measure / Saved reports
          </button>
          <div className="cfg-title">
            <h1>Insights Studio</h1>
            <span className="insight-badge">
              {dirty
                ? "Unsaved changes"
                : reportId
                  ? "Saved report"
                  : "New report"}
            </span>
          </div>
          <p className="insight-subtitle">
            Define the question. Choose the numbers. Keep everyone informed.
          </p>
        </div>
        <Button
          variant="outline"
          disabled={busy || !canEdit}
          onClick={() => saveReport()}
        >
          <Save size={16} />
          Save report
        </Button>
      </header>
      <StudioSetupSummary
        title="Report preview & summary"
        name={config.name || "Your report"}
        icon={BarChart3}
        items={[
          {
            title: "Sources",
            value: categoryValues.sources,
            category: "sources",
          },
          {
            title: "Metrics",
            value: categoryValues.metrics,
            category: "metrics",
          },
          {
            title: "Schedule",
            value: categoryValues.schedule,
            category: "schedule",
          },
        ]}
        onNavigate={id => {
          const target = sections.find(s =>
            s.categories.some(c => c.id === id)
          );
          if (target) journey.navigate(target.id, id);
        }}
      />
      <StudioJourney journey={journey} label="Insights Studio sections">
        <div className="cfg-body">
          {error && (
            <p role="alert" className="insight-notice">
              {error}
            </p>
          )}
          {options.error && (
            <p role="alert" className="insight-notice">
              Accounts and recipients could not be loaded.{" "}
              <button onClick={() => options.refetch()}>Try again</button>
            </p>
          )}
          {options.data && !canEdit && (
            <p className="insight-notice">
              You can view reports and customize your dashboards. A workspace
              editor can change report settings and run reports.
            </p>
          )}
          <fieldset disabled={busy || !canEdit} className="insight-form">
            {page === "purpose" && (
              <>
                <div className="cfg-content-title">
                  <div>
                    <h2>What should this report help you understand?</h2>
                    <p>
                      Start with a report purpose, then tailor every detail.
                    </p>
                  </div>
                </div>
                <div className="insight-choice-grid">
                  {[
                    {
                      title: "Executive overview",
                      text: "Advertising results and social engagement in one report.",
                      metrics: [
                        "spend",
                        "purchaseValue",
                        "purchases",
                        "roas",
                        "views",
                        "engagements",
                      ] as InsightMetric[],
                      icon: Layers,
                    },
                    {
                      title: "Advertising performance",
                      text: "Spend, attributed purchases, efficiency, and campaign detail.",
                      metrics: [
                        "spend",
                        "purchaseValue",
                        "purchases",
                        "roas",
                        "impressions",
                        "linkClicks",
                        "ctr",
                        "cpa",
                      ] as InsightMetric[],
                      icon: BarChart3,
                    },
                    {
                      title: "Social performance",
                      text: "Publishing, page views, engagement, and post results.",
                      metrics: [
                        "posts",
                        "followers",
                        "views",
                        "engagements",
                      ] as InsightMetric[],
                      icon: Target,
                    },
                  ].map(p => (
                    <button
                      type="button"
                      key={p.title}
                      className="insight-choice"
                      aria-pressed={
                        JSON.stringify(config.metrics) ===
                        JSON.stringify(p.metrics)
                      }
                      onClick={() =>
                        update({
                          name: p.title,
                          metrics: p.metrics,
                          chartMetric:
                            p.metrics[0] === "posts" ? "views" : p.metrics[0],
                        })
                      }
                    >
                      <p.icon size={24} />
                      <strong>{p.title}</strong>
                      <span>{p.text}</span>
                    </button>
                  ))}
                </div>
                <div className="insight-form-grid">
                  <label className="insight-label">
                    Report name
                    <input
                      value={config.name}
                      maxLength={120}
                      onChange={e => update({ name: e.target.value })}
                      placeholder="Weekly performance report"
                    />
                  </label>
                  <label className="insight-label insight-full">
                    Purpose / context
                    <textarea
                      value={config.description}
                      maxLength={1000}
                      rows={3}
                      onChange={e => update({ description: e.target.value })}
                      placeholder="What should your team learn from this report?"
                    />
                    <small>Included on the report cover.</small>
                  </label>
                </div>
              </>
            )}
            {page === "sources" && (
              <>
                <div className="cfg-content-title">
                  <div>
                    <h2>Choose your sources and reporting window</h2>
                    <p>
                      Each account keeps its own currency, attribution, and
                      source notes.
                    </p>
                  </div>
                  <span>{config.connectionIds.length} / 8 selected</span>
                </div>
                <div className="insight-choice-grid">
                  {options.data?.connections.map(a => (
                    <button
                      type="button"
                      key={a.id}
                      className="insight-choice"
                      disabled={
                        a.status !== "connected" ||
                        (config.connectionIds.length >= 8 &&
                          !config.connectionIds.includes(a.id))
                      }
                      aria-pressed={config.connectionIds.includes(a.id)}
                      onClick={() =>
                        update({
                          connectionIds: config.connectionIds.includes(a.id)
                            ? config.connectionIds.filter(x => x !== a.id)
                            : [...config.connectionIds, a.id],
                        })
                      }
                    >
                      <span className="insight-eyebrow">
                        {a.channel === "meta_ads"
                          ? "Meta advertising"
                          : "Facebook Page"}
                      </span>
                      <strong>{a.name}</strong>
                      <span>
                        {a.status !== "connected"
                          ? "Reconnect in Integrations"
                          : [a.currency, a.timezone]
                              .filter(Boolean)
                              .join(" · ") || "Connected"}
                      </span>
                      {config.connectionIds.includes(a.id) && (
                        <Check size={18} />
                      )}
                    </button>
                  ))}
                </div>
                {!options.isLoading && !options.data?.connections.length && (
                  <p className="insight-empty">
                    Connect an account in{" "}
                    <Link href="/app/settings/integrations">Integrations</Link>{" "}
                    to create a report. Meta ads and Facebook Page reporting are
                    available.
                  </p>
                )}
                <div className="insight-form-grid">
                  <ChoiceField className="insight-label">
                    Reporting period
                    <VisualSelect
                      value={config.period}
                      onChange={e =>
                        update({
                          period: e.target.value as InsightConfig["period"],
                        })
                      }
                    >
                      {reportPeriods.map(([v, label]) => (
                        <option key={v} value={v}>
                          {label}
                        </option>
                      ))}
                    </VisualSelect>
                  </ChoiceField>
                  <label className="insight-label">
                    Report timezone
                    <input
                      list="insight-timezones"
                      value={config.timezone}
                      onChange={e => update({ timezone: e.target.value })}
                    />
                    <datalist id="insight-timezones">
                      {timezones.map(t => (
                        <option key={t} value={t} />
                      ))}
                    </datalist>
                    <small>Used for reporting dates and scheduled runs.</small>
                  </label>
                  {config.period === "days" && (
                    <label className="insight-label">
                      Number of days
                      <input
                        type="number"
                        min={1}
                        max={366}
                        value={config.rollingDays ?? 30}
                        onChange={e =>
                          update({ rollingDays: Number(e.target.value) })
                        }
                      />
                    </label>
                  )}
                  {config.period === "custom" && (
                    <>
                      <label className="insight-label">
                        Start date
                        <input
                          type="date"
                          value={config.customRange.since}
                          onChange={e =>
                            update({
                              customRange: {
                                ...config.customRange,
                                since: e.target.value,
                              },
                            })
                          }
                        />
                      </label>
                      <label className="insight-label">
                        End date
                        <input
                          type="date"
                          value={config.customRange.until}
                          onChange={e =>
                            update({
                              customRange: {
                                ...config.customRange,
                                until: e.target.value,
                              },
                            })
                          }
                        />
                      </label>
                    </>
                  )}
                </div>
                <label className="insight-check">
                  <input
                    type="checkbox"
                    checked={config.compare}
                    onChange={e => update({ compare: e.target.checked })}
                  />
                  <span>
                    <strong>Compare with previous period</strong>
                    <small>
                      Same number of days immediately before this period.
                    </small>
                  </span>
                </label>
                {!["custom", "yesterday", "last_month"].includes(
                  config.period
                ) && (
                  <label className="insight-check">
                    <input
                      type="checkbox"
                      checked={config.includeToday}
                      onChange={e => update({ includeToday: e.target.checked })}
                    />
                    <span>
                      <strong>Include today’s incomplete data</strong>
                      <small>
                        Off by default, so rolling reports use completed days.
                      </small>
                    </span>
                  </label>
                )}
                <p className="insight-notice">
                  {rangeError ||
                    (range &&
                      `If run now: ${range.since} through ${range.until}.`)}
                </p>
              </>
            )}
            {page === "metrics" && (
              <>
                <div className="cfg-content-title">
                  <div>
                    <h2>Focus on the numbers that matter</h2>
                    <p>
                      Choose metrics for each selected channel. They become
                      reusable dashboard KPIs.
                    </p>
                  </div>
                </div>
                <StudioCategories
                  compact
                  label="Filter metrics"
                  current={metricFilter}
                  items={[
                    { id: "all", title: "All metrics" },
                    { id: "meta_ads", title: "Advertising" },
                    { id: "facebook", title: "Social" },
                  ]}
                  onSelect={setMetricFilter}
                />
                <div className="insight-metric-choices">
                  {selectableMetrics
                    .filter(
                      key =>
                        metricFilter === "all" ||
                        insightMetrics[key].channel === metricFilter
                    )
                    .map(key => (
                      <button
                        type="button"
                        className="insight-metric-choice"
                        key={key}
                        aria-pressed={config.metrics.includes(key)}
                        onClick={() => metricToggle(key)}
                      >
                        <span>
                          {config.metrics.includes(key) ? (
                            <Check size={16} />
                          ) : (
                            <PlusMark />
                          )}
                        </span>
                        <strong>{insightMetrics[key].label}</strong>
                        <small>
                          {insightMetrics[key].channel === "meta_ads"
                            ? "Advertising"
                            : "Social"}
                        </small>
                      </button>
                    ))}
                </div>
                <p className="insight-caption">
                  Purchases are platform attributed. Followers are a current
                  snapshot. No conversion rate is inferred from ad clicks.
                </p>
              </>
            )}
            {page === "layout" && (
              <>
                <div className="cfg-content-title">
                  <div>
                    <h2>Shape the final report</h2>
                    <p>
                      Your on-screen report and PDF use this same structure.
                    </p>
                  </div>
                </div>
                <div className="insight-layout-preview">
                  <div>
                    <span className="insight-eyebrow">Report sections</span>
                    {(
                      [
                        [
                          "summary",
                          "Executive summary",
                          "Observed changes, with account-level evidence.",
                        ],
                        [
                          "trends",
                          "Trend charts",
                          "Daily movement for your selected metrics.",
                        ],
                        [
                          "details",
                          "Detailed tables",
                          "Campaign or post performance, up to 30 rows per source.",
                        ],
                      ] as const
                    ).map(([key, title, help]) => (
                      <label className="insight-check" key={key}>
                        <input
                          type="checkbox"
                          checked={config.sections[key]}
                          onChange={e =>
                            update({
                              sections: {
                                ...config.sections,
                                [key]: e.target.checked,
                              },
                            })
                          }
                        />
                        <span>
                          <strong>{title}</strong>
                          <small>{help}</small>
                        </span>
                      </label>
                    ))}
                    <ChoiceField className="insight-label">
                      Preferred trend metric
                      <VisualSelect
                        value={config.chartMetric}
                        onChange={e =>
                          update({
                            chartMetric: e.target.value as InsightMetric,
                          })
                        }
                      >
                        {config.metrics.map(key => (
                          <option key={key} value={key}>
                            {insightMetrics[key].label}
                          </option>
                        ))}
                      </VisualSelect>
                      <small>
                        For other channels, the first selected metric with daily
                        data is used.
                      </small>
                    </ChoiceField>
                  </div>
                  <div
                    className="insight-paper-preview"
                    aria-label="Report structure preview"
                  >
                    <span>EVOKELOOP / INSIGHTS</span>
                    <h3>{config.name || "Your report"}</h3>
                    <p>Reporting period & sources</p>
                    {config.sections.summary && (
                      <div>
                        <strong>Executive summary</strong>
                        <i />
                        <i />
                      </div>
                    )}
                    <div className="insight-preview-kpis">
                      <b>KPI</b>
                      <b>KPI</b>
                      <b>KPI</b>
                    </div>
                    {config.sections.trends && (
                      <div className="insight-preview-chart">
                        <BarChart3 size={62} />
                        <span>Trend charts</span>
                      </div>
                    )}
                    {config.sections.details && (
                      <div>
                        <strong>Detailed findings</strong>
                        <i />
                        <i />
                        <i />
                      </div>
                    )}
                    <small>Source notes · Methodology · Page numbers</small>
                  </div>
                </div>
              </>
            )}
            {page === "schedule" && (
              <>
                <div className="cfg-content-title">
                  <div>
                    <h2>Keep the report working for you</h2>
                    <p>Run manually or choose a recurring schedule.</p>
                  </div>
                </div>
                <label className="insight-check insight-emphasis">
                  <input
                    type="checkbox"
                    checked={config.schedule.enabled}
                    onChange={e =>
                      update({
                        schedule: {
                          ...config.schedule,
                          enabled: e.target.checked,
                        },
                      })
                    }
                  />
                  <span>
                    <strong>Run this report automatically</strong>
                    <small>
                      Saved dashboard widgets refresh when a run finishes.
                    </small>
                  </span>
                </label>
                {config.schedule.enabled && (
                  <>
                    <div className="insight-form-grid">
                      <ChoiceField className="insight-label">
                        Frequency
                        <VisualSelect
                          value={config.schedule.frequency}
                          onChange={e =>
                            update({
                              schedule: {
                                ...config.schedule,
                                frequency: e.target
                                  .value as InsightConfig["schedule"]["frequency"],
                              },
                            })
                          }
                        >
                          <option value="daily">Daily</option>
                          <option value="weekly">Weekly</option>
                          <option value="monthly">Monthly</option>
                        </VisualSelect>
                      </ChoiceField>
                      {config.schedule.frequency === "weekly" && (
                        <ChoiceField className="insight-label">
                          Day of week
                          <VisualSelect
                            value={config.schedule.weekday}
                            onChange={e =>
                              update({
                                schedule: {
                                  ...config.schedule,
                                  weekday: Number(e.target.value),
                                },
                              })
                            }
                          >
                            {[
                              "Sunday",
                              "Monday",
                              "Tuesday",
                              "Wednesday",
                              "Thursday",
                              "Friday",
                              "Saturday",
                            ].map((d, i) => (
                              <option value={i} key={d}>
                                {d}
                              </option>
                            ))}
                          </VisualSelect>
                        </ChoiceField>
                      )}
                      {config.schedule.frequency === "monthly" && (
                        <label className="insight-label">
                          Day of month
                          <input
                            type="number"
                            min={1}
                            max={31}
                            value={config.schedule.monthDay}
                            onChange={e =>
                              update({
                                schedule: {
                                  ...config.schedule,
                                  monthDay: Number(e.target.value),
                                },
                              })
                            }
                          />
                          <small>Shorter months use the last day.</small>
                        </label>
                      )}
                      <label className="insight-label">
                        Run time
                        <input
                          type="time"
                          value={`${String(config.schedule.hour).padStart(2, "0")}:${String(config.schedule.minute).padStart(2, "0")}`}
                          onChange={e => {
                            const [hour, minute] = e.target.value
                              .split(":")
                              .map(Number);
                            update({
                              schedule: { ...config.schedule, hour, minute },
                            });
                          }}
                        />
                      </label>
                      <label className="insight-label">
                        Schedule timezone
                        <input
                          list="schedule-timezones"
                          value={config.timezone}
                          onChange={e => update({ timezone: e.target.value })}
                        />
                        <datalist id="schedule-timezones">
                          {timezones.map(t => (
                            <option key={t} value={t} />
                          ))}
                        </datalist>
                      </label>
                      <label className="insight-label">
                        Start date (optional)
                        <input
                          type="date"
                          value={config.schedule.startDate || ""}
                          onChange={e =>
                            update({
                              schedule: {
                                ...config.schedule,
                                startDate: e.target.value || null,
                              },
                            })
                          }
                        />
                      </label>
                      <label className="insight-label">
                        End date (optional)
                        <input
                          type="date"
                          value={config.schedule.endDate || ""}
                          onChange={e =>
                            update({
                              schedule: {
                                ...config.schedule,
                                endDate: e.target.value || null,
                              },
                            })
                          }
                        />
                      </label>
                    </div>
                    <div className="insight-next-run">
                      <CalendarClock size={26} />
                      <div>
                        <strong>Next scheduled run</strong>
                        <p>
                          {next
                            ? new Date(next).toLocaleString(undefined, {
                                timeZone: config.timezone,
                                dateStyle: "full",
                                timeStyle: "short",
                              })
                            : rangeError ||
                              "No future run. Review the dates and timezone."}
                        </p>
                        <small>
                          {config.timezone} · Schedule starts after saving.
                        </small>
                      </div>
                    </div>
                    <p className="insight-caption">
                      Daylight-saving gaps or repeated times move to the next
                      unambiguous local minute. Missed runs are consolidated
                      into one catch-up run using the current reporting window.
                      An already-running report is not duplicated.
                    </p>
                    {config.period === "custom" && (
                      <p className="insight-notice">
                        Choose a rolling reporting period in Accounts & dates
                        before enabling the schedule.
                      </p>
                    )}
                  </>
                )}
              </>
            )}
            {page === "delivery" && (
              <>
                <div className="cfg-content-title">
                  <div>
                    <h2>Deliver the right information to the right people</h2>
                    <p>
                      Every run is saved in Results, whether or not email is
                      enabled.
                    </p>
                  </div>
                </div>
                <label className="insight-check insight-emphasis">
                  <input
                    type="checkbox"
                    checked={config.delivery.email}
                    disabled={!options.data?.emailConfigured}
                    onChange={e =>
                      update({
                        delivery: {
                          ...config.delivery,
                          email: e.target.checked,
                          recipientUserIds: config.delivery.recipientUserIds
                            .length
                            ? config.delivery.recipientUserIds
                            : workspace.membership?.userId
                              ? [workspace.membership.userId]
                              : [],
                        },
                      })
                    }
                  />
                  <span>
                    <strong>Email scheduled report results</strong>
                    <small>A summary and secure link to the full report.</small>
                  </span>
                </label>
                {!options.data?.emailConfigured && (
                  <p className="insight-notice">
                    Email delivery needs administrator configuration. You can
                    still schedule reports and download PDFs from Results.
                  </p>
                )}
                {config.delivery.email && (
                  <>
                    <h3 className="insight-form-heading">Recipients</h3>
                    <div className="insight-recipient-grid">
                      {options.data?.recipients.map(r => (
                        <label className="insight-check" key={r.userId}>
                          <input
                            type="checkbox"
                            checked={config.delivery.recipientUserIds.includes(
                              r.userId
                            )}
                            onChange={e =>
                              update({
                                delivery: {
                                  ...config.delivery,
                                  recipientUserIds: e.target.checked
                                    ? [
                                        ...config.delivery.recipientUserIds,
                                        r.userId,
                                      ]
                                    : config.delivery.recipientUserIds.filter(
                                        id => id !== r.userId
                                      ),
                                },
                              })
                            }
                          />
                          <span>
                            <strong>{r.name || r.email}</strong>
                            <small>{r.email}</small>
                          </span>
                        </label>
                      ))}
                    </div>
                    <label className="insight-check">
                      <input
                        type="checkbox"
                        checked={config.delivery.attachPdf}
                        onChange={e =>
                          update({
                            delivery: {
                              ...config.delivery,
                              attachPdf: e.target.checked,
                            },
                          })
                        }
                      />
                      <span>
                        <strong>Attach the PDF report</strong>
                        <small>
                          Includes the same metrics, graphs, and source notes as
                          Results.
                        </small>
                      </span>
                    </label>
                    <label className="insight-check">
                      <input
                        type="checkbox"
                        checked={config.delivery.notifyFailure}
                        onChange={e =>
                          update({
                            delivery: {
                              ...config.delivery,
                              notifyFailure: e.target.checked,
                            },
                          })
                        }
                      />
                      <span>
                        <strong>Notify recipients if a run fails</strong>
                        <small>
                          Partial results are clearly marked. Delivery status
                          appears in run history.
                        </small>
                      </span>
                    </label>
                    <p className="insight-caption">
                      Recipients must be active workspace members. Access is
                      checked again before sending. Temporary email failures
                      retry automatically for up to 23 hours.
                    </p>
                  </>
                )}
                <div className="insight-next-run">
                  <FileText size={25} />
                  <div>
                    <strong>PDF export is always available</strong>
                    <p>Open any completed result and choose Download PDF.</p>
                  </div>
                </div>
              </>
            )}
            {page === "review" && (
              <>
                <div className="cfg-content-title">
                  <div>
                    <h2>Ready to turn your data into a report?</h2>
                    <p>
                      Review the setup. Run once now, and save the schedule for
                      future reports.
                    </p>
                  </div>
                </div>
                <div className="insight-review-grid">
                  <button type="button" onClick={() => select("sources")}>
                    <Target size={22} />
                    <strong>Sources & period</strong>
                    <p>
                      {accounts.map(a => a.name).join(", ") ||
                        "Choose accounts"}
                    </p>
                    <small>
                      {range ? `${range.since} — ${range.until}` : rangeError}
                    </small>
                    {config.compare && range && (
                      <small>
                        Compare: {reportPreviousRange(range).since} —{" "}
                        {reportPreviousRange(range).until}
                      </small>
                    )}
                  </button>
                  <button type="button" onClick={() => select("metrics")}>
                    <BarChart3 size={22} />
                    <strong>Metrics & output</strong>
                    <p>
                      {config.metrics
                        .map(m => insightMetrics[m].label)
                        .join(", ") || "Choose metrics"}
                    </p>
                    <small>On-screen report + PDF export</small>
                  </button>
                  <button type="button" onClick={() => select("schedule")}>
                    <CalendarClock size={22} />
                    <strong>Run schedule</strong>
                    <p>{scheduleDescription(config)}</p>
                    <small>
                      {next
                        ? `Next: ${new Date(next).toLocaleString(undefined, { timeZone: config.timezone })}`
                        : "Run whenever you need a fresh report"}
                    </small>
                  </button>
                  <button type="button" onClick={() => select("delivery")}>
                    <Mail size={22} />
                    <strong>Delivery</strong>
                    <p>
                      {config.delivery.email
                        ? `${config.delivery.recipientUserIds.length} recipient(s)${config.delivery.attachPdf ? " · PDF attached" : ""}`
                        : "Saved in Results"}
                    </p>
                    <small>
                      Runs are retained with their original settings.
                    </small>
                  </button>
                </div>
                {!validation.success && (
                  <p className="insight-notice">
                    {validation.error.issues.map(i => i.message).join(" ")}
                  </p>
                )}
                {config.delivery.email && (
                  <label className="insight-check">
                    <input
                      type="checkbox"
                      checked={notifyNow}
                      onChange={e => setNotifyNow(e.target.checked)}
                    />
                    <span>
                      <strong>
                        Also notify selected recipients for this manual run
                      </strong>
                      <small>
                        Scheduled runs use the saved delivery settings.
                      </small>
                    </span>
                  </label>
                )}
                <div className="insight-run-action">
                  <div>
                    <h3>Generate your report</h3>
                    <p>
                      Loads connected-channel data. No AI credits are required.
                    </p>
                  </div>
                  <Button
                    disabled={busy || !validation.success || !!rangeError}
                    onClick={() => saveReport(true)}
                  >
                    <Play size={16} />
                    {busy ? "Preparing report…" : "Save & run report"}
                  </Button>
                </div>
              </>
            )}
          </fieldset>
          {page === "results" && (
            <>
              {!runId ? (
                <div className="insight-results-empty">
                  <FileText size={40} />
                  <h2>Your report will appear here</h2>
                  <p>
                    Choose your sources and metrics, then use Review & run to
                    generate the first result.
                  </p>
                  <Button onClick={() => select("review")}>
                    Review & run
                    <ArrowRight size={15} />
                  </Button>
                </div>
              ) : output.isLoading ? (
                <p role="status">Loading report output…</p>
              ) : output.error ? (
                <p role="alert" className="insight-notice">
                  {output.error.message}
                </p>
              ) : (
                output.data &&
                output.data.reportId === reportId && (
                  <>
                    <div className="insight-result-status">
                      <span
                        className="insight-status"
                        data-status={output.data.status}
                      >
                        {output.data.status}
                      </span>
                      <span>
                        Run {new Date(output.data.createdAtMs).toLocaleString()}{" "}
                        · {output.data.trigger}
                      </span>
                      <span>
                        Email:{" "}
                        {output.data.deliveryState === "disabled"
                          ? "Not requested"
                          : output.data.deliveryState}
                      </span>
                      <Button
                        variant="outline"
                        onClick={() => select("review")}
                      >
                        Review & run again
                      </Button>
                    </div>
                    {output.data.deliveryError && (
                      <p className="insight-notice">
                        {output.data.deliveryError}
                      </p>
                    )}
                    {["queued", "running"].includes(output.data.status) ? (
                      <div className="insight-generating" role="status">
                        <div className="insight-bars">
                          <i />
                          <i />
                          <i />
                          <i />
                          <i />
                        </div>
                        <h2>
                          {output.data.status === "queued"
                            ? "Your report is queued"
                            : "Bringing your results together"}
                        </h2>
                        <p>
                          Loading sources, comparing periods, and preparing your
                          report. You can leave this screen; the run continues
                          in the background.
                        </p>
                      </div>
                    ) : output.data.result ? (
                      <>
                        {output.data.revision !== revision && (
                          <p className="insight-notice">
                            This is an earlier report revision. Its original
                            settings are preserved. Run the current
                            configuration before pinning new widgets.
                          </p>
                        )}
                        <InsightReport
                          organizationId={organizationId}
                          reportId={reportId!}
                          runId={output.data.id}
                          result={output.data.result}
                          config={output.data.config}
                          status={output.data.status}
                          revision={output.data.revision}
                          allowPin={output.data.revision === revision && !dirty}
                        />
                      </>
                    ) : (
                      <p role="alert" className="insight-notice">
                        {output.data.error || "No output is available."}
                      </p>
                    )}
                  </>
                )
              )}
            </>
          )}
          {page === "history" && (
            <>
              <div className="cfg-content-title">
                <div>
                  <h2>Run history</h2>
                  <p>
                    Open any of the latest 50 runs to review its original data,
                    settings, and delivery status.
                  </p>
                </div>
              </div>
              {!runs.data?.length ? (
                <p className="insight-empty">No runs yet.</p>
              ) : (
                <div className="insight-history">
                  {runs.data.map(r => (
                    <button
                      key={r.id}
                      onClick={() => {
                        setSelectedRun(r.id);
                        select("results");
                      }}
                    >
                      <FileText size={20} />
                      <div>
                        <strong>
                          {new Date(r.createdAtMs).toLocaleString()}
                        </strong>
                        <small>
                          {r.trigger} · Revision {r.revision} · Email:{" "}
                          {r.deliveryState === "disabled"
                            ? "Not requested"
                            : r.deliveryState}
                        </small>
                        {r.error && <small>{r.error}</small>}
                      </div>
                      <span className="insight-status" data-status={r.status}>
                        {r.status}
                      </span>
                      <ArrowRight size={16} />
                    </button>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </StudioJourney>
    </div>
  );
}
function PlusMark() {
  return <span aria-hidden="true">+</span>;
}
function WorkspaceStudio() {
  const { organizationId } = useWorkspace();
  const params = new URLSearchParams(useSearch());
  const id = params.get("id") || undefined;
  return organizationId ? (
    <Studio
      key={`${organizationId}:${id || "new"}`}
      organizationId={organizationId}
      reportId={id}
      initialRun={params.get("run") || undefined}
    />
  ) : null;
}
export default function InsightsStudioPage() {
  return (
    <WorkspaceGate>
      <WorkspaceStudio />
    </WorkspaceGate>
  );
}
