import { describe, expect, it } from "vitest";
import {
  catalogCardGallery,
  catalogCreationGallery,
  galleryGroups,
  type CatalogImageMedia,
  type CatalogMediaGroupSummary,
} from "../shared/catalogMedia";

const image = {
  id: 1,
  media: {
    references: [
      { groupId: "system", imageId: "front", position: 0 },
      { groupId: "option", imageId: "front", position: 0 },
    ],
  } as CatalogImageMedia,
};
const groups: CatalogMediaGroupSummary[] = [
  {
    id: "system",
    name: "System",
    role: "system",
    eligible: true,
    declaredImages: 1,
    imageIds: ["front"],
  },
  {
    id: "option",
    name: "Option",
    role: "optional_component",
    eligible: true,
    declaredImages: 1,
    imageIds: ["front"],
  },
];
describe("represented component eligibility", () => {
  it("retains a genuinely current eligible shared system view", () => {
    expect(catalogCardGallery([image], groups, ["option"]).images).toEqual([
      image,
    ]);
  });
  it.each([
    [{ ...groups[0], eligible: false }, groups[1]],
    [{ ...groups[0], imageIds: ["replacement"] }, groups[1]],
    [groups[1]],
  ])(
    "rejects represented-only views when the other reference is no longer eligible",
    (...current) => {
      expect(catalogCardGallery([image], current, ["option"]).images).toEqual(
        []
      );
    }
  );
  it("keeps legacy photos but rejects retired rows", () => {
    expect(catalogCardGallery([{ id: 2 }], groups, ["option"]).images).toEqual([
      { id: 2 },
    ]);
    expect(
      catalogCardGallery(
        [{ ...image, media: { ...image.media, retired: true } }],
        groups,
        ["option"]
      ).images
    ).toEqual([]);
  });
});

it("creation ignores classification and stale grouping but not retirement, without mutating catalog policy", () => {
  const classified = groups.map(group => ({
    ...group,
    eligible: false,
    imageIds: ["old"],
  }));
  const orphan = {
    ...image,
    id: 2,
    media: {
      ...image.media,
      references: [{ groupId: "unknown", imageId: "front", position: 0 }],
    },
  };
  const retired = { ...image, id: 3, media: { ...image.media, retired: true } };
  const gallery = catalogCreationGallery([image, orphan, retired], classified);
  expect(gallery.images.map(i => i.id)).toEqual([1, 2]);
  expect(
    galleryGroups(gallery.images, gallery.groups).every(g => g.eligible)
  ).toBe(true);
  expect(
    galleryGroups(gallery.images, gallery.groups)
      .flatMap(g => g.images)
      .some(i => i.id === 2)
  ).toBe(true);
  expect(classified.every(g => !g.eligible && g.imageIds[0] === "old")).toBe(
    true
  );
  expect(
    catalogCardGallery([image, orphan, retired], classified).images
  ).toEqual([]);
});
