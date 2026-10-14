import { expect, it } from "vitest";
import {
  creativeSetupSchema,
  defaultCreativeSetup,
  creativeImageOutputs,
  generationSetupIssues,
  isReferenceCreative,
  outputCount,
} from "../shared/creativeBuilder";
import { imageReferenceCount } from "../shared/creativeConfigurator";
import { buildCreativePrompt } from "./lib/creativeBuilder";
it("supports a source-only image set through schema, validation, output planning and prompt", () => {
  const setup = creativeSetupSchema.parse({
    ...defaultCreativeSetup(),
    sourceAssetKeys: ["creative:12", "asset:19"],
    formatIds: ["square_1_1", "portrait_4_5"],
  });
  expect(isReferenceCreative(setup)).toBe(true);
  expect(generationSetupIssues(setup)).toEqual([]);
  expect(outputCount(setup)).toBe(2);
  expect(creativeImageOutputs(setup)).toHaveLength(2);
  expect(imageReferenceCount(setup)).toBeGreaterThanOrEqual(2);
  const prompt = buildCreativePrompt({
    setup,
    brand: { name: "Brand", colors: [], fonts: [] } as any,
    products: [],
    formatId: "square_1_1",
    hasLogo: false,
  });
  expect(prompt).toContain("PRIMARY SUBJECT");
  expect(prompt).toContain("Do not invent specifications");
});
it("rejects duplicate, malformed or excessive source keys", () => {
  for (const keys of [
    ["asset:2", "asset:2"],
    ["asset:0"],
    ["product_image:3"],
    Array.from({ length: 10 }, (_, i) => `asset:${i + 1}`),
  ]) {
    expect(
      creativeSetupSchema.safeParse({
        ...defaultCreativeSetup(),
        sourceAssetKeys: keys,
      }).success
    ).toBe(false);
  }
});
it("preserves product grouping and counts added sources as references", () => {
  const setup = {
    ...defaultCreativeSetup(),
    sourceAssetKeys: ["asset:1"],
    products: [1, 2].map(id => ({
      productId: id,
      imageId: id,
      featuredSpecKeys: [],
      includePrice: false,
    })),
  };
  expect(isReferenceCreative(setup)).toBe(false);
  expect(outputCount(setup)).toBe(setup.formatIds.length * 2);
});
