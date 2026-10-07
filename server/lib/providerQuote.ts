import type { ProviderRate } from "../../shared/platformAdmin";
import { estimatedActionCredits } from "../../shared/aiCredits";
import { estimateHiggsfield } from "./higgsfield";
import { stableHash } from "./policy";

/** A provider cost snapshot is private. Only its retail credits reach customers. */
export async function providerRequestRate(
  rate: ProviderRate,
  endpoint: string,
  request: Record<string, unknown>
): Promise<ProviderRate> {
  const estimate = await estimateHiggsfield(endpoint, request);
  return {
    ...rate,
    perRequestUsd: estimate.costMicros / 1e6,
    estimatedCostMicros: estimate.costMicros,
    perSecondUsd: null,
    costBasis: "provider_account_estimate",
    quotedAtMs: estimate.quotedAtMs,
    requestHash: stableHash({ endpoint, request }),
  };
}

/** Check before any paid call. A changed quote requires a new customer decision. */
export function assertAcceptedPrice(
  accepted: ProviderRate,
  current: ProviderRate
) {
  if (estimatedActionCredits(accepted) !== estimatedActionCredits(current))
    throw new Error(
      "The credit price changed for these inputs. Review a new quote before generating. No generation was submitted."
    );
}
