import { describe, expect, it } from "vitest";
import { getCatalogApprovalAction } from "./catalogReviewState";

describe("Product Catalog approval toggle", () => {
  it("approves pending and rejected products", () => {
    expect(getCatalogApprovalAction("pending")).toMatchObject({
      decision: "approved",
      label: "Approve",
    });
    expect(getCatalogApprovalAction("rejected")).toMatchObject({
      decision: "approved",
      label: "Approve",
    });
  });

  it("unapproves approved products with a distinct green treatment", () => {
    const action = getCatalogApprovalAction("approved");
    expect(action).toMatchObject({ decision: "pending", label: "Unapprove" });
    expect(action.className).toContain("emerald");
  });
});
