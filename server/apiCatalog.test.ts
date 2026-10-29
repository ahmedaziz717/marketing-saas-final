import { beforeEach, expect, it, vi } from "vitest";
import { apiCatalogConfigSchema } from "../shared/apiCatalog";
const mocked = vi.hoisted(() => ({ request: vi.fn() }));
vi.mock("./lib/websiteCrawler", () => ({ safeStoreRequest: mocked.request }));
import {
  apiCatalogAddress,
  parseApiCatalog,
  fetchApiCatalog,
  readApiCatalogPage,
  inferProductTemplate,
  inferProductLinkRule,
} from "./lib/apiCatalog";
import { instructionContent } from "./lib/apiInstructions";
const endpoint = "https://store.example/api/catalog?limit=20";
const config = () => apiCatalogConfigSchema.parse({});
const product = {
  id: "pc-1",
  title: "CLX HORUS",
  url: "/products/horus",
  images: [{ src: "https://cdn.example/horus.png" }],
  price: { amount: 3499, currency: "USD" },
};
beforeEach(() => vi.clearAllMocks());

it("enriches gallery groups only from explicitly enabled same-origin detail requests", async () => {
  const cfg = apiCatalogConfigSchema.parse({ mediaGroupsFromDetails: true, detailUrlTemplate: "https://store.example/api/products/{id}?configure=true", mediaGroupRules: [
    { key: "case", role: "optional_component", itemsPath: "options", idPath: "id", namePath: "name", imagesPath: "images", eligiblePath: "enabled" },
  ] });
  mocked.request.mockResolvedValueOnce({ data: [product] }).mockResolvedValueOnce({ data: { options: [{ id: "case1", name: "Case 1", enabled: true, images: ["https://cdn.example/front.png", "https://cdn.example/back.png"] }] } });
  const page = await readApiCatalogPage(endpoint, cfg, null);
  expect(page.items[0].mediaGroups?.[0].images).toHaveLength(2);
  expect(mocked.request).toHaveBeenLastCalledWith("https://store.example/api/products/pc-1?configure=true", {});
  mocked.request.mockReset();
  mocked.request.mockResolvedValueOnce({ data: [product] });
  await expect(readApiCatalogPage(endpoint, { ...cfg, detailUrlTemplate: "https://other.example/{id}" }, null)).rejects.toThrow(/origin/);
  expect(mocked.request).toHaveBeenCalledTimes(1);
});

it("keeps array attributes and feature bullets as selectable catalog facts", () => {
  const page = parseApiCatalog(
    [
      {
        ...product,
        attributes: [
          { name: "Graphics", value: "RTX 5090" },
          { label: "Memory", options: ["64 GB", "DDR5"] },
          { name: "Wi-Fi", value: true },
        ],
        features: ["Tool-free access", "Two-year warranty"],
      },
    ],
    endpoint,
    config()
  );
  expect(page.items[0].specifications).toEqual({
    Graphics: "RTX 5090",
    Memory: "64 GB, DDR5",
    "Wi-Fi": "true",
  });
  expect(page.items[0].features).toEqual([
    "Tool-free access",
    "Two-year warranty",
  ]);
  const custom = parseApiCatalog(
    [{ ...product, info: { highlights: { Cooling: "Liquid cooling" } } }],
    endpoint,
    apiCatalogConfigSchema.parse({ fields: { features: "info.highlights" } })
  );
  expect(custom.items[0].specifications).toEqual({});
  expect(custom.items[0].features).toEqual(["Cooling: Liquid cooling"]);
});

it("previews unresolved products and imports nested component quantities with verified URL rules", () => {
  const kits = [
    {
      code: "kit-1",
      name: "Gaming PC",
      layout: "desktop",
      price: 2000,
      metadata: { images: { main: "kits/kit-1/main.png" } },
      stock: { available: 6 },
      components: {
        memory: { name: "16GB DDR5-5600", quantity: 2 },
        processor: { name: "Ryzen 7 9700X", quantity: 1 },
        monitor: { name: "No Monitor Selected", quantity: 1 },
      },
    },
  ];
  const api = "https://api.vendor.example/v1/kits";
  const preview = parseApiCatalog(kits, api, config(), { preview: true });
  expect(preview.items[0].productUrl).toBe("");
  expect(preview.items[0].imageUrl).toBe("");
  expect(preview.issues).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ field: "productUrl", blocking: false }),
    ])
  );
  const mapping = apiCatalogConfigSchema.parse({
    productUrlRules: [
      {
        path: "layout",
        equals: "desktop",
        template: "https://shop.example/products/{code}",
      },
    ],
    imageBaseUrl: "https://images.example/catalog/",
    defaultCurrency: "USD",
  });
  const result = parseApiCatalog(kits, api, mapping);
  expect(result.items[0]).toMatchObject({
    productUrl: "https://shop.example/products/kit-1",
    imageUrl: "https://images.example/catalog/kits/kit-1/main.png",
    availability: "In stock · 6 available",
    currency: "USD",
    specifications: {
      memory: "32 GB total · 2 × 16GB DDR5-5600",
      processor: "Ryzen 7 9700X",
    },
  });
  expect(result.items[0].specifications).not.toHaveProperty("monitor");
  expect(
    inferProductTemplate("https://shop.example/products/kit-1", kits)
  ).toBe("https://shop.example/products/{code}");
  expect(
    parseApiCatalog([{ ...kits[0], layout: "laptop" }], api, mapping).items[0]
      .productUrl
  ).toBe("");
});

it("rejects executable templates and dangerous field paths", () => {
  for (const productUrlTemplate of [
    "javascript:alert(1)",
    "https://user:password@shop.example/{code}",
    "https://shop.example/{constructor.name}",
  ])
    expect(
      apiCatalogConfigSchema.safeParse({ productUrlTemplate }).success
    ).toBe(false);
  expect(apiCatalogAddress("  https://api.example/products  ")).toBe(
    "https://api.example/products"
  );
});

it("reads a public JSON catalog without credentials and maps common fields", async () => {
  mocked.request.mockResolvedValue({ data: { products: [product] } });
  const page = await readApiCatalogPage(endpoint, config(), null);
  expect(mocked.request).toHaveBeenCalledWith(endpoint, {});
  expect(page.items[0]).toMatchObject({
    name: "CLX HORUS",
    externalId: "pc-1",
    productUrl: "https://store.example/products/horus",
    imageUrl: "https://cdn.example/horus.png",
    price: "3499",
    currency: "USD",
  });
  expect(page.next).toBeNull();
});
it("uses explicit dot paths and preserves stable identifiers and product links", () => {
  const mapping = apiCatalogConfigSchema.parse({
    itemsPath: "payload.rows",
    fields: {
      name: "label",
      id: "code",
      productUrl: "links.shop",
      imageUrl: "photos.0.url",
    },
  });
  const result = parseApiCatalog(
    {
      payload: {
        rows: [
          {
            label: "Desk",
            code: 27,
            links: { shop: "https://shop.example/desk" },
            photos: [{ url: "/desk.png" }],
          },
        ],
      },
    },
    endpoint,
    mapping
  );
  expect(result.items[0]).toMatchObject({
    name: "Desk",
    externalId: "27",
    productUrl: "https://shop.example/desk",
  });
  expect(() =>
    parseApiCatalog([{ name: "No landing page" }], endpoint, config())
  ).toThrow(/stable ID or SKU/);
  expect(() => parseApiCatalog([product, product], endpoint, config())).toThrow(
    /IDs repeat/
  );
});
it("supports basic, bearer and header auth without allowing routing headers or credentials in URLs", async () => {
  mocked.request.mockResolvedValue({ data: [] });
  for (const [auth, expected] of [
    [
      { type: "basic", username: "reader", password: "secret" },
      {
        Authorization: `Basic ${Buffer.from("reader:secret").toString("base64")}`,
      },
    ],
    [{ type: "bearer", token: "token" }, { Authorization: "Bearer token" }],
    [
      { type: "header", name: "X-API-Key", value: "key" },
      { "X-API-Key": "key" },
    ],
  ] as const) {
    await fetchApiCatalog(endpoint, { ...config(), auth });
    expect(mocked.request).toHaveBeenLastCalledWith(endpoint, expected);
  }
  for (const name of ["Host", "Cookie", "X-Forwarded-For", "X-Original-URL"])
    expect(
      apiCatalogConfigSchema.safeParse({
        auth: { type: "header", name, value: "secret" },
      }).success
    ).toBe(false);
  for (const value of [
    "http://store.example/api",
    "https://user:pass@store.example/api",
    "https://store.example/api?api_key=secret",
    "https://store.example:8443/api",
  ])
    expect(() => apiCatalogAddress(value)).toThrow();
  expect(
    apiCatalogConfigSchema.safeParse({ fields: { name: "constructor.name" } })
      .success
  ).toBe(false);
});
it("follows same-origin pages and rejects cross-origin, repeating and token pagination before sending credentials", async () => {
  const cfg = {
    ...config(),
    auth: { type: "bearer" as const, token: "private" },
  };
  mocked.request
    .mockResolvedValueOnce({ data: { items: [product], next: "?page=2" } })
    .mockResolvedValueOnce({
      data: { items: [{ ...product, id: "pc-2" }], next: null },
    });
  const page = await readApiCatalogPage(endpoint, cfg, null);
  await readApiCatalogPage(endpoint, cfg, page.next);
  expect(mocked.request).toHaveBeenLastCalledWith(
    "https://store.example/api/catalog?page=2",
    { Authorization: "Bearer private" }
  );
  for (const next of [
    "https://attacker.example/collect",
    endpoint,
    "cursor-token",
    2,
  ]) {
    mocked.request.mockResolvedValueOnce({ data: { items: [product], next } });
    await expect(readApiCatalogPage(endpoint, cfg, null)).rejects.toThrow(
      /Pagination|pagination/
    );
  }
  const count = mocked.request.mock.calls.length;
  await expect(
    readApiCatalogPage(
      endpoint,
      cfg,
      JSON.stringify({ url: "https://attacker.example/", visited: [] })
    )
  ).rejects.toThrow(/origin/);
  expect(mocked.request).toHaveBeenCalledTimes(count);
});
it("treats instruction files as bounded data and rejects disguised executable/image uploads", async () => {
  const text = await instructionContent([
    {
      name: "api.md",
      mimeType: "text/markdown",
      base64: Buffer.from("Products: data.items").toString("base64"),
    },
  ]);
  expect(text[0]).toMatchObject({ type: "text" });
  await expect(
    instructionContent([
      {
        name: "fake.png",
        mimeType: "image/png",
        base64: Buffer.from("<svg onload='evil()' />").toString("base64"),
      },
    ])
  ).rejects.toThrow(/contents/);
  await expect(
    instructionContent([
      {
        name: "fake.pdf",
        mimeType: "application/pdf",
        base64: Buffer.from("MZ executable").toString("base64"),
      },
    ])
  ).rejects.toThrow(/valid PDF/);
  await expect(
    instructionContent([
      {
        name: "binary.txt",
        mimeType: "text/plain",
        base64: Buffer.from([0, 1, 2]).toString("base64"),
      },
    ])
  ).rejects.toThrow(/UTF-8/);
});

it("imports stock independently and preserves HTML feature bullets", () => {
  const result = parseApiCatalog(
    [
      {
        ...product,
        in_stock: false,
        features: "<ul><li>Dimmable</li><li>Brass finish</li></ul>",
      },
    ],
    endpoint,
    config()
  );
  expect(result.items[0]).toMatchObject({
    availability: "Out of stock",
    features: ["Dimmable", "Brass finish"],
    specifications: {},
  });
});

it("limits a product-page example to its product family", () => {
  const rows = [
    { code: "desktop-1", layout: "desktop" },
    { code: "laptop-1", layout: "laptop" },
  ];
  expect(
    inferProductLinkRule("https://shop.example/desktops/desktop-1", rows)
  ).toEqual({
    rule: {
      path: "layout",
      equals: "desktop",
      template: "https://shop.example/desktops/{code}",
    },
  });
  expect(
    apiCatalogConfigSchema.safeParse({
      productUrlTemplate: "https://{code}.example/product",
    }).success
  ).toBe(false);
});

it("imports incomplete products by stable identity and never substitutes a fake landing page", () => {
  const result = parseApiCatalog(
    [
      { code: "a", name: "Desktop", price: 2000 },
      { code: "b", name: "Laptop", features: ["Portable"] },
    ],
    "https://api.example/kits",
    config()
  );
  expect(result.items.map(p => p.productUrl)).toEqual(["", ""]);
  expect(result.items.map(p => p.externalId)).toEqual(["a", "b"]);
  expect(result.issues.every(i => !i.blocking)).toBe(true);
  expect(result.items[1].features).toEqual(["Portable"]);
  expect(() =>
    parseApiCatalog([{ name: "Unidentified" }], endpoint, config())
  ).toThrow(/stable ID/);
});

it.each(["https://images.example/clx", "https://images.example/clx/"])(
  "preserves the directory for image base %s",
  imageBaseUrl => {
    const result = parseApiCatalog(
      [
        {
          code: "a",
          name: "PC",
          metadata: {
            images: {
              main: "products/product/featured.png",
              chassisFeatured: "components/case/featured.png",
            },
          },
        },
      ],
      "https://api.example/kits",
      { ...config(), imageBaseUrl }
    );
    expect(result.items[0].imageUrl).toBe(
      "https://images.example/clx/products/product/featured.png"
    );
    expect(apiCatalogConfigSchema.parse({ imageBaseUrl }).imageBaseUrl).toBe(
      "https://images.example/clx/"
    );
  }
);

it("retains absolute image URLs and does not duplicate root-relative paths", () => {
  const rows = [
    { code: "1", name: "One", imageUrl: "https://cdn.example/one.png" },
    { code: "2", name: "Two", imageUrl: "/clx/components/two.png" },
  ];
  const result = parseApiCatalog(rows, "https://api.example/kits", {
    ...config(),
    imageBaseUrl: "https://images.example/clx",
  });
  expect(result.items.map(p => p.imageUrl)).toEqual([
    "https://cdn.example/one.png",
    "https://images.example/clx/components/two.png",
  ]);
});

it("imports complete common image arrays with primary-first normalized deduplication", () => {
  const images = Array.from({ length: 35 }, (_, i) => ({ src: `/photos/${i}.png` }));
  const page = parseApiCatalog([{ ...product, imageUrl: "https://store.example/photos/2.png", images: [...images, { url: "javascript:bad()" }, { src: "https://store.example/photos/2.png" }] }], endpoint, config());
  expect(page.items[0].imageUrls).toHaveLength(35);
  expect(page.items[0].imageUrls?.[0]).toBe("https://store.example/photos/2.png");
  expect(page.items[0].imageUrls).toContain("https://store.example/photos/34.png");
  expect(page.issues.some(issue => issue.field === "imageUrl" && !issue.blocking)).toBe(true);
});
it("respects explicit galleries, single images and skipImages", () => {
  const row = { ...product, imageUrl: "https://cdn.example/main.png", photos: ["https://cdn.example/side.png", "https://cdn.example/main.png"] };
  expect(parseApiCatalog([row], endpoint, { ...config(), imagesPath: "photos" }).items[0].imageUrls).toEqual(["https://cdn.example/main.png", "https://cdn.example/side.png"]);
  expect(parseApiCatalog([row], endpoint, { ...config(), skipImages: true }).items[0].imageUrls).toEqual([]);
});
