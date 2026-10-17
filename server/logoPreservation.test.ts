import sharp from "sharp";
import { beforeEach, expect, it, vi } from "vitest";
import {
  creativeSetupSchema,
  defaultCreativeSetup,
} from "../shared/creativeBuilder";
const mocks = vi.hoisted(() => ({
  read: vi.fn(),
  resolve: vi.fn(),
  vision: vi.fn(),
}));
vi.mock("./_core/llm", () => ({
  invokeLLM: mocks.vision,
  listLLMModels: async () => ({ data: [{ id: "gpt-5.5" }] }),
}));
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
  chooseSafeLogoPlacement,
  findSafeLogoPlacement,
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
  const { placement } = await prepareLogoPlacement(
    logo,
    canvas,
    "bottom-right"
  );
  expect(placement).toEqual({ width: 80, height: 40, left: 957, top: 997 });
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
    },
  });
  expect(prompt).toContain('"left":43');
  expect(prompt).toContain("Logo contrast is handled locally");
  expect(prompt).toContain("Do not paint a reserved rectangle");
  expect(prompt).toContain("MANDATORY ART STYLE");
  expect(prompt).toContain("MANDATORY MOOD");
  expect(prompt).toContain(setup.copy.headline);
  expect(prompt).toContain("Do not draw, trace, repeat");
  expect(prompt).toContain("Follow the separate logo instructions above");
  expect(prompt).not.toContain("Use only the supplied logo");
});

it.each([
  ["black", "#19182b", true],
  ["white", "#e7dff2", false],
])(
  "supports a %s logo on a low-contrast scene without repainting the mark or distant art",
  async (color, background, lighten) => {
    const bytes = await sharp({
      create: { width: 60, height: 40, channels: 4, background: color },
    })
      .extend({
        left: 2,
        right: 2,
        top: 2,
        bottom: 2,
        background: { r: 0, g: 0, b: 0, alpha: 0 },
      })
      .png()
      .toBuffer();
    mocks.read.mockResolvedValue(bytes.toString("base64"));
    const logo = (await loadPreservedLogo(
      { ...defaultCreativeSetup(), preserveLogo: true, logoAssetId: 1 },
      { logo: { storageKey: "logo.png" } }
    ))!;
    const design = await sharp({
      create: { width: 200, height: 160, channels: 4, background },
    })
      .png()
      .toBuffer();
    const placement = { left: 50, top: 50, width: 60, height: 40 };
    const result = await renderOriginalLogo(design, logo, placement);
    expect(
      (await sharp(result).extract(placement).raw().toBuffer()).equals(
        await sharp(logo.png).raw().toBuffer()
      )
    ).toBe(true);
    const pixel = async (image: Buffer, left: number, top: number) => [
      ...(await sharp(image)
        .extract({ left, top, width: 1, height: 1 })
        .raw()
        .toBuffer()),
    ];
    expect(await pixel(result, 5, 5)).toEqual(await pixel(design, 5, 5));
    const near = (await pixel(result, 49, 70))[0];
    const distant = (await pixel(result, 29, 70))[0];
    expect(lighten ? near > distant : near < distant).toBe(true);
    expect(await pixel(result, 28, 70)).toEqual(await pixel(design, 28, 70));
  }
);

it("moves the original logo clear of headline, CTA, and product without moving their pixels", async () => {
  const canvas = { width: 1080, height: 1080 };
  const preferred = { left: 43, top: 43, width: 151, height: 151 };
  const protectedRegions = [
    { left: 55, top: 120, width: 600, height: 160 },
    { left: 70, top: 325, width: 380, height: 120 },
    { left: 65, top: 470, width: 400, height: 80 },
    { left: 480, top: 260, width: 500, height: 690 },
  ];
  const placement = chooseSafeLogoPlacement(
    canvas,
    preferred,
    protectedRegions
  );
  expect(placement).not.toEqual(preferred);
  expect(placement.width).toBe(preferred.width);
  const feather = Math.ceil(placement.width * 0.35);
  for (const r of protectedRegions)
    expect(
      placement.left + placement.width + feather <= r.left ||
        placement.left - feather >= r.left + r.width ||
        placement.top + placement.height + feather <= r.top ||
        placement.top - feather >= r.top + r.height
    ).toBe(true);
  const design = await sharp({
    create: { ...canvas, channels: 4, background: "#171329" },
  })
    .png()
    .toBuffer();
  const png = await sharp({
    create: { width: 151, height: 151, channels: 4, background: "black" },
  })
    .png()
    .toBuffer();
  const result = await renderOriginalLogo(
    design,
    { png, width: 151, height: 151, sourceKey: "logo", sha256: "hash" },
    placement
  );
  for (const region of protectedRegions)
    expect(
      (await sharp(result).extract(region).raw().toBuffer()).equals(
        await sharp(design).extract(region).raw().toBuffer()
      )
    ).toBe(true);
});

it("keeps an already-clear corner and refuses to cover a fully occupied canvas", () => {
  const canvas = { width: 1000, height: 1000 };
  const preferred = { left: 40, top: 40, width: 100, height: 100 };
  expect(
    chooseSafeLogoPlacement(canvas, preferred, [
      { left: 400, top: 400, width: 200, height: 200 },
    ])
  ).toEqual(preferred);
  expect(() =>
    chooseSafeLogoPlacement(canvas, preferred, [
      { left: 0, top: 0, width: 1000, height: 1000 },
    ])
  ).toThrow("without covering text or the subject");
});

it("checks completed image content and rejects uncertain or out-of-canvas protection bounds", async () => {
  const design = await sharp({
    create: { width: 1000, height: 1000, channels: 4, background: "white" },
  })
    .png()
    .toBuffer();
  const preferred = { left: 40, top: 40, width: 100, height: 100 };
  const respond = (payload: unknown) =>
    mocks.vision.mockResolvedValue({
      choices: [{ message: { content: JSON.stringify(payload) } }],
    });
  respond({
    confidence: 0.95,
    regions: [{ left: 40, top: 40, width: 300, height: 180 }],
  });
  expect(await findSafeLogoPlacement(design, preferred)).not.toEqual(preferred);
  expect(mocks.vision.mock.calls[0][0].messages[0].content).toContain(
    "untrusted data"
  );
  respond({
    confidence: 0.4,
    regions: [{ left: 40, top: 40, width: 300, height: 180 }],
  });
  await expect(findSafeLogoPlacement(design, preferred)).rejects.toThrow(
    "could not be verified"
  );
  respond({
    confidence: 0.95,
    regions: [{ left: 900, top: 40, width: 300, height: 180 }],
  });
  await expect(findSafeLogoPlacement(design, preferred)).rejects.toThrow(
    "could not be verified"
  );
});
