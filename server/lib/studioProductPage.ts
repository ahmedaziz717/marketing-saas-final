import { catalogEntrySchema } from "../../shared/catalog";
import {
  assertPublicUrl,
  extractPageEvidence,
  normalizeWebsiteUrl,
  safeFetchText,
} from "./websiteCrawler";

/** Deterministic, bounded single-page import. No paid AI extraction or crawling. */
export async function previewStudioProductPage(website: string) {
  const url = normalizeWebsiteUrl(website),
    page = await safeFetchText(url);
  if (page.status < 200 || page.status >= 300)
    throw new Error(`The product page returned HTTP ${page.status}.`);
  const evidence = extractPageEvidence(page.text, page.finalUrl);
  if (!evidence.productCandidate)
    throw new Error(
      "We could not identify a product on this page. Use a direct product page, or choose Business / service."
    );
  const item = evidence.structuredProducts[0] ?? {};
  const offers = Array.isArray(item.offers) ? item.offers[0] : item.offers;
  const offer =
    offers && typeof offers === "object"
      ? (offers as Record<string, unknown>)
      : {};
  const text = (value: unknown, fallback = "") =>
    typeof value === "string" || typeof value === "number"
      ? String(value)
      : fallback;
  const rawImage = Array.isArray(item.image) ? item.image[0] : item.image;
  const image = text(
    rawImage && typeof rawImage === "object" ? rawImage.url : rawImage,
    evidence.imageUrls[0] ?? ""
  );
  let imageUrl = "";
  if (image) {
    const candidate = new URL(image, page.finalUrl);
    if (["https:", "http:"].includes(candidate.protocol)) {
      try {
        await assertPublicUrl(candidate.toString());
        imageUrl = candidate.toString();
      } catch {
        /* Keep product facts, omit unsafe or unreachable images. */
      }
    }
  }
  return catalogEntrySchema.parse({
    name: text(item.name, evidence.title).slice(0, 300),
    description: text(item.description, evidence.description).slice(0, 10000),
    productUrl: page.finalUrl,
    sku: text(item.sku, evidence.commerceMeta.sku ?? "").slice(0, 180),
    price: text(offer.price, evidence.commerceMeta.price ?? "").slice(0, 80),
    currency: text(
      offer.priceCurrency,
      evidence.commerceMeta.currency ?? ""
    ).slice(0, 16),
    specifications: evidence.specifications,
    imageUrl,
  });
}
