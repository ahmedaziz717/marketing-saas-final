import { z } from "zod";

export const productOverlayPlacementSchema = z.object({
  left: z.number().int().min(0).max(8000),
  top: z.number().int().min(0).max(8000),
  width: z.number().int().min(1).max(8000),
  height: z.number().int().min(1).max(8000).optional(),
});
export type ProductOverlayPlacement = z.infer<
  typeof productOverlayPlacementSchema
>;
export const productOverlayReplacementsSchema = z
  .array(
    z.object({
      index: z.number().int().min(0).max(2),
      key: z.string().regex(/^(asset|catalog-image):[1-9][0-9]*$/),
      revision: z.string().regex(/^[a-f0-9]{64}$/),
      sameViewConfirmed: z.literal(true),
    })
  )
  .max(3)
  .refine(
    items => new Set(items.map(item => item.index)).size === items.length,
    "Choose one replacement per layer."
  )
  .default([]);
export type ProductOverlayReplacement = z.infer<
  typeof productOverlayReplacementsSchema
>[number];
export type ProductOverlayMetadata = {
  method: "editable_original_v3";
  designStorageKey: string;
  designUrl: string;
  applied: boolean;
  alignment?: "automatic" | "manual" | "needs_adjustment";
  automaticFailure?: "source_resolution" | "alignment_unavailable";
  layers: Array<
    ProductOverlayPlacement & {
      sourceKey: string;
      sha256: string;
      height: number;
    }
  >;
};

export function constrainProductLayer(
  layer: ProductOverlayPlacement,
  aspect: number,
  canvas: { width: number; height: number }
) {
  const width = Math.max(
    1,
    Math.min(
      Math.round(layer.width),
      canvas.width,
      layer.height === undefined
        ? Math.floor(canvas.height * aspect)
        : canvas.width
    )
  );
  const height = Math.max(
    1,
    Math.min(canvas.height, Math.round(layer.height ?? width / aspect))
  );
  return {
    width,
    ...(layer.height === undefined ? {} : { height }),
    left: Math.max(0, Math.min(Math.round(layer.left), canvas.width - width)),
    top: Math.max(0, Math.min(Math.round(layer.top), canvas.height - height)),
  };
}

/** A saved manual correction creates new metadata without changing the source version. */
export function manuallyAppliedProductOverlay(
  metadata: ProductOverlayMetadata,
  layers: ProductOverlayMetadata["layers"]
): ProductOverlayMetadata {
  return {
    ...metadata,
    applied: true,
    alignment: "manual",
    automaticFailure: undefined,
    layers,
  };
}
