import { expect, it } from "vitest";
import {
  reconcileCatalogRefresh,
  catalogRefreshChanges,
} from "../shared/catalogRefresh";
it("keeps manual corrections and records reviewable source changes", () => {
  const result = reconcileCatalogRefresh(
    {
      name: "Reviewed name",
      specifications: { Memory: "32GB" },
      availability: "In stock",
      provenance: { name: "user:1@123", specifications: "user:1@123" },
    },
    {
      name: "Source name",
      specifications: { Memory: "16GB" },
      availability: "Out of stock",
    },
    {},
    "api"
  );
  expect(result.values).toEqual({
    name: "Reviewed name",
    specifications: { Memory: "32GB" },
    availability: "Out of stock",
  });
  expect(catalogRefreshChanges(result.provenance)).toMatchObject({
    before: { availability: "In stock" },
    after: { availability: "Out of stock" },
    preserved: ["name", "specifications"],
  });
  expect(result.changed).toBe(true);
});
it("uses page details only to fill gaps in API specifications", () => {
  const result = reconcileCatalogRefresh(
    {
      name: "API name",
      specifications: { Memory: "32GB" },
      provenance: { source: "api" },
    },
    {
      name: "Page name",
      specifications: { Memory: "8GB", Warranty: "1 year" },
    },
    {},
    "website"
  );
  expect(result.values).toEqual({
    name: "API name",
    specifications: { Memory: "32GB", Warranty: "1 year" },
  });
});
