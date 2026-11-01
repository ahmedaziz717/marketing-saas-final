import { TRPCError } from "@trpc/server";
import { googleAdsRows } from "./googleAdsApi";
import { withGoogleAdsAccess } from "./googleAdsConnections";
import type { LibraryDatabase } from "./assetLibrary";

// Google Ads exposes product feed labels, not Merchant Center data-source IDs.
// Keep this read within the existing Ads grant and the selected account's links.
export async function googleMerchantFeedLabels(
  db: LibraryDatabase,
  organizationId: number,
  connectionId: string,
  merchantId: string
) {
  if (!/^\d{1,20}$/.test(merchantId))
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Invalid Merchant Center account.",
    });
  return withGoogleAdsAccess(
    db,
    organizationId,
    connectionId,
    async (connection, token) => {
      const read = (query: string) =>
        googleAdsRows(
          token,
          connection.accountId,
          query,
          connection.details.google?.loginCustomerId
        );
      const links = await read(
        "SELECT product_link.merchant_center.merchant_center_id FROM product_link WHERE product_link.type = 'MERCHANT_CENTER'"
      );
      if (
        !links.some(
          row =>
            String(row.productLink?.merchantCenter?.merchantCenterId) ===
            merchantId
        )
      )
        throw new TRPCError({
          code: "BAD_REQUEST",
          message:
            "Select a Merchant Center account linked to this Google Ads account.",
        });
      const rows = await read(
        `SELECT shopping_product.feed_label FROM shopping_product WHERE shopping_product.merchant_center_id = ${merchantId} LIMIT 10000`
      );
      const labels = Array.from(
        new Set(
          rows
            .map(row => row.shoppingProduct?.feedLabel)
            .filter(
              (label): label is string =>
                typeof label === "string" && label.length > 0
            )
        )
      ).sort();
      return { labels, limited: rows.length >= 10000 };
    }
  );
}
