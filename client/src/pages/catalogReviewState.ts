export type CatalogReviewStatus = "pending" | "approved" | "rejected";

export function getCatalogApprovalAction(status: CatalogReviewStatus) {
  return status === "approved"
    ? {
        decision: "pending" as const,
        label: "Unapprove",
        className:
          "border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 hover:text-emerald-800",
      }
    : {
        decision: "approved" as const,
        label: "Approve",
        className: "",
      };
}
