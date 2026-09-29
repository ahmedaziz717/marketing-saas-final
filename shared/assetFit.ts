import type { LibraryAsset } from "./assetLibrary";
export const assetFormats = [
  "square",
  "portrait",
  "story",
  "landscape",
] as const;
export function assetFormat(
  a: Pick<LibraryAsset, "width" | "height" | "format">
) {
  if (a.width && a.height) {
    const ratio = a.width / a.height;
    if (Math.abs(ratio - 1) < 0.02) return "square";
    if (Math.abs(ratio - 0.8) < 0.02) return "portrait";
    if (Math.abs(ratio - 9 / 16) < 0.02) return "story";
    if (Math.abs(ratio - 1.91) < 0.04) return "landscape";
    return "other";
  }
  const f = a.format?.toLowerCase() ?? "";
  return assetFormats.find(x => f.includes(x)) ?? "unknown";
}
export function assetFit(a: LibraryAsset, channel: string, carousel = false) {
  if (channel === "all") return true;
  if (a.purpose !== "finished") return false;
  if (channel === "facebook")
    return a.mediaType === "image" || a.mediaType === "video";
  const format = assetFormat(a);
  return (
    a.mediaType === "image" &&
    (carousel ? format === "square" : assetFormats.includes(format as any)) &&
    (!a.width || !a.height || Math.min(a.width, a.height) >= 600)
  );
}
export function assetSizeLabel(a: LibraryAsset) {
  const f = assetFormat(a);
  return `${a.width && a.height ? `${a.width} × ${a.height} · ` : ""}${f === "unknown" ? "Size not recorded" : f}`;
}
