import { describe, expect, it } from "vitest";
import { briefSubmissionIssues, draftSaveIssues, normalizeDestinationUrl } from "../shared/briefValidation";

describe("campaign brief validation", () => {
  it("normalizes a bare destination domain to HTTPS and preserves complete URLs", () => {
    expect(normalizeDestinationUrl("bambulab.com")).toBe("https://bambulab.com/");
    expect(normalizeDestinationUrl(" https://bambulab.com/en-us?source=brief ")).toBe("https://bambulab.com/en-us?source=brief");
    expect(normalizeDestinationUrl("")).toBe("");
  });

  it("rejects invalid destination values with an explicit save issue", () => {
    expect(normalizeDestinationUrl("not a website")).toBeNull();
    expect(draftSaveIssues({ name: "Launch brief", destinationUrl: "not a website" })).toContain("Destination URL must be a valid web address");
  });

  it("allows populated short draft fields and empty optional selections to save", () => {
    expect(draftSaveIssues({ name: "Test", destinationUrl: "bambulab.com" })).toEqual([]);
  });

  it("requires full creative context only when the draft is submitted for review", () => {
    const incomplete = briefSubmissionIssues({ name: "Test", audience: "Test", offer: "Test", creativeDirection: "Test", destinationUrl: "bambulab.com", placements: ["facebook_feed"], formats: ["square_1_1"], assetIds: [] });
    expect(incomplete).toEqual(expect.arrayContaining(["Audience must contain at least 10 characters", "Creative direction must contain at least 10 characters", "Select at least one approved brand asset"]));
    expect(briefSubmissionIssues({ name: "Spring launch", audience: "Existing customers interested in an upgrade", offer: "Save on a complete printing system", creativeDirection: "Premium product-focused studio composition", destinationUrl: "https://bambulab.com", placements: ["facebook_feed"], formats: ["square_1_1"], assetIds: [1] })).toEqual([]);
  });
});
