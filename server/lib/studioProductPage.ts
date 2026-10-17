import { catalogEntrySchema } from "../../shared/catalog";
import {
  assertPublicUrl,
  extractPageEvidence,
  normalizeWebsiteRequestUrl,
  safeFetchText,
} from "./websiteCrawler";

/** Deterministic, bounded single-page import. No paid AI extraction or crawling. */
export async function previewStudioPage(website: string) {
  const url = normalizeWebsiteRequestUrl(website),
    page = await safeFetchText(url);
  if (page.status < 200 || page.status >= 300)
    throw new Error(
      `The page returned HTTP ${page.status}. Check that it is publicly accessible, or describe the promotion manually.`
    );
  if (
    page.contentType &&
    !/text\/(?:html|plain)|application\/xhtml/i.test(page.contentType)
  )
    throw new Error("Use a public web page, not a feed or download.");
  const evidence = extractPageEvidence(page.text, page.finalUrl);
  if (!evidence.title.trim() && !evidence.text.trim())
    throw new Error(
      "This page has no readable details. It may need a login or JavaScript. Describe the promotion manually instead."
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
  const product = evidence.productCandidate
    ? catalogEntrySchema.parse({
        name: text(item.name, evidence.title).slice(0, 300),
        description: text(item.description, evidence.description).slice(
          0,
          10000
        ),
        productUrl: page.finalUrl,
        sku: text(item.sku, evidence.commerceMeta.sku ?? "").slice(0, 180),
        price: text(offer.price, evidence.commerceMeta.price ?? "").slice(
          0,
          80
        ),
        currency: text(
          offer.priceCurrency,
          evidence.commerceMeta.currency ?? ""
        ).slice(0, 16),
        specifications: evidence.specifications,
        imageUrl,
      })
    : null;
  return {
    url: page.finalUrl,
    title: evidence.title.slice(0, 180),
    description: (evidence.description || evidence.text).slice(0, 3000),
    imageUrl,
    product,
  };
}

/** Compatibility for older clients; non-product pages use the generic preview. */
export async function previewStudioProductPage(website: string) {
  const page = await previewStudioPage(website);
  if (!page.product)
    throw new Error(
      "This page does not appear to be a product. In Page URL, choose Service or General promotion to use its content."
    );
  return page.product;
}
