import { z } from "zod";

export const googleAssetMetricsDays = z.union([
  z.literal(7),
  z.literal(30),
  z.literal(90),
]);
export type GoogleAssetMetricsDays = z.infer<typeof googleAssetMetricsDays>;
export type GoogleAssetPerformance = {
  resourceName: string;
  impressions: number | null;
  clicks: number | null;
  ctr: number | null;
  conversions: number | null;
  conversionRate: number | null;
};
export type GoogleAssetMetricsResult = {
  status: "available" | "unavailable";
  since: string | null;
  until: string | null;
  timezone: string | null;
  days: GoogleAssetMetricsDays;
  rows: GoogleAssetPerformance[];
};
