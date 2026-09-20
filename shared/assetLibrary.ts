export const ASSET_STATES = ["draft", "needs_review", "approved", "changes_requested", "rejected"] as const;
export type AssetState = (typeof ASSET_STATES)[number];
export type AssetKey = `asset:${number}` | `creative:${number}`;
export type AssetView = "all" | "images" | "videos" | "ugc" | "source";
export const ASSET_VIEWS: { id: AssetView; label: string }[] = [
  { id: "all", label: "All assets" }, { id: "images", label: "Image assets" },
  { id: "videos", label: "Video assets" }, { id: "ugc", label: "User-generated content" },
  { id: "source", label: "Brand & product assets" },
];
export type LibraryAsset = {
  key: AssetKey; name: string; origin: "uploaded" | "generated";
  url: string; mediaType: "image" | "video" | "other";
  mimeType: string; purpose: "source" | "finished"; isUgc: boolean;
  state: AssetState; revision: string; fingerprint: string;
  parentKey: AssetKey | null; createdAtMs: number;
  reviewedAtMs: number | null; reviewedByUserId: number | null;
  headline?: string; primaryText?: string; format?: string;
};
export type WorkflowSnapshot = { id: number; action: string; payload: Record<string, unknown> | null; actorUserId: number; createdAtMs: number };
export const WORKFLOW_ACTIONS = ["asset_library.submitted", "asset_library.approved", "asset_library.changes_requested", "asset_library.rejected"];
export function parseAssetKey(value: string): { kind: "asset" | "creative"; id: number } {
  const match = /^(asset|creative):([1-9][0-9]*)$/.exec(value);
  if (!match || !Number.isSafeInteger(Number(match[2]))) throw new Error("Invalid asset reference");
  return { kind: match[1] as "asset" | "creative", id: Number(match[2]) };
}
export function assetState(savedStatus: string, workflow: WorkflowSnapshot | undefined, fingerprint: string): AssetState {
  if (workflow) {
    if (workflow.payload?.fingerprint !== fingerprint) return "draft";
    if (workflow.action === "asset_library.submitted") return "needs_review";
    if (workflow.action === "asset_library.changes_requested") return "changes_requested";
    if (workflow.action === "asset_library.rejected") return "rejected";
    if (workflow.action === "asset_library.approved") return savedStatus === "approved" ? "approved" : "draft";
  }
  // Preserve decisions made before the library existed; pending generations are drafts.
  return savedStatus === "approved" ? "approved" : savedStatus === "rejected" ? "rejected" : "draft";
}
export function canSubmitAsset(state: AssetState) { return ["draft", "changes_requested", "rejected"].includes(state); }
export function canReviewAsset(state: AssetState, decision: "approved" | "changes_requested" | "rejected") {
  return state === "needs_review" || (state === "approved" && decision !== "approved");
}
export function assetMatchesView(asset: LibraryAsset, view: AssetView) {
  return view === "all" || (view === "images" && asset.mediaType === "image") || (view === "videos" && asset.mediaType === "video") || (view === "ugc" && asset.isUgc) || (view === "source" && asset.purpose === "source");
}
export function assetStateLabel(value: string) { return value.replaceAll("_", " ").replace(/^./, character => character.toUpperCase()); }
