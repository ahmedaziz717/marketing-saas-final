import sharp from "sharp";
import { expect, it, vi } from "vitest";
import {
  defaultCreativeSetup,
  creativeSetupSchema,
} from "../shared/creativeBuilder";
import { buildCreativePrompt } from "./lib/creativeBuilder";
import { CREATIVE_FONT_GROUPS } from "../shared/creativeFonts";
import {
  renderProductOverlay,
  suggestProductPlacement,
} from "./lib/productOverlay";
const mocked = vi.hoisted(() => ({ invoke: vi.fn() }));
vi.mock("./_core/llm", () => ({
  invokeLLM: mocked.invoke,
  listLLMModels: async () => ({ data: [{ id: "gpt-5.5" }] }),
}));

const source = async () => ({
  png: await sharp({
    create: { width: 40, height: 80, channels: 4, background: "red" },
  })
    .png()
    .toBuffer(),
  width: 40,
  height: 80,
  sourceKey: "original.png",
  sha256: "digest",
});
const design = () =>
  sharp({
    create: { width: 200, height: 200, channels: 4, background: "blue" },
  })
    .png()
    .toBuffer();

it("recomposes from the full design without changing pixels outside the product and preserves its aspect", async () => {
  const original = await design(),
    copy = Buffer.from(original),
    cutout = await source();
  const first = await renderProductOverlay(
    original,
    [cutout],
    [{ left: 10, top: 20, width: 40 }]
  );
  const second = await renderProductOverlay(
    original,
    [cutout],
    [{ left: 100, top: 15, width: 60 }]
  );
  expect(original.equals(copy)).toBe(true);
  expect(second.layers[0]).toMatchObject({
    width: 60,
    height: 120,
    sourceKey: "original.png",
  });
  const pixel = async (image: Buffer, left: number, top: number) => [
    ...(await sharp(image)
      .extract({ left, top, width: 1, height: 1 })
      .removeAlpha()
      .raw()
      .toBuffer()),
  ];
  expect(await pixel(first.png, 20, 30)).toEqual([255, 0, 0]);
  expect(await pixel(second.png, 20, 30)).toEqual([0, 0, 255]);
  expect(await pixel(second.png, 110, 30)).toEqual([255, 0, 0]);
  await expect(
    renderProductOverlay(original, [cutout], [{ left: 190, top: 0, width: 40 }])
  ).rejects.toThrow(/within/);
});

it("uses measured target bounds instead of a fixed small box and flags a different angle", async () => {
  mocked.invoke.mockResolvedValue({
    choices: [
      {
        message: {
          content: JSON.stringify({
            products: [
              {
                left: 500,
                top: 100,
                width: 400,
                height: 800,
                confidence: 0.95,
                sameAngle: false,
              },
            ],
          }),
        },
      },
    ],
  });
  expect(
    await suggestProductPlacement(await design(), [await source()], {
      width: 200,
      height: 200,
    })
  ).toEqual({ layers: [{ left: 100, top: 20, width: 80 }], sameAngle: false });
  mocked.invoke.mockResolvedValue({
    choices: [
      {
        message: {
          content: JSON.stringify({
            products: [
              {
                left: 500,
                top: 100,
                width: 400,
                height: 800,
                confidence: 0.3,
                sameAngle: true,
              },
            ],
          }),
        },
      },
    ],
  });
  await expect(
    suggestProductPlacement(await design(), [await source()], {
      width: 200,
      height: 200,
    })
  ).rejects.toThrow(/uncertain/);
});

it("keeps the full styled prompt and supports Rubik without forcing font preservation", () => {
  const setup = {
    ...defaultCreativeSetup(),
    preserveProduct: true,
    fontFamily: "Rubik",
    mood: "vibrant" as const,
    artStyle: "cinematic" as const,
  };
  expect(CREATIVE_FONT_GROUPS["Sans serif"]).toContain("Rubik");
  expect(
    creativeSetupSchema.parse({ ...setup, preserveFont: undefined })
      .preserveFont
  ).toBe(false);
  const input = {
    setup,
    brand: { colors: ["#123456"], fonts: ["Inter"] } as any,
    products: [] as any,
    formatId: "square_1_1",
    hasLogo: true,
  };
  const prompt = buildCreativePrompt(input);
  for (const content of [
    setup.basePrompt,
    setup.copy.headline,
    "Rubik",
    "MANDATORY MOOD",
    "MANDATORY ART STYLE",
    "Use only the supplied logo",
    "complete, polished advertisement",
    "Font preservation is OFF",
  ])
    expect(prompt).toContain(content);
  expect(prompt).not.toContain("Do not make a finished ad");
  expect(
    buildCreativePrompt({ ...input, setup: { ...setup, preserveFont: true } })
  ).toContain('preserve the selected font family "Rubik"');
});
