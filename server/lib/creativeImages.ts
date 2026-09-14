import sharp from "sharp";
import { storageGetBase64 } from "../storage";

export async function readGenerationSource(storageKey: string) {
  const source = Buffer.from(await storageGetBase64(storageKey), "base64");
  try {
    const bytes = await sharp(source, { limitInputPixels: 40_000_000 })
      .rotate()
      .resize({
        width: 2048,
        height: 2048,
        fit: "inside",
        withoutEnlargement: true,
      })
      .png()
      .toBuffer();
    return { b64Json: bytes.toString("base64"), mimeType: "image/png" };
  } catch {
    throw new Error("Selected source image could not be decoded");
  }
}

export async function prepareCreativeOutput(
  bytes: Buffer,
  size: { width: number; height: number; background: string }
) {
  // Contain preserves all generated text and product detail; no crop silently removes content.
  return sharp(bytes, { limitInputPixels: 40_000_000 })
    .rotate()
    .resize(size.width, size.height, {
      fit: "contain",
      background: size.background,
    })
    .png()
    .toBuffer();
}
