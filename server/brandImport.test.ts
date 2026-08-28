import { describe, expect, it } from "vitest";
import { approvedProductsOnly, editedProductProvenance, importedProductCanBeUsed, mergeBrandDraft, nextCrawlResumeStatus, productDedupeKey, validateExtractedProduct } from "./lib/brandImport";

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

  it("rejects unsupported GPT product facts before persistence", () => {
    const page = { pageType: "product", productCandidate: true, productEvidence: ["add_to_cart", "product_detail_path"], text: "Apex H2 printer. SKU APX-2. Price $1,499. Build volume 300 x 300 x 300 mm.", structuredProducts: [] };
    const validated = validateExtractedProduct({ page, candidate: { name: "Apex H2", sku: "INVENTED-9", price: "$9,999", currency: "USD", specifications: [{ name: "Build volume", value: "300 x 300 x 300 mm" }, { name: "Speed", value: "900 mm/s" }] } });
    expect(validated).toEqual({ eligible: true, sku: null, price: null, currency: null, specifications: [{ name: "Build volume", value: "300 x 300 x 300 mm" }] });
    expect(validateExtractedProduct({ page: { ...page, pageType: "other", productCandidate: false }, candidate: { name: "Apex H2", specifications: [] } }).eligible).toBe(false);
    expect(validateExtractedProduct({ page, candidate: { name: "Invented Support Bundle", specifications: [] } }).eligible).toBe(false);
  });
});
