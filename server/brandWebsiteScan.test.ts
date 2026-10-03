import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("./lib/marketingDrafts", () => ({ marketingJson: vi.fn() }));
vi.mock("./lib/websiteCrawler", async original => ({
  ...(await original<typeof import("./lib/websiteCrawler")>()),
  safeFetchText: vi.fn(),
}));
import { marketingJson } from "./lib/marketingDrafts";
import { safeFetchText } from "./lib/websiteCrawler";
import {
  brandStyleEvidence,
  extractBrandWebsiteEvidence,
  scanBrandWebsite,
} from "./lib/brandWebsiteScan";
import { normalizeBrandLogo } from "./lib/brandLogoImport";
import sharp from "sharp";
const html = `<html><head><title>Home</title><link rel="stylesheet" href="/plugins/irrelevant.css"><link rel="stylesheet" href="/themes/brand.css"><script type="application/ld+json">{"@graph":[{"@type":"Organization","url":"https://example.com","name":"Learning Directory","logo":{"url":"/own-logo.svg"}}]}</script><style>:root{--brand-primary:#0f414c}body{font-family:'Montserrat',sans-serif;color:rgb(15,65,76)}</style></head><body><header><img class="custom-logo" src="/header-logo.png"></header><h1>Discover learning resources</h1><p>We connect families and educators with independent providers. Explore our directory to find resources for your learning journey.</p><img alt="Provider logo" src="/provider-logo.png"></body></html>`;
beforeEach(() => vi.clearAllMocks());
describe("dedicated brand website scan", () => {
  it("finds structured and header logos without treating directory providers as the site's brand", () => {
    const data = extractBrandWebsiteEvidence(html, "https://example.com");
    expect(data.name).toBe("Learning Directory");
    expect(data.logoUrls).toEqual([
      "https://example.com/own-logo.svg",
      "https://example.com/header-logo.png",
    ]);
    expect(data.stylesheetUrls[0]).toBe("https://example.com/themes/brand.css");
    expect(data.colors).toContain("#0F414C");
    expect(data.fonts).toContain("Montserrat");
  });
  it("normalizes RGB and short hex, excludes transparent colors and icon fonts", () => {
    const data = brandStyleEvidence(
      `body{color:rgb(12,34,56);background:#abc;font-family:Inter,sans-serif} .icon{font-family:'Font Awesome';color:rgba(1,2,3,.2)}`
    );
    expect(data.colors).toEqual(["#0C2238", "#AABBCC"]);
    expect(data.fonts).toEqual(["Inter"]);
  });
  it("reads linked CSS and filters invented colors and fonts out of suggestions", async () => {
    vi.mocked(safeFetchText).mockImplementation(async url => ({
      finalUrl: url,
      status: 200,
      contentType: url.endsWith("css") ? "text/css" : "text/html",
      text: url.endsWith("css") ? "body{color:#123456;font-family:Sora}" : html,
    }));
    vi.mocked(marketingJson).mockResolvedValue({
      name: "Learning Directory",
      voice:
        "Welcoming, practical language for families. Attribute services to listed providers.",
      colors: ["#123456", "#BADBAD"],
      fonts: ["Sora", "Imaginary"],
    });
    const result = await scanBrandWebsite("https://example.com");
    expect(result.colors).toEqual(["#123456"]);
    expect(result.fonts).toEqual(["Sora"]);
    expect(result.voice).toContain("providers");
    expect(result.warnings).toEqual([]);
  });
  it("keeps extracted visuals usable and reports voice/style failures", async () => {
    vi.mocked(safeFetchText).mockImplementation(async url => {
      if (url.endsWith("css")) throw Error("blocked");
      return {
        finalUrl: url,
        status: 200,
        contentType: "text/html",
        text: html,
      };
    });
    vi.mocked(marketingJson).mockRejectedValue(Error("unavailable"));
    const result = await scanBrandWebsite("https://example.com");
    expect(result.voice).toBe("");
    expect(result.logoUrls).toHaveLength(2);
    expect(result.warnings).toHaveLength(2);
  });
  it("does not turn a blocked page into a successful brand scan", async () => {
    vi.mocked(safeFetchText).mockResolvedValue({
      finalUrl: "https://example.com",
      status: 403,
      contentType: "text/html",
      text: "Forbidden",
    });
    await expect(scanBrandWebsite("https://example.com")).rejects.toThrow();
    expect(marketingJson).not.toHaveBeenCalled();
  });
  it("rasterizes self-contained SVGs while rejecting remote and local references", async () => {
    const png = await normalizeBrandLogo(
      Buffer.from(
        '<svg xmlns="http://www.w3.org/2000/svg" width="100" height="40"><rect width="100" height="40" fill="#0f414c"/></svg>'
      ),
      "image/svg+xml"
    );
    expect((await sharp(png).metadata()).format).toBe("png");
    await expect(
      normalizeBrandLogo(
        Buffer.from('<svg><image href="file:///etc/passwd"/></svg>'),
        "image/svg+xml"
      )
    ).rejects.toThrow(/external/);
    await expect(
      normalizeBrandLogo(
        Buffer.from('<svg><use href="https://example.com/logo.svg"/></svg>'),
        "image/svg+xml"
      )
    ).rejects.toThrow(/external/);
  });
});
