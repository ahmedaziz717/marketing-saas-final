import { z } from "zod";
export const tierInput = z.object({
  id: z.string().regex(/^[a-z][a-z0-9_-]{1,40}$/),
  name: z.string().trim().min(2).max(80),
  monthlyCredits: z.number().int().min(0).max(100000000),
  monthlyPriceUsd: z.number().min(0).max(1000000),
});
export const rateInput = z.object({
  provider: z.string().trim().min(1).max(80),
  model: z.string().trim().min(1).max(160),
  kind: z.enum(["text", "image", "other"]),
  credits: z.number().int().min(0).max(1000000),
  inputPerMillion: z.number().min(0).max(1000000).nullable(),
  cachedInputPerMillion: z.number().min(0).max(1000000).nullable(),
  outputPerMillion: z.number().min(0).max(1000000).nullable(),
  perRequestUsd: z.number().min(0).max(1000000).nullable(),
  longContextThreshold: z.number().int().positive().nullable().optional(),
  longContextInputMultiplier: z.number().positive().max(100).optional(),
  longContextOutputMultiplier: z.number().positive().max(100).optional(),
  note: z.string().max(1000),
});
export type ProviderRate = z.infer<typeof rateInput>;
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
