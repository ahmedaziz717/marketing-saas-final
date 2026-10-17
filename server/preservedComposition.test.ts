import sharp from "sharp";
import { expect, it } from "vitest";
import {
  CREATIVE_FORMATS,
  defaultCreativeSetup,
} from "../shared/creativeBuilder";
import {
  preparePreservedComposition,
  compositePreservedCreative,
} from "./lib/preservedComposition";
import { buildPreservationScenePrompt } from "./lib/creativeBuilder";

const brand: any = {
  colors: ["#6c3cff"],
  fonts: [],
  requiredClaims: "",
  prohibitedContent: "",
};
const products: any = [
  {
    id: 1,
    name: "CLX HORUS",
    featuredSpecifications: { CPU: "AMD Ryzen 9 9950X" },
    price: "3499.99",
    currency: "USD",
    includePrice: true,
  },
];
async function cutout() {
  return {
    png: await sharp({
      create: { width: 120, height: 200, channels: 4, background: "red" },
    })
      .png()
      .toBuffer(),
    width: 120,
    height: 200,
    sourceKey: "original.png",
    sha256: "source-digest",
  };
}
const overlaps = (a: any, b: any) =>
  a.left < b.left + b.width &&
  a.left + a.width > b.left &&
  a.top < b.top + b.height &&
  a.top + a.height > b.top;

it("keeps product pixels intact, with exact copy, prices, specs and claims outside all product bounds", async () => {
  const original = await cutout();
  const setup = {
    ...defaultCreativeSetup(),
    preserveProduct: true,
    mood: "dark" as const,
    copy: {
      headline: "Neon power, HORUS style",
      subheadline:
        "Explore the CLX HORUS prebuilt gaming PC configuration featuring an AMD Ryzen 9 9950X 16-Core CPU and GIGABYTE GeForce RTX 5090 WINDFORCE 32GB GPU.",
      cta: "View Configuration",
    },
  };
  for (const format of CREATIVE_FORMATS.filter(
    f => f.channel === "meta" || f.channel === "microsoft"
  )) {
    for (const placement of ["auto", "left", "right", "center"] as const) {
      const composition = await preparePreservedComposition({
        setup: { ...setup, placement },
        brand: { ...brand, requiredClaims: "Terms & conditions apply." },
        products,
        canvas: format,
        cutouts: [original],
      });
      for (const foreground of composition.foreground) {
        expect(foreground.left).toBeGreaterThanOrEqual(0);
        expect(foreground.top).toBeGreaterThanOrEqual(0);
        expect(foreground.left + foreground.width).toBeLessThanOrEqual(
          format.width
        );
        expect(foreground.top + foreground.height).toBeLessThanOrEqual(
          format.height
        );
        for (const layer of composition.layers)
          expect(overlaps(foreground, layer)).toBe(false);
      }
      expect(
        composition.foreground.filter(f => f.text).map(f => f.text)
      ).toEqual([
        setup.copy.headline,
        setup.copy.subheadline,
        "CPU: AMD Ryzen 9 9950X\n3499.99 USD",
        "Terms & conditions apply.",
        setup.copy.cta,
      ]);
      const background = await sharp({
        create: {
          width: format.width,
          height: format.height,
          channels: 4,
          background: "blue",
        },
      })
        .png()
        .toBuffer();
      const output = await compositePreservedCreative(background, composition);
      const layer = composition.layers[0];
      const productPixels = await sharp(output)
        .extract({
          left: layer.left,
          top: layer.top,
          width: layer.width,
          height: layer.height,
        })
        .raw()
        .toBuffer();
      expect(
        productPixels.equals(await sharp(layer.png).raw().toBuffer())
      ).toBe(true);
    }
  }
});

it("never includes catalog facts, copy or ordinary product-rendering instructions in the scene prompt", async () => {
  const setup = { ...defaultCreativeSetup(), preserveProduct: true };
  const composition = await preparePreservedComposition({
    setup,
    brand,
    products,
    canvas: CREATIVE_FORMATS[0],
    cutouts: [await cutout()],
  });
  const prompt = buildPreservationScenePrompt({
    setup,
    brand,
    formatId: "square_1_1",
    layers: composition.layers,
    copyRegion: composition.regions.copy,
  });
  for (const text of [
    setup.copy.headline,
    setup.copy.subheadline,
    setup.basePrompt,
    "Catalog facts:",
    "CLX HORUS",
    "3499.99",
    "Preserve the physical design",
  ])
    expect(prompt).not.toContain(text);
  expect(prompt).toContain(
    "Product photos, logos and copy are deliberately NOT supplied"
  );
  expect(prompt).toContain("No people, hands");
});

it("refuses unreadable dense copy instead of overlapping or silently dropping fields", async () => {
  const setup = {
    ...defaultCreativeSetup(),
    copy: {
      headline: "Long headline ".repeat(13),
      subheadline: "Detailed specification and product features ".repeat(9),
      cta: "View every available product configuration",
    },
  };
  await expect(
    preparePreservedComposition({
      setup,
      brand,
      products,
      canvas: { width: 728, height: 90, name: "Leaderboard" },
      cutouts: [await cutout()],
    })
  ).rejects.toThrow(/layout cannot.*(fit|readable)/);
});

it("escapes markup in customer copy and keeps multiple products and logo separate", async () => {
  const setup = {
    ...defaultCreativeSetup(),
    copy: {
      headline: 'Power <Performance> & "Style"',
      subheadline: "",
      cta: "Shop now",
    },
  };
  const original = await cutout();
  const composition = await preparePreservedComposition({
    setup,
    brand,
    products: [],
    canvas: CREATIVE_FORMATS[0],
    cutouts: [original, original, original],
    logo: original.png,
  });
  expect(composition.layers).toHaveLength(3);
  expect(composition.foreground.find(f => f.role === "headline")?.text).toBe(
    setup.copy.headline
  );
  for (const element of composition.foreground)
    for (const layer of composition.layers)
      expect(overlaps(element, layer)).toBe(false);
});
