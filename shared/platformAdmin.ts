import { z } from "zod";
export const tierInput = z.object({
  id: z.string().regex(/^[a-z][a-z0-9_-]{1,40}$/),
  name: z.string().trim().min(2).max(80),
  monthlyCredits: z.number().int().min(0).max(100000000),
  monthlyPriceUsd: z.number().min(0).max(1000000),
});
export const rateInput = z.object({
  billingMode: z.enum(["fixed", "cost"]).optional(),
  markupPercent: z.number().min(0).max(1000).nullable().optional(),
  creditValueMicros: z.number().int().positive().optional(),
  estimatedCostMicros: z
    .number()
    .int()
    .min(0)
    .max(1000000000)
    .nullable()
    .optional(),
  costRules: z
    .array(
      z.object({
        when: z.record(
          z.string(),
          z.union([z.string(), z.number(), z.boolean()])
        ),
        usd: z.number().nonnegative(),
        unit: z.enum(["image", "second", "request", "video_token"]),
      })
    )
    .optional(),
  provider: z.string().trim().min(1).max(80),
  model: z.string().trim().min(1).max(160),
  kind: z.enum(["text", "image", "video", "other"]),
  credits: z.number().int().min(0).max(1000000),
  inputPerMillion: z.number().min(0).max(1000000).nullable(),
  cachedInputPerMillion: z.number().min(0).max(1000000).nullable(),
  outputPerMillion: z.number().min(0).max(1000000).nullable(),
  perRequestUsd: z.number().min(0).max(1000000).nullable(),
  perSecondUsd: z.number().min(0).max(1000000).nullable().optional(),
  videoInputMultiplier: z.number().positive().max(100).optional(),
  imageInputPerMillion: z.number().min(0).max(1000000).nullable().optional(),
  imageOutputPerMillion: z.number().min(0).max(1000000).nullable().optional(),
  sourceUrl: z.string().url().optional(),
  automaticPricing: z.boolean().optional(),
  pricingCheckedAt: z.number().optional(),
  pricingVerifiedAt: z.number().optional(),
  pricingError: z.string().optional(),
  costBasis: z
    .enum(["provider_account_estimate", "published_rate_estimate"])
    .optional(),
  quotedAtMs: z.number().int().nonnegative().optional(),
  requestHash: z.string().max(64).optional(),
  pricingVersion: z.string().max(100).optional(),
  longContextThreshold: z.number().int().positive().nullable().optional(),
  longContextInputMultiplier: z.number().positive().max(100).optional(),
  longContextOutputMultiplier: z.number().positive().max(100).optional(),
  note: z.string().max(1000),
});
export type ProviderRate = z.infer<typeof rateInput>;
const validTokens = (n: unknown): n is number =>
  typeof n === "number" && Number.isSafeInteger(n) && n >= 0;

/** Direct Images API bills text/image inputs separately and has no cache discount.
 * Responses API image caching cannot be recovered from its usage response, so
 * do not silently apply this calculation to that API.
 */
export function estimateImageCostMicros(
  rate: ProviderRate | undefined,
  usage: Record<string, unknown>
) {
  if (!rate) return null;
  if (rate.perRequestUsd !== null)
    return Math.round(rate.perRequestUsd * 1000000);
  if (usage._evokeloop_api !== "images") return null;
  const input = usage.input_tokens_details as
    | Record<string, unknown>
    | undefined;
  const output = usage.output_tokens_details as
    | Record<string, unknown>
    | undefined;
  const textIn = input?.text_tokens,
    imageIn = input?.image_tokens;
  // Direct Images API defines output_tokens as image output. Some responses
  // provide an additional breakdown; validate it when present.
  const imageOut = output ? output.image_tokens : usage.output_tokens;
  const textOut = output ? output.text_tokens : 0;
  if (
    ![
      textIn,
      imageIn,
      imageOut,
      textOut,
      usage.input_tokens,
      usage.output_tokens,
    ].every(validTokens)
  )
    return null;
  if (
    (textIn as number) + (imageIn as number) !== usage.input_tokens ||
    (imageOut as number) + (textOut as number) !== usage.output_tokens
  )
    return null;
  const pairs = [
    [textIn, rate.inputPerMillion],
    [imageIn, rate.imageInputPerMillion],
    [imageOut, rate.imageOutputPerMillion],
    [textOut, rate.outputPerMillion],
  ];
  let micros = 0;
  for (const [count, price] of pairs) {
    if (count === 0) continue;
    if (typeof price !== "number" || !Number.isFinite(price) || price < 0)
      return null;
    micros += (count as number) * price;
  }
  return Number.isSafeInteger(Math.round(micros)) ? Math.round(micros) : null;
}
export function estimateCostMicros(
  rate: ProviderRate | undefined,
  input: number | null,
  output: number | null,
  cached = 0
) {
  if (!rate) return null;
  if (rate.perRequestUsd !== null)
    return Math.round(rate.perRequestUsd * 1000000);
  if (
    !validTokens(input) ||
    !validTokens(output) ||
    !validTokens(cached) ||
    cached > input
  )
    return null;
  if (
    input === null ||
    output === null ||
    rate.inputPerMillion === null ||
    rate.outputPerMillion === null
  )
    return null;
  const longContext =
    rate.longContextThreshold != null && input > rate.longContextThreshold;
  const inputMultiplier = longContext
    ? (rate.longContextInputMultiplier ?? 1)
    : 1;
  const outputMultiplier = longContext
    ? (rate.longContextOutputMultiplier ?? 1)
    : 1;
  return Math.round(
    ((input - cached) * rate.inputPerMillion +
      cached * (rate.cachedInputPerMillion ?? rate.inputPerMillion)) *
      inputMultiplier +
      output * rate.outputPerMillion * outputMultiplier
  );
}
export function utcCreditMonth(now = Date.now()) {
  return new Date(now).toISOString().slice(0, 7);
}
export const moneyMicros = (value: number) => Math.round(value * 1000000);
