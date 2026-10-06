import { z } from "zod";
import type { ProviderRate } from "./platformAdmin";

/** A comparison scenario, never a measurement or a credit reservation. */
export const imageActionAssumptionsSchema = z.object({
  quality: z.enum(["low", "medium", "high"]),
  size: z.enum(["1024x1024", "1024x1536", "1536x1024"]),
  textInputTokens: z.number().int().min(0).max(1000000),
  imageInputTokens: z.number().int().min(0).max(1000000),
});
export type ImageActionAssumptions = z.infer<
  typeof imageActionAssumptionsSchema
>;
export const defaultImageActionAssumptions: ImageActionAssumptions = {
  quality: "medium",
  size: "1024x1024",
  textInputTokens: 1000,
  imageInputTokens: 0,
};
export const imageEstimateSource =
  "https://developers.openai.com/api/docs/guides/image-generation#cost-and-latency";

/** Checked against OpenAI's image-generation guide and its public calculator
 * on 2026-10-06. These predict output only; input tokens are separate.
 * Image 2.5 has its own quality factors, not Image 2's factors.
 */
function outputEstimate(model: string, setup: ImageActionAssumptions) {
  const [width, height] = setup.size.split("x").map(Number);
  if (
    ["gpt-image-2", "gpt-image-2.5-sunburst", "gpt-image-2.5-flare"].includes(
      model
    )
  ) {
    const factors =
      model === "gpt-image-2"
        ? { low: 16, medium: 48, high: 96 }
        : { low: 16, medium: 24, high: 48 };
    const longFactor = factors[setup.quality];
    const short =
      (longFactor * Math.min(width, height)) / Math.max(width, height);
    const floor = Math.floor(short);
    // The published calculator uses ties-to-even for the shorter dimension.
    const shortFactor =
      short - floor === 0.5 ? floor + (floor % 2) : Math.round(short);
    return {
      tokens: Math.ceil(
        (longFactor * shortFactor * (2000000 + width * height)) / 4000000
      ),
      source: "OpenAI output-token calculator",
      approximateTokens: false,
    };
  }
  if (model === "gpt-image-1" || model === "gpt-image-1.5") {
    const counts = {
      low: { "1024x1024": 272, "1024x1536": 408, "1536x1024": 400 },
      medium: { "1024x1024": 1056, "1024x1536": 1584, "1536x1024": 1568 },
      high: { "1024x1024": 4160, "1024x1536": 6240, "1536x1024": 6208 },
    };
    return {
      tokens: counts[setup.quality][setup.size],
      source: "OpenAI output-token table",
      approximateTokens: false,
    };
  }
  if (model === "gpt-image-1-mini") {
    // Mini's published image prices differ from the older-model token table.
    // Derive an approximate token equivalent from Mini's OWN output prices
    // ($8 / 1M when verified), then apply the current stored output rate.
    // Never present the resulting count as measured/official token usage.
    const usd = {
      low: { "1024x1024": 0.005, "1024x1536": 0.006, "1536x1024": 0.006 },
      medium: { "1024x1024": 0.011, "1024x1536": 0.015, "1536x1024": 0.015 },
      high: { "1024x1024": 0.036, "1024x1536": 0.052, "1536x1024": 0.052 },
    };
    return {
      tokens: (usd[setup.quality][setup.size] * 1000000) / 8,
      source: "Approximation from Mini's published image prices",
      approximateTokens: true,
    };
  }
  throw new Error("This model needs a verified image output estimate.");
}

export function estimateOpenAIImageAction(
  rate: ProviderRate,
  assumptions: ImageActionAssumptions = defaultImageActionAssumptions
) {
  const setup = imageActionAssumptionsSchema.parse(assumptions);
  if (rate.provider !== "openai" || rate.kind !== "image")
    throw new Error("Choose an OpenAI image model.");
  const output = outputEstimate(rate.model, setup);
  const component = (tokens: number, perMillion: number | null | undefined) => {
    if (tokens === 0) return 0;
    if (perMillion == null || !Number.isFinite(perMillion) || perMillion < 0)
      throw new Error("Verified token pricing is required.");
    // Tokens × USD / million tokens = microdollars.
    return tokens * perMillion;
  };
  const textInputMicros = component(
    setup.textInputTokens,
    rate.inputPerMillion
  );
  const imageInputMicros = component(
    setup.imageInputTokens,
    rate.imageInputPerMillion
  );
  const imageOutputMicros = component(
    output.tokens,
    rate.imageOutputPerMillion
  );
  return {
    costMicros: Math.round(
      textInputMicros + imageInputMicros + imageOutputMicros
    ),
    textInputMicros,
    imageInputMicros,
    imageOutputMicros,
    outputTokens: output.tokens,
    approximateOutputTokens: output.approximateTokens,
    source: output.source,
    sourceUrl: imageEstimateSource,
    assumptions: setup,
  };
}
