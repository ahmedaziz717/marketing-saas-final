import sharp from "sharp";
import { storageGetBase64 } from "../storage";

/** Call only after authorizing the owning creative. Hidden design originals are
 * not standalone library assets, so the generic /media ownership lookup cannot
 * serve them. Return bounded preview bytes without widening that access rule. */
export async function productOverlayPreview(designStorageKey: string) {
  const original = Buffer.from(
    await storageGetBase64(designStorageKey),
    "base64"
  );
  const preview = await sharp(original, { limitInputPixels: 16_000_000 })
    .resize({
      width: 1600,
      height: 1600,
      fit: "inside",
      withoutEnlargement: true,
    })
    .png()
    .toBuffer();
  return `data:image/png;base64,${preview.toString("base64")}`;
}
