import { beforeEach, expect, it, vi } from "vitest";
const mock = vi.hoisted(() => ({ generate: vi.fn(), template: vi.fn() }));
vi.mock("./lib/marketingDrafts", () => ({ marketingJsonWith: mock.template }));
import { generatePmaxCopy, pmaxCopySchema } from "./lib/googlePmaxAi";
import {
  pmaxMissingAssets,
  googleChangeSchema,
} from "../shared/googleCampaigns";
import { addPmaxSuggestion } from "../client/src/components/google/GooglePmaxDraft";

const valid = {
  headlines: [
    "Discover more",
    "Made for your next project",
    "Explore our collection",
  ],
  longHeadlines: ["Find the right product for your next project"],
  descriptions: [
    "Explore the collection and choose what suits you.",
    "Discover useful products with clear details.",
  ],
};
beforeEach(() => {
  vi.clearAllMocks();
  mock.template.mockReturnValue(mock.generate);
});
it("uses the registered editable prompt with protected limits and authoritative context", async () => {
  mock.generate.mockResolvedValue(valid);
  const context = {
    brand: { name: "Example", prohibitedContent: ["No invented claims"] },
    products: [{ marketingCategory: { status: "confirmed", revision: 4 } }],
  };
  expect(await generatePmaxCopy(context, "My run prompt")).toEqual(valid);
  expect(mock.template).toHaveBeenCalledWith(
    "google.pmax.copy",
    "My run prompt"
  );
  expect(mock.generate.mock.calls[0][0]).toContain("never publish");
  expect(mock.generate.mock.calls[0][1].context).toBe(context);
});
it("rejects out-of-contract AI output without silently truncating it", async () => {
  expect(pmaxCopySchema.safeParse(valid).success).toBe(true);
  expect(
    pmaxCopySchema.safeParse({
      ...valid,
      headlines: ["a".repeat(31), "Second", "Third"],
    }).success
  ).toBe(false);
  expect(
    pmaxCopySchema.safeParse({ ...valid, descriptions: ["Only one"] }).success
  ).toBe(false);
  expect(
    pmaxCopySchema.safeParse({ ...valid, headlines: ["Same", "same", "Third"] })
      .success
  ).toBe(false);
  mock.generate.mockImplementation(() => pmaxCopySchema.parse({}));
  await expect(generatePmaxCopy({})).rejects.toThrow("Your draft is unchanged");
});
it("accepts suggestions only by adding, preserving manual text and capacity", () => {
  const ad = {
    name: "My group",
    finalUrl: "https://example.com",
    headlines: ["Manual headline", ""],
    descriptions: ["Manual description"],
    longHeadline: "Manual long headline",
    assets: [],
    path1: "",
    path2: "",
  };
  const next = addPmaxSuggestion(ad, {
    field: "HEADLINE",
    source: { kind: "text", text: "New suggestion" },
  });
  expect(next.headlines).toEqual(["Manual headline", "New suggestion"]);
  expect(ad.headlines).toEqual(["Manual headline", ""]);
  const long = addPmaxSuggestion(ad, {
    field: "LONG_HEADLINE",
    source: { kind: "text", text: "Another long headline" },
  });
  expect(long.longHeadline).toBe(ad.longHeadline);
  expect(long.assets).toHaveLength(1);
  expect(
    addPmaxSuggestion(next, {
      field: "HEADLINE",
      source: { kind: "text", text: "New suggestion" },
    })
  ).toBe(next);
});
it("reports missing counts and distinguishes campaign-level brand assets", () => {
  const fields = [
    "HEADLINE",
    "LONG_HEADLINE",
    "DESCRIPTION",
    "MARKETING_IMAGE",
    "SQUARE_MARKETING_IMAGE",
  ];
  expect(pmaxMissingAssets(fields, true).map(i => i.message)).toEqual([
    "Add 2 more headlines (1/3 required).",
    "Add 1 more descriptions (1/2 required).",
  ]);
  expect(pmaxMissingAssets(fields).map(i => i.field)).toContain(
    "BUSINESS_NAME"
  );
  expect(pmaxMissingAssets(Array(16).fill("HEADLINE"))[0].message).toContain(
    "maximum 15"
  );
});
it("surfaces missing ad name at its real payload path instead of a generic union error", () => {
  const parsed = googleChangeSchema.safeParse({
    kind: "ad_create",
    campaignId: "1",
    adGroupId: "2",
    type: "SEARCH",
    ad: {
      finalUrl: "https://example.com",
      headlines: valid.headlines,
      descriptions: valid.descriptions,
    },
  });
  expect(parsed.success).toBe(false);
  if (!parsed.success)
    expect(parsed.error.issues.some(i => i.path.join(".") === "ad.name")).toBe(
      true
    );
});
