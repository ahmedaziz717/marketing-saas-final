import sharp from "sharp";
import { beforeEach, expect, it, vi } from "vitest";
import {
  creativeSetupSchema,
  defaultCreativeSetup,
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
  loadPreservedLogo,
  prepareLogoPlacement,
  renderOriginalLogo,
} from "./lib/logoPreservation";
import { builderImageQuote } from "./routers/creativeBuilder";
import { buildCreativePrompt } from "./lib/creativeBuilder";

beforeEach(() => vi.clearAllMocks());

it("retains original logo pixels and all surrounding art, never enlarging low-resolution artwork", async () => {
  const source = await sharp({
    create: {
      width: 80,
      height: 40,
      channels: 4,
      background: { r: 23, g: 41, b: 62, alpha: 1 },
    },
  })
    .png()
    .toBuffer();
  const padded = await sharp(source)
    .extend({
      left: 3,
      right: 3,
      top: 3,
      bottom: 3,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .png()
    .toBuffer();
  mocks.read.mockResolvedValue(padded.toString("base64"));
  const logo = (await loadPreservedLogo(
    { ...defaultCreativeSetup(), preserveLogo: true, logoAssetId: 1 },
    { logo: { storageKey: "logo.png" } }
  ))!;
  const canvas = { width: 1080, height: 1080 };
  const design = await sharp({
    create: { ...canvas, channels: 4, background: "#c7e2d9" },
  })
    .png()
    .toBuffer();
  const { placement, background } = await prepareLogoPlacement(
    logo,
    canvas,
    "bottom-right"
  );
  expect(placement).toEqual({ width: 80, height: 40, left: 957, top: 997 });
  expect(background).toBe("light");
  const result = await renderOriginalLogo(design, logo, placement);
  const actual = await sharp(result).ensureAlpha().raw().toBuffer();
  const before = await sharp(design).ensureAlpha().raw().toBuffer();
  const mark = await sharp(result).extract(placement).raw().toBuffer();
  expect(mark.equals(await sharp(source).raw().toBuffer())).toBe(true);
  for (let y = 0; y < canvas.height; y++)
    for (let x = 0; x < canvas.width; x++) {
      if (
        x >= placement.left &&
        x < placement.left + placement.width &&
        y >= placement.top &&
        y < placement.top + placement.height
      )
        continue;
      const i = (y * canvas.width + x) * 4;
      if (!actual.subarray(i, i + 4).equals(before.subarray(i, i + 4)))
        throw new Error("Artwork outside the logo changed");
    }
});

it("rejects opaque logos before quoting or paid generation and leaves older drafts off", async () => {
  const setup = {
    ...defaultCreativeSetup(),
    preserveLogo: true,
    logoAssetId: 1,
  };
  const bytes = await sharp({
    create: { width: 40, height: 40, channels: 3, background: "white" },
  })
    .png()
    .toBuffer();
  mocks.read.mockResolvedValue(bytes.toString("base64"));
  await expect(
    builderImageQuote({} as any, 1, setup, {
      products: [],
      logo: { storageKey: "logo.png" },
    } as any)
  ).rejects.toThrow("transparent PNG or WebP");
  expect(mocks.resolve).not.toHaveBeenCalled();
  const { preserveLogo, logoPosition, ...legacy } = setup;
  expect(creativeSetupSchema.parse(legacy)).toMatchObject({
    preserveLogo: false,
    logoPosition: "top-left",
  });
});

it("reserves only the logo area while retaining complete style, copy and product instructions", () => {
  const setup = {
    ...defaultCreativeSetup(),
    preserveLogo: true,
    preserveProduct: true,
    logoAssetId: 1,
  };
  const prompt = buildCreativePrompt({
    setup,
    brand: { name: "Brand", colors: [], fonts: [], voice: "Clear" } as any,
    products: [],
    formatId: "square_1_1",
    hasLogo: true,
    logoPlacement: {
      placement: { left: 43, top: 43, width: 120, height: 90 },
      background: "light",
    },
  });
  expect(prompt).toContain('"left":43');
  expect(prompt).toContain("quiet light background");
  expect(prompt).toContain("MANDATORY ART STYLE");
  expect(prompt).toContain("MANDATORY MOOD");
  expect(prompt).toContain(setup.copy.headline);
  expect(prompt).toContain("Do not draw, trace, repeat");
  expect(prompt).toContain("Follow the separate logo instructions above");
  expect(prompt).not.toContain("Use only the supplied logo");
});
