import { storagePut } from "../storage";
import { ENV } from "../_core/env";
import { prepareCreativeOutput } from "./creativeImages";
import { REQUIRED_IMAGE_MODEL_ID } from "./models";

export type SunburstSource = {
  b64Json: string;
  mimeType?: string;
};

export type GenerateSunburstOptions = {
  prompt: string;
  originalImages?: SunburstSource[];
  quality?: "low" | "medium" | "high" | "xhigh" | "max";
  outputSize: { width: number; height: number; background: string };
  storagePrefix: string;
};

export function sunburstCanvasSize(width: number, height: number) {
  const ratio = Math.min(3, Math.max(1 / 3, width / height));
  const longEdge = 1536;
  const round16 = (value: number) =>
    Math.max(512, Math.min(1536, Math.round(value / 16) * 16));
  const modelWidth = ratio >= 1 ? longEdge : round16(longEdge * ratio);
  const modelHeight = ratio >= 1 ? round16(longEdge / ratio) : longEdge;
  return `${modelWidth}x${modelHeight}`;
}

export function requireSunburstCredential() {
  if (!ENV.openAiApiKey)
    throw new Error(
      "GPT Image 2.5 Sunburst credential is not configured for this workspace"
    );
  return ENV.openAiApiKey;
}

export async function generateSunburstImage(
  options: GenerateSunburstOptions
) {
  const apiKey = requireSunburstCredential();
  const sources = (options.originalImages ?? []).slice(0, 16);
  const endpoint = sources.length
    ? "https://api.openai.com/v1/images/edits"
    : "https://api.openai.com/v1/images/generations";
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      authorization: `Bearer ${apiKey}`,
      "content-type": "application/json",
    },
    signal: AbortSignal.timeout(8 * 60 * 1000),
    body: JSON.stringify({
      model: REQUIRED_IMAGE_MODEL_ID,
      prompt: options.prompt,
      size: sunburstCanvasSize(
        options.outputSize.width,
        options.outputSize.height
      ),
      quality: options.quality ?? "medium",
      output_format: "png",
      n: 1,
      ...(sources.length
        ? {
            images: sources.map(source => ({
              image_url: `data:${source.mimeType || "image/png"};base64,${source.b64Json}`,
            })),
          }
        : {}),
    }),
  });
  const body = await response.text();
  if (!response.ok) {
    let detail = body.slice(0, 500);
    try {
      const parsed = JSON.parse(body) as {
        error?: { code?: string; type?: string; message?: string };
      };
      detail = [parsed.error?.code, parsed.error?.type, parsed.error?.message]
        .filter(Boolean)
        .join(": ")
        .slice(0, 500);
    } catch {
      // Keep the bounded response text for the internal immutable failure record.
    }
    throw new Error(
      `GPT Image 2.5 Sunburst request failed (${response.status}): ${detail}`
    );
  }
  const parsed = JSON.parse(body) as {
    data?: Array<{ b64_json?: string }>;
  };
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
