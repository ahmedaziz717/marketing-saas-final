import { beforeEach, expect, it, vi } from "vitest";
const f = vi.hoisted(() => ({ read: vi.fn(), access: vi.fn() }));
vi.mock("./lib/googleAdsApi", () => ({ googleAdsRows: f.read }));
vi.mock("./lib/googleAdsConnections", () => ({
  withGoogleAdsAccess: f.access,
}));
import { googleMerchantFeedLabels } from "./lib/googleMerchantFeedLabels";
beforeEach(() => {
  f.read.mockReset();
  f.access
    .mockReset()
    .mockImplementation(async (_db, _org, _connection, work) =>
      work(
        {
          accountId: "2222222222",
          details: { google: { loginCustomerId: "1111111111" } },
        },
        "token"
      )
    );
});
const link = { productLink: { merchantCenter: { merchantCenterId: "123" } } };
it("discovers distinct labels only for the linked merchant using existing account access", async () => {
  f.read
    .mockResolvedValueOnce([link])
    .mockResolvedValueOnce([
      { shoppingProduct: { feedLabel: "US" } },
      { shoppingProduct: { feedLabel: "CA" } },
      { shoppingProduct: { feedLabel: "US" } },
      {},
    ]);
  expect(
    await googleMerchantFeedLabels({} as any, 7, "connection", "123")
  ).toEqual({ labels: ["CA", "US"], limited: false });
  expect(f.access).toHaveBeenCalledWith(
    {},
    7,
    "connection",
    expect.any(Function)
  );
  expect(f.read).toHaveBeenLastCalledWith(
    "token",
    "2222222222",
    "SELECT shopping_product.feed_label FROM shopping_product WHERE shopping_product.merchant_center_id = 123 LIMIT 10000",
    "1111111111"
  );
});
it("does not query inventory for an unlinked merchant", async () => {
  f.read.mockResolvedValueOnce([]);
  await expect(
    googleMerchantFeedLabels({} as any, 7, "connection", "123")
  ).rejects.toThrow("linked");
  expect(f.read).toHaveBeenCalledTimes(1);
});
it("rejects query injection before access", async () => {
  await expect(
    googleMerchantFeedLabels({} as any, 7, "connection", "123 OR 1=1")
  ).rejects.toThrow("Invalid");
  expect(f.access).not.toHaveBeenCalled();
});
it("returns empty inventory distinctly from access errors and reports the scan limit", async () => {
  f.read.mockResolvedValueOnce([link]).mockResolvedValueOnce([]);
  expect(
    await googleMerchantFeedLabels({} as any, 7, "connection", "123")
  ).toEqual({ labels: [], limited: false });
  f.read
    .mockResolvedValueOnce([link])
    .mockResolvedValueOnce(
      Array.from({ length: 10000 }, () => ({
        shoppingProduct: { feedLabel: "US" },
      }))
    );
  expect(
    (await googleMerchantFeedLabels({} as any, 7, "connection", "123")).limited
  ).toBe(true);
  f.read.mockRejectedValueOnce(new Error("access denied"));
  await expect(
    googleMerchantFeedLabels({} as any, 7, "connection", "123")
  ).rejects.toThrow("access denied");
});
