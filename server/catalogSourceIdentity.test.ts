import { expect, it } from "vitest";
import { relatedCatalogSources } from "../shared/catalogSources";
const old = {
  id: 1,
  name: "Same PC",
  sku: "pc123",
  sourceId: null,
  status: "approved",
  productUrl: "https://shop.example/products/pc123",
  specifications: { Benchmark: "200 FPS" },
};
const api = {
  id: 2,
  name: "Same PC",
  sku: "retail-pc123",
  externalId: "pc123",
  sourceId: 8,
  status: "pending",
  productUrl: "https://shop.example/products/pc123",
  specifications: { Processor: "Core i9", Memory: "96 GB" },
  provenance: { source: "api" },
};
it("identifies exact API counterparts while preserving pending review and independent records", () => {
  expect(relatedCatalogSources(old, [old, api])).toEqual([
    expect.objectContaining({
      id: 2,
      status: "pending",
      source: "api",
      specifications: api.specifications,
    }),
  ]);
  expect(old.specifications).toEqual({ Benchmark: "200 FPS" });
});
it("does not join by product name, fuzzy SKU or blank identity fields", () => {
  expect(
    relatedCatalogSources({ ...old, sku: "", productUrl: "" }, [
      { ...api, sku: "", externalId: "", productUrl: "" },
    ])
  ).toEqual([]);
  expect(
    relatedCatalogSources(old, [
      {
        ...api,
        sku: "pc123-pro",
        externalId: "pc123-pro",
        productUrl: "https://shop.example/products/pc123-pro",
      },
    ])
  ).toEqual([]);
});
