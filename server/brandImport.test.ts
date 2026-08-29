import { describe, expect, it } from "vitest";
import { approvedProductsOnly, canStartNewCrawl, canonicalProductIdentityUrl, deterministicProductFromPage, editedProductProvenance, importedProductCanBeUsed, inferProductCategory, inferProductRecordType, mergeBrandDraft, nextCrawlResumeStatus, productDedupeKey, pruneDeletedProductIds, validateExtractedProduct } from "./lib/brandImport";

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
    expect(productDedupeKey({ productUrl: "https://WWW.Example.com/products/apex/?utm_source=ad", name: "Old name" })).toBe(productDedupeKey({ productUrl: "https://example.com/products/apex", name: "Renamed product" }));
    expect(canonicalProductIdentityUrl("https://WWW.Example.com/products/apex/?x=1#details")).toBe("https://example.com/products/apex");
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

  it("normalizes a ProductGroup into one product family with verified variants and prices", () => {
    const product = deterministicProductFromPage({
      url: "https://shop.example.com/products/apex-h2",
      title: "Apex H2",
      description: "Fallback",
      specifications: { "Build volume": "300 mm" },
      imageUrls: ["https://cdn.example.com/fallback.jpg"],
      structuredProducts: [{
        "@type": "ProductGroup",
        name: "Apex H2",
        description: "Manufacturing platform",
        url: "https://shop.example.com/products/apex-h2",
        hasVariant: [
          { "@type": "Product", name: "Apex H2 Standard", sku: "APX-1", image: "https://cdn.example.com/standard.jpg", offers: { price: 1499, priceCurrency: "USD", availability: "https://schema.org/InStock" } },
          { "@type": "Product", name: "Apex H2 Combo", sku: "APX-2", offers: { price: 1799, priceCurrency: "USD" } },
        ],
      }],
    });
    expect(product).toMatchObject({ name: "Apex H2", category: "Products", description: "Manufacturing platform", price: "1499", currency: "USD", variantCount: 2 });
    expect(product?.specifications).toMatchObject({ "Build volume": "300 mm", "Available variants": "Apex H2 Standard; Apex H2 Combo", Availability: "InStock" });
    expect(product?.specifications["Variant SKUs"]).toContain("APX-1");
    expect(product?.imageUrls).toContain("https://cdn.example.com/standard.jpg");
    expect(inferProductCategory("Apex 3D Printer", "https://shop.example.com/products/apex")).toBe("3D Printers");
    expect(inferProductCategory("PLA Basic", "https://shop.example.com/products/pla-basic")).toBe("Filaments & Materials");
    expect(inferProductRecordType("Apex 3D Printer", "https://shop.example.com/products/apex", "Uses multiple filament materials", 3)).toBe("family");
  });

  it("prunes deleted products from campaign brief selections", () => {
    expect(pruneDeletedProductIds([1, 2, 3, 5], [2, 5])).toEqual([1, 3]);
    expect(pruneDeletedProductIds(null, [2])).toEqual([]);
  });

  it("allows completed rescans but prevents overlapping active scans", () => {
    expect(canStartNewCrawl("completed")).toBe(true);
    expect(canStartNewCrawl("review_ready")).toBe(true);
    expect(canStartNewCrawl("failed")).toBe(true);
    expect(canStartNewCrawl("crawling")).toBe(false);
    expect(canStartNewCrawl("analyzing")).toBe(false);
  });
});
