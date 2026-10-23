import { systemPromptContract } from "../../shared/promptContracts";
import { createHash } from "node:crypto";
import { z } from "zod";
import { invokeLLM } from "../_core/llm";
import { storageClient, assetBucket } from "../storage";
import { REQUIRED_TEXT_MODEL_ID } from "./models";
import type { BuilderBrandKit } from "./creativeBuilder";
import { applicationPrompt } from "./promptRegistry";

export const BRAND_SUMMARY_FAILED =
  "The brand voice summary could not be prepared safely. Your full brand guide is unchanged. Please retry, or save a more concise guide before generating.";
const VERSION = 1;
const fields = [
  "identity",
  "audience",
  "tone",
  "messagingPriorities",
  "doRules",
  "dontRules",
  "constraints",
] as const;
const summarySchema = z
  .object(
    Object.fromEntries(
      fields.map(key => [key, z.string().min(1).max(1800)])
    ) as Record<(typeof fields)[number], z.ZodString>
  )
  .strict()
  .refine(value => JSON.stringify(value).length <= 6000);
const inFlight = new Map<string, Promise<string>>();

export function brandSummaryKey(
  organizationId: number,
  brand: BuilderBrandKit,
  template = ""
) {
  if (!Number.isSafeInteger(organizationId) || organizationId <= 0)
    throw new Error(BRAND_SUMMARY_FAILED);
  const hash = createHash("sha256")
    .update(
      JSON.stringify({
        version: VERSION,
        model: REQUIRED_TEXT_MODEL_ID,
        template,
        name: brand.name,
        voice: brand.voice,
        requiredClaims: brand.requiredClaims,
        prohibitedContent: brand.prohibitedContent,
      })
    )
    .digest("hex");
  return `org-${organizationId}/brand-summaries/v${VERSION}-${hash}.json`;
}

async function prepare(key: string, brand: BuilderBrandKit): Promise<string> {
  const bucket = storageClient().storage.from(assetBucket());
  const cached = await bucket.download(key);
  if (!cached.error && cached.data)
    return JSON.stringify(
      summarySchema.parse(JSON.parse(await cached.data.text()))
    );
  // Do not turn a storage outage or authorization failure into repeated AI costs.
  if (cached.error && String(cached.error.statusCode) !== "404")
    throw new Error(BRAND_SUMMARY_FAILED);
  const result = await invokeLLM({
    promptTemplateId: "brand.summary",
    model: REQUIRED_TEXT_MODEL_ID,
    includedInAction: true,
    maxTokens: 4000,
    reasoning: { effort: "low" },
    messages: [
      {
        role: "system",
        content: systemPromptContract("contract.brandVoiceSummary.1"),
      },
      {
        role: "user",
        content: JSON.stringify({
          name: brand.name,
          guide: brand.voice,
          requiredClaims: brand.requiredClaims,
          prohibitedContent: brand.prohibitedContent,
        }),
      },
    ],
    response_format: {
      type: "json_schema",
      json_schema: {
        name: "brand_voice_summary",
        strict: true,
        schema: {
          type: "object",
          additionalProperties: false,
          required: [...fields, "cannotSummarize"],
          properties: {
            ...Object.fromEntries(fields.map(key => [key, { type: "string" }])),
            cannotSummarize: { type: "boolean" },
          },
        },
      },
    },
  });
  const content = result.choices[0]?.message.content;
  if (
    typeof content !== "string" ||
    result.choices[0]?.finish_reason !== "stop"
  )
    throw new Error(BRAND_SUMMARY_FAILED);
  const { cannotSummarize, ...raw } = JSON.parse(content);
  if (cannotSummarize !== false) throw new Error(BRAND_SUMMARY_FAILED);
  const summary = JSON.stringify(summarySchema.parse(raw));
  const saved = await bucket.upload(key, Buffer.from(summary), {
    contentType: "application/json",
    upsert: false,
  });
  // Another worker may have populated the same immutable content-addressed cache.
  if (saved.error && String(saved.error.statusCode) !== "409")
    throw new Error(BRAND_SUMMARY_FAILED);
  return summary;
}

/** Return a derived copy only; never update the saved kit or queued source snapshot. */
export async function generationBrand(
  organizationId: number,
  brand: BuilderBrandKit
): Promise<BuilderBrandKit> {
  if (!brand.voice || brand.voice.length <= 2000) return brand;
  const template = await applicationPrompt("brand.summary", organizationId);
  const key = brandSummaryKey(
    organizationId,
    brand,
    `${template.version}:${template.value}`
  );
  let pending = inFlight.get(key);
  if (!pending) {
    pending = prepare(key, brand).catch(() => {
      throw new Error(BRAND_SUMMARY_FAILED);
    });
    inFlight.set(key, pending);
  }
  try {
    return { ...brand, voice: await pending };
  } finally {
    if (inFlight.get(key) === pending) inFlight.delete(key);
  }
}
