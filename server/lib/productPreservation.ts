import sharp from "sharp";
import { createHash } from "node:crypto";
import type { CreativeSetup } from "../../shared/creativeBuilder";
import { storageGetBase64 } from "../storage";

export type ProductCutout = {
  png: Buffer;
  width: number;
  height: number;
  /** Decoded source canvas, before trimming alpha; never inferred from catalog metadata. */
  originalWidth?: number;
  originalHeight?: number;
  sourceKey: string;
  sha256: string;
};
export type ProductLayer = ProductCutout & {
  left: number;
  top: number;
};
export type ImageRegion = {
  left: number;
  top: number;
  width: number;
  height: number;
};

/** Starting positions for the editor only; these never constrain AI art direction. */
export function preservationRegions(
  canvas: { width: number; height: number },
  placement: CreativeSetup["placement"],
  count: number
) {
  const { width: w, height: h } = canvas;
  const region = (
    x: number,
    y: number,
    width: number,
    height: number
  ): ImageRegion => ({
    left: Math.round(x * w),
    top: Math.round(y * h),
    width: Math.floor(width * w),
    height: Math.floor(height * h),
  });
  const stacked =
    placement === "center" ||
    (placement === "auto" && (w / h < 0.85 || count > 1));
  if (stacked)
    return {
      copy: region(0.06, 0.05, 0.88, 0.37),
      product: region(0.09, 0.48, 0.82, 0.46),
    };
  const left = placement === "left";
  const banner = w / h > 4;
  return {
    copy: region(
      left ? (banner ? 0.29 : 0.54) : 0.05,
      0.07,
      banner ? 0.66 : 0.41,
      0.86
    ),
    product: region(
      left ? 0.05 : banner ? 0.75 : 0.54,
      0.07,
      banner ? 0.2 : 0.41,
      0.86
    ),
  };
}

/** Inspect alpha only. Never guess a mask or repaint the supplied product. */
export async function readProductCutout(
  sourceKey: string
): Promise<ProductCutout> {
  return readTransparentArtwork(sourceKey, "product");
}

export async function readTransparentArtwork(
  sourceKey: string,
  subject: "product" | "logo"
): Promise<ProductCutout> {
  const bytes = Buffer.from(await storageGetBase64(sourceKey), "base64");
  const source = sharp(bytes, { limitInputPixels: 16_000_000 })
    .rotate()
    .toColourspace("srgb");
  const { data, info } = await source
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  let left = info.width,
    top = info.height,
    right = -1,
    bottom = -1,
    transparent = 0;
  for (let y = 0; y < info.height; y++) {
    for (let x = 0; x < info.width; x++) {
      const alpha = data[(y * info.width + x) * 4 + 3];
      if (alpha === 0) transparent++;
      else {
        left = Math.min(left, x);
        top = Math.min(top, y);
        right = Math.max(right, x);
        bottom = Math.max(bottom, y);
      }
    }
  }
  if (right < left || bottom < top)
    throw new Error(
      `Preserve original ${subject} needs visible artwork; this image is empty.`
    );
  if (transparent < info.width * info.height * 0.01)
    throw new Error(
      subject === "logo"
        ? "Preserve original logo needs a transparent PNG or WebP. Upload a transparent logo in Brand so its background does not cover the creative. No generation has started."
        : "Preserve original product needs a transparent PNG or WebP cutout. Choose a transparent catalog photo or upload an approved cutout in Image assets. No generation has started."
    );
  const width = right - left + 1,
    height = bottom - top + 1;
  const png = await sharp(data, { raw: info })
    .extract({ left, top, width, height })
    .png()
    .toBuffer();
  return {
    png,
    width,
    height,
    originalWidth: info.width,
    originalHeight: info.height,
    sourceKey,
    sha256: createHash("sha256").update(bytes).digest("hex"),
  };
}

export async function loadPreservedProducts(
  setup: CreativeSetup,
  resolved: {
    products: Array<{
      image: { storageKey: string } | null;
      recordType?: string | null;
    }>;
    references?: Array<{ storageKey: string; key?: string }>;
    enhancement?: { productOverlay?: import("../../shared/productOverlay").ProductOverlayMetadata };
  }
) {
  if (!setup.preserveProduct) return [];
  if (setup.enhancement && resolved.enhancement?.productOverlay) {
    const cutouts: ProductCutout[] = [];
    for (const layer of resolved.enhancement.productOverlay.layers) {
      const source = await readProductCutout(layer.sourceKey);
      if (source.sha256 !== layer.sha256) throw new Error("The original product image changed. Reopen Enhance before continuing.");
      cutouts.push(source);
    }
    return cutouts;
  }
  if (setup.promotionMode === "platform")
    throw new Error(
      "Preserve original product needs a product photo, not a business promotion."
    );
  const keys = resolved.products.length
    ? resolved.products.map(p => {
        if (!p.image || p.recordType === "service")
          throw new Error(
            "Preserve original product needs a photo for every physical product."
          );
        return p.image.storageKey;
      })
    : (setup.sourceAssetKeys ?? []).map(key => {
        const r = resolved.references?.find(r => r.key === key);
        if (!r) throw new Error("Selected product cutout is unavailable.");
        return r.storageKey;
      });
  if (!keys.length)
    throw new Error(
      "Choose a product cutout before enabling Preserve original product."
    );
  if (
    (!resolved.products.length || setup.productMode === "together") &&
    keys.length > 3
  )
    throw new Error(
      "Preserve up to three products together, or create separate catalog images."
    );
  // Sequential decoding bounds peak memory when the catalog contains many photos.
  const cutouts: ProductCutout[] = [];
  for (const key of keys) cutouts.push(await readProductCutout(key));
  return cutouts;
}

/** Suggest initial layer sizes; the complete design is generated independently. */
export async function layoutPreservedProducts(
  cutouts: ProductCutout[],
  canvas: { width: number; height: number },
  placement: CreativeSetup["placement"]
): Promise<ProductLayer[]> {
  if (!cutouts.length || cutouts.length > 3)
    throw new Error("Choose one to three cutouts per image.");
  const {
    left: regionLeft,
    top: regionTop,
    width: regionWidth,
    height: regionHeight,
  } = preservationRegions(canvas, placement, cutouts.length).product;
  const gap = canvas.width * 0.025;
  const cellWidth = (regionWidth - gap * (cutouts.length - 1)) / cutouts.length;
  const layers: ProductLayer[] = [];
  for (let i = 0; i < cutouts.length; i++) {
    const cutout = cutouts[i];
    const result = await sharp(cutout.png)
      .resize({
        width: Math.max(1, Math.floor(cellWidth)),
        height: Math.max(1, Math.floor(regionHeight)),
        fit: "inside",
        withoutEnlargement: false,
      })
      .png()
      .toBuffer({ resolveWithObject: true });
    layers.push({
      ...cutout,
      png: result.data,
      width: result.info.width,
      height: result.info.height,
      left: Math.round(
        regionLeft + i * (cellWidth + gap) + (cellWidth - result.info.width) / 2
      ),
      top: Math.round(regionTop + regionHeight - result.info.height),
    });
  }
  return layers;
}
