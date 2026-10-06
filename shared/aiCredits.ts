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
