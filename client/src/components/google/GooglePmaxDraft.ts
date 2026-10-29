import type {
  GoogleAdContent,
  GoogleAssetInput,
} from "@shared/googleCampaigns";

/** An explicit suggestion acceptance may fill empty slots, but never replace manual text. */
export function addPmaxSuggestion(
  ad: GoogleAdContent,
  asset: GoogleAssetInput
): GoogleAdContent {
  if (asset.source.kind !== "text") return ad;
  const text = asset.source.text;
  if (asset.field === "HEADLINE" || asset.field === "DESCRIPTION") {
    const key = asset.field === "HEADLINE" ? "headlines" : "descriptions";
    const values = ad[key].filter(v => v.trim());
    if (
      values.includes(text) ||
      values.length >= (key === "headlines" ? 15 : 5)
    )
      return ad;
    return { ...ad, [key]: [...values, text] };
  }
  if (asset.field === "LONG_HEADLINE") {
    const others = ad.assets.filter(a => a.field === "LONG_HEADLINE");
    if (
      ad.longHeadline === text ||
      others.some(a => a.source.kind === "text" && a.source.text === text) ||
      others.length + (ad.longHeadline ? 1 : 0) >= 5
    )
      return ad;
    return ad.longHeadline
      ? { ...ad, assets: [...ad.assets, asset] }
      : { ...ad, longHeadline: text };
  }
  return ad;
}
