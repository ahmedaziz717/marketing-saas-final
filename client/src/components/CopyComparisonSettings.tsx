import { VisualSelect, ChoiceField } from "@/components/choices/VisualSelect";
import { copyComparisonSchema } from "@shared/copyEvidence";
import type { WorkflowNode } from "@shared/creativeWorkflow";
import { copyDimensions, copyTaxonomy } from "@shared/copyTaxonomy";
import { CopyTaxonomyReference } from "./CopyTags";
export function CopyComparisonSettings({
  node,
  onChange,
}: {
  node: WorkflowNode;
  onChange: (config: Partial<WorkflowNode["config"]>) => void;
}) {
  const settings = copyComparisonSchema.parse(node.config.copyComparison ?? {});
  return (
    <>
      <fieldset>
        <legend>Dimensions to compare</legend>
        {copyDimensions.map(d => (
          <label key={d} className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={settings.dimensions.includes(d)}
              disabled={
                settings.dimensions.length === 1 &&
                settings.dimensions.includes(d)
              }
              onChange={e =>
                onChange({
                  copyComparison: {
                    ...settings,
                    dimensions: e.target.checked
                      ? [...settings.dimensions, d]
                      : settings.dimensions.filter(v => v !== d),
                  },
                })
              }
            />
            {copyTaxonomy[d].label}
          </label>
        ))}
      </fieldset>
      <ChoiceField>
        Comparison objective
        <VisualSelect
          value={settings.objective}
          onChange={e =>
            onChange({
              copyComparison: {
                ...settings,
                objective: e.target.value as "cpa" | "roas",
              },
            })
          }
        >
          <option value="cpa">Lowest purchase CPA</option>
          <option value="roas">Highest purchase ROAS</option>
        </VisualSelect>
      </ChoiceField>
      <label>
        Minimum impressions per value
        <input
          type="number"
          min={0}
          max={1000000}
          value={settings.minimumImpressions}
          onChange={e =>
            onChange({
              copyComparison: {
                ...settings,
                minimumImpressions: Math.max(
                  0,
                  Math.min(1000000, Math.trunc(Number(e.target.value)))
                ),
              },
            })
          }
        />
      </label>
      <label>
        Minimum purchases per value
        <input
          type="number"
          min={1}
          max={10000}
          value={settings.minimumPurchases}
          onChange={e =>
            onChange({
              copyComparison: {
                ...settings,
                minimumPurchases: Math.max(
                  1,
                  Math.min(10000, Math.trunc(Number(e.target.value)))
                ),
              },
            })
          }
        />
      </label>
      <p className="wf-setting-help">
        Tags every copy field and variant using the shared value sets and
        explicit text signals. All dimensions are tagged; selected dimensions
        control the performance comparisons. Inspect the evidence in the report.
        Differences are descriptive, not proof of a copy effect. Uses 0 AI
        credits.
      </p>
      <CopyTaxonomyReference />
    </>
  );
}
