import { describe, expect, it } from "vitest";
import { canonicalizeUrl, extractPageEvidence, isExcludedProductUrl, isForbiddenIp, isProductDetailUrl, isProductSectionUrl, mergeDiscoveredUrls, nextProductCatalogWindow, normalizeWebsiteUrl, parseSitemap, productCandidateFromEvidence, productCoverageIdentity, productSitemapPriority, sameSite } from "./lib/websiteCrawler";

describe("crawl URL safety", () => {
  it("normalizes public web addresses and removes tracking parameters", () => {
    expect(normalizeWebsiteUrl("Example.com/products/?utm_source=ad&b=2&a=1#details")).toBe("https://example.com/products?a=1&b=2");
    expect(() => normalizeWebsiteUrl("ftp://example.com/file")).toThrow(/HTTP/);
    expect(() => normalizeWebsiteUrl("https://user:pass@example.com")).toThrow(/credentials/);
  });

  it("blocks private, local, link-local, multicast, and metadata-network addresses", () => {
    ["127.0.0.1", "10.1.2.3", "172.16.0.1", "192.168.1.1", "169.254.169.254", "224.0.0.1", "::1", "fc00::1", "fe80::1"].forEach(address => expect(isForbiddenIp(address)).toBe(true));
    expect(isForbiddenIp("8.8.8.8")).toBe(false);
  });

  it("keeps discovery on the source domain and its subdomains", () => {
    expect(sameSite("https://shop.example.com/p/1", "https://www.example.com")).toBe(true);
    expect(sameSite("https://example.com/p/1", "https://shop.example.com")).toBe(true);
    expect(sameSite("https://example.co/p/1", "https://example.com")).toBe(false);
  });

  it("merges resumable discoveries without duplicates, foreign hosts, or overflow", () => {
    expect(mergeDiscoveredUrls(["https://example.com/"], ["https://example.com/a", "https://example.com/a#top", "https://foreign.test/x", "https://shop.example.com/b"], "https://example.com/", 3)).toEqual(["https://example.com/", "https://shop.example.com/b", "https://example.com/a"]);
  });

  it("ranks purchasable product-detail pages ahead of collection and general pages", () => {
    expect(mergeDiscoveredUrls([], ["https://example.com/collections/printers", "https://example.com/about", "https://example.com/products/apex"], "https://example.com", 3)).toEqual(["https://example.com/products/apex", "https://example.com/collections/printers", "https://example.com/about"]);
    expect(isProductDetailUrl("https://example.com/products/apex?variant=1")).toBe(true);
    expect(isProductDetailUrl("https://example.com/collections/printers")).toBe(false);
  });
});

describe("site evidence extraction", () => {
  it("parses sitemap indexes and URL sets", () => {
    expect(parseSitemap(`<sitemapindex><sitemap><loc>https://example.com/products.xml</loc></sitemap></sitemapindex>`).sitemapLocs).toEqual(["https://example.com/products.xml"]);
    expect(parseSitemap(`<urlset><url><loc>https://example.com/a</loc></url><url><loc>https://example.com/b</loc></url></urlset>`).pageLocs).toEqual(["https://example.com/a", "https://example.com/b"]);
  });

  it("prioritizes brand product families over low-level replacement parts in bounded scans", () => {
    expect(productSitemapPriority({ loc: "https://us.store.bambulab.com/products/h2d", title: "Bambu Lab H2D", lastmod: "2026-08-01" })).toBeGreaterThan(productSitemapPriority({ loc: "https://us.store.bambulab.com/products/replacement-control-board-fan", title: "Replacement Control Board Fan", lastmod: "2026-08-01" }));
  });

  it("advances through product catalogs in bounded 250-page windows without repeating canonical product URLs", () => {
    const candidates = Array.from({ length: 520 }, (_, index) => `https://shop.example.com/products/item-${index + 1}`);
    const first = nextProductCatalogWindow(candidates, [], 250);
    const second = nextProductCatalogWindow(candidates, first, 250);
    const third = nextProductCatalogWindow(candidates, [...first, ...second], 250);
    expect(first).toHaveLength(250);
    expect(second).toHaveLength(250);
    expect(third).toHaveLength(20);
    expect(new Set([...first, ...second, ...third].map(productCoverageIdentity)).size).toBe(520);
    expect(nextProductCatalogWindow([`${candidates[0]}/?variant=1`, `${candidates[0]}?variant=2`], [candidates[0]!], 10)).toEqual([]);
  });

  it("extracts editable brand evidence and structured product provenance", () => {
    const evidence = extractPageEvidence(`<!doctype html><html><head><title>Acme One</title><meta name="description" content="Precision tools"><link rel="stylesheet" href="/brand.css"><style>:root{--brand:#6c3cff;font-family:'Manrope',sans-serif}</style><script type="application/ld+json">{"@type":"Product","name":"Acme One","sku":"A1"}</script></head><body><img class="brand-logo" src="/logo.png" alt="Acme logo"><a href="/products/acme-one">Buy</a><h1>Acme One</h1></body></html>`, "https://example.com/products/acme-one", `.product{color:#12AB34;font-family:"Sora"}`);
    expect(evidence.pageType).toBe("product");
    expect(evidence.colors).toContain("#6C3CFF");
    expect(evidence.fonts).toContain("Manrope");
    expect(evidence.fonts).toContain("Sora");
    expect(evidence.colors).toContain("#12AB34");
    expect(evidence.stylesheetUrls).toEqual(["https://example.com/brand.css"]);
    expect(evidence.logoUrls).toEqual(["https://example.com/logo.png"]);
    expect(evidence.structuredProducts[0]).toMatchObject({ name: "Acme One", sku: "A1" });
    expect(evidence.commerceMeta.sku).toBeNull();
  });

  it("captures deterministic Open Graph commerce fallback fields", () => {
    const evidence = extractPageEvidence(`<html><head><title>Apex Printer</title><meta property="og:type" content="product"><meta property="product:retailer_item_id" content="APX-1"><meta property="product:price:amount" content="1299"><meta property="product:price:currency" content="USD"><meta property="product:availability" content="in stock"><meta property="og:image" content="/apex.jpg"></head><body><button>Add to cart</button></body></html>`, "https://shop.example.com/products/apex");
    expect(evidence.commerceMeta).toEqual({ sku: "APX-1", price: "1299", currency: "USD", availability: "in stock" });
  });

  it("recognizes ProductGroup variants and extracts deterministic specification tables", () => {
    const evidence = extractPageEvidence(`<html><head><title>Apex H2</title><script id="product-jsonld" type="application/ld+json">{"@type":"ProductGroup","name":"Apex H2","description":"A manufacturing platform","url":"https://shop.example.com/products/apex-h2","hasVariant":[{"@type":"Product","name":"Apex H2 Standard","sku":"APX-1","image":"https://cdn.example.com/apex.jpg","offers":{"price":"1499","priceCurrency":"USD","availability":"https://schema.org/InStock"}},{"@type":"Product","name":"Apex H2 Combo","sku":"APX-2","offers":{"price":"1799","priceCurrency":"USD"}}]}</script></head><body><button>Add to cart</button><table><tr><th>Build volume</th><td>300 × 300 × 300 mm</td></tr></table></body></html>`, "https://shop.example.com/products/apex-h2");
    expect(evidence.pageType).toBe("product");
    expect(evidence.structuredProducts[0]).toMatchObject({ "@type": "ProductGroup", name: "Apex H2" });
    expect(evidence.specifications).toMatchObject({ "Build volume": "300 × 300 × 300 mm" });
  });

  it("accepts genuine product detail evidence and rejects support, editorial, service, policy, and collection pages", () => {
    const product = extractPageEvidence(`<html><head><meta property="og:type" content="product"><meta property="product:price:amount" content="1499"><script type="application/ld+json">{"@type":"Product","name":"Apex","sku":"APX-1","offers":{"price":"1499"}}</script></head><body><img src="/apex.png"><button>Add to cart</button></body></html>`, "https://example.com/products/apex");
    expect(product.productCandidate).toBe(true);
    expect(product.pageType).toBe("product");
    ["https://example.com/support/setup", "https://example.com/docs/api", "https://example.com/blog/apex-guide", "https://example.com/services/repairs", "https://example.com/policies/privacy", "https://forum.example.com/t/apex-is-in-stock/846", "https://community.example.com/t/apex-bug-report/67", "https://example.com/collections/desktops", "https://example.com/products"].forEach(url => {
      const evidence = extractPageEvidence(`<html><body><h1>Apex information</h1><img src="/apex.png"><p>$1,499</p></body></html>`, url);
      expect(evidence.productCandidate, url).toBe(false);
    });
  });

  it("discovers product sections while excluding known non-product sections", () => {
    expect(isProductSectionUrl("https://example.com/products/apex")).toBe(true);
    expect(isProductSectionUrl("https://shop.example.com/catalog/apex")).toBe(true);
    expect(isProductSectionUrl("https://us.store.bambulab.com/")).toBe(true);
    expect(isProductSectionUrl("https://store.example.com/products/apex")).toBe(true);
    expect(isProductSectionUrl("https://example.com/support/products/apex-help")).toBe(false);
    expect(isExcludedProductUrl("https://example.com/help/apex")).toBe(true);
    expect(isExcludedProductUrl("https://forum.bambulab.com/t/about-the-troubleshooting-category/43")).toBe(true);
    expect(productCandidateFromEvidence({ url: "https://example.com/products/apex", hasStructuredProduct: false, hasSku: true, hasPrice: true, hasAddToCart: false, hasProductMeta: false, productImageCount: 1 }).eligible).toBe(true);
  });
});
