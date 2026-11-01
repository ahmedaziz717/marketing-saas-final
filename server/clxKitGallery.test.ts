import { expect, it } from "vitest";
import recipe from "../docs/catalog-recipes/clx-kit-gallery.json";
import { apiCatalogConfigSchema } from "../shared/apiCatalog";
import { mapCatalogMediaGroups } from "./lib/catalogMediaMapping";
import { catalogMediaPlans } from "./lib/catalogMediaPlans";
it("maps six observed product-712 views and binds only the first frame to the verified thumbnail alias", () => {
  const config = apiCatalogConfigSchema.parse(recipe);
  const mediaGroups = mapCatalogMediaGroups({code: "gmhorrtu4b03bm", name: "CLX HORUS AMD RYZEN 7 9800X3D | RTX4080S", metadata: {gallery: {size: 6}, images: {main: "kits/gmhorrtu4b03bm/gmhorrtu4b03bm_gaming-pc.png"}}}, config, "https://api.cybertron.com");
  expect(mediaGroups?.[0].images).toHaveLength(6);
  const imageUrl = "https://static.cybertron.com/clx/kits/gmhorrtu4b03bm/gmhorrtu4b03bm_gaming-pc.png";
  const plans = catalogMediaPlans({imageUrl, mediaGroups} as any);
  expect(plans[0].candidates).toEqual([imageUrl, "https://static.cybertron.com/clx/kits/gmhorrtu4b03bm/gallery/1.png"]);
  expect(plans[5].candidates).toEqual(["https://static.cybertron.com/clx/kits/gmhorrtu4b03bm/gallery/6.png"]);
  expect(plans).toHaveLength(6);
  expect(plans.slice(1).every(plan => !plan.candidates.includes(imageUrl))).toBe(true);
  expect(mediaGroups?.[0].referenceOnly).toBe(true);
});
