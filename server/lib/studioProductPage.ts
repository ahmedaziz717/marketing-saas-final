import { catalogEntrySchema } from "../../shared/catalog";
import * as cheerio from "cheerio";
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
  const $ = cheerio.load(page.text);
  $(
    'script,style,noscript,svg,nav,footer,aside,[hidden],[aria-hidden="true"], [style*="display:none"], [style*="display: none"]'
  ).remove();
  const main = $('main,[role="main"]').first();
  const article = $("article").first();
  const body = main.length ? main : article.length ? article : $("body");
  // Keep adjacent headings, paragraphs and list items distinct in the snapshot.
  body.find("h1,h2,h3,h4,p,li,dt,dd,section,div,br").append("\n");
  const pageContent = body
    .text()
    .replace(/[^\S\n]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, 12000);
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
  const title =
    evidence.title || text(item.name) || body.find("h1").first().text().trim();
  const description =
    evidence.description || text(item.description) || pageContent;
  if (!title.trim() && !description.trim())
    throw new Error(
      "This page has no readable details. It may need a login or JavaScript. Describe the promotion manually instead."
    );
  const rawImage = Array.isArray(item.image) ? item.image[0] : item.image;
  const image = text(
    rawImage && typeof rawImage === "object" ? rawImage.url : rawImage,
    evidence.imageUrls[0] ?? ""
  );
  let imageUrl = "";
  if (image) {
    try {
      const candidate = new URL(image, page.finalUrl);
      if (["https:", "http:"].includes(candidate.protocol)) {
        await assertPublicUrl(candidate.toString());
        imageUrl = candidate.toString();
      }
    } catch {
      /* Keep page facts, omit malformed, unsafe or unreachable images. */
    }
  }
  const product = evidence.productCandidate
    ? catalogEntrySchema.parse({
        name: text(item.name, evidence.title).slice(0, 300),
        description: text(
          item.description,
          evidence.description || pageContent
        ).slice(0, 10000),
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
    title: title.slice(0, 180),
    description: description.slice(0, 3000),
    pageContent,
    imageUrl,
    product,
  };
}

/** Compatibility for older clients; non-product pages use the generic preview. */
export async function previewStudioProductPage(website: string) {
  const page = await previewStudioPage(website);
  if (!page.product)
    throw new Error(
      "We could not identify a product on this page. In Page URL, choose Service or General promotion to use its content."
    );
  return page.product;
}
