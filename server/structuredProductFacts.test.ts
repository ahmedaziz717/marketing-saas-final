import { expect, it } from "vitest";
import {
  structuredCatalogFacts,
  availabilityLabel,
  specificationsFromLines,
} from "../shared/catalogFacts";
import { selectProductFacts } from "./lib/productFacts";
import {
  creativeSetupSchema,
  defaultCreativeSetup,
} from "../shared/creativeBuilder";
import { productFactSelectionSchema } from "../shared/studioProductFacts";
const product = {
  id: 11,
  name: "Studio lamp",
  specifications: {
    Power: "12 W",
    Availability: "https://schema.org/OutOfStock",
    "Feature 1": "Dimmable",
    "Variant prices": "49–79",
  },
  features: ["Dimmable", "Brass finish"],
  price: "49.00",
  currency: "USD",
};
it("separates legacy availability and features without losing technical specifications", () => {
  expect(structuredCatalogFacts(product)).toEqual({
    specifications: { Power: "12 W" },
    features: ["Dimmable", "Brass finish"],
    availability: "https://schema.org/OutOfStock",
  });
  expect(availabilityLabel(structuredCatalogFacts(product).availability)).toBe(
    "Out of stock"
  );
  expect(
    specificationsFromLines(
      "• Power: 12 W\nURL: https://example.test/spec\n: \nEmpty:"
    )
  ).toEqual({ Power: "12 W", URL: "https://example.test/spec" });
});
it("accepts the same explicit fact choices in saved image and video setup", () => {
  const selection = {
    productId: 11,
    featuredSpecKeys: ["Power"],
    featuredFeatures: ["Dimmable"],
    includeAvailability: true,
    includePrice: true,
  };
  expect(productFactSelectionSchema.parse(selection)).toEqual(selection);
  expect(
    creativeSetupSchema.parse({
      ...defaultCreativeSetup(),
      products: [{ ...selection, imageId: 21 }],
    }).products[0]
  ).toMatchObject(selection);
  expect(selectProductFacts(product, selection)).toMatchObject({
    specifications: { Power: "12 W" },
    featuredSpecifications: { Power: "12 W" },
    featuredFeatures: ["Dimmable"],
    availability: "https://schema.org/OutOfStock",
    includeAvailability: true,
    price: "49.00",
  });
  expect(
    selectProductFacts(product, {
      productId: 11,
      featuredSpecKeys: [],
      includePrice: false,
    })
  ).toMatchObject({
    availability: null,
    featuredFeatures: [],
    includeAvailability: false,
    price: null,
  });
});
it("rejects invented or stale features and stock claims against trusted catalog data", () => {
  expect(() =>
    selectProductFacts(product, {
      productId: 11,
      featuredSpecKeys: [],
      featuredFeatures: ["Lifetime warranty"],
      includePrice: false,
    })
  ).toThrow(/features or availability changed/);
  expect(() =>
    selectProductFacts(
      { ...product, specifications: {}, availability: "" },
      {
        productId: 11,
        featuredSpecKeys: [],
        includeAvailability: true,
        includePrice: false,
      }
    )
  ).toThrow(/features or availability changed/);
});

it("keeps structured fields when a catalog is uploaded as CSV", async () => {
  const { parseCatalogCsv } = await import("../shared/catalogCsv");
  const [item] = parseCatalogCsv(
    'name,productUrl,specifications,features,availability\nLamp,https://example.test/lamp,"Power: 12 W\nMaterial: Brass","Dimmable\nTool-free access",Out of stock'
  );
  expect(item).toMatchObject({
    specifications: { Power: "12 W", Material: "Brass" },
    features: ["Dimmable", "Tool-free access"],
    availability: "Out of stock",
  });
});
