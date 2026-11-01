import { systemPromptContract } from "../../shared/promptContracts";
import sharp from "sharp";
import {
  constrainProductLayer,
  resolveProductAlignment,
  type ProductOverlayPlacement,
  type ProductOverlayFailureDiagnostic,
} from "../../shared/productOverlay";
import type { ProductCutout } from "./productPreservation";
import { z } from "zod";
import { invokeLLM, listLLMModels } from "../_core/llm";
import { requireLatestGptTextModel } from "./models";

export class ProductOverlayResolutionError extends Error {
  placements?: ProductOverlayPlacement[];
}

export class ProductOverlayFailureError extends Error {
  constructor(
    message: string,
    readonly diagnostic: ProductOverlayFailureDiagnostic
  ) {
    super(message);
  }
}

/** Persist only allowlisted codes and bounded measurements, never provider text or source URLs. */
export function productOverlayFailureDiagnostic(
  error: unknown,
  stage: ProductOverlayFailureDiagnostic["stage"]
): ProductOverlayFailureDiagnostic {
  if (error instanceof ProductOverlayFailureError) return error.diagnostic;
  if (error instanceof ProductOverlayResolutionError)
    return { stage: "render", reason: "source_resolution" };
  return {
    stage,
    reason:
      stage === "source_read"
        ? "source_read_failed"
        : stage === "storage"
          ? "storage_failed"
          : stage === "render"
            ? "render_failed"
            : "alignment_failed",
  };
}

/** Use decoded canvas AND usable artwork. Padding alone cannot qualify a thumbnail.
 * Limit resampling on both axes, including independently stretched footprints. */
export function automaticProductUpscaleAllowed(
  source: ProductCutout,
  layer: ProductOverlayPlacement
) {
  const scaleX = layer.width / source.width;
  const scaleY =
    (layer.height ?? (layer.width * source.height) / source.width) /
    source.height;
  if (scaleX <= 1 && scaleY <= 1) return true;
  return (
    Math.max(
      source.originalWidth ?? source.width,
      source.originalHeight ?? source.height
    ) >= 600 &&
    Math.max(source.width, source.height) >= 500 &&
    Math.min(source.width, source.height) >= 300 &&
    scaleX <= 1.5 &&
    scaleY <= 1.5
  );
}

export async function suggestProductPlacement(
  design: Buffer,
  sources: ProductCutout[],
  canvas: { width: number; height: number },
  automatic = false,
  preserveSizes?: ProductOverlayPlacement[]
) {
  if (preserveSizes && preserveSizes.length !== sources.length)
    throw new ProductOverlayFailureError(
      "The current product sizes are unavailable. Reopen the editor before suggesting placement.",
      { stage: "alignment", reason: "invalid_geometry" }
    );
  const first = await sharp(design, { limitInputPixels: 16_000_000 })
    .resize({
      width: 1400,
      height: 1400,
      fit: "inside",
      withoutEnlargement: true,
    })
    .png()
    .toBuffer();
  const images = [first];
  for (const source of sources)
    images.push(
      await sharp(source.png)
        .resize({
          width: 600,
          height: 600,
          fit: "inside",
          withoutEnlargement: true,
        })
        .png()
        .toBuffer()
    );
  const result = await (async () => {
    try {
      const model = requireLatestGptTextModel((await listLLMModels()).data);
      return await invokeLLM({
        model,
        includedInAction: automatic,
        maxTokens: 1800,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content: systemPromptContract("contract.productOverlay.1"),
          },
          {
            role: "user",
            content: images.map(image => ({
              type: "image_url" as const,
              image_url: {
                url: `data:image/png;base64,${image.toString("base64")}`,
                detail: "high" as const,
              },
            })),
          },
        ],
      });
    } catch {
      throw new ProductOverlayFailureError(
        "Product alignment is temporarily unavailable. Align the layer manually.",
        { stage: "alignment", reason: "provider_unavailable" }
      );
    }
  })();
  const text = result?.choices?.[0]?.message?.content;
  const responseSchema = z.object({
    products: z
      .array(
        z.object({
          left: z.number().int().min(0).max(1000),
          top: z.number().int().min(0).max(1000),
          width: z.number().int().min(1).max(1000),
          height: z.number().int().min(1).max(1000),
          confidence: z.number().min(0).max(1),
          sameAngle: z.boolean(),
          sourceBody: z.object({
            left: z.number().int().min(0).max(1000),
            top: z.number().int().min(0).max(1000),
            width: z.number().int().min(1).max(1000),
            height: z.number().int().min(1).max(1000),
            confidence: z.number().min(0).max(1),
          }),
        })
      )
      .length(sources.length),
  });
  let parsed: z.infer<typeof responseSchema>;
  try {
    parsed = responseSchema.parse(
      JSON.parse(typeof text === "string" ? text : "{}")
    );
  } catch {
    throw new ProductOverlayFailureError(
      "Product alignment returned an invalid response. Align the layer manually.",
      { stage: "alignment", reason: "invalid_response" }
    );
  }
  const measurements = parsed.products.map((box, i) => {
    const metrics = {
      stage: "alignment" as const,
      layerIndex: i,
      confidence: box.confidence,
      sameAngle: box.sameAngle,
    };
    const reason =
      box.confidence < 0.85 || box.sourceBody.confidence < 0.85
        ? "low_confidence"
        : !box.sameAngle
          ? "camera_angle"
          : undefined;
    if (reason)
      throw new ProductOverlayFailureError(
        "The product position or camera view is uncertain. Keep the original design and align the layer manually.",
        { ...metrics, reason }
      );
    const result = resolveProductAlignment(
      box,
      sources[i],
      canvas,
      preserveSizes?.[i],
      box.sourceBody
    );
    result.measurement.targetConfidence = box.confidence;
    if (result.reason)
      throw new ProductOverlayFailureError(
        result.reason === "size_mismatch"
          ? "The detected product cannot be covered at the current size without distortion. Your size and position are unchanged; adjust manually or explicitly allow size changes."
          : "The detected product does not match the original cutout safely. Your placement is unchanged; compare the original design and align manually.",
        {
          ...metrics,
          reason: result.reason,
          aspectDifference: result.measurement.aspectDifference,
          measurement: result.measurement,
        }
      );
    return result;
  });
  return {
    layers: measurements.map(result => result.placement!),
    measurements: measurements.map(result => result.measurement),
    sameAngle: parsed.products.every(p => p.sameAngle),
  };
}

/** Recompose from the immutable complete design; never from a previous overlay. */
export async function renderProductOverlay(
  design: Buffer,
  sources: ProductCutout[],
  placements: ProductOverlayPlacement[],
  allowUpscale = false
) {
  const image = sharp(design, { limitInputPixels: 16_000_000 });
  const info = await image.metadata();
  if (
    !info.width ||
    !info.height ||
    sources.length !== placements.length ||
    !sources.length ||
    sources.length > 3
  )
    throw new Error("The saved design and product layers do not match.");
  const canvas = { width: info.width, height: info.height };
  const composites = [];
  const layers = [];
  for (let i = 0; i < sources.length; i++) {
    const source = sources[i];
    const layer = constrainProductLayer(
      placements[i],
      source.width / source.height,
      canvas
    );
    if (
      JSON.stringify({
        width: layer.width,
        left: layer.left,
        top: layer.top,
        ...(layer.height === undefined ? {} : { height: layer.height }),
      }) !==
      JSON.stringify({
        width: placements[i].width,
        left: placements[i].left,
        top: placements[i].top,
        ...(placements[i].height === undefined
          ? {}
          : { height: placements[i].height }),
      })
    )
      throw new Error("Keep each product within the design canvas.");
    if (
      (layer.width > source.width ||
        (layer.height ?? (layer.width * source.height) / source.width) >
          source.height) &&
      !allowUpscale
    )
      throw new ProductOverlayResolutionError(
        `Product ${i + 1} has ${source.width} x ${source.height} usable pixels and needs ${layer.width} x ${Math.round(layer.height ?? (layer.width * source.height) / source.width)} here. Use a higher-resolution original or explicitly accept enlargement in the editor.`
      );
    const result = await sharp(source.png)
      .resize(
        layer.height === undefined
          ? { width: layer.width, kernel: sharp.kernel.lanczos3 }
          : {
              width: layer.width,
              height: layer.height,
              fit: "fill",
              kernel: sharp.kernel.lanczos3,
            }
      )
      .png()
      .toBuffer({ resolveWithObject: true });
    composites.push({ input: result.data, left: layer.left, top: layer.top });
    layers.push({
      ...layer,
      height: result.info.height,
      sourceKey: source.sourceKey,
      sha256: source.sha256,
    });
  }
  return { png: await image.composite(composites).png().toBuffer(), layers };
}

/** Bundled generation finishing only. Never invoked by read-only preview. */
export async function automaticProductOverlay(
  design: Buffer,
  sources: ProductCutout[],
  canvas: { width: number; height: number }
) {
  const placement = await suggestProductPlacement(
    design,
    sources,
    canvas,
    true
  );
  try {
    const originalQuality = sources.every((source, i) =>
      automaticProductUpscaleAllowed(source, placement.layers[i])
    );
    const rendered = await renderProductOverlay(
      design,
      sources,
      placement.layers,
      originalQuality
    );
    return { ...rendered, measurements: placement.measurements };
  } catch (error) {
    if (error instanceof ProductOverlayResolutionError) {
      error.placements = placement.layers;
      throw error;
    }
    throw new ProductOverlayFailureError(
      "The product overlay could not be rendered. The complete design is preserved.",
      { stage: "render", reason: "render_failed" }
    );
  }
}
