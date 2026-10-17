import sharp from "sharp";
import { beforeEach, expect, it, vi } from "vitest";
import {
  defaultCreativeSetup,
  creativeSetupSchema,
  generationSetupIssues,
} from "../shared/creativeBuilder";
const mocks = vi.hoisted(() => ({ read: vi.fn(), resolve: vi.fn() }));
vi.mock("./storage", () => ({
  storageGetBase64: mocks.read,
  storagePut: vi.fn(),
}));
vi.mock("./lib/modelCatalog", () => ({
  resolveModel: mocks.resolve,
  imageBatchQuote: vi.fn(),
  imageModelQuote: vi.fn(),
}));
import {
  readProductCutout,
  loadPreservedProducts,
  layoutPreservedProducts,
  compositePreservedProducts,
  preservationSceneInstruction,
} from "./lib/productPreservation";
import { builderImageQuote } from "./routers/creativeBuilder";

beforeEach(() => vi.clearAllMocks());
async function cutoutBytes() {
  const product = Buffer.alloc(82 * 53 * 4);
  for (let i = 0; i < product.length; i += 4) {
    product[i] = (i / 4) % 256;
    product[i + 1] = 173;
    product[i + 2] = 42;
    product[i + 3] = 255;
  }
  const png = await sharp(product, {
    raw: { width: 82, height: 53, channels: 4 },
  })
    .png()
    .toBuffer();
  return {
    product,
    bytes: await sharp(png)
      .extend({
        left: 2,
        right: 2,
        top: 2,
        bottom: 2,
        background: { r: 0, g: 0, b: 0, alpha: 0 },
      })
      .png()
      .toBuffer(),
  };
}

it("preserves source product pixels and generated surroundings at the exact declared coordinates", async () => {
  const { bytes, product } = await cutoutBytes();
  mocks.read.mockResolvedValue(bytes.toString("base64"));
  const original = await readProductCutout("org-1/cutout.png");
  expect(original).toMatchObject({ width: 82, height: 53 });
  const layers = [{ ...original, left: 9, top: 30 }];
  expect(layers[0]).toMatchObject({ left: 9, top: 30, width: 82, height: 53 });
  const background = await sharp({
    create: {
      width: 100,
      height: 100,
      channels: 4,
      background: { r: 7, g: 19, b: 31, alpha: 1 },
    },
  })
    .png()
    .toBuffer();
  const result = await compositePreservedProducts(background, layers);
  const interior = await sharp(result)
    .extract({ left: 9, top: 30, width: 82, height: 53 })
    .ensureAlpha()
    .raw()
    .toBuffer();
  expect(interior.equals(product)).toBe(true);
  const outside = await sharp(result)
    .extract({ left: 0, top: 0, width: 1, height: 1 })
    .ensureAlpha()
    .raw()
    .toBuffer();
  expect([...outside]).toEqual([7, 19, 31, 255]);
  expect(preservationSceneInstruction(layers)).toContain('"left":9');
  expect(preservationSceneInstruction(layers)).toContain(
    "Do NOT draw any product"
  );
});

it("fits separate products without overlap or perspective distortion across formats", async () => {
  mocks.read.mockResolvedValue((await cutoutBytes()).bytes.toString("base64"));
  const cutout = await readProductCutout("cutout.png");
  for (const canvas of [
    { width: 1080, height: 1920 },
    { width: 1200, height: 628 },
    { width: 320, height: 50 },
  ]) {
    for (const placement of ["auto", "left", "right", "center"] as const) {
      const layers = await layoutPreservedProducts(
        [cutout, cutout, cutout],
        canvas,
        placement
      );
      for (let i = 0; i < layers.length; i++) {
        const layer = layers[i];
        expect(layer.left).toBeGreaterThanOrEqual(0);
        expect(layer.top).toBeGreaterThanOrEqual(0);
        expect(layer.left + layer.width).toBeLessThanOrEqual(canvas.width);
        expect(layer.top + layer.height).toBeLessThanOrEqual(canvas.height);
        expect(
          Math.abs(layer.width / layer.height - cutout.width / cutout.height)
        ).toBeLessThan(0.12);
        if (i)
          expect(layer.left).toBeGreaterThanOrEqual(
            layers[i - 1].left + layers[i - 1].width
          );
      }
    }
  }
});

it("rejects opaque or empty images before model lookup or paid generation", async () => {
  const setup = {
    ...defaultCreativeSetup(),
    preserveProduct: true,
    sourceAssetKeys: ["asset:1"],
  };
  const resolved: any = {
    products: [],
    references: [{ key: "asset:1", storageKey: "org-1/source.png" }],
  };
  for (const background of ["white", { r: 0, g: 0, b: 0, alpha: 0 }]) {
    const bytes = await sharp({
      create: { width: 40, height: 40, channels: 4, background },
    })
      .png()
      .toBuffer();
    mocks.read.mockResolvedValue(bytes.toString("base64"));
    await expect(
      builderImageQuote({} as any, 1, setup, resolved)
    ).rejects.toThrow(/Preserve original product/);
  }
  expect(mocks.resolve).not.toHaveBeenCalled();
});

it("reads only resolved product sources, never logos or campaign context, and leaves legacy setups unchanged", async () => {
  const setup = defaultCreativeSetup();
  expect(creativeSetupSchema.parse(setup).preserveProduct).toBeUndefined();
  expect(await loadPreservedProducts(setup, { products: [] })).toEqual([]);
  expect(mocks.read).not.toHaveBeenCalled();
  mocks.read.mockResolvedValue((await cutoutBytes()).bytes.toString("base64"));
  await loadPreservedProducts(
    { ...setup, preserveProduct: true, sourceAssetKeys: ["asset:1"] },
    {
      products: [],
      references: [
        { key: "asset:1", storageKey: "source.png" },
        { storageKey: "campaign.png" },
      ],
    }
  );
  expect(mocks.read).toHaveBeenCalledTimes(1);
  expect(mocks.read).toHaveBeenCalledWith("source.png");
  await expect(
    loadPreservedProducts(
      { ...setup, preserveProduct: true, sourceAssetKeys: ["asset:2"] },
      { products: [], references: [] }
    )
  ).rejects.toThrow(/unavailable/);
  expect(
    generationSetupIssues({
      ...setup,
      preserveProduct: true,
      promotionMode: "platform",
    })
  ).toContain(
    "Preserve original product requires a product photo, not a business promotion."
  );
});

it("explains cutout failures without exposing internal source details", async () => {
  const { categorizeGenerationError } = await import("./lib/generation");
  expect(
    categorizeGenerationError(
      "Selected product cutout is unavailable: internal-key"
    )
  ).toEqual({
    category: "source_image",
    userMessage:
      "Product preservation needs a valid transparent cutout. Choose an approved transparent PNG or WebP product image, then retry.",
  });
});

it("counts only people as AI references when foreground products and branding are composed afterward", async () => {
  const { imageReferenceCount } = await import(
    "../shared/creativeConfigurator"
  );
  expect(
    imageReferenceCount({
      ...defaultCreativeSetup(),
      preserveProduct: true,
      products: [
        { productId: 1, imageId: 1, featuredSpecKeys: [], includePrice: false },
      ],
      sourceAssetKeys: ["asset:1"],
      referenceAssetIds: [2],
      logoAssetId: 3,
    })
  ).toBe(0);
  expect(
    imageReferenceCount({
      ...defaultCreativeSetup(),
      preserveProduct: true,
      people: [{ kind: "asset", assetId: 4 }],
    })
  ).toBe(1);
});
