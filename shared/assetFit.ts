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

// Discovery labels describe dimensions only, not provider approval or live integrations.
// Google: support.google.com/google-ads/answer/9823397
// Microsoft: learn.microsoft.com/advertising/campaign-management-service/responsivead
export const assetChannels = [
  { id: "meta_ads", label: "Meta Ads" },
  { id: "google_ads", label: "Google Ads" },
  { id: "microsoft", label: "Microsoft Ads (Bing)" },
  { id: "facebook", label: "Facebook" },
  { id: "instagram", label: "Instagram" },
] as const;
const googleBannerSizes = [[300,250],[336,280],[728,90],[160,600],[300,600],[320,50],[320,100],[970,90],[970,250],[468,60],[250,250],[200,200],[120,600]];
export function assetSizeMatches(a: LibraryAsset, channel: string) {
  if (channel === "all") return true;
  if (a.purpose !== "finished" || a.mediaType !== "image" || !a.width || !a.height) return false;
  const w = a.width, h = a.height, ratio = w / h;
  const fits = (r: number, minW: number, minH: number) => Math.abs(ratio / r - 1) <= 0.01 && w >= minW && h >= minH;
  switch (channel) {
    case "google_ads":
      return googleBannerSizes.some(([bw,bh]) => w === bw && h === bh) || fits(1.91,600,314) || fits(1,300,300) || fits(9/16,600,1067) || fits(4/5,480,600);
    case "microsoft":
      return fits(1.91,703,368) || fits(1,300,300) || fits(1/2,470,940) || fits(4,608,152);
    case "meta_ads":
    case "facebook":
    case "instagram":
      return fits(1.91,600,314) || fits(1,600,600) || fits(4/5,600,750) || fits(9/16,600,1067);
    default: return false;
  }
}
export function assetMatchingChannels(a: LibraryAsset) {
  return assetChannels.filter(channel => assetSizeMatches(a, channel.id));
}
