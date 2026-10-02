import type { Channel, PublicationState } from "./channels";

export const contentDraftStates: readonly PublicationState[] = [
  "draft",
  "changes_requested",
  "rejected",
];
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
  } = {}
) {
  const params = new URLSearchParams(
    options.id ? { edit: options.id } : { new: "1" }
  );
  for (const [key, value] of Object.entries(options))
    if (key !== "id" && value != null && value !== "")
      params.set(key, String(value));
  return `/app/creatives/${channel === "facebook" ? "social" : "ads"}?${params}`;
}
export function activationHref(channel: Channel, id: string) {
  return `/app/publishing?channel=${channel}&publication=${encodeURIComponent(id)}&configure=1`;
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
