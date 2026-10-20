import { beforeEach, expect, it, vi } from "vitest";
import { apiCatalogConfigSchema } from "../shared/apiCatalog";
const mocked = vi.hoisted(() => ({ request: vi.fn() }));
vi.mock("./lib/websiteCrawler", () => ({ safeStoreRequest: mocked.request }));
import {
  apiCatalogAddress,
  parseApiCatalog,
  fetchApiCatalog,
  readApiCatalogPage,
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
  ).toThrow(/product URL/);
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
