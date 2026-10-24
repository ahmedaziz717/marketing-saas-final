import { expect, it } from "vitest";
import recipe from "../docs/catalog-recipes/clx-chassis.json";
import fixture from "./fixtures/clx-chassis-gallery.json";
import { apiCatalogConfigSchema } from "../shared/apiCatalog";
import { mapCatalogMediaGroups } from "./lib/catalogMediaMapping";

const config = apiCatalogConfigSchema.parse(recipe);
const map = (value: unknown) =>
  mapCatalogMediaGroups(value, config, "https://api.cybertron.com")!;
it("resolves the observed complete galleries with stable component identities and reference provenance", () => {
  const groups = map(fixture);
  expect(groups).toHaveLength(21);
  expect(groups.filter(g => g.role === "optional_component")).toHaveLength(19);
  expect(
    groups.every(g => g.referenceOnly && g.images.length === g.expectedCount)
  ).toBe(true);
  expect(
    new Set(groups.flatMap(g => g.images.flatMap(i => i.candidates))).size
  ).toBe(183);
  expect(
    groups.find(g => g.id === "base-chassis:cas-crs-3500cb")?.images
  ).toHaveLength(8);
  expect(
    groups.find(g => g.id === "chassis-option:cas-crs-3500mb")?.images.at(-1)
      ?.candidates
  ).toEqual([
    "https://static.cybertron.com/clx/components/cas-crs-3500mb/gallery/8.png",
  ]);
  expect(
    groups.find(g => g.id === "chassis-option:asm-cas-nv5wsea")?.images.at(-1)
  ).toEqual({
    id: "index:11",
    candidates: [
      "https://static.cybertron.com/clx/components/asm-cas-nv5wsea/gallery/11.png",
    ],
  });
});
it.each([-1, 1.5, 1001, "8", undefined])(
  "rejects invalid eligible counts %s",
  count => {
    const value = structuredClone(fixture) as any;
    value.components.chassis.metadata.gallery.size = count;
    expect(() => map(value)).toThrow(/gallery count/);
  }
);
it("does not require or fetch unavailable galleries for ineligible options", () => {
  const value = structuredClone(fixture) as any;
  value.components.chassis.upgrades[0].enabledInKit = false;
  delete value.components.chassis.upgrades[0].metadata.gallery;
  const option = map(value).find(
    g => g.id === `chassis-option:${value.components.chassis.upgrades[0].code}`
  )!;
  expect(option.eligible).toBe(false);
  expect(option.images).toEqual([]);
});
it("keeps source values within the configured URL path and disallows dynamic hosts", () => {
  const value = structuredClone(fixture) as any;
  value.components.chassis.code = "case/other?x=1";
  expect(map(value)[0].images[0].candidates[0]).toContain(
    "case%2Fother%3Fx%3D1/gallery/1.png"
  );
  const invalid = structuredClone(recipe);
  invalid.mediaGroupRules[0].indexedGallery.urlTemplate =
    "https://{code}/gallery/{index}.png";
  expect(apiCatalogConfigSchema.safeParse(invalid).success).toBe(false);
});
