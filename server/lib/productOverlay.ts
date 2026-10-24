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

export async function suggestProductPlacement(
  design: Buffer,
  sources: ProductCutout[],
  canvas: { width: number; height: number }
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
        p.confidence < 0.65 ||
        p.left + p.width > 1000 ||
        p.top + p.height > 1000
    )
  )
    throw new Error(
      "The product position is uncertain. Keep the original design and align the layer manually."
    );
  return {
    layers: parsed.products.map((box, i) => {
      const aspect = sources[i].width / sources[i].height;
      const width = Math.max(
        (box.width * canvas.width) / 1000,
        ((box.height * canvas.height) / 1000) * aspect
      );
      return constrainProductLayer(
        {
          width,
          left: ((box.left + box.width / 2) * canvas.width) / 1000 - width / 2,
          top:
            ((box.top + box.height / 2) * canvas.height) / 1000 -
            width / aspect / 2,
        },
        aspect,
        canvas
      );
    }),
    sameAngle: parsed.products.every(p => p.sameAngle),
  };
}

/** Recompose from the immutable complete design; never from a previous overlay. */
export async function renderProductOverlay(
  design: Buffer,
  sources: ProductCutout[],
  placements: ProductOverlayPlacement[]
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
      JSON.stringify(layer) !==
      JSON.stringify({
        width: placements[i].width,
        left: placements[i].left,
        top: placements[i].top,
      })
    )
      throw new Error("Keep each product within the design canvas.");
    const result = await sharp(source.png)
      .resize({ width: layer.width })
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
