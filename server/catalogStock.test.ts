import { expect, it } from "vitest";
import { catalogStockStatus } from "../shared/catalogFacts";

it.each([
  "In stock",
  "in_stock",
  "InStock",
  "https://schema.org/InStock",
  "In stock · 12 available",
])("recognizes explicit stock: %s", availability => {
  expect(catalogStockStatus({ availability })).toBe("in_stock");
});
it.each(["Out of stock", "out_of_stock", "https://schema.org/OutOfStock"])(
  "recognizes unavailable stock: %s",
  availability => {
    expect(catalogStockStatus({ availability })).toBe("out_of_stock");
  }
);
it.each([null, "", "Unknown", "Preorder", "Backorder", "Not in stock"])(
  "does not infer in-stock from %s",
  availability => {
    expect(catalogStockStatus({ availability })).toBe("other");
  }
);
it("supports legacy availability specs, with the dedicated field taking priority", () => {
  expect(
    catalogStockStatus({ specifications: { "Stock status": "In stock" } })
  ).toBe("in_stock");
  expect(
    catalogStockStatus({
      availability: "Out of stock",
      specifications: { "Stock status": "In stock" },
    })
  ).toBe("out_of_stock");
});
