import { z } from "zod";

export const productOverlayPlacementSchema = z.object({
  left: z.number().int().min(0).max(8000),
  top: z.number().int().min(0).max(8000),
  width: z.number().int().min(1).max(8000),
});
export type ProductOverlayPlacement = z.infer<
  typeof productOverlayPlacementSchema
>;
export type ProductOverlayMetadata = {
  method: "editable_original_v3";
  designStorageKey: string;
  designUrl: string;
  applied: boolean;
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
      Math.floor(canvas.height * aspect)
    )
  );
  const height = Math.max(1, Math.round(width / aspect));
  return {
    width,
    left: Math.max(0, Math.min(Math.round(layer.left), canvas.width - width)),
    top: Math.max(0, Math.min(Math.round(layer.top), canvas.height - height)),
  };
}
