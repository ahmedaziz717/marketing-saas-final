import { googleReportDetails } from "@shared/googleReportDetails";
import { ChoiceVisual } from "@/components/choices/ChoiceVisual";
import { VisualSelect, ChoiceField } from "@/components/choices/VisualSelect";
import { chartTypes } from "@shared/insightCharts";
import { useId, useState, type CSSProperties } from "react";
import { Check, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  independentWidgetConfig,
  insightConfigSchema,
  insightMetrics,
  supportsInsightMetric,
  reportPeriods,
  selectableMetrics,
  widgetColors,
  widgetPalettes,
  widgetTitle,
  type DashboardWidget,
  type InsightConfig,
  type InsightMetric,
} from "@shared/insights";

export function widgetStyle(
  widget: Pick<DashboardWidget, "appearance">
): CSSProperties {
  const colors = widgetColors(widget.appearance);
  return {
    "--widget-bg": colors.background,
    "--widget-fg": colors.foreground,
    "--widget-accent": colors.accent,
  } as CSSProperties;
}

export function ReportComponentPicker({
  components,
  onChange,
}: {
  components: NonNullable<DashboardWidget["components"]>;
  onChange: (value: NonNullable<DashboardWidget["components"]>) => void;
}) {
  return (
    <fieldset className="insight-component-picker">
      <legend>Report components</legend>
      <p>
        Choose what appears in this widget. You can change this from the
        dashboard.
      </p>
      {(
        [
          [
            "summary",
            "Executive summary",
            "Key findings and period comparisons",
          ],
          ["metrics", "Key metrics", "Selected KPIs for each account or Page"],
          ["trends", "Trend charts", "Daily performance for your chart metric"],
          ["details", "Detail tables", "Campaign or post breakdowns"],
        ] as const
      ).map(([key, label, detail]) => (
        <label key={key} className="choice-radio-card">
          <span className="choice-radio-art">
            <ChoiceVisual label={label} context="Report component" />
          </span>
          <input
            type="checkbox"
            checked={components.includes(key)}
            onChange={e =>
              onChange(
                e.target.checked
                  ? [...components, key]
                  : components.filter(k => k !== key)
              )
            }
          />
          <span>
            <strong>{label}</strong>
            <small>{detail}</small>
          </span>
        </label>
      ))}
    </fieldset>
  );
}

type Connection = { id: string; name: string; channel: string; status: string };
export function InsightWidgetEditor({
  widget,
  config,
  connections,
  onClose,
  onSave,
  saving,
  layoutEditing,
}: {
  widget: DashboardWidget;
  config: InsightConfig;
  connections: Connection[];
  onClose: () => void;
  onSave: (widget: DashboardWidget, config: InsightConfig) => Promise<void>;
  saving: boolean;
  layoutEditing: boolean;
}) {
  const [draft, setDraft] = useState<DashboardWidget>(structuredClone(widget));
  const [setup, setSetup] = useState<InsightConfig>(
    independentWidgetConfig(config)
  );
  const [tab, setTab] = useState<"content" | "dates" | "appearance">("content");
  const [error, setError] = useState("");
  const panelId = useId();
  const update = (patch: Partial<DashboardWidget>) =>
    setDraft(d => ({ ...d, ...patch }));
  const updateSetup = (patch: Partial<InsightConfig>) =>
    setSetup(c => ({ ...c, ...patch }));
  const available = connections.filter(c => setup.connectionIds.includes(c.id));
  const metricChoices = selectableMetrics.filter(m =>
    (draft.kind === "report"
      ? available
      : available.filter(a => a.id === draft.connectionId)
    ).some(a => supportsInsightMetric(m, a.channel))
  );
  const title = widgetTitle(draft, setup);
  const colors = widgetColors(draft.appearance);
  const changeMetric = (metric: InsightMetric) => {
    update({ metric });
    updateSetup({
      metrics: Array.from(new Set([...setup.metrics, metric])),
      chartMetric: metric,
    });
  };
  const changeKind = (kind: DashboardWidget["kind"]) => {
    const account =
      available.find(a => a.id === draft.connectionId) ?? available[0];
    const metric =
      setup.metrics.find(m => supportsInsightMetric(m, account?.channel)) ??
      setup.chartMetric;
    update({
      kind,
      connectionId: kind === "report" ? null : (account?.id ?? null),
      metric,
      components: draft.components ?? ["summary"],
    });
  };
  const commit = async () => {
    const parsed = insightConfigSchema.safeParse(
      independentWidgetConfig(setup)
    );
    if (!parsed.success) {
      setError(parsed.error.issues[0].message);
      return;
    }
    if (draft.kind === "report" && !(draft.components ?? ["summary"]).length) {
      setError("Choose at least one report component.");
      return;
    }
    try {
      setError("");
      await onSave(draft, parsed.data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save this widget.");
    }
  };
  return (
    <Dialog
      open
      onOpenChange={open => {
        if (!open && !saving) onClose();
      }}
    >
      <DialogContent className="insight-widget-editor">
        <DialogHeader>
          <DialogTitle>Edit widget</DialogTitle>
          <DialogDescription>
            This widget has its own settings. Changes here leave the original
            report unchanged.
          </DialogDescription>
        </DialogHeader>
        <div
          className="insight-widget-editor-tabs"
          role="tablist"
          aria-label="Widget settings"
        >
          {(
            [
              ["content", "Content"],
              ["dates", "Dates & refresh"],
              ["appearance", "Style & size"],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              role="tab"
              id={`${panelId}-${key}`}
              aria-controls={panelId}
              aria-selected={tab === key}
              tabIndex={tab === key ? 0 : -1}
              onClick={() => setTab(key)}
              onKeyDown={e => {
                const keys = ["content", "dates", "appearance"] as const;
                if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(e.key))
                  return;
                e.preventDefault();
                const next =
                  e.key === "Home"
                    ? 0
                    : e.key === "End"
                      ? 2
                      : (keys.indexOf(tab) + (e.key === "ArrowRight" ? 1 : 2)) %
                        3;
                setTab(keys[next]);
                e.currentTarget.parentElement
                  ?.querySelectorAll<HTMLButtonElement>('[role="tab"]')
                  [next]?.focus();
              }}
            >
              {label}
            </button>
          ))}
        </div>
        <div
          className="insight-widget-editor-body"
          id={panelId}
          role="tabpanel"
          aria-labelledby={`${panelId}-${tab}`}
        >
          {tab === "content" && (
            <>
              <label className="insight-label">
                Widget title
                <input
                  aria-label="Widget title"
                  maxLength={120}
                  value={draft.title ?? title}
                  onChange={e => update({ title: e.target.value })}
                />
                <small>
                  {draft.title
                    ? "Custom title"
                    : "Automatically named from your content"}
                </small>
              </label>
              <button
                className="insight-text-button"
                onClick={() => update({ title: undefined })}
              >
                <RotateCcw size={13} />
                Use automatic title
              </button>
              <ChoiceField className="insight-label">
                Widget type
                <VisualSelect
                  aria-label="Widget type"
                  value={draft.kind}
                  onChange={e =>
                    changeKind(e.target.value as DashboardWidget["kind"])
                  }
                >
                  <option value="report">Report components</option>
                  <option value="kpi">Key metric</option>
                  <option value="trend">Trend chart</option>
                </VisualSelect>
              </ChoiceField>
              {draft.kind === "trend" && (
                <div className="insight-form-grid">
                  <label className="insight-label">
                    Chart style
                    <VisualSelect
                      value={draft.visualization ?? "area"}
                      onChange={e =>
                        update({
                          visualization: e.target
                            .value as DashboardWidget["visualization"],
                        })
                      }
                    >
                      {chartTypes.map(([id, label]) => (
                        <option key={id} value={id}>
                          {label}
                        </option>
                      ))}
                    </VisualSelect>
                  </label>
                  <label className="insight-label">
                    Group dates by
                    <VisualSelect
                      value={draft.aggregation ?? "day"}
                      onChange={e =>
                        update({
                          aggregation: e.target
                            .value as DashboardWidget["aggregation"],
                        })
                      }
                    >
                      <option value="day">Day</option>
                      <option value="week">Week</option>
                      <option value="month">Month</option>
                    </VisualSelect>
                  </label>
                </div>
              )}
              {draft.kind === "report" ? (
                <>
                  <ReportComponentPicker
                    components={draft.components ?? ["summary"]}
                    onChange={components => update({ components })}
                  />
                  <fieldset className="insight-widget-metrics">
                    <legend>Metrics to include</legend>
                    {metricChoices.map(m => (
                      <label key={m} className="choice-radio-card">
                        <span className="choice-radio-art">
                          <ChoiceVisual
                            label={insightMetrics[m].label}
                            context="Metric"
                          />
                        </span>
                        <input
                          type="checkbox"
                          checked={setup.metrics.includes(m)}
                          onChange={e => {
                            const metrics = e.target.checked
                              ? [...setup.metrics, m]
                              : setup.metrics.filter(k => k !== m);
                            updateSetup({
                              metrics,
                              chartMetric: metrics.includes(setup.chartMetric)
                                ? setup.chartMetric
                                : (metrics[0] ?? setup.chartMetric),
                            });
                          }}
                        />
                        {insightMetrics[m].label}
                      </label>
                    ))}
                  </fieldset>
                  {(draft.components ?? []).includes("trends") && (
                    <ChoiceField className="insight-label">
                      Chart metric
                      <VisualSelect
                        aria-label="Chart metric"
                        value={setup.chartMetric}
                        onChange={e =>
                          updateSetup({
                            chartMetric: e.target.value as InsightMetric,
                          })
                        }
                      >
                        {setup.metrics.map(m => (
                          <option key={m} value={m}>
                            {insightMetrics[m].label}
                          </option>
                        ))}
                      </VisualSelect>
                    </ChoiceField>
                  )}
                </>
              ) : (
                <>
                  <ChoiceField className="insight-label">
                    Account / Page
                    <VisualSelect
                      aria-label="Account / Page"
                      value={draft.connectionId ?? ""}
                      onChange={e => {
                        const a = available.find(c => c.id === e.target.value);
                        const m = selectableMetrics.find(m =>
                          supportsInsightMetric(m, a?.channel)
                        )!;
                        update({ connectionId: e.target.value, metric: m });
                        updateSetup({
                          metrics: Array.from(new Set([...setup.metrics, m])),
                          chartMetric: m,
                        });
                      }}
                    >
                      {available.map(a => (
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
                      value={draft.metric}
                      onChange={e =>
                        changeMetric(e.target.value as InsightMetric)
                      }
                    >
                      {metricChoices.map(m => (
                        <option key={m} value={m}>
                          {insightMetrics[m].label}
                        </option>
                      ))}
                    </VisualSelect>
                  </ChoiceField>
                </>
              )}
            </>
          )}
          {tab === "dates" && (
            <>
              <label className="insight-label">
                Date source
                <VisualSelect
                  value={draft.dateMode ?? "custom"}
                  onChange={e =>
                    update({
                      dateMode: e.target.value as "dashboard" | "custom",
                    })
                  }
                >
                  <option value="custom">Custom range</option>
                  <option value="dashboard">Follow dashboard</option>
                </VisualSelect>
              </label>
              {available.some(a => a.channel === "google_ads") && (
                <label className="insight-label">
                  Google detail breakdown
                  <select
                    value={setup.googleDetailLevel ?? "campaign"}
                    onChange={e =>
                      updateSetup({
                        googleDetailLevel: e.target
                          .value as InsightConfig["googleDetailLevel"],
                      })
                    }
                  >
                    {Object.entries(googleReportDetails).map(([v, t]) => (
                      <option key={v} value={v}>
                        {t}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              {available.some(a => a.channel !== "facebook") && (
                <label className="insight-widget-check">
                  <input
                    type="checkbox"
                    checked={setup.includeInactiveCampaigns === true}
                    onChange={e =>
                      updateSetup({
                        includeInactiveCampaigns: e.target.checked,
                      })
                    }
                  />
                  Include inactive campaigns
                </label>
              )}
              <div className="insight-form-grid">
                <ChoiceField className="insight-label">
                  Reporting period
                  <VisualSelect
                    aria-label="Reporting period"
                    value={setup.period}
                    onChange={e =>
                      updateSetup({
                        period: e.target.value as InsightConfig["period"],
                        schedule: {
                          ...setup.schedule,
                          enabled:
                            e.target.value === "custom"
                              ? false
                              : setup.schedule.enabled,
                        },
                      })
                    }
                  >
                    {reportPeriods.map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </VisualSelect>
                </ChoiceField>
                {setup.period === "days" && (
                  <label className="insight-label">
                    Number of days
                    <input
                      type="number"
                      min={1}
                      max={366}
                      value={setup.rollingDays ?? 30}
                      onChange={e =>
                        updateSetup({ rollingDays: Number(e.target.value) })
                      }
                    />
                  </label>
                )}
                {setup.period === "custom" && (
                  <>
                    <label className="insight-label">
                      Start date
                      <input
                        type="date"
                        value={setup.customRange.since}
                        onChange={e =>
                          updateSetup({
                            customRange: {
                              ...setup.customRange,
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
                        value={setup.customRange.until}
                        onChange={e =>
                          updateSetup({
                            customRange: {
                              ...setup.customRange,
                              until: e.target.value,
                            },
                          })
                        }
                      />
                    </label>
                  </>
                )}
                <label className="insight-label">
                  Timezone
                  <input
                    value={setup.timezone}
                    onChange={e => updateSetup({ timezone: e.target.value })}
                  />
                </label>
              </div>
              <label className="insight-widget-check">
                <input
                  type="checkbox"
                  checked={setup.includeToday}
                  onChange={e =>
                    updateSetup({ includeToday: e.target.checked })
                  }
                />
                Include today’s partial data
              </label>
              <label className="insight-widget-check">
                <input
                  type="checkbox"
                  checked={setup.compare}
                  onChange={e => updateSetup({ compare: e.target.checked })}
                />
                Compare with the previous period
              </label>
              <label className="insight-widget-check">
                <input
                  type="checkbox"
                  disabled={setup.period === "custom"}
                  checked={setup.schedule.enabled}
                  onChange={e =>
                    updateSetup({
                      schedule: {
                        ...setup.schedule,
                        enabled: e.target.checked,
                        startDate: null,
                        endDate: null,
                      },
                    })
                  }
                />
                Refresh this widget automatically
              </label>
              {setup.schedule.enabled && (
                <div className="insight-form-grid">
                  <ChoiceField className="insight-label">
                    Frequency
                    <VisualSelect
                      aria-label="Frequency"
                      value={setup.schedule.frequency}
                      onChange={e =>
                        updateSetup({
                          schedule: {
                            ...setup.schedule,
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
                  {setup.schedule.frequency === "weekly" && (
                    <ChoiceField className="insight-label">
                      Day of week
                      <VisualSelect
                        aria-label="Day of week"
                        value={setup.schedule.weekday}
                        onChange={e =>
                          updateSetup({
                            schedule: {
                              ...setup.schedule,
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
                          <option key={d} value={i}>
                            {d}
                          </option>
                        ))}
                      </VisualSelect>
                    </ChoiceField>
                  )}
                  {setup.schedule.frequency === "monthly" && (
                    <label className="insight-label">
                      Day of month
                      <input
                        type="number"
                        min={1}
                        max={31}
                        value={setup.schedule.monthDay}
                        onChange={e =>
                          updateSetup({
                            schedule: {
                              ...setup.schedule,
                              monthDay: Number(e.target.value),
                            },
                          })
                        }
                      />
                    </label>
                  )}
                  <label className="insight-label">
                    Refresh time
                    <input
                      type="time"
                      value={`${String(setup.schedule.hour).padStart(2, "0")}:${String(setup.schedule.minute).padStart(2, "0")}`}
                      onChange={e => {
                        const [hour, minute] = e.target.value
                          .split(":")
                          .map(Number);
                        updateSetup({
                          schedule: { ...setup.schedule, hour, minute },
                        });
                      }}
                    />
                  </label>
                </div>
              )}
              <p className="insight-caption">
                Refreshes update only this widget. Report email delivery stays
                with the original report.
              </p>
            </>
          )}
          {tab === "appearance" && (
            <>
              <div className="insight-form-grid">
                <ChoiceField className="insight-label">
                  Width
                  <VisualSelect
                    aria-label="Width"
                    value={draft.size}
                    onChange={e =>
                      update({
                        size: e.target.value as DashboardWidget["size"],
                      })
                    }
                  >
                    <option value="small">One third</option>
                    <option value="half">Half width</option>
                    <option value="medium">Two thirds</option>
                    <option value="wide">Full width</option>
                  </VisualSelect>
                </ChoiceField>
                <ChoiceField className="insight-label">
                  Height
                  <VisualSelect
                    aria-label="Height"
                    value={draft.height}
                    onChange={e =>
                      update({
                        height: e.target.value as DashboardWidget["height"],
                        autoSize: false,
                      })
                    }
                  >
                    <option value="compact">Compact · 1 unit</option>
                    <option value="standard">Standard · 2 units</option>
                    <option value="tall">Tall · 3 units</option>
                  </VisualSelect>
                </ChoiceField>
              </div>
              {draft.kind === "report" && (
                <label className="insight-check">
                  <input
                    type="checkbox"
                    checked={!!draft.autoSize}
                    onChange={e => update({ autoSize: e.target.checked })}
                  />
                  <span>
                    <strong>Fit height to report content</strong>
                    <small>
                      Adapts as the report or screen changes, keeping the
                      dashboard grid aligned.
                    </small>
                  </span>
                </label>
              )}
              <p className="insight-caption">
                Two compact tiles align with one standard tile; three align with
                one tall tile, including the gaps.
              </p>
              <fieldset className="insight-palette-picker">
                <legend>Color combinations</legend>
                {Object.entries(widgetPalettes).map(([key, p]) => (
                  <button
                    key={key}
                    type="button"
                    aria-pressed={
                      (draft.appearance?.palette === key &&
                        !draft.appearance?.custom) ||
                      (key === "canvas" && !draft.appearance)
                    }
                    onClick={() =>
                      update({
                        appearance: {
                          palette: key as keyof typeof widgetPalettes,
                        },
                      })
                    }
                    style={{
                      background: p.background,
                      color: p.foreground,
                      borderColor: p.accent,
                    }}
                  >
                    <span style={{ background: p.accent }} />
                    {p.label}
                    {draft.appearance?.palette === key &&
                      !draft.appearance?.custom && <Check size={14} />}
                  </button>
                ))}
              </fieldset>
              <details className="insight-custom-colors">
                <summary>Custom colors</summary>
                <div>
                  {(
                    [
                      ["background", "Background"],
                      ["foreground", "Text"],
                      ["accent", "Chart & accent"],
                    ] as const
                  ).map(([key, label]) => (
                    <label key={key}>
                      {label}
                      <input
                        type="color"
                        value={colors[key]}
                        onChange={e =>
                          update({
                            appearance: {
                              palette: draft.appearance?.palette ?? "canvas",
                              custom: { ...colors, [key]: e.target.value },
                            },
                          })
                        }
                      />
                    </label>
                  ))}
                </div>
              </details>
              <div
                className="insight-widget-style-preview"
                style={widgetStyle(draft)}
              >
                <small>STYLE PREVIEW</small>
                <strong>{title}</strong>
                <span>Selected tile colors</span>
                <i />
              </div>
            </>
          )}
        </div>
        {error && (
          <p role="alert" className="insight-notice">
            {error}
          </p>
        )}
        <div className="insight-widget-editor-footer">
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button disabled={saving} onClick={commit}>
            {saving
              ? "Saving…"
              : layoutEditing
                ? "Apply to layout"
                : "Save widget"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
