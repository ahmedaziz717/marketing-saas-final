import { expect, it } from "vitest";
import { extractPageEvidence } from "./lib/websiteCrawler";
import { missingProductFacts } from "./lib/productSpecifications";
const url = "https://shop.example/products/pc-1";
const page = (body: string, properties: unknown[] = []) =>
  `<html><head><title>Gaming PC</title><script type="application/ld+json">${JSON.stringify({ "@type": "Product", name: "Gaming PC", url, sku: "pc-1", additionalProperty: properties })}</script></head><body><main>${body}</main></body></html>`;
it("reads label/value component rows and quantities without benchmark or recommended-product contamination", () => {
  const result = extractPageEvidence(
    page(`<ul>
    <li><span aria-hidden="true">icon</span><p>Processor</p><div><p>AMD Ryzen 7 9700X</p><button>More info</button></div></li>
    <li><p>Memory</p><div><p><span>2x </span><span>16GB DDR5-5600</span></p></div></li>
    <li><p>Video Card</p><div>NVIDIA RTX 4070 SUPER 12GB</div></li>
    <li><p>Primary Hard Drive</p><div>1TB NVMe SSD</div></li>
    <li>Call of Duty: Warzone 150FPS</li><li>CS: GO300FPS</li>
  </ul><section class="recommended-products"><table><tr><td>Processor</td><td>Wrong processor</td></tr></table></section>`),
    url
  );
  expect(result.specifications).toMatchObject({
    Processor: "AMD Ryzen 7 9700X",
    Memory: "2x 16GB DDR5-5600",
    "Video Card": "NVIDIA RTX 4070 SUPER 12GB",
    "Primary Hard Drive": "1TB NVMe SSD",
  });
  expect(Object.keys(result.specifications)).not.toContain("Call of Duty");
  expect(Object.values(result.specifications).join(" ")).not.toMatch(
    /FPS|Wrong|More info/
  );
  expect(result.missingProductFacts).toEqual([]);
});
it("combines structured properties, definition lists, tables and labelled lists on other sites", () => {
  const result = extractPageEvidence(
    page(
      `<dl><dt>Material</dt><dd>Wool</dd></dl><table><tr><th>Weight</th><td>400 g</td></tr></table><ul><li>Color: Blue</li></ul>`,
      [{ name: "Size", value: "Medium" }]
    ),
    url
  );
  expect(result.specifications).toMatchObject({
    Material: "Wool",
    Weight: "400 g",
    Color: "Blue",
    Size: "Medium",
  });
  expect(result.specificationEvidence?.Size.source).toBe(
    "schema:additionalProperty"
  );
});
it("selects the matching product schema and leaves incomplete specs explicitly missing", () => {
  const body = `<script type="application/ld+json">${JSON.stringify([
    {
      "@type": "Product",
      url: "https://shop.example/products/other",
      additionalProperty: [{ name: "Memory", value: "8GB" }],
    },
    {
      "@type": "Product",
      url,
      additionalProperty: [{ name: "Processor", value: "Ryzen 7" }],
    },
  ])}</script>`;
  const result = extractPageEvidence(body, url);
  expect(result.specifications).toEqual({ Processor: "Ryzen 7" });
  expect(missingProductFacts("Gaming PC", result.specifications)).toEqual([
    "graphics",
    "memory",
    "storage",
  ]);
});
