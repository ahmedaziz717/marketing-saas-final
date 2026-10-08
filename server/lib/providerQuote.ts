import type { ProviderRate } from "../../shared/platformAdmin";
import { estimatedActionCredits } from "../../shared/aiCredits";
import {
  estimateHiggsfield,
  HiggsfieldQuoteUnavailableError,
} from "./higgsfield";
import {
  seedanceDescriptionEstimate,
  type VideoPricingContext,
} from "./seedancePricing";
import { stableHash } from "./policy";

/** A provider cost snapshot is private. Only its retail credits reach customers. */
export async function providerRequestRate(
  rate: ProviderRate,
  endpoint: string,
  request: Record<string, unknown>,
  context?: VideoPricingContext
): Promise<ProviderRate> {
  let estimate: { costMicros: number; quotedAtMs: number };
  try {
    estimate = await estimateHiggsfield(endpoint, request);
  } catch (error) {
    if (
      !(error instanceof HiggsfieldQuoteUnavailableError) ||
      !error.pricingDescription
    )
      throw error;
    const calculation = seedanceDescriptionEstimate(
      endpoint,
      request,
      error.pricingDescription,
      rate,
      context
    );
    if (!calculation) throw error;
    const { costMicros, ...pricingCalculation } = calculation;
    return {
      ...rate,
      perRequestUsd: costMicros / 1e6,
      estimatedCostMicros: costMicros,
      perSecondUsd: null,
      costBasis: "published_rate_estimate",
      quotedAtMs: Date.now(),
      pricingCalculation,
      pricingVersion: `higgsfield-formula-${stableHash(error.pricingDescription).slice(0, 16)}`,
      requestHash: stableHash({ endpoint, request, context }),
      sourceUrl: `https://open.higgsfield.ai/models/${endpoint}/playground`,
    };
  }
  return {
    ...rate,
    perRequestUsd: estimate.costMicros / 1e6,
    estimatedCostMicros: estimate.costMicros,
    perSecondUsd: null,
    costBasis: "provider_account_estimate",
    pricingCalculation: undefined,
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
