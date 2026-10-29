import { expect, it } from "vitest";
import {
  originalProductSelections,
  nativeProductStartingLayer,
  resizeProductLayer,
  resizeProductLayerFromCorner,
} from "../shared/productOverlay";

it("uses full output pixels and preserves aspect when either size control changes", () => {
  const layer = { left: 300, top: 200, width: 200, height: 400 };
  expect(
    resizeProductLayer(layer, 400, 0.5, { width: 1080, height: 1080 })
  ).toEqual({ left: 300, top: 200, width: 400, height: 800 });
  expect(
    resizeProductLayer(layer, 1000, 0.5, { width: 1080, height: 1080 })
  ).toEqual({ left: 300, top: 0, width: 540, height: 1080 });
});

it.each(["nw", "ne", "sw", "se"] as const)(
  "keeps the opposite %s corner fixed at canvas edges",
  corner => {
    const layer = { left: 200, top: 100, width: 200, height: 400 };
    const result = resizeProductLayerFromCorner(
      layer,
      corner,
      {
        x: corner.includes("w") ? -10000 : 10000,
        y: corner.includes("n") ? -10000 : 10000,
      },
      0.5,
      { width: 1080, height: 1080 }
    );
    expect(result.width / result.height).toBe(0.5);
    expect(result.left).toBeGreaterThanOrEqual(0);
    expect(result.top).toBeGreaterThanOrEqual(0);
    expect(result.left + result.width).toBeLessThanOrEqual(1080);
    expect(result.top + result.height).toBeLessThanOrEqual(1080);
    expect(
      corner.includes("w") ? result.left + result.width : result.left
    ).toBe(corner.includes("w") ? 400 : 200);
    expect(corner.includes("n") ? result.top + result.height : result.top).toBe(
      corner.includes("n") ? 500 : 100
    );
  }
);

it("recovers only the exact rendered view from a multi-view batch without changing reusable setup", () => {
  const requestedSetup = {
    products: [
      {
        productId: 7,
        imageId: 71,
        imageIds: [71, 72, 73],
        featuredSpecKeys: [],
        includePrice: false,
      },
    ],
  } as any;
  const metadata = {
    productIds: [7],
    requestedSetup,
    renderedProductImages: [{ productId: 7, imageId: 72 }],
  };
  expect(originalProductSelections(metadata)).toEqual([
    {
      productId: 7,
      imageId: 72,
      imageIds: [72],
      featuredSpecKeys: [],
      includePrice: false,
    },
  ]);
  expect(requestedSetup.products[0].imageIds).toEqual([71, 72, 73]);
  expect(
    originalProductSelections({ productIds: [7], requestedSetup })
  ).toEqual([]);
  expect(
    originalProductSelections({
      ...metadata,
      renderedProductImages: [{ productId: 8, imageId: 72 }],
    })
  ).toEqual([]);
  expect(
    originalProductSelections({
      ...metadata,
      renderedProductImages: [{ productId: 7, imageId: null }],
    })
  ).toEqual([]);
});
it("retains the unambiguous legacy single-view recovery", () => {
  const product = {
    productId: 7,
    imageId: 71,
    featuredSpecKeys: [],
    includePrice: false,
  };
  expect(
    originalProductSelections({
      productIds: [7],
      requestedSetup: { products: [product] } as any,
    })
  ).toEqual([product]);
});

it("does not enlarge the actual 145 by 215 thumbnail cutout when starting manual placement", () => {
  expect(
    nativeProductStartingLayer(
      { sourceWidth: 145, sourceHeight: 215 },
      { width: 1080, height: 1080 }
    )
  ).toEqual({ left: 467, top: 432, width: 145, height: 215 });
  expect(
    nativeProductStartingLayer(
      { sourceWidth: 2000, sourceHeight: 3000 },
      { width: 1080, height: 1080 }
    )
  ).toEqual({ left: 180, top: 0, width: 720, height: 1080 });
});
