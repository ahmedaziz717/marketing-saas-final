import { describe, expect, it } from "vitest";
import { getBriefDraftUiState } from "./briefFormState";

describe("campaign brief draft UI state", () => {
  it("keeps Save draft active for the reported short form and normalizes a bare domain", () => {
    expect(getBriefDraftUiState({ name: "Test", destinationUrl: "bambulab.com", assetIds: [7], productIds: [11, 12] })).toEqual({ issues: [], normalizedDestinationUrl: "https://bambulab.com/", saveDisabled: false });
  });

  it("does not make optional asset and product selections blockers for a draft", () => {
    expect(getBriefDraftUiState({ name: "Test", destinationUrl: "", assetIds: [], productIds: [] })).toMatchObject({ issues: [], saveDisabled: false });
  });

  it("reports invalid URLs inline but only disables the button while a save is running", () => {
    expect(getBriefDraftUiState({ name: "Test", destinationUrl: "not a website", assetIds: [], productIds: [] })).toMatchObject({ issues: ["Destination URL must be a valid web address"], normalizedDestinationUrl: null, saveDisabled: false });
    expect(getBriefDraftUiState({ name: "Test", destinationUrl: "https://bambulab.com", assetIds: [], productIds: [] }, true).saveDisabled).toBe(true);
  });
});
