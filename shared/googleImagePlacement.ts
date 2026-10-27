import type { GoogleAssetInput } from "./googleCampaigns";

export const googleDisplayRequiredImages = [
  {
    field: "MARKETING_IMAGE",
    label: "Landscape · 1.91:1 · 1200 × 628 px",
    minimum: "600 × 314",
  },
  {
    field: "SQUARE_MARKETING_IMAGE",
    label: "Square · 1:1 · 1200 × 1200 px",
    minimum: "300 × 300",
  },
] as const;

// Google validates image dimensions when linking, not just when uploading.
// https://developers.google.com/google-ads/api/performance-max/asset-requirements
export const googleImageSpecs: Partial<
  Record<GoogleAssetInput["field"], readonly [number, number, number]>
> = {
  MARKETING_IMAGE: [600, 314, 1.91],
  SQUARE_MARKETING_IMAGE: [300, 300, 1],
  PORTRAIT_MARKETING_IMAGE: [480, 600, 0.8],
  LOGO: [128, 128, 1],
  LANDSCAPE_LOGO: [512, 128, 4],
};
export function googleImageMatches(
  field: GoogleAssetInput["field"],
  width?: number,
  height?: number
) {
  const spec = googleImageSpecs[field];
  return (
    !!spec &&
    !!width &&
    !!height &&
    Number.isFinite(width) &&
    Number.isFinite(height) &&
    width >= spec[0] &&
    height >= spec[1] &&
    Math.abs(width / height / spec[2] - 1) <= 0.01
  );
}
export function googleMarketingImagePlacement(width?: number, height?: number) {
  return (
    [
      "MARKETING_IMAGE",
      "SQUARE_MARKETING_IMAGE",
      "PORTRAIT_MARKETING_IMAGE",
    ] as const
  ).find(field => googleImageMatches(field, width, height));
}
