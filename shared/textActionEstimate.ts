import { estimateCostMicros, type ProviderRate } from "./platformAdmin";

/** Representative token budgets based on measured text actions. Prices stay
 * tied to the current model rate and credit policy, not fixed credit amounts.
 * These are estimates, not limits; billing settles against reported usage.
 */
export const textActionBudgets = {
  standard: { input: 2000, output: 400 },
  short_response: { input: 400, output: 200 },
  video_prompt: { input: 2000, output: 400 },
  ad_copy: { input: 1800, output: 650 },
  copy_optimization: { input: 5200, output: 1100 },
  field_assistance: { input: 350, output: 420 },
} as const;
export type TextAction = keyof typeof textActionBudgets;

export function textActionForOperation(operation?: string): TextAction {
  switch (operation) {
    case "workflow.assistant":
      return "short_response";
    case "video.draftPrompt":
      return "video_prompt";
    case "channels.draftAssetCopy":
    case "channels.draftCaptions":
      return "ad_copy";
    case "workflow.optimize_copy":
      return "copy_optimization";
    case "workflows.assistInput":
      return "field_assistance";
    default:
      return "standard";
  }
}

export function textActionRate(
  rate: ProviderRate,
  action: TextAction
): ProviderRate {
  const budget = textActionBudgets[action];
  const cost = estimateCostMicros(rate, budget.input, budget.output);
  return cost == null ? rate : { ...rate, estimatedCostMicros: cost };
}
