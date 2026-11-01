import { componentIdentity } from "./lib/catalogComponents";
import { expect, it } from "vitest";
import { apiCatalogConfigSchema } from "../shared/apiCatalog";
import { mapCatalogMediaGroups } from "./lib/catalogMediaMapping";
import { catalogCardGallery } from "../shared/catalogMedia";
const config = apiCatalogConfigSchema.parse({
  mediaGroupRules: [
    {
      key: "options",
      role: "optional_component",
      itemsPath: "options",
      idPath: "code",
      namePath: "name",
      imagesPath: "images",
      componentKind: "Chassis",
    },
  ],
});
it("carries exact source code and raw option amounts without treating them as standalone prices", () => {
  const [group] = mapCatalogMediaGroups(
    {
      options: [
        {
          code: "painted:limited-1",
          name: "Printed enclosure",
          price: 55,
          images: ["https://images.test/original.png"],
        },
      ],
    },
    config,
    "https://source.test"
  )!;
  expect(group.component).toEqual({
    sourceCode: "painted:limited-1",
    kind: "Chassis",
    optionAmount: "55",
    amountMeaning: "unknown",
  });
  expect(group.images[0].candidates).toEqual([
    "https://images.test/original.png",
  ]);
});
it("hides only separately represented galleries in catalog cards and preserves original data", () => {
  const groups = mapCatalogMediaGroups(
    {
      options: [
        {
          code: "one",
          name: "Enclosure",
          images: ["https://images.test/original.png"],
        },
      ],
    },
    config,
    "https://source.test"
  )!;
  const summary = groups.map(({ images, ...g }) => ({
    ...g,
    declaredImages: images.length,
  }));
  const media = {
    width: 700,
    height: 700,
    hasAlpha: true,
    candidates: [],
    selectedSourceUrl: "https://images.test/original.png",
    references: [{ groupId: "options:one", imageId: "front", position: 0 }],
    unavailableCandidates: 0,
  };
  const photos = [
    { id: 1, media: null },
    { id: 2, media },
  ];
  expect(catalogCardGallery(photos, summary, ["options:one"])).toEqual({
    images: [photos[0]],
    groups: [],
  });
  expect(photos[1].media!.references[0].groupId).toBe("options:one");
  expect(catalogCardGallery(photos, summary).images).toHaveLength(2);
});

it("never merges component codes across source identities or printed variants", () => {
  expect(componentIdentity(1, "case-black")).not.toBe(
    componentIdentity(2, "case-black")
  );
  expect(componentIdentity(1, "case-black")).not.toBe(
    componentIdentity(1, "case-printed")
  );
});
