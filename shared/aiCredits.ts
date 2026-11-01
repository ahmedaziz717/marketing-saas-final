import { z } from "zod";
import type { ProviderRate } from "./platformAdmin";

export const creditPolicySchema = z.object({
  markupPercent: z.number().min(0).max(1000),
  creditValueMicros: z.number().int().min(100).max(1000000),
});
export type CreditPolicy = z.infer<typeof creditPolicySchema>;
export const defaultCreditPolicy: CreditPolicy = {
  markupPercent: 100,
  creditValueMicros: 10000,
};
/** Round once, at the action boundary. A 100% markup doubles cost. */
export function retailCredits(costMicros: number, policy: CreditPolicy) {
  if (!Number.isFinite(costMicros) || costMicros < 0)
    throw new Error("Provider cost is unavailable");
  return Math.ceil(
    (costMicros * (100 + policy.markupPercent)) /
      (100 * policy.creditValueMicros)
  );
}
export function rateCreditPolicy(rate: ProviderRate): CreditPolicy {
  return {
    markupPercent: rate.markupPercent ?? 100,
    creditValueMicros: rate.creditValueMicros ?? 10000,
  };
}
/** Provider credits express the dollar cost at the platform credit value. Only
 * the retail charge is rounded up; rounding wholesale first inflates markup.
 */
export function actionPriceBreakdown(costMicros: number, policy: CreditPolicy) {
  if (
    !Number.isFinite(policy.creditValueMicros) ||
    policy.creditValueMicros <= 0
  )
    throw new Error("Credit value must be positive");
  const credits = retailCredits(costMicros, policy);
  return {
    providerUsd: costMicros / 1e6,
    providerCredits: costMicros / policy.creditValueMicros,
    retailUsd: (costMicros * (1 + policy.markupPercent / 100)) / 1e6,
    retailCredits: credits,
    chargedUsd: (credits * policy.creditValueMicros) / 1e6,
  };
}
export function estimatedActionCredits(rate: ProviderRate) {
  if (rate.billingMode !== "cost") return rate.credits;
  const cost =
    rate.perRequestUsd != null
      ? Math.round(rate.perRequestUsd * 1e6)
      : rate.estimatedCostMicros;
  if (cost == null)
    throw new Error("This model needs a cost estimate before generation.");
  return retailCredits(cost, rateCreditPolicy(rate));
}
