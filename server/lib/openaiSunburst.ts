import { meteredCall } from "./aiMetering";
import { storagePut, storageClient, assetBucket } from "../storage";
import { libraryDatabase } from "./assetLibrary";
import { imageModelQuote } from "./modelCatalog";
import { imageProviderSize } from "../../shared/imageActionEstimate";
import {
  modelRequestBody,
  referenceCapacity,
  generationModel,
  DEFAULT_IMAGE_MODEL,
  type ModelOptions,
} from "../../shared/modelCatalog";
import type { ProviderRate } from "../../shared/platformAdmin";
import {
  submitHiggsfield,
  pollHiggsfield,
  providerUrls,
  downloadVideo,
  HiggsfieldError,
} from "./higgsfield";
import { ENV } from "../_core/env";
import { prepareCreativeOutput } from "./creativeImages";
import { REQUIRED_IMAGE_MODEL_ID } from "./models";

export type SunburstSource = {
  b64Json: string;
  mimeType?: string;
};

export type GenerateSunburstOptions = {
  rateSnapshot?: ProviderRate;
  modelId?: string;
  modelOptions?: ModelOptions;
  prompt: string;
  originalImages?: SunburstSource[];
  quality?: "low" | "medium" | "high" | "xhigh" | "max";
  outputSize: { width: number; height: number; background: string };
  storagePrefix: string;
};

export function sunburstCanvasSize(width: number, height: number) {
  return imageProviderSize("gpt-image-2.5-sunburst", width, height);
}

export function requireSunburstCredential() {
  if (!ENV.openAiApiKey)
    throw new Error(
      "GPT Image 2.5 Sunburst credential is not configured for this workspace"
    );
  return ENV.openAiApiKey;
}

export async function generateSunburstImage(options: GenerateSunburstOptions) {
  const quote = options.rateSnapshot
    ? {
        model: generationModel(options.modelId ?? DEFAULT_IMAGE_MODEL)!,
        rate: options.rateSnapshot,
        credits: 0,
      }
    : await imageModelQuote(
        await libraryDatabase(),
        options.modelId,
        generationModel(options.modelId ?? DEFAULT_IMAGE_MODEL)?.provider ===
          "openai"
          ? {
              ...options.modelOptions,
              quality:
                options.modelOptions?.quality ?? options.quality ?? "medium",
            }
          : options.modelOptions,
        options.outputSize
      );
  if (
    !quote.model ||
    quote.model.kind !== "image" ||
    quote.rate.provider !== quote.model.provider ||
    quote.rate.model !== quote.model.providerModel
  )
    throw new Error("The saved model price does not match this request.");
  const model = quote.model;
  if (model.provider === "higgsfield")
    return generateHiggsfieldImage(options, quote);
  const apiKey = requireSunburstCredential();
  const sources = options.originalImages ?? [];
  if (sources.length > 16)
    throw new Error("Choose no more than 16 image references.");
  const endpoint = sources.length
    ? "https://api.openai.com/v1/images/edits"
    : "https://api.openai.com/v1/images/generations";
  const parsed = await meteredCall(
    "openai",
    model.providerModel,
    "image",
    async () => {
      const legacy = model.providerModel.startsWith("gpt-image-1");
      const size = imageProviderSize(
        model.providerModel,
        options.outputSize.width,
        options.outputSize.height
      );
      const quality = String(
        options.modelOptions?.quality ?? options.quality ?? "medium"
      );
      const payload = {
        model: model.providerModel,
        prompt: options.prompt,
        size,
        quality,
        output_format: "png",
        n: 1,
        ...(sources.length
          ? {
              images: sources.map(source => ({
                image_url: `data:${source.mimeType || "image/png"};base64,${source.b64Json}`,
              })),
            }
          : {}),
      };
      let body: BodyInit = JSON.stringify(payload);
      if (legacy && sources.length) {
        const form = new FormData();
        for (const [key, value] of Object.entries(payload))
          if (key !== "images") form.set(key, String(value));
        for (const source of sources)
          form.append(
            "image[]",
            new Blob([new Uint8Array(Buffer.from(source.b64Json, "base64"))], {
              type: source.mimeType || "image/png",
            }),
            "reference.png"
          );
        body = form;
      }
      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          authorization: `Bearer ${apiKey}`,
          ...(!(legacy && sources.length)
            ? { "content-type": "application/json" }
            : {}),
        },
        signal: AbortSignal.timeout(8 * 60 * 1000),
        body,
      });
      const responseBody = await response.text();
      if (!response.ok) {
        let detail = responseBody.slice(0, 500);
        try {
          const parsed = JSON.parse(responseBody) as {
            error?: { code?: string; type?: string; message?: string };
          };
          detail = [
            parsed.error?.code,
            parsed.error?.type,
            parsed.error?.message,
          ]
            .filter(Boolean)
            .join(": ")
            .slice(0, 500);
        } catch {
          // Keep the bounded response text for the internal immutable failure record.
        }
        throw new Error(
          `Image generation request failed (${response.status}): ${detail}`
        );
      }
      const parsed = JSON.parse(responseBody) as {
        data?: Array<{ b64_json?: string }>;
        usage?: Record<string, unknown>;
      };
      if (!parsed.data?.[0]?.b64_json)
        throw new Error("Image provider returned no image");
      return {
        value: parsed,
        usage: { ...parsed.usage, _evokeloop_api: "images" },
      };
    },
    { rateSnapshot: quote.rate }
  );
  const encoded = parsed.data?.[0]?.b64_json;
  if (!encoded)
    throw new Error("GPT Image 2.5 Sunburst returned no image data");
  const output = await prepareCreativeOutput(
    Buffer.from(encoded, "base64"),
    options.outputSize
  );
  const stored = await storagePut(
    `${options.storagePrefix}/${Date.now()}.png`,
    output,
    "image/png"
  );
  return { url: stored.url, storageKey: stored.key };
}

async function generateHiggsfieldImage(
  options: GenerateSunburstOptions,
  quote: Awaited<ReturnType<typeof imageModelQuote>>
) {
  const sources = options.originalImages ?? [];
  if (sources.length > referenceCapacity(quote.model))
    throw new Error(
      `${quote.model.name} supports ${referenceCapacity(quote.model)} reference images. Choose another model for this creative.`
    );
  const urls: string[] = [];
  for (const [index, source] of Array.from(sources.entries())) {
    const stored = await storagePut(
      `${options.storagePrefix}/reference-${index}.png`,
      Buffer.from(source.b64Json, "base64"),
      source.mimeType || "image/png"
    );
    const { data, error } = await storageClient()
      .storage.from(assetBucket())
      .createSignedUrl(stored.key, 86400);
    if (error || !data?.signedUrl)
      throw new Error("Could not prepare the reference image.");
    urls.push(data.signedUrl);
  }
  const request = modelRequestBody(quote.model, {
    prompt: options.prompt,
    images: urls,
    options: options.modelOptions ?? {},
  });
  const bytes = await meteredCall(
    "higgsfield",
    quote.model.providerModel,
    "image",
    async context => {
      let requestId: string | undefined;
      try {
        await context.record({
          idempotencyKey: context.id,
          costBasis: "published_rate_estimate",
        });
        let result = await submitHiggsfield(
          quote.model.providerModel,
          request,
          context.id
        );
        requestId = result.request_id;
        await context.record({
          providerRequestId: requestId,
          idempotencyKey: context.id,
          costBasis: "published_rate_estimate",
        });
        const deadline = Date.now() + 8 * 60 * 1000;
        while (
          ["queued", "in_progress"].includes(result.status) &&
          Date.now() < deadline
        ) {
          await new Promise(resolve => setTimeout(resolve, 3000));
          result = await pollHiggsfield(
            requestId,
            providerUrls(result).providerStatusUrl
          );
        }
        if (["failed", "nsfw", "canceled"].includes(result.status))
          throw new Error(
            "The image provider declined or failed this request. Credits were refunded."
          );
        if (result.status !== "completed" || !result.images?.[0]?.url)
          throw Object.assign(
            new Error(
              "The image request needs reconciliation. Its provider request is saved; do not submit another paid request."
            ),
            { keepReservation: true }
          );
        const output = await downloadVideo(result.images[0].url);
        return {
          value: output,
          usage: {
            providerRequestId: requestId,
            costBasis: "published_rate_estimate",
          },
        };
      } catch (error) {
        if (
          (error instanceof HiggsfieldError && error.ambiguous) ||
          (requestId &&
            !(error instanceof Error && error.message.includes("refunded")))
        )
          throw Object.assign(
            new Error(
              "The image request needs administrator review. Its provider request is saved and credits remain reserved."
            ),
            { keepReservation: true }
          );
        throw error;
      }
    },
    { rateSnapshot: quote.rate }
  );
  const output = await prepareCreativeOutput(bytes, options.outputSize);
  const stored = await storagePut(
    `${options.storagePrefix}/${Date.now()}.png`,
    output,
    "image/png"
  );
  return { url: stored.url, storageKey: stored.key };
}
