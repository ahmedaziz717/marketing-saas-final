import { z } from "zod";
import type { ProviderRate } from "./platformAdmin";

/** Explicit estimate assumptions, never measured provider usage. */
export const imageActionAssumptionsSchema = z.object({
  quality: z.enum(["low", "medium", "high", "xhigh", "max"]),
  size: z
    .string()
    .regex(/^\d{3,4}x\d{3,4}$/)
    .refine(value => {
      const [w, h] = value.split("x").map(Number);
      return (
        w % 16 === 0 &&
        h % 16 === 0 &&
        w * h >= 655360 &&
        w * h <= 8294400 &&
        Math.max(w, h) <= 3840 &&
        Math.max(w, h) / Math.min(w, h) <= 3
      );
    }, "Choose supported image dimensions."),
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
export const imageOutputSizeSchema = z.object({
  width: z.number().int().min(1).max(10000),
  height: z.number().int().min(1).max(10000),
});
export type ImageOutputSize = z.infer<typeof imageOutputSizeSchema>;
export function workflowImageSize(ratio: string): ImageOutputSize {
  const sizes: Record<string, ImageOutputSize> = {
    "1:1": { width: 1080, height: 1080 },
    "4:5": { width: 1080, height: 1350 },
    "9:16": { width: 1080, height: 1920 },
    "16:9": { width: 1920, height: 1080 },
  };
  if (sizes[ratio]) return sizes[ratio];
  const [w, h] = ratio.split(":").map(Number);
  return {
    width: 1080,
    height: w > 0 && h > 0 ? Math.round((1080 * h) / w) : 1080,
  };
}

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
    const factors: Partial<Record<ImageActionAssumptions["quality"], number>> =
      model === "gpt-image-2"
        ? { low: 16, medium: 48, high: 96 }
        : { low: 16, medium: 24, high: 48, xhigh: 64, max: 96 };
    const longFactor = factors[setup.quality];
    if (!longFactor)
      throw new Error("This model does not support the selected quality.");
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
    if (setup.quality === "xhigh" || setup.quality === "max")
      throw new Error("This model does not support the selected quality.");
    const counts = {
      low: { "1024x1024": 272, "1024x1536": 408, "1536x1024": 400 },
      medium: { "1024x1024": 1056, "1024x1536": 1584, "1536x1024": 1568 },
      high: { "1024x1024": 4160, "1024x1536": 6240, "1536x1024": 6208 },
    };
    return {
      tokens: legacyValue(counts[setup.quality], setup.size),
      source: "OpenAI output-token table",
      approximateTokens: false,
    };
  }
  if (model === "gpt-image-1-mini") {
    if (setup.quality === "xhigh" || setup.quality === "max")
      throw new Error("This model does not support the selected quality.");
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
      tokens: (legacyValue(usd[setup.quality], setup.size) * 1000000) / 8,
      source: "Approximation from Mini's published image prices",
      approximateTokens: true,
    };
  }
  throw new Error("This model needs a verified image output estimate.");
}

function legacyValue(values: Record<string, number>, size: string) {
  if (values[size] == null)
    throw new Error("This model does not support the selected dimensions.");
  return values[size];
}

/** Matches the canvas actually sent to the image provider. */
export function imageProviderSize(
  model: string,
  width: number,
  height: number
) {
  if (model.startsWith("gpt-image-1"))
    return width === height
      ? "1024x1024"
      : width > height
        ? "1536x1024"
        : "1024x1536";
  const ratio = Math.min(3, Math.max(1 / 3, width / height));
  const round16 = (n: number) =>
    Math.max(512, Math.min(1536, Math.round(n / 16) * 16));
  return ratio >= 1
    ? `1536x${round16(1536 / ratio)}`
    : `${round16(1536 * ratio)}x1536`;
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
