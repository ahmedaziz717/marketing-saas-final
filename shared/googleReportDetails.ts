export const googleReportDetails = {
  campaign: "Campaigns",
  ad_group: "Ad groups",
  asset_group: "Performance Max asset groups",
  ad: "Ads",
  device: "Devices",
  country: "User countries",
  hour: "Hours of day",
} as const;
export type GoogleDetailLevel = keyof typeof googleReportDetails;
