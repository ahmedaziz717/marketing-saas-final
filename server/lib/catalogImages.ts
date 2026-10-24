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
  const stats = metadata.hasAlpha ? await sharp(image.data, { limitInputPixels: 25_000_000 }).stats() : null;
  return {
    ...image,
    contentType: types[metadata.format],
    width: metadata.orientation && metadata.orientation >= 5 ? metadata.height : metadata.width,
    height: metadata.orientation && metadata.orientation >= 5 ? metadata.width : metadata.height,
    hasAlpha: !!stats && stats.channels[stats.channels.length - 1].min < 255,
  };
}

/** Explicit same-view candidates only. Decode real bytes; never trust URL size names. */
export async function fetchBestCatalogImage(candidates: string[]) {
  const urls = Array.from(new Set(candidates));
  if (!urls.length || urls.length > 12) throw new Error("Provide one to twelve resolutions of the same image.");
  let best: { url: string; image: Awaited<ReturnType<typeof fetchCatalogImage>> } | undefined;
  let reference: { aspect: number; transparent: boolean } | undefined;
  let unavailableCandidates = 0;
  let transientFailure: unknown;
  for (const url of urls) {
    try {
      const image = await fetchCatalogImage(url);
      reference ??= { aspect: image.width / image.height, transparent: image.hasAlpha };
      if (Math.abs(image.width / image.height / reference.aspect - 1) > 0.02 || (reference.transparent && !image.hasAlpha)) { unavailableCandidates++; continue; }
      if (!best || image.width * image.height > best.image.width * best.image.height) best = { url, image };
    } catch (error) {
      unavailableCandidates++;
      if (/HTTP (429|5\d\d)|timeout|timed out|ECONNRESET|EAI_AGAIN/i.test(String(error))) transientFailure = error;
    }
  }
  if (!best && transientFailure) throw transientFailure;
  if (!best) throw new Error("No usable image resolution is available.");
  return { ...best, unavailableCandidates };
}
