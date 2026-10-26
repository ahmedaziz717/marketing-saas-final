import { readFileSync } from "node:fs";
import sharp from "sharp";
import { expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ read: vi.fn(), invoke: vi.fn() }));
vi.mock("./storage", () => ({ storageGetBase64: mocks.read }));
vi.mock("./_core/llm", () => ({
  invokeLLM: mocks.invoke,
  listLLMModels: async () => ({ data: [{ id: "gpt-5.5" }] }),
}));
import { loadPreservedProducts } from "./lib/productPreservation";
import {
  automaticProductOverlay,
  renderProductOverlay,
  automaticProductUpscaleAllowed,
} from "./lib/productOverlay";
import { defaultCreativeSetup } from "../shared/creativeBuilder";

it.each([
  {
    id: 732,
    creative: 85,
    size: [480, 666],
    hash: "d3fef5ccbba5099d88b6bd6c50c1f72c9fa058da8023400baad3ed88906cb9e3",
    box: { left: 403, top: 194, width: 509, height: 699 },
    saved: { left: 435, top: 206, width: 550, height: 763 },
  },
  {
    id: 816,
    creative: 89,
    size: [384, 568],
    hash: "1438cda38d94efd4563a6ec1a47d4e5318de9061213481d2693e3e404b59e835",
    box: { left: 442, top: 198, width: 506, height: 674 },
    saved: { left: 477, top: 174, width: 546, height: 808 },
  },
  {
    id: 904,
    creative: 91,
    size: [382, 531],
    hash: "5ac22c28ebdf2fed48ee3ba9235e0a1235bffe84ccdefc3798a9469d310ea856",
    box: { left: 472, top: 219, width: 469, height: 624 },
    saved: { left: 510, top: 221, width: 507, height: 705 },
  },
])(
  "creative $creative: fresh image $id covers the measured footprint without stretching or discarding source identity",
  async fixture => {
    const bytes = readFileSync(
      new URL(
        `./__fixtures__/product-overlay/image${fixture.id}.png`,
        import.meta.url
      )
    );
    mocks.read.mockResolvedValue(bytes.toString("base64"));
    const sourceKey =
      fixture.id === 732
        ? "organizations/3/products/712/import_5d733095-d570-44c2-adfb-f60257fc44c9"
        : fixture.id === 816
          ? "organizations/3/products/724/import_fe0d9679-714e-4667-ad43-04927800e3c5"
          : "organizations/3/products/724/import_a995797a-447e-4494-9d5b-8a13ef90f540";
    const sources = await loadPreservedProducts(
      { ...defaultCreativeSetup(), preserveProduct: true },
      { products: [{ image: { storageKey: sourceKey } }] }
    );
    expect(mocks.read).toHaveBeenLastCalledWith(sourceKey);
    expect(sources[0]).toMatchObject({
      width: fixture.size[0],
      height: fixture.size[1],
      originalWidth: 700,
      originalHeight: 700,
      sha256: fixture.hash,
      sourceKey,
    });
    mocks.invoke.mockResolvedValue({
      choices: [
        {
          message: {
            content: JSON.stringify({
              products: [{ ...fixture.box, confidence: 0.99, sameAngle: true }],
            }),
          },
        },
      ],
    });
    const design = await sharp({
      create: { width: 1080, height: 1080, channels: 4, background: "blue" },
    })
      .png()
      .toBuffer();
    const result = await automaticProductOverlay(design, sources, {
      width: 1080,
      height: 1080,
    });
    expect(result.layers[0]).toMatchObject({
      ...fixture.saved,
      sourceKey,
      sha256: fixture.hash,
    });
    // Bounding-box estimates may differ from the catalog silhouette. Cover the
    // box at the source aspect ratio instead of distorting the physical product.
    const placed = result.layers[0];
    expect(
      Math.abs(
        placed.height - (placed.width * fixture.size[1]) / fixture.size[0]
      )
    ).toBeLessThanOrEqual(0.5);
    expect(placed.left).toBeLessThanOrEqual(
      Math.round(fixture.box.left * 1.08)
    );
    expect(placed.top).toBeLessThanOrEqual(Math.round(fixture.box.top * 1.08));
    expect(placed.left + placed.width).toBeGreaterThanOrEqual(
      Math.round((fixture.box.left + fixture.box.width) * 1.08) - 1
    );
    expect(placed.top + placed.height).toBeGreaterThanOrEqual(
      Math.round((fixture.box.top + fixture.box.height) * 1.08) - 1
    );
    expect(automaticProductUpscaleAllowed(sources[0], fixture.saved)).toBe(
      true
    );
    const saved = await renderProductOverlay(
      design,
      sources,
      [fixture.saved],
      true
    );
    expect(saved.layers[0]).toMatchObject({
      ...fixture.saved,
      sourceKey,
      sha256: fixture.hash,
    });
    // The full generated creative (including text/logo regions) stays unchanged outside the product.
    expect(
      await sharp(saved.png)
        .extract({ left: 0, top: 0, width: 100, height: 100 })
        .raw()
        .toBuffer()
    ).toEqual(
      await sharp(design)
        .extract({ left: 0, top: 0, width: 100, height: 100 })
        .raw()
        .toBuffer()
    );
  }
);

it("rejects padded thumbnails and excessive enlargement on either axis", () => {
  const source = {
    png: Buffer.alloc(0),
    width: 382,
    height: 531,
    originalWidth: 700,
    originalHeight: 700,
    sourceKey: "exact",
    sha256: "hash",
  };
  expect(
    automaticProductUpscaleAllowed(
      { ...source, width: 164, height: 227 },
      { left: 0, top: 0, width: 507, height: 674 }
    )
  ).toBe(false);
  expect(
    automaticProductUpscaleAllowed(source, {
      left: 0,
      top: 0,
      width: 574,
      height: 674,
    })
  ).toBe(false);
  expect(
    automaticProductUpscaleAllowed(source, {
      left: 0,
      top: 0,
      width: 507,
      height: 797,
    })
  ).toBe(false);
  expect(
    automaticProductUpscaleAllowed(source, {
      left: 0,
      top: 0,
      width: 573,
      height: 796,
    })
  ).toBe(true);
});
