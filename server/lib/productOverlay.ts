import { systemPromptContract } from "../../shared/promptContracts";
import sharp from "sharp";
import {
  constrainProductLayer,
  type ProductOverlayPlacement,
} from "../../shared/productOverlay";
import type { ProductCutout } from "./productPreservation";
import { z } from "zod";
import { invokeLLM, listLLMModels } from "../_core/llm";
import { requireLatestGptTextModel } from "./models";

export class ProductOverlayResolutionError extends Error {
  placements?: ProductOverlayPlacement[];
}

export async function suggestProductPlacement(
  design: Buffer,
  sources: ProductCutout[],
  canvas: { width: number; height: number },
  automatic = false
) {
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
  const model = requireLatestGptTextModel((await listLLMModels()).data);
  const result = await invokeLLM({
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
  const text = result.choices[0]?.message?.content;
  const parsed = z
    .object({
      products: z
        .array(
          z.object({
            left: z.number().int().min(0).max(1000),
            top: z.number().int().min(0).max(1000),
            width: z.number().int().min(1).max(1000),
            height: z.number().int().min(1).max(1000),
            confidence: z.number().min(0).max(1),
            sameAngle: z.boolean(),
          })
        )
        .length(sources.length),
    })
    .parse(JSON.parse(typeof text === "string" ? text : "{}"));
  if (
    parsed.products.some(
      p =>
        p.confidence < (automatic ? 0.85 : 0.65) ||
        (automatic && !p.sameAngle) ||
        p.left + p.width > 1000 ||
        p.top + p.height > 1000
    )
  )
    throw new Error(
      "The product position is uncertain. Keep the original design and align the layer manually."
    );
  if (
    automatic &&
    parsed.products.some((box, i) => {
      const measuredAspect =
        (box.width * canvas.width) / (box.height * canvas.height);
      return (
        Math.abs(measuredAspect / (sources[i].width / sources[i].height) - 1) >
        0.15
      );
    })
  )
    throw new Error(
      "The product view does not match the original cutout closely enough for automatic placement."
    );
  return {
    layers: parsed.products.map((box, i) => {
      const aspect = sources[i].width / sources[i].height;
      const width = Math.max(
        (box.width * canvas.width) / 1000,
        ((box.height * canvas.height) / 1000) * aspect
      );
      const desired: ProductOverlayPlacement = {
        width: Math.round(width),
        left: Math.round(
          ((box.left + box.width / 2) * canvas.width) / 1000 - width / 2
        ),
        top: Math.round(
          ((box.top + box.height / 2) * canvas.height) / 1000 -
            width / aspect / 2
        ),
      };
      // Fit the measured same-view footprint rather than centering an oversized
      // aspect-locked rectangle. Keep legacy proportional placements unchanged.
      const targetWidth = Math.round((box.width * canvas.width) / 1000);
      const targetHeight = Math.round((box.height * canvas.height) / 1000);
      if (Math.abs(targetWidth / targetHeight / aspect - 1) > 0.01) {
        desired.width = targetWidth;
        desired.height = targetHeight;
        desired.left = Math.round((box.left * canvas.width) / 1000);
        desired.top = Math.round((box.top * canvas.height) / 1000);
      }
      const constrained = constrainProductLayer(desired, aspect, canvas);
      if (
        automatic &&
        Object.keys(desired).some(
          key =>
            Math.abs(
              (desired[key as keyof typeof desired] ?? 0) -
                (constrained[key as keyof typeof constrained] ?? 0)
            ) > 1
        )
      )
        throw new Error(
          "Automatic product placement would clip or shift the original product."
        );
      return constrained;
    }),
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
        `Product ${i + 1} is only ${source.width} pixels wide but needs ${layer.width} pixels here. Use a higher-resolution original or explicitly accept enlargement in the editor.`
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
    // Permit resampling an original with substantial usable pixels. Do not
    // silently stretch legacy thumbnail cutouts; recovery can explicitly accept it.
    const originalQuality = sources.every(
      source => Math.max(source.width, source.height) >= 600
    );
    return await renderProductOverlay(
      design,
      sources,
      placement.layers,
      originalQuality
    );
  } catch (error) {
    if (error instanceof ProductOverlayResolutionError)
      error.placements = placement.layers;
    throw error;
  }
}
