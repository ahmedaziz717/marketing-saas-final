import { describe, it, expect, vi, afterEach } from "vitest";
vi.mock("./lib/websiteCrawler", () => ({ safeStoreRequest: vi.fn() }));
import { safeStoreRequest } from "./lib/websiteCrawler";
import { readStorePage } from "./lib/storeCatalog";
afterEach(() => vi.resetAllMocks());
describe("Store API adapters", () => {
  it("paginates Shopify product variants and returns the next product cursor", async () => {
    vi.mocked(safeStoreRequest)
      .mockResolvedValueOnce({
        headers: {},
        data: {
          data: {
            products: {
              pageInfo: { hasNextPage: true, endCursor: "products-next" },
              nodes: [
                {
                  id: "gid://shopify/Product/1",
                  title: "Lamp",
                  description: "Light",
                  handle: "lamp",
                  productType: "Lighting",
                  onlineStoreUrl: "https://shop.test/lamp",
                  priceRangeV2: {
                    minVariantPrice: { amount: "20", currencyCode: "USD" },
                  },
                  variants: {
                    nodes: [{ id: "v1", title: "Red", sku: "R", price: "20" }],
                    pageInfo: { hasNextPage: true, endCursor: "variants-next" },
                  },
                },
              ],
            },
          },
        },
      })
      .mockResolvedValueOnce({
        headers: {},
        data: {
          data: {
            product: {
              variants: {
                nodes: [{ id: "v2", title: "Blue", sku: "B", price: "22" }],
                pageInfo: { hasNextPage: false },
              },
            },
          },
        },
      });
    const result = await readStorePage(
      "shopify",
      "https://example.myshopify.com",
      { token: "private-token" },
      null
    );
    expect(result.next).toBe("products-next");
    expect(result.items[0].variants).toHaveLength(2);
    expect(result.items[0]).toMatchObject({ name: "Lamp", currency: "USD" });
    expect(vi.mocked(safeStoreRequest).mock.calls[1][2]).toContain(
      "variants-next"
    );
  });
  it("normalizes BigCommerce products and follows page metadata", async () => {
    vi.mocked(safeStoreRequest)
      .mockResolvedValueOnce({
        headers: {},
        data: {
          data: [
            {
              id: 1,
              name: "Lamp",
              price: 20,
              custom_url: { url: "/lamp" },
              images: [{ url_standard: "https://cdn.test/lamp.png" }],
              variants: [],
            },
          ],
          meta: { pagination: { total_pages: 2, total: 21 } },
        },
      })
      .mockResolvedValueOnce({
        headers: {},
        data: { secure_url: "https://store.test", currency: "USD" },
      });
    const result = await readStorePage(
      "bigcommerce",
      "https://api.bigcommerce.com/stores/abc",
      { token: "private-token" },
      null
    );
    expect(result).toMatchObject({ next: "2", total: 21 });
    expect(result.items[0]).toMatchObject({
      productUrl: "https://store.test/lamp",
      imageUrl: "https://cdn.test/lamp.png",
    });
  });
  it("uses WooCommerce pagination headers and store currency", async () => {
    vi.mocked(safeStoreRequest)
      .mockResolvedValueOnce({
        headers: { "x-wp-totalpages": "2", "x-wp-total": "22" },
        data: [
          {
            id: 1,
            name: "Lamp",
            description: "<p>Light</p>",
            permalink: "https://shop.test/lamp",
            price: "20",
            type: "simple",
            images: [],
            attributes: [],
          },
        ],
      })
      .mockResolvedValueOnce({ headers: {}, data: { value: "USD" } });
    const result = await readStorePage(
      "woocommerce",
      "https://shop.test",
      { token: "consumer", secret: "private" },
      null
    );
    expect(result).toMatchObject({ next: "2", total: 22 });
    expect(result.items[0]).toMatchObject({ currency: "USD", name: "Lamp" });
    expect(vi.mocked(safeStoreRequest).mock.calls[0][0]).not.toContain(
      "private"
    );
  });
});
