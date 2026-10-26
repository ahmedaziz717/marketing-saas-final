import { z } from "zod";
import type { CreativeSetup } from "./creativeBuilder";

/** Recover only the exact catalog references saved with this output. */
export function originalProductSelections(
  metadata?: {
    productIds: number[];
    requestedSetup?: CreativeSetup;
    renderedProductImages?: Array<{
      productId: number;
      imageId: number | null;
    }>;
  } | null
) {
  const ids = metadata?.productIds ?? [];
  if (!ids.length || ids.length > 3) return [];
  if (metadata?.renderedProductImages !== undefined) {
    const exact = metadata.renderedProductImages;
    if (
      exact.length !== ids.length ||
      new Set(ids).size !== ids.length ||
      exact.some(
        (item, i) =>
          item.productId !== ids[i] ||
          !Number.isInteger(item.imageId) ||
          (item.imageId ?? 0) <= 0
      )
    )
      return [];
    return exact.map(item => ({
      featuredSpecKeys: [],
      includePrice: false,
      ...metadata.requestedSetup?.products.find(
        p => p.productId === item.productId
      ),
      productId: item.productId,
      imageId: item.imageId!,
      imageIds: [item.imageId!],
    }));
  }

  const selected = ids.map(id =>
    metadata?.requestedSetup?.products.find(p => p.productId === id)
  );
  if (selected.some(p => !p?.imageId || (p.imageIds?.length ?? 0) > 1))
    return [];
  return selected as Array<
    CreativeSetup["products"][number] & { imageId: number }
  >;
}

export const productOverlayPlacementSchema = z.object({
  left: z.number().int().min(0).max(8000),
  top: z.number().int().min(0).max(8000),
  width: z.number().int().min(1).max(8000),
  height: z.number().int().min(1).max(8000).optional(),
});
export type ProductOverlayPlacement = z.infer<
  typeof productOverlayPlacementSchema
>;

/** An unmeasured manual starting layer is never silently enlarged or presented
 * as a match. The user positions it explicitly against the full design. */
export function nativeProductStartingLayer(
  source: { sourceWidth: number; sourceHeight: number },
  canvas: { width: number; height: number }
): ProductOverlayPlacement {
  const scale = Math.min(
    1,
    canvas.width / source.sourceWidth,
    canvas.height / source.sourceHeight
  );
  const width = Math.max(1, Math.floor(source.sourceWidth * scale));
  const height = Math.max(1, Math.floor(source.sourceHeight * scale));
  return {
    left: Math.floor((canvas.width - width) / 2),
    top: Math.floor((canvas.height - height) / 2),
    width,
    height,
  };
}
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
export type ProductOverlayFailureDiagnostic = {
  stage: "source_read" | "alignment" | "render" | "storage";
  reason:
    | "low_confidence"
    | "camera_angle"
    | "aspect_mismatch"
    | "size_mismatch"
    | "invalid_geometry"
    | "invalid_response"
    | "provider_unavailable"
    | "alignment_failed"
    | "source_resolution"
    | "render_failed"
    | "source_read_failed"
    | "storage_failed";
  layerIndex?: number;
  confidence?: number;
  sameAngle?: boolean;
  aspectDifference?: number;
  measurement?: ProductAlignmentMeasurement;
};
export type ProductOverlayMetadata = {
  method: "editable_original_v3";
  designStorageKey: string;
  designUrl: string;
  applied: boolean;
  alignment?: "automatic" | "manual" | "needs_adjustment";
  automaticFailure?: "source_resolution" | "alignment_unavailable";
  automaticFailureDiagnostic?: ProductOverlayFailureDiagnostic;
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

/** Resize in full-resolution canvas pixels, never CSS preview pixels. */
export function resizeProductLayer(
  layer: ProductOverlayPlacement,
  width: number,
  aspect: number,
  canvas: { width: number; height: number }
) {
  const next = constrainProductLayer(
    { left: layer.left, top: layer.top, width },
    aspect,
    canvas
  );
  return { ...next, height: Math.max(1, Math.round(next.width / aspect)) };
}

export type ProductResizeCorner = "nw" | "ne" | "sw" | "se";

/** Corner resizing keeps the opposite corner fixed and preserves source proportions. */
export function resizeProductLayerFromCorner(
  layer: ProductOverlayPlacement,
  corner: ProductResizeCorner,
  delta: { x: number; y: number },
  aspect: number,
  canvas: { width: number; height: number }
) {
  const height = layer.height ?? layer.width / aspect;
  const west = corner.includes("w"),
    north = corner.includes("n");
  const anchorX = west ? layer.left + layer.width : layer.left;
  const anchorY = north ? layer.top + height : layer.top;
  const dx = (west ? -1 : 1) * delta.x;
  const dy = (north ? -1 : 1) * delta.y;
  // Project the pointer onto the fixed-aspect diagonal, so either axis is usable.
  const requested = layer.width + (dx + dy / aspect) / (1 + 1 / aspect ** 2);
  const maxWidth = Math.min(
    west ? anchorX : canvas.width - anchorX,
    (north ? anchorY : canvas.height - anchorY) * aspect
  );
  const width = Math.max(
    1,
    Math.min(Math.round(requested), Math.floor(maxWidth))
  );
  const nextHeight = Math.max(1, Math.round(width / aspect));
  return {
    width,
    height: nextHeight,
    left: Math.round(west ? anchorX - width : anchorX),
    top: Math.round(north ? anchorY - nextHeight : anchorY),
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
    automaticFailureDiagnostic: undefined,
    layers,
  };
}

export type ProductAlignmentMeasurement = {
  normalizedBounds: {
    left: number;
    top: number;
    width: number;
    height: number;
  };
  detectedBounds: { left: number; top: number; width: number; height: number };
  renderedBounds?: { left: number; top: number; width: number; height: number };
  aspectDifference: number;
  sizeMode: "preserve" | "fit";
};

/** One full-canvas mapping shared by automatic finishing and explicit suggestions.
 * Never silently stretch, clip, move a detection to fit, or resize an accepted layer. */
export function resolveProductAlignment(
  box: ProductAlignmentMeasurement["normalizedBounds"],
  source: { width: number; height: number },
  canvas: { width: number; height: number },
  preserveSize?: Pick<ProductOverlayPlacement, "width" | "height">
): {
  placement?: ProductOverlayPlacement;
  measurement: ProductAlignmentMeasurement;
  reason?: "aspect_mismatch" | "invalid_geometry" | "size_mismatch";
} {
  const detectedBounds = {
    left: (box.left * canvas.width) / 1000,
    top: (box.top * canvas.height) / 1000,
    width: (box.width * canvas.width) / 1000,
    height: (box.height * canvas.height) / 1000,
  };
  const aspect = source.width / source.height;
  const measurement: ProductAlignmentMeasurement = {
    normalizedBounds: {
      left: box.left,
      top: box.top,
      width: box.width,
      height: box.height,
    },
    detectedBounds,
    aspectDifference: Math.abs(
      detectedBounds.width / detectedBounds.height / aspect - 1
    ),
    sizeMode: preserveSize ? "preserve" : "fit",
  };
  if (
    !Number.isFinite(measurement.aspectDifference) ||
    box.left < 0 ||
    box.top < 0 ||
    box.width <= 0 ||
    box.height <= 0 ||
    box.left + box.width > 1000 ||
    box.top + box.height > 1000
  )
    return { measurement, reason: "invalid_geometry" };
  if (measurement.aspectDifference > 0.15)
    return { measurement, reason: "aspect_mismatch" };
  const width =
    preserveSize?.width ??
    Math.round(Math.max(detectedBounds.width, detectedBounds.height * aspect));
  const height = preserveSize?.height ?? Math.round(width / aspect);
  if (
    preserveSize &&
    (Math.abs(height - width / aspect) > 1 ||
      width + 1 < detectedBounds.width ||
      height + 1 < detectedBounds.height)
  )
    return { measurement, reason: "size_mismatch" };
  // Retain legacy aspect-preserving cover geometry; use the unrounded cover width
  // for its center so rounding does not move historical verified placements.
  const centerWidth = preserveSize
    ? width
    : Math.max(detectedBounds.width, detectedBounds.height * aspect);
  const centerHeight = preserveSize ? height : centerWidth / aspect;
  const placement: ProductOverlayPlacement = {
    width,
    ...(preserveSize ? { height } : {}),
    left: Math.round(
      detectedBounds.left + detectedBounds.width / 2 - centerWidth / 2
    ),
    top: Math.round(
      detectedBounds.top + detectedBounds.height / 2 - centerHeight / 2
    ),
  };
  measurement.renderedBounds = { ...placement, height };
  if (
    placement.left < 0 ||
    placement.top < 0 ||
    placement.left + width > canvas.width ||
    placement.top + height > canvas.height
  )
    return { measurement, reason: "invalid_geometry" };
  return { placement, measurement };
}
