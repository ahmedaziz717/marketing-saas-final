import { VisualSelect, ChoiceField } from "@/components/choices/VisualSelect";
import { Button } from "./ui/button";
import { FlaskConical } from "lucide-react";
import { optimizerLibrary } from "@shared/optimizerLibrary";
import type { ExperimentPlan } from "@shared/optimizationStudioSchema";

export function OptimizationExperiments({
  plans,
  onChange,
  onAdd,
  onSource,
  onSave,
}: {
  plans: ExperimentPlan[];
  onChange: (plans: ExperimentPlan[]) => void;
  onAdd: () => void;
  onSource: (id: string) => void;
  onSave: () => void;
}) {
  const edit = (id: string, patch: Partial<ExperimentPlan>) =>
    onChange(plans.map(p => (p.id === id ? { ...p, ...patch } : p)));
  return (
    <section>
      <div className="cfg-content-title">
        <div>
          <h2>Make the next test specific</h2>
          <p>Define the control, variant and success criteria before launch.</p>
        </div>
        <Button variant="outline" disabled={plans.length >= 30} onClick={onAdd}>
          Add experiment
        </Button>
      </div>
      <p className="insight-notice">
        Plan status tracks work your team carries out. Saving or marking a plan
        ready does not launch ads or change budgets.
      </p>
      {!plans.length && (
        <div className="insight-empty">
          <FlaskConical size={28} />
          <h3>No experiments yet</h3>
          <p>
            Create one from a recommendation to retain its source evidence, or
            add a manual plan.
          </p>
        </div>
      )}
      {plans.map((p, i) => (
        <article className="optimization-experiment" key={p.id}>
          <header>
            <span className="insight-eyebrow">Experiment {i + 1}</span>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                if (window.confirm(`Remove “${p.title}” from this plan?`))
                  onChange(plans.filter(x => x.id !== p.id));
              }}
            >
              Remove
            </Button>
          </header>
          <div className="insight-form-grid">
            <label className="insight-label">
              Experiment title
              <input
                aria-label={`Experiment ${i + 1} title`}
                value={p.title}
                maxLength={160}
                onChange={e => edit(p.id, { title: e.target.value })}
              />
            </label>
            <ChoiceField className="insight-label">
              Plan status
              <VisualSelect
                aria-label={`Experiment ${i + 1} status`}
                value={p.status}
                onChange={e =>
                  edit(p.id, {
                    status: e.target.value as ExperimentPlan["status"],
                  })
                }
              >
                <option value="draft">Draft</option>
                <option value="ready">Ready for review</option>
                <option value="in_progress">In progress externally</option>
                <option value="concluded">Concluded</option>
              </VisualSelect>
            </ChoiceField>
            <label className="insight-label insight-full">
              Hypothesis
              <textarea
                rows={3}
                maxLength={3000}
                placeholder="Changing X should improve Y because…"
                value={p.hypothesis}
                onChange={e => edit(p.id, { hypothesis: e.target.value })}
              />
            </label>
            <label className="insight-label">
              Control
              <textarea
                rows={3}
                maxLength={2000}
                placeholder="Current version and settings held constant"
                value={p.control}
                onChange={e => edit(p.id, { control: e.target.value })}
              />
            </label>
            <label className="insight-label">
              Variant
              <textarea
                rows={3}
                maxLength={2000}
                placeholder="The single change to test"
                value={p.variant}
                onChange={e => edit(p.id, { variant: e.target.value })}
              />
            </label>
            <ChoiceField className="insight-label">
              Primary metric
              <VisualSelect
                value={p.metric}
                onChange={e =>
                  edit(p.id, {
                    metric: e.target.value as ExperimentPlan["metric"],
                  })
                }
              >
                {Object.entries({
                  purchase_cpa: "Cost per purchase",
                  roas: "ROAS",
                  ctr: "Click-through rate",
                  conversion_rate: "Conversion rate",
                }).map(([key, label]) => (
                  <option key={key} value={key}>
                    {label}
                  </option>
                ))}
              </VisualSelect>
            </ChoiceField>
            <label className="insight-label">
              Planned duration (days)
              <input
                type="number"
                min={7}
                max={90}
                value={p.durationDays}
                onChange={e =>
                  edit(p.id, { durationDays: Number(e.target.value) })
                }
              />
            </label>
            <label className="insight-label insight-full">
              Decision rule & guardrails
              <textarea
                rows={3}
                maxLength={2000}
                placeholder="Define the improvement needed, minimum sample, spend limit and when to call the result inconclusive."
                value={p.decisionRule}
                onChange={e => edit(p.id, { decisionRule: e.target.value })}
              />
            </label>
            <label className="insight-label insight-full">
              Observed outcome & notes
              <textarea
                rows={3}
                maxLength={4000}
                placeholder="Record measured results, dates and limitations after the test."
                value={p.outcome}
                onChange={e => edit(p.id, { outcome: e.target.value })}
              />
            </label>
            <ChoiceField className="insight-label">
              Recorded decision
              <VisualSelect
                value={p.decision}
                onChange={e =>
                  edit(p.id, {
                    decision: e.target.value as ExperimentPlan["decision"],
                  })
                }
              >
                <option value="undecided">Not decided</option>
                <option value="inconclusive">Inconclusive</option>
                <option value="keep_control">Keep control</option>
                <option value="adopt_variant">
                  Recommend adopting variant
                </option>
              </VisualSelect>
            </ChoiceField>
          </div>
          {p.source ? (
            <Button variant="link" onClick={() => onSource(p.source!.runId)}>
              View source evidence ·{" "}
              {optimizerLibrary[p.source.kind].name.replace(" optimizer", "")}
            </Button>
          ) : (
            <p className="insight-caption">
              Manual plan · no measured evidence linked
            </p>
          )}
        </article>
      ))}
      {plans.length > 0 && (
        <Button onClick={onSave}>Save experiment plans</Button>
      )}
    </section>
  );
}
