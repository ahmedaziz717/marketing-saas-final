/** Review notices are separate from connection/authentication failures. */
export function catalogReviewNotices(product: {
  productUrl?: string | null;
  price?: string | null;
  currency?: string | null;
  images?: unknown[];
  provenance?: Record<string, string>;
}) {
  if (product.provenance?.source !== "api") return [];
  const notices: string[] = [];
  if (!product.productUrl)
    notices.push(
      "Product-page link missing. Add the correct destination before publishing an ad."
    );
  if (product.price && !product.currency)
    notices.push(
      "Price currency missing. Confirm it before using this price in an ad."
    );
  if (
    ["unavailable", "partial"].includes(
      product.provenance["media.status"] ??
        product.provenance["api.imageStatus"]
    )
  )
    notices.push(
      product.images?.length
        ? "A source image could not be loaded. Previously saved images are retained."
        : "Source image could not be loaded. Add an image or correct the source and sync again."
    );
  else if (!product.images?.length)
    notices.push("No product image imported. You can add one during review.");
  return notices;
}
