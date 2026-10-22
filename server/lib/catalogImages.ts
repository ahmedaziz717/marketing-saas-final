import sharp from "sharp";
import { safeFetchImage } from "./websiteCrawler";

/** Preview and import use identical download, SSRF, size and decoding checks. */
export async function fetchCatalogImage(url: string) {
  const image = await safeFetchImage(url);
  const decoded = sharp(image.data, {
    limitInputPixels: 25_000_000,
    failOn: "warning",
  });
  const metadata = await decoded.metadata();
  const types: Record<string, string> = {
    jpeg: "image/jpeg",
    png: "image/png",
    webp: "image/webp",
    gif: "image/gif",
    avif: "image/avif",
    heif: "image/avif",
  };
  if (
    !metadata.format ||
    !types[metadata.format] ||
    !metadata.width ||
    !metadata.height
  )
    throw new Error("Not a supported catalog image.");
  await decoded.resize(1, 1).toBuffer();
  return {
    ...image,
    contentType: types[metadata.format],
    width: metadata.width,
    height: metadata.height,
  };
}
