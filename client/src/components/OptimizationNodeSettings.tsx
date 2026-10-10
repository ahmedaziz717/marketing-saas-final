import { datePresets } from "@shared/reportDates";
import { type WorkflowNode } from "@shared/creativeWorkflow";
import {
  optimizerKinds,
  optimizerSchema,
  analysisQuerySchema,
  dimensionNames,
  schedulingSettingsSchema,
  type Dimension,
} from "@shared/optimization";
import { optimizerLibrary } from "@shared/optimizerLibrary";
import { DateRangeFilter } from "./DateRangeFilter";
export function OptimizationNodeSettings({
  node,
  onChange,
}: {
  node: WorkflowNode;
  onChange: (v: Partial<WorkflowNode["config"]>) => void;
}) {
  const trigger = node.config.trigger ?? {
    kind: "manual" as const,
    weekday: 1,
    hour: 9,
    timezone: "UTC",
    event: "history_synced" as const,
  };
  const optimizer = optimizerSchema.parse(
    node.config.optimizer ?? { kind: "headline" }
  );
  const analysis = analysisQuerySchema.parse(
    node.config.analysis ?? {
      range: {
        since: "2026-01-01",
        until: new Date().toISOString().slice(0, 10),
      },
      dimensions: ["messaging_style"],
    }
  );
  const scheduling = schedulingSettingsSchema.parse(optimizer.scheduling ?? {});
  return (
    <>
      {node.type === "start_trigger" && (
        <>
          <label>
            Start mode
            <select
              value={trigger.kind}
              onChange={e =>
                onChange({
                  trigger: {
                    ...trigger,
                    kind: e.target.value as typeof trigger.kind,
                  },
                })
              }
            >
              {["manual", "scheduled", "event", "workflow_call"].map(k => (
                <option key={k} value={k}>
                  {k.replaceAll("_", " ")}
                </option>
              ))}
            </select>
          </label>
          {trigger.kind === "scheduled" && (
            <>
              <label>
                Weekday
                <select
                  value={trigger.weekday}
                  onChange={e =>
                    onChange({
                      trigger: { ...trigger, weekday: Number(e.target.value) },
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
                    <option value={i} key={i}>
                      {d}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Hour (0–23)
                <input
                  type="number"
                  min={0}
                  max={23}
                  value={trigger.hour}
                  onChange={e =>
                    onChange({
                      trigger: { ...trigger, hour: Number(e.target.value) },
                    })
                  }
                />
              </label>
              <label>
                Timezone
                <input
                  value={trigger.timezone}
                  onChange={e =>
                    onChange({
                      trigger: { ...trigger, timezone: e.target.value },
                    })
                  }
                />
              </label>
            </>
          )}
          {trigger.kind === "event" && (
            <label>
              Event
              <select
                value={trigger.event}
                onChange={e =>
                  onChange({
                    trigger: {
                      ...trigger,
                      event: e.target.value as typeof trigger.event,
                    },
                  })
                }
              >
                {[
                  "history_synced",
                  "publication_delivered",
                  "manual_event",
                ].map(k => (
                  <option key={k}>{k}</option>
                ))}
              </select>
            </label>
          )}
          <p className="wf-setting-help">
            Save and publish a version, then enable its trigger in the App.
            Scheduled/event runs pause before paid generation and delivery still
            requires publication approval.
          </p>
        </>
      )}
      {node.type === "run_workflow" && (
        <>
          <label>
            Required output
            <select
              value={node.config.outputType ?? "any"}
              onChange={e => onChange({ outputType: e.target.value as any })}
            >
              {[
                "any",
                "text",
                "image",
                "video",
                "data",
                "decision",
                "publication",
              ].map(t => (
                <option key={t}>{t}</option>
              ))}
            </select>
          </label>
          <p className="wf-setting-help">
            Pinned versions run inside this workflow with the same tenant
            permissions. Add typed input mappings below using the child App
            input IDs. Optionally prefix a connected source ID and → to route
            only that source.
          </p>
          <textarea
            aria-label="Input mapping"
            placeholder="source_node → child_input:data (one per line)"
            value={(node.config.inputMapping ?? [])
              .map(
                m =>
                  `${m.sourceNodeId ? `${m.sourceNodeId} → ` : ""}${m.targetNodeId}:${m.type}`
              )
              .join("\n")}
            onChange={e =>
              onChange({
                inputMapping: e.target.value
                  .split("\n")
                  .filter(Boolean)
                  .map(l => {
                    const [route, typeRaw] = l.split(":");
                    const targets = route.split(/→|->/).map(s => s.trim());
                    const targetNodeId = targets.at(-1) ?? "",
                      type = typeRaw?.trim();
                    return {
                      sourceNodeId: targets.length > 1 ? targets[0] : undefined,
                      targetNodeId,
                      type: ([
                        "text",
                        "image",
                        "video",
                        "data",
                        "decision",
                        "publication",
                      ].includes(type)
                        ? type
                        : "any") as any,
                    };
                  }),
              })
            }
          />
        </>
      )}
      {node.type === "meta_history" && (
        <label>
          <input
            type="checkbox"
            checked={node.config.incremental ?? true}
            onChange={e => onChange({ incremental: e.target.checked })}
          />{" "}
          Incremental sync with attribution overlap
        </label>
      )}
      {node.type === "analyze_history" && (
        <>
          <label>
            <input
              type="checkbox"
              checked={node.config.measurePublishedOnly ?? false}
              onChange={e =>
                onChange({ measurePublishedOnly: e.target.checked })
              }
            />{" "}
            Measure only connected delivered publications
          </label>
          <label>
            Reporting window
            <select
              value={node.config.datePreset ?? "custom"}
              onChange={e => onChange({ datePreset: e.target.value as any })}
            >
              {datePresets.map(([id, name]) => (
                <option key={id} value={id}>
                  {name}
                </option>
              ))}
              <option value="custom">Custom date range</option>
            </select>
          </label>
          <DateRangeFilter
            value={analysis.range}
            onChange={range =>
              range &&
              onChange({
                datePreset: "custom",
                analysis: { ...analysis, range },
              })
            }
          />
          <label>
            Granularity
            <select
              value={analysis.grain}
              onChange={e =>
                onChange({
                  analysis: { ...analysis, grain: e.target.value as any },
                })
              }
            >
              {["daily", "placement", "hourly"].map(g => (
                <option key={g}>{g}</option>
              ))}
            </select>
          </label>
          <label>
            Dimensions (select up to four)
            <select
              multiple
              value={analysis.dimensions}
              onChange={e =>
                onChange({
                  analysis: {
                    ...analysis,
                    dimensions: Array.from(e.target.selectedOptions)
                      .map(o => o.value as Dimension)
                      .slice(0, 4),
                  },
                })
              }
            >
              {dimensionNames.map(d => (
                <option key={d}>{d}</option>
              ))}
            </select>
          </label>
        </>
      )}
      {node.type === "optimize_dimension" && (
        <>
          <label>
            Optimizer
            <select
              value={optimizer.kind}
              onChange={e =>
                onChange({
                  optimizer: {
                    ...optimizer,
                    kind: e.target.value as typeof optimizer.kind,
                  },
                })
              }
            >
              {optimizerKinds.map(k => (
                <option key={k} value={k}>
                  {optimizerLibrary[k].name}
                </option>
              ))}
            </select>
          </label>
          {optimizer.kind === "weekday_time" ? (
            <>
              <p className="wf-setting-help">
                Compare live Meta delivery periods by purchase efficiency. This
                step calculates a report; it does not generate ads or change
                delivery.
              </p>
              <label>
                Comparison
                <select
                  value={scheduling.comparison}
                  onChange={e =>
                    onChange({
                      optimizer: {
                        ...optimizer,
                        mode: "analyze",
                        scheduling: {
                          ...scheduling,
                          comparison: e.target
                            .value as typeof scheduling.comparison,
                        },
                      },
                    })
                  }
                >
                  <option value="both">
                    Weekdays and hours (separate comparisons)
                  </option>
                  <option value="weekday">Weekdays</option>
                  <option value="hour">Hours</option>
                </select>
              </label>
              <label>
                Analysis objective
                <select value="cost_per_purchase" disabled>
                  <option value="cost_per_purchase">
                    Lowest cost per attributed purchase (CPA)
                  </option>
                </select>
              </label>
              <p className="wf-setting-help">
                ROAS remains visible as context. Aggregate revenue alone cannot
                support a ROAS confidence estimate.
              </p>
              <label>
                Probability required to propose a test
                <select
                  value={scheduling.testProbability}
                  onChange={e =>
                    onChange({
                      optimizer: {
                        ...optimizer,
                        mode: "analyze",
                        scheduling: {
                          ...scheduling,
                          testProbability: Number(e.target.value),
                        },
                      },
                    })
                  }
                >
                  {Array.from(
                    new Set([0.8, 0.9, 0.95, 0.99, scheduling.testProbability])
                  )
                    .sort((a, b) => a - b)
                    .map(v => (
                      <option key={v} value={v}>
                        {+(v * 100).toFixed(1)}%{v === 0.95 ? " (default)" : ""}
                      </option>
                    ))}
                </select>
              </label>
              {scheduling.comparison !== "hour" && (
                <label>
                  Observed dates required per weekday
                  <select
                    value={scheduling.minimumWeekdayObservations}
                    onChange={e =>
                      onChange({
                        optimizer: {
                          ...optimizer,
                          mode: "analyze",
                          scheduling: {
                            ...scheduling,
                            minimumWeekdayObservations: Number(e.target.value),
                          },
                        },
                      })
                    }
                  >
                    {Array.from({ length: 11 }, (_, i) => i + 2).map(v => (
                      <option key={v} value={v}>
                        {v} dates{v === 2 ? " (default)" : ""}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              <p className="wf-setting-help">
                These decision rules control when a test is proposed. They do
                not change the calculated confidence percentage. Missing or
                unreconciled data prevents a test recommendation.
              </p>
              <details className="wf-step-guide">
                <summary>How confidence is calculated</summary>
                <p>
                  Bayesian Gamma–Poisson model with a Jeffreys prior. Compare
                  attributed purchase counts per unit of spend across all
                  observed periods using 40,000 reproducible draws. The result
                  is the probability that the observed lowest-CPA period has the
                  best purchase efficiency under this model.
                </p>
                <p>
                  The report includes 95% CPA credible intervals. Non-random
                  delivery, changing campaigns and attribution can violate the
                  assumptions. This is not causal lift or a guarantee of future
                  performance.
                </p>
              </details>
            </>
          ) : (
            <>
              <label>
                Mode
                <select
                  value={optimizer.mode}
                  onChange={e =>
                    onChange({
                      optimizer: {
                        ...optimizer,
                        mode: e.target.value as typeof optimizer.mode,
                      },
                    })
                  }
                >
                  <option value="analyze">Analyze evidence</option>
                  <option value="analyze_generate">
                    Analyze + generate candidates
                  </option>
                </select>
              </label>
              <label>
                Verified brief
                <textarea
                  value={optimizer.brief}
                  onChange={e =>
                    onChange({
                      optimizer: { ...optimizer, brief: e.target.value },
                    })
                  }
                />
              </label>
              <p className="wf-setting-help">
                Generation uses the existing credit quote. Recommendations are
                test hypotheses and never authorize changes to campaigns or
                budgets.
              </p>
            </>
          )}
        </>
      )}
    </>
  );
}
