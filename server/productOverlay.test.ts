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
  ProductOverlayResolutionError,
  suggestProductPlacement,
} from "./lib/productOverlay";
const mocked = vi.hoisted(() => ({ invoke: vi.fn() }));
vi.mock("./_core/llm", () => ({
  invokeLLM: mocked.invoke,
  listLLMModels: async () => ({ data: [{ id: "gpt-5.5" }] }),
}));

const source = async (width = 40) => ({
  png: await sharp({
    create: { width, height: width * 2, channels: 4, background: "red" },
  })
    .png()
    .toBuffer(),
  width,
  height: width * 2,
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
    [{ left: 100, top: 15, width: 60 }],
    true
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
  // The provider rejects JSON mode before generation unless a message explicitly
  // asks for JSON. Exercise the real request contract, not just its mocked reply.
  const request = mocked.invoke.mock.calls.at(-1)![0];
  expect(request.response_format).toEqual({ type: "json_object" });
  expect(
    request.messages.some(
      (message: { content: unknown }) =>
        typeof message.content === "string" && /\bjson\b/i.test(message.content)
    )
  ).toBe(true);
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

it("automatically composites a confident matching product without a separate action charge", async () => {
  mocked.invoke.mockResolvedValue({
    choices: [
      {
        message: {
          content: JSON.stringify({
            products: [
              {
                left: 300,
                top: 200,
                width: 300,
                height: 600,
                confidence: 0.95,
                sameAngle: true,
              },
            ],
          }),
        },
      },
    ],
  });
  const { automaticProductOverlay } = await import("./lib/productOverlay");
  const finished = await automaticProductOverlay(
    await design(),
    [await source(80)],
    { width: 200, height: 200 }
  );
  await expect(
    automaticProductOverlay(await design(), [await source()], {
      width: 200,
      height: 200,
    })
  ).rejects.toBeInstanceOf(ProductOverlayResolutionError);
  const failure = await automaticProductOverlay(
    await design(),
    [await source()],
    { width: 200, height: 200 }
  ).catch(error => error as ProductOverlayResolutionError);
  expect(failure.placements).toEqual([{ width: 60, left: 60, top: 40 }]);
  const callsBeforeRecovery = mocked.invoke.mock.calls.length;
  const recovered = await renderProductOverlay(
    await design(),
    [await source(80)],
    failure.placements!
  );
  expect(recovered.layers[0]).toMatchObject({ width: 60, left: 60, top: 40 });
  expect(mocked.invoke).toHaveBeenCalledTimes(callsBeforeRecovery);
  const corner = await sharp(recovered.png)
    .extract({ left: 0, top: 0, width: 1, height: 1 })
    .raw()
    .toBuffer();
  const originalCorner = await sharp(await design())
    .extract({ left: 0, top: 0, width: 1, height: 1 })
    .raw()
    .toBuffer();
  expect(corner).toEqual(originalCorner);
  expect(finished.layers[0]).toMatchObject({
    left: 60,
    top: 40,
    width: 60,
    height: 120,
  });
  expect(mocked.invoke).toHaveBeenLastCalledWith(
    expect.objectContaining({ includedInAction: true })
  );
});
it.each([
  { confidence: 0.7, sameAngle: true, width: 300, height: 600 },
  { confidence: 0.99, sameAngle: false, width: 300, height: 600 },
  { confidence: 0.99, sameAngle: true, width: 600, height: 600 },
])(
  "does not silently apply an uncertain or distorted automatic overlay: %j",
  async box => {
    mocked.invoke.mockResolvedValue({
      choices: [
        {
          message: {
            content: JSON.stringify({
              products: [{ left: 100, top: 100, ...box }],
            }),
          },
        },
      ],
    });
    const { automaticProductOverlay } = await import("./lib/productOverlay");
    await expect(
      automaticProductOverlay(await design(), [await source()], {
        width: 200,
        height: 200,
      })
    ).rejects.toThrow();
  }
);

it("clears needs-adjustment on manual correction without changing the original version", async () => {
  const { manuallyAppliedProductOverlay } = await import(
    "../shared/productOverlay"
  );
  const original = {
    method: "editable_original_v3" as const,
    designStorageKey: "base",
    designUrl: "/base",
    applied: false,
    alignment: "needs_adjustment" as const,
    automaticFailureDiagnostic: {
      stage: "alignment" as const,
      reason: "low_confidence" as const,
      confidence: 0.7,
    },
    layers: [],
  };
  const corrected = manuallyAppliedProductOverlay(original, []);
  expect(corrected).toMatchObject({
    applied: true,
    alignment: "manual",
    designStorageKey: "base",
    automaticFailureDiagnostic: undefined,
  });
  expect(original).toMatchObject({
    applied: false,
    alignment: "needs_adjustment",
  });
});

it("rejects silent enlargement while allowing an explicitly accepted manual enlargement", async () => {
  const original = await design(),
    cutout = await source();
  await expect(
    renderProductOverlay(original, [cutout], [{ left: 0, top: 0, width: 60 }])
  ).rejects.toThrow(/higher-resolution/);
  expect(
    (
      await renderProductOverlay(
        original,
        [cutout],
        [{ left: 0, top: 0, width: 60 }],
        true
      )
    ).layers[0].width
  ).toBe(60);
});
it("covers a same-angle footprint proportionally without stretching the cutout", async () => {
  mocked.invoke.mockResolvedValue({
    choices: [
      {
        message: {
          content: JSON.stringify({
            products: [
              {
                left: 200,
                top: 100,
                width: 525,
                height: 700,
                confidence: 0.99,
                sameAngle: true,
              },
            ],
          }),
        },
      },
    ],
  });
  const canvas = await sharp({
    create: { width: 1000, height: 1000, channels: 4, background: "blue" },
  })
    .png()
    .toBuffer();
  const cutout = {
    png: await sharp({
      create: { width: 480, height: 666, channels: 4, background: "red" },
    })
      .png()
      .toBuffer(),
    width: 480,
    height: 666,
    sourceKey: "700px-original",
    sha256: "original-digest",
  };
  const { automaticProductOverlay } = await import("./lib/productOverlay");
  const result = await automaticProductOverlay(canvas, [cutout], {
    width: 1000,
    height: 1000,
  });
  expect(result.layers[0]).toMatchObject({
    left: 200,
    top: 86,
    width: 525,
    height: 728,
    sourceKey: "700px-original",
    sha256: "original-digest",
  });
  expect(
    await sharp(result.png)
      .extract({ left: 725, top: 800, width: 1, height: 1 })
      .raw()
      .toBuffer()
  ).toEqual(
    await sharp(canvas)
      .extract({ left: 725, top: 800, width: 1, height: 1 })
      .raw()
      .toBuffer()
  );
  expect(
    await sharp(result.png)
      .extract({ left: 724, top: 799, width: 1, height: 1 })
      .raw()
      .toBuffer()
  ).toEqual(Buffer.from([255, 0, 0, 255]));
});
it("requires enlargement consent for height-only stretch and rejects clipping", async () => {
  const cutout = await source();
  await expect(
    renderProductOverlay(
      await design(),
      [cutout],
      [{ left: 10, top: 20, width: 40, height: 100 }]
    )
  ).rejects.toThrow(/higher-resolution/);
  const result = await renderProductOverlay(
    await design(),
    [cutout],
    [{ left: 10, top: 20, width: 40, height: 100 }],
    true
  );
  expect(result.layers[0]).toMatchObject({
    width: 40,
    height: 100,
    left: 10,
    top: 20,
  });
  await expect(
    renderProductOverlay(
      await design(),
      [cutout],
      [{ left: 190, top: 20, width: 40, height: 100 }],
      true
    )
  ).rejects.toThrow(/canvas/);
});

it("composites full-resolution output pixels rather than a smaller editor preview", async () => {
  const fullDesign = await sharp({
    create: { width: 1080, height: 1080, channels: 4, background: "blue" },
  })
    .png()
    .toBuffer();
  const cutout = await source(400);
  const rendered = await renderProductOverlay(
    fullDesign,
    [cutout],
    [{ left: 500, top: 100, width: 400, height: 800 }]
  );
  expect(await sharp(rendered.png).metadata()).toMatchObject({
    width: 1080,
    height: 1080,
  });
  expect(rendered.layers[0]).toMatchObject({
    left: 500,
    top: 100,
    width: 400,
    height: 800,
  });
  expect(
    await sharp(rendered.png)
      .extract({ left: 899, top: 899, width: 1, height: 1 })
      .raw()
      .toBuffer()
  ).toEqual(Buffer.from([255, 0, 0, 255]));
  expect(
    await sharp(rendered.png)
      .extract({ left: 900, top: 900, width: 1, height: 1 })
      .raw()
      .toBuffer()
  ).toEqual(Buffer.from([0, 0, 255, 255]));
});

it.each([
  { width: 1080, height: 1920 },
  { width: 1920, height: 1080 },
])(
  "keeps full portrait/landscape canvas and exact original-source proportions: %j",
  async canvas => {
    const fullDesign = await sharp({
      create: { ...canvas, channels: 4, background: "blue" },
    })
      .png()
      .toBuffer();
    const cutout = await source(400);
    const rendered = await renderProductOverlay(
      fullDesign,
      [cutout],
      [{ left: 300, top: 200, width: 350, height: 700 }]
    );
    expect(await sharp(rendered.png).metadata()).toMatchObject(canvas);
    expect(rendered.layers[0]).toMatchObject({
      left: 300,
      top: 200,
      width: 350,
      height: 700,
      sourceKey: cutout.sourceKey,
      sha256: cutout.sha256,
    });
    expect(
      await sharp(rendered.png)
        .extract({ left: 649, top: 899, width: 1, height: 1 })
        .raw()
        .toBuffer()
    ).toEqual(Buffer.from([255, 0, 0, 255]));
    expect(
      await sharp(rendered.png)
        .extract({ left: 650, top: 900, width: 1, height: 1 })
        .raw()
        .toBuffer()
    ).toEqual(Buffer.from([0, 0, 255, 255]));
  }
);
