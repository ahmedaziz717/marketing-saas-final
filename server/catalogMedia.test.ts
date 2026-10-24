import { expect, it, vi } from "vitest";
import sharp from "sharp";
import { apiCatalogConfigSchema } from "../shared/apiCatalog";
import { mapCatalogMediaGroups } from "./lib/catalogMediaMapping";
import {
  catalogDefaultImage,
  catalogImageEligible,
  galleryGroups,
} from "../shared/catalogMedia";
const state = vi.hoisted(() => ({ bytes: new Map<string, Buffer>() }));
vi.mock("./lib/websiteCrawler", () => ({
  safeFetchImage: async (url: string) => {
    if (url.endsWith("rate-limited.png")) throw new Error("HTTP 429");
    const data = state.bytes.get(url);
    if (!data) throw new Error("HTTP 404");
    return { data, contentType: "image/png" };
  },
}));
import { fetchBestCatalogImage } from "./lib/catalogImages";
it("uses measured pixels, retains original bytes and alpha, and rejects incompatible variants", async () => {
  const image = (width: number, height: number, alpha = true) =>
    sharp({
      create: {
        width,
        height,
        channels: alpha ? 4 : 3,
        background: alpha ? { r: 20, g: 30, b: 40, alpha: 0.5 } : "red",
      },
    })
      .png()
      .toBuffer();
  state.bytes.set("https://images.test/original.png", await image(60, 80));
  state.bytes.set("https://images.test/thumb.png", await image(600, 800));
  state.bytes.set("https://images.test/cropped.png", await image(1200, 800));
  state.bytes.set(
    "https://images.test/opaque.png",
    await image(1200, 1600, false)
  );
  const result = await fetchBestCatalogImage(Array.from(state.bytes.keys()));
  expect(result.url).toBe("https://images.test/thumb.png");
  expect(result.image.width).toBe(600);
  expect(result.image.data.equals(state.bytes.get(result.url)!)).toBe(true);
  expect(result.image.hasAlpha).toBe(true);
  expect(result.unavailableCandidates).toBe(2);
});
it("falls back when a declared original is unavailable without inventing URLs", async () => {
  const result = await fetchBestCatalogImage([
    "https://images.test/missing.png",
    "https://images.test/thumb.png",
  ]);
  expect(result.image.width).toBe(600);
  expect(result.unavailableCandidates).toBe(1);
});
it("maps generic base/eligible options, preserves full gallery entries, and never expands a count into URLs", () => {
  const config = apiCatalogConfigSchema.parse({
    mediaGroupRules: [
      {
        key: "base",
        role: "base_component",
        itemsPath: "base",
        idPath: "code",
        namePath: "name",
        imagesPath: "gallery",
        imageUrlPath: "url",
        imageIdPath: "id",
        resolutionPaths: ["original"],
        expectedCountPath: "count",
      },
      {
        key: "options",
        role: "optional_component",
        itemsPath: "options",
        idPath: "code",
        namePath: "name",
        imagesPath: "gallery",
        eligiblePath: "enabled",
      },
    ],
  });
  const groups = mapCatalogMediaGroups(
    {
      base: {
        code: "case-a",
        name: "Base case",
        count: 3,
        gallery: [
          {
            id: "front",
            url: "https://images.test/front.png",
            original: "https://images.test/full.png",
          },
          { id: "back", url: "https://images.test/back.png" },
        ],
      },
      options: [
        {
          code: "case-b",
          name: "Option B",
          enabled: true,
          gallery: ["https://images.test/b1.png", "https://images.test/b2.png"],
        },
        {
          code: "case-c",
          name: "Option C",
          enabled: false,
          gallery: ["https://images.test/c.png"],
        },
        {
          code: "case-d",
          name: "Option D",
          enabled: true,
          gallery: { size: 8 },
        },
      ],
    },
    config,
    "https://api.test/list"
  )!;
  expect(groups[0].images).toHaveLength(2);
  expect(groups[0].images[0].candidates).toHaveLength(2);
  expect(groups[1].images).toHaveLength(2);
  expect(groups[2]).toMatchObject({ eligible: false, images: [] });
  expect(groups[3].images).toEqual([]);
});
it("keeps shared photos in both groups but never defaults to an optional look or permits an ineligible option", () => {
  const image = {
    id: 1,
    media: {
      width: 600,
      height: 800,
      hasAlpha: true,
      candidates: [],
      selectedSourceUrl: "",
      unavailableCandidates: 0,
      references: [
        { groupId: "b", imageId: "front", position: 0 },
        { groupId: "c", imageId: "front", position: 0 },
      ],
    },
  };
  const groups = [
    {
      id: "b",
      name: "B",
      role: "optional_component" as const,
      eligible: true,
      declaredImages: 1,
    },
    {
      id: "c",
      name: "C",
      role: "optional_component" as const,
      eligible: false,
      declaredImages: 1,
    },
  ];
  expect(
    galleryGroups([image], groups).map(group => group.images.length)
  ).toEqual([1, 1]);
  expect(catalogImageEligible(image, groups)).toBe(true);
  expect(catalogDefaultImage(image, groups)).toBe(false);
  expect(
    catalogImageEligible(
      image,
      groups.map(group => ({ ...group, eligible: false }))
    )
  ).toBe(false);
  expect(catalogImageEligible(image, [])).toBe(false);
});

it("preserves transient provider errors for bounded import retries", async () => {
  await expect(fetchBestCatalogImage(["https://images.test/missing.png", "https://images.test/rate-limited.png"])).rejects.toThrow("HTTP 429");
});

it("retires source-removed views without deleting stored images or selecting them automatically", () => {
  const image = { id: 91, media: { width: 600, height: 600, hasAlpha: false, candidates: [], selectedSourceUrl: "", unavailableCandidates: 0, references: [{ groupId: "system", imageId: "old", position: 0 }] } };
  const groups = [{ id: "system", name: "System", role: "system" as const, eligible: true, declaredImages: 1, imageIds: ["new"] }];
  expect(catalogImageEligible(image, groups)).toBe(false);
  expect(catalogDefaultImage(image, groups)).toBe(false);
  expect(galleryGroups([image], groups).find(group => group.id === "retired")?.images).toEqual([image]);
});
