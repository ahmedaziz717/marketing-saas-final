import { dateInZone, moveDate, rangeSchema } from "@shared/channels";

export type AnalyticsView = "overview" | "advertising" | "social";
export const analyticsPaths: Record<AnalyticsView, string> = {
  overview: "/app/analytics",
  advertising: "/app/analytics/advertising",
  social: "/app/analytics/social",
};
export function analyticsViewForRoute(
  path: string,
  search = ""
): AnalyticsView {
  if (path === analyticsPaths.advertising) return "advertising";
  if (path === analyticsPaths.social) return "social";
  // Keep previously shared ?tab= links working; the path wins on scoped views.
  const legacy = new URLSearchParams(search).get("tab");
  return path === analyticsPaths.overview &&
    (legacy === "social" || legacy === "advertising")
    ? legacy
    : "overview";
}
export function analyticsHref(view: AnalyticsView, search = "") {
  const params = new URLSearchParams(search);
  const retained = new URLSearchParams();
  // Dates and comparison travel between sections. Account/channel are scoped
  // and must not leave an incompatible selection hidden in the next section.
  for (const key of ["since", "until", "compare"]) {
    const value = params.get(key);
    if (value) retained.set(key, value);
  }
  return analyticsPaths[view] + (retained.size ? "?" + retained : "");
}
export function analyticsFilters(search: string, now = Date.now()) {
  const params = new URLSearchParams(search);
  const today = dateInZone(now, "UTC").slice(0, 10);
  const parsed = rangeSchema.safeParse({
    since: params.get("since"),
    until: params.get("until"),
  });
  return {
    range: parsed.success
      ? parsed.data
      : { since: moveDate(today, -29), until: today },
    compare: params.get("compare") === "1",
    account: params.get("account") || "all",
    channel:
      params.get("channel") === "facebook"
        ? "facebook"
        : params.get("channel") === "meta_ads"
          ? "meta_ads"
          : "all",
  };
}
