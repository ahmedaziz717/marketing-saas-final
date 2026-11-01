import { beforeEach, expect, it, vi } from "vitest";
import { TRPCError } from "@trpc/server";
import { textActionForOperation } from "../shared/textActionEstimate";
const mocks = vi.hoisted(() => ({ page: vi.fn(), generate: vi.fn() }));
vi.mock("./lib/marketingDrafts", () => ({
  websiteEvidence: mocks.page,
  marketingJsonWith: () => mocks.generate,
}));
import { generateSearchCopy } from "./lib/googleSearchCopy";
import { searchCopySuggestionsSchema } from "../shared/googleSearchCopy";
import { googleChangeSchema } from "../shared/googleCampaigns";
const copy = {
  headlines: Array.from({ length: 15 }, (_, i) => `Explore collection ${i}`),
  descriptions: Array.from(
    { length: 4 },
    (_, i) => `Explore our collection and its details ${i}.`
  ),
  path1: ["collection"],
  path2: ["details"],
};
beforeEach(() => {
  vi.clearAllMocks();
  mocks.page.mockResolvedValue({
    url: "https://example.com/products",
    title: "Collection",
    text: "Verified product page content. ".repeat(8),
  });
  mocks.generate.mockImplementation(async (_prompt, _data, schema) =>
    schema.parse(copy)
  );
});
it("reads the actual campaign page before requesting all Search fields with brand context", async () => {
  expect(textActionForOperation("googleAds.campaigns.draftSearchCopy")).toBe("ad_copy");
  const context = {
    brand: { name: "Acme" },
    existingCopy: { headlines: ["Manual copy"] },
  };
  expect(
    await generateSearchCopy("https://example.com/products", context)
  ).toEqual(copy);
  expect(mocks.page).toHaveBeenCalledWith("https://example.com/products");
  expect(mocks.generate.mock.calls[0][1]).toMatchObject({
    context,
    page: {
      title: "Collection",
      text: expect.stringContaining("Verified product page"),
    },
  });
  expect(mocks.generate.mock.calls[0][0]).toContain("untrusted reference data");
});
it("preserves actionable credit-account errors from the existing metered provider", async () => {
  mocks.generate.mockRejectedValue(new TRPCError({ code: "FORBIDDEN", message: "Insufficient AI credits." }));
  await expect(generateSearchCopy("https://example.com", {})).rejects.toThrow("Insufficient AI credits.");
});
it.each(["https://example.com/unreadable", "https://localhost/private"])(
  "never generates when safe page reading fails: %s",
  async url => {
    mocks.page.mockRejectedValue(new Error("blocked or unavailable"));
    await expect(generateSearchCopy(url, {})).rejects.toThrow(
      "landing page could not be read"
    );
    expect(mocks.generate).not.toHaveBeenCalled();
  }
);
it("rejects invalid URLs and empty pages before generation", async () => {
  await expect(generateSearchCopy("file:///secret", {})).rejects.toThrow();
  expect(mocks.page).not.toHaveBeenCalled();
  mocks.page.mockResolvedValue({ text: "", url: "https://example.com" });
  await expect(generateSearchCopy("https://example.com", {})).rejects.toThrow(
    "could not be read"
  );
  expect(mocks.generate).not.toHaveBeenCalled();
});
it("rejects incomplete, duplicate or oversized AI suggestions without truncation", () => {
  expect(searchCopySuggestionsSchema.safeParse(copy).success).toBe(true);
  for (const invalid of [
    { ...copy, descriptions: [...copy.descriptions, "Fifth"] },
    { ...copy, headlines: copy.headlines.map(() => "Same") },
    { ...copy, path1: ["x".repeat(16)] },
  ])
    expect(searchCopySuggestionsSchema.safeParse(invalid).success).toBe(false);
});
it("validates Search copy at its own paths for existing-campaign ad creation", () => {
  const change = {
    kind: "ad_create",
    campaignId: "1",
    adGroupId: "2",
    type: "SEARCH",
    ad: {
      name: "Ad",
      finalUrl: "https://example.com",
      headlines: ["First headline", "Second headline", "Third headline"],
      descriptions: ["First description", "Second description"],
      assets: [],
      path1: "",
      path2: "",
    },
  };
  expect(googleChangeSchema.safeParse(change).success).toBe(true);
  const invalid = googleChangeSchema.safeParse({
    ...change,
    ad: {
      ...change.ad,
      headlines: ["Same", "same"],
      descriptions: ["Only one"],
    },
  });
  expect(invalid.success).toBe(false);
  if (!invalid.success)
    expect(invalid.error.issues.map(i => i.path.join("."))).toEqual(
      expect.arrayContaining([
        "ad.headlines",
        "ad.headlines.1",
        "ad.descriptions",
      ])
    );
});
