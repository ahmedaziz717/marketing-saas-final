import { beforeEach, expect, it, vi } from "vitest";
const mock = vi.hoisted(() => ({ fetch: vi.fn() }));
vi.mock("./websiteCrawler", async original => ({
  ...(await original<typeof import("./websiteCrawler")>()),
  safeFetchText: mock.fetch,
  assertPublicUrl: vi.fn().mockResolvedValue(undefined),
}));
import { previewStudioProductPage } from "./studioProductPage";
beforeEach(() => {
  mock.fetch.mockReset();
});
it("accepts a bare product URL and extracts actual title, image and price without AI", async () => {
  mock.fetch.mockResolvedValue({
    status: 200,
    finalUrl: "https://shop.example.com/products/lamp",
    text: '<script type="application/ld+json">{"@type":"Product","name":"Amber lamp","image":"/lamp.png","sku":"L1","offers":{"price":"49","priceCurrency":"USD"}}</script>',
  });
  const result = await previewStudioProductPage(
    "shop.example.com/products/lamp"
  );
  expect(mock.fetch).toHaveBeenCalledWith(
    "https://shop.example.com/products/lamp"
  );
  expect(result).toMatchObject({
    name: "Amber lamp",
    imageUrl: "https://shop.example.com/lamp.png",
    price: "49",
    currency: "USD",
    sku: "L1",
  });
});
it("rejects non-product pages and failed fetches", async () => {
  mock.fetch.mockResolvedValue({
    status: 200,
    finalUrl: "https://example.com/about",
    text: "<h1>About our company</h1>",
  });
  await expect(previewStudioProductPage("example.com/about")).rejects.toThrow(
    /identify a product/
  );
  mock.fetch.mockRejectedValue(
    new Error("Private network addresses are not allowed")
  );
  await expect(
    previewStudioProductPage("example.com/products/one")
  ).rejects.toThrow(/Private network/);
});
it("does not expose unsafe image protocols", async () => {
  mock.fetch.mockResolvedValue({
    status: 200,
    finalUrl: "https://example.com/products/lamp",
    text: '<script type="application/ld+json">{"@type":"Product","name":"Lamp","image":"javascript:alert(1)"}</script>',
  });
  expect(
    (await previewStudioProductPage("example.com/products/lamp")).imageUrl
  ).toBe("");
});
