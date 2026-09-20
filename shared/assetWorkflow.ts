import type { AssetState, LibraryAsset } from "./assetLibrary";

export type AssetSurface = "studio" | "library";
export type UploadDisposition = "draft" | "submit" | "approve";
export const studioRoles = ["owner", "admin", "creator"] as const;
export const reviewerRoles = ["owner", "admin", "reviewer"] as const;
export const directApprovalRoles = ["owner", "admin"] as const;
export const mayCreateAssets = (role: string) => (studioRoles as readonly string[]).includes(role);
export const mayReviewAssets = (role: string) => (reviewerRoles as readonly string[]).includes(role);
export const mayApproveAndAdd = (role: string) => (directApprovalRoles as readonly string[]).includes(role);

// A draft exists durably in storage/Studio, but is not a library entry. Returned
// submissions retain their review history; they are never in Approved Assets.
export const isLibraryAsset = (asset: Pick<LibraryAsset, "state">) => asset.state !== "draft";
export const isWorkingAsset = (asset: Pick<LibraryAsset, "state">) => ["draft", "changes_requested", "rejected"].includes(asset.state);
export function workflowLabel(state: AssetState) {
  return state === "needs_review" ? "Awaiting approval" : state === "changes_requested" ? "Changes requested" : state[0].toUpperCase() + state.slice(1);
}
export function libraryAssetLink(key: string, state: AssetState) {
  const view = state === "needs_review" ? "needs_review" : state === "approved" ? "approved" : "history";
  return `/app/library?view=${view}&asset=${encodeURIComponent(key)}`;
}
export const studioAssetLink = (key: string) => `/app/creatives?tab=saved&asset=${encodeURIComponent(key)}`;
