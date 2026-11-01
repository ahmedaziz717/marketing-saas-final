import type { ModelDefinition, ModelOptions } from "../../shared/modelCatalog";
import { modelDefaults, requiresVideo } from "../../shared/modelCatalog";
import type { ProviderRate } from "../../shared/platformAdmin";
import {
  estimatedActionCredits,
  retailCredits,
  rateCreditPolicy,
} from "../../shared/aiCredits";
import { defaultVideoSetup } from "../../shared/videoCreation";
import { videoWithModel } from "../../shared/creativeConfigurator";
import { configuredModelRate } from "./modelCatalog";
import { videoQuote } from "./videoPricing";
import { imageProviderSize } from "../../shared/imageActionEstimate";
import { providerDiscount } from "./seedancePricing";

/** Planning estimate only. The existing exact-request acceptance remains the generation gate. */
export function studioPlanningEstimate(
  model: ModelDefinition,
  base: ProviderRate,
  options: ModelOptions,
  outputs: Array<{ width: number; height: number }>,
  sourceSeconds?: number
) {
  const configured = configuredModelRate(model, base, options);
  const discount = model.provider === "higgsfield" ? providerDiscount(base) : 0;
  const discounted = (cost: number | null, fallback: number) =>
    cost == null
      ? fallback
      : retailCredits(
          Math.round(cost * (1 - discount / 100)),
          rateCreditPolicy(configured)
        );
  if (model.kind === "image") {
    const credits = outputs.reduce((total, output) => {
      // Same supported-canvas normalization as imageModelQuote, supplied by caller.
      const rate = configuredModelRate(
        model,
        base,
        options,
        imageProviderSize(model.providerModel, output.width, output.height)
      );
      const cost =
        rate.perRequestUsd != null
          ? Math.round(rate.perRequestUsd * 1e6)
          : (rate.estimatedCostMicros ?? null);
      return total + discounted(cost, estimatedActionCredits(rate));
    }, 0);
    return {
      credits,
      estimated: true as const,
      assumptions: "Estimate for your selected model, quality and sizes",
    };
  }
  const source = requiresVideo(model),
    seconds = sourceSeconds ?? 5;
  const setup = videoWithModel(
    { ...defaultVideoSetup, sourceVideoKey: source ? "asset:1" : null },
    model,
    { ...modelDefaults(model), ...options }
  );
  const quote = videoQuote(
    setup,
    source
      ? [
          {
            key: "asset:1",
            name: "Duration estimate",
            storageKey: "",
            fingerprint: "",
            mimeType: "video/mp4",
            durationSeconds: seconds,
            width: 1280,
            height: 720,
          },
        ]
      : [],
    configured
  );
  return {
    credits: discounted(quote.costMicros, quote.credits),
    estimated: true as const,
    assumptions:
      source && sourceSeconds === undefined
        ? "Estimate includes a 5-second source clip; updates after selection"
        : "Estimate for your duration, resolution and audio settings",
  };
}
