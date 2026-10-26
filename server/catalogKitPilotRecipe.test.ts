import { expect, it } from "vitest";
import recipe from "../docs/catalog-recipes/clx-kit-gallery.json";
import { galleryPilotRecipeSchema } from "../shared/catalogGalleryPilot";
import { apiCatalogConfigSchema } from "../shared/apiCatalog";
import { mapCatalogMediaGroups } from "./lib/catalogMediaMapping";

it("accepts the documented kit pilot and resolves its old thumbnail alias without dropping stable identity", () => {
  const parsed = galleryPilotRecipeSchema.parse({
    ...recipe,
    detailIdentityPath: "code",
  });
  const groups = mapCatalogMediaGroups(
    {
      code: "gmsetrtu5105bm",
      name: "Kit",
      metadata: {
        gallery: { size: 9 },
        images: { main: "kits/gmsetrtu5105bm/gmsetrtu5105bm_gaming-pc.png" },
      },
      components: {
        chassis: { code: "other", metadata: { gallery: { size: 20 } } },
      },
    },
    apiCatalogConfigSchema.parse(parsed),
    "https://api.cybertron.com/v1/products/kits/gmsetrtu5105bm?configure=true"
  )!;
  expect(groups).toHaveLength(1);
  expect(groups[0].role).toBe("system");
  expect(groups[0].images).toHaveLength(9);
  expect(groups[0].images[0].candidates).toEqual([
    "https://static.cybertron.com/clx/kits/gmsetrtu5105bm/gmsetrtu5105bm_gaming-pc.png",
    "https://static.cybertron.com/clx/kits/gmsetrtu5105bm/gallery/1.png",
  ]);
  expect(groups[0].images.flatMap(image => image.candidates)).toHaveLength(10);
});
it.each([
  "file:///tmp/images",
  "https://user:password@images.test/",
  "not-a-url",
])("rejects unsafe or invalid image bases: %s", imageBaseUrl => {
  expect(
    galleryPilotRecipeSchema.safeParse({
      ...recipe,
      detailIdentityPath: "code",
      imageBaseUrl,
    }).success
  ).toBe(false);
});
it("continues rejecting unreviewed source-wide settings in pilot recipes", () => {
  expect(
    galleryPilotRecipeSchema.safeParse({
      ...recipe,
      detailIdentityPath: "code",
      headers: { Authorization: "secret" },
    }).success
  ).toBe(false);
});
