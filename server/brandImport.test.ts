import { describe, expect, it } from "vitest";
import { approvedProductsOnly, editedProductProvenance, importedProductCanBeUsed, mergeBrandDraft, nextCrawlResumeStatus, productDedupeKey } from "./lib/brandImport";

describe("website import normalization", () => {
  it("merges evidence without duplicates while preserving user-editable primary fields", () => {
    const merged = mergeBrandDraft({ companyName: "Edited Name", colors: ["#6c3cff"], fonts: [], logoUrls: [], requiredClaims: [], prohibitedContent: [], summary: "", voice: "" }, { companyName: "Source Name", summary: "Precision tools", voice: "Clear", colors: ["#6C3CFF", "#111111"], fonts: ["Manrope"], logoUrls: ["https://example.com/logo.png"], requiredClaims: ["Made in USA"], prohibitedContent: [] });
    expect(merged.companyName).toBe("Edited Name");
    expect(merged.colors).toEqual(["#6C3CFF", "#111111"]);
  });

  it("creates stable product dedupe keys and excludes unapproved products", () => {
    expect(productDedupeKey({ sku: "ABC-1", productUrl: "https://example.com/p/1", name: "One" })).toBe(productDedupeKey({ sku: "abc-1", productUrl: "https://example.com/p/1", name: "One" }));
    expect(productDedupeKey({ sku: "ABC-1", productUrl: "https://example.com/collections/a", name: "One" })).toBe(productDedupeKey({ sku: "abc-1", productUrl: "https://example.com/products/one", name: "One Deluxe" }));
    expect(approvedProductsOnly([{ id: 1, status: "pending" }, { id: 2, status: "approved" }])).toEqual([{ id: 2, status: "approved" }]);
    expect(importedProductCanBeUsed("pending")).toBe(false);
    expect(importedProductCanBeUsed("rejected")).toBe(false);
    expect(importedProductCanBeUsed("approved")).toBe(true);
  });

  it("resumes persisted crawl work at the correct phase and records user-edit provenance", () => {
    expect(nextCrawlResumeStatus(4, 10)).toBe("crawling");
    expect(nextCrawlResumeStatus(10, 10)).toBe("analyzing");
    expect(editedProductProvenance({ images: "https://example.com/p/1" }, 17, 1234)).toEqual({ images: "https://example.com/p/1", name: "user:17@1234", sku: "user:17@1234", category: "user:17@1234", description: "user:17@1234", price: "user:17@1234", specifications: "user:17@1234" });
  });
});
