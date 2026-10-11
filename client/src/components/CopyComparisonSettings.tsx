import { copyComparisonSchema } from "@shared/copyEvidence";
import type { WorkflowNode } from "@shared/creativeWorkflow";
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
      <label>
        Comparison objective
        <select
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
        </select>
      </label>
      <label>
        Minimum impressions per style
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
        Minimum purchases per style
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
        Uses the existing text-rule classifier. Inspect the actual copy and
        source ads in the report. Differences are descriptive, not proof that a
        style caused sales. This comparison uses 0 AI credits.
      </p>
    </>
  );
}
