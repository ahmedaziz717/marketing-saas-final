import type { Channel, PublicationState } from "./channels";

export const contentDraftStates: readonly PublicationState[] = [
  "draft",
  "changes_requested",
  "rejected",
];
export const studioDraftFilters = [
  { id: "all", label: "All" },
  { id: "images", label: "Images" },
  { id: "videos", label: "Videos" },
  { id: "social", label: "Social posts" },
  { id: "ads", label: "Ads" },
] as const;
export type StudioDraftFilter = (typeof studioDraftFilters)[number]["id"];
export function studioDraftsHref(
  options: {
    filter?: StudioDraftFilter;
    plan?: number;
    search?: string;
    asset?: string;
  } = {}
) {
  const params = new URLSearchParams();
  if (options.filter && options.filter !== "all")
    params.set("filter", options.filter);
  if (options.plan) params.set("plan", String(options.plan));
  if (options.search) params.set("q", options.search);
  if (options.asset) params.set("asset", options.asset);
  return "/app/creatives/drafts" + (params.size ? "?" + params.toString() : "");
}
export function studioContentHref(
  channel: Channel,
  options: {
    id?: string;
    asset?: string;
    plan?: number;
    connection?: string;
    adset?: string;
    time?: string;
    timezone?: string;
    section?: "setup" | "creative" | "copy" | "delivery" | "preview";
  } = {}
) {
  const params = new URLSearchParams(
    options.id
      ? {
          publication: options.id,
          section: options.section ?? "copy",
          ...(options.section && options.section !== "copy"
            ? {}
            : { category: "compose" }),
          channel,
        }
      : { channel }
  );
  for (const [key, value] of Object.entries(options))
    if (key !== "id" && value != null && value !== "")
      params.set(key, String(value));
  return `/app/activate/studio?${params}`;
}
export function activationHref(channel: Channel, id: string) {
  return studioContentHref(channel, { id, section: "preview" });
}
export function legacyStudioHref(path: string, search: string) {
  const params = new URLSearchParams(search);
  if (
    path.endsWith("/saved") ||
    path.endsWith("/ugc") ||
    params.get("tab") === "saved" ||
    params.has("revise") ||
    (params.has("asset") && !params.has("new") && !path.endsWith("/drafts"))
  ) {
    params.delete("tab");
    params.set("kind", "media");
    if (path.endsWith("/ugc")) params.set("type", "ugc");
    return `/app/creatives/drafts?${params}`;
  }
  return null;
}
