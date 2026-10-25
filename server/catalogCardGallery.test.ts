import { describe, expect, it } from "vitest";
import {
  catalogCardGallery,
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
