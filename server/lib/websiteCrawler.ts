import { lookup } from "node:dns/promises";
import http from "node:http";
import https from "node:https";
import { createHash } from "node:crypto";
import * as cheerio from "cheerio";
import { XMLParser } from "fast-xml-parser";
import ipaddr from "ipaddr.js";

const MAX_DOCUMENT_BYTES = 2 * 1024 * 1024;
const FETCH_TIMEOUT_MS = 10_000;
const MAX_REDIRECTS = 4;
const BLOCKED_EXTENSIONS = /\.(?:7z|avi|bin|css|csv|docx?|exe|gif|gz|ico|jpe?g|json|mov|mp3|mp4|pdf|png|pptx?|rar|rss|svg|tar|tgz|txt|webm|webp|xlsx?|xml|zip)$/i;

export type PageEvidence = {
  url: string;
  canonicalUrl: string | null;
  title: string;
  description: string;
  siteName: string;
  pageType: "home" | "product" | "collection" | "about" | "contact" | "other";
  text: string;
  colors: string[];
  fonts: string[];
  imageUrls: string[];
  logoUrls: string[];
  stylesheetUrls: string[];
  internalLinks: string[];
  structuredProducts: Array<Record<string, unknown>>;
  productCandidate: boolean;
  productEvidence: string[];
};

const NON_PRODUCT_PATH = /\/(?:support|help|help-center|docs?|documentation|knowledge-base|kb|blog|blogs|news|articles?|resources?|guides?|faqs?|polic(?:y|ies)|legal|privacy|terms|account|login|sign-in|register|cart|checkout|contact|careers?|jobs?|services?|repairs?|returns?|shipping|warranty)(?:\/|$)/i;
const NON_PRODUCT_HOST = /^(?:forum|community|support|help|docs?|documentation|kb|blog|news|careers?|status)\./i;
const COMMERCE_HOST = /^(?:(?:[a-z]{2}\.)?(?:shop|store)|[a-z]{2}\.store)\./i;
const PRODUCT_SECTION_PATH = /\/(?:products?|shop|store|catalog|collections?|categories?)(?:\/|$)/i;
const PRODUCT_DETAIL_PATH = /\/(?:products?|product|p)\/[^/?#]+(?:\/|$)/i;

export function isExcludedProductUrl(value: string) {
  const url = new URL(value);
  return NON_PRODUCT_HOST.test(url.hostname.replace(/^www\./, "")) || NON_PRODUCT_PATH.test(url.pathname);
}

export function isProductSectionUrl(value: string) {
  const url = new URL(value);
  return !isExcludedProductUrl(value) && (PRODUCT_SECTION_PATH.test(url.pathname) || COMMERCE_HOST.test(url.hostname.replace(/^www\./, "")) || /(?:^|[._-])products?(?:[._-]|$)/i.test(url.hostname));
}

export function productCandidateFromEvidence(input: { url: string; hasStructuredProduct: boolean; hasSku: boolean; hasPrice: boolean; hasAddToCart: boolean; hasProductMeta: boolean; productImageCount: number }) {
  if (isExcludedProductUrl(input.url)) return { eligible: false, reasons: ["excluded_path"] };
  const path = new URL(input.url).pathname;
  const detailPath = PRODUCT_DETAIL_PATH.test(path);
  const collectionPath = PRODUCT_SECTION_PATH.test(path) && !detailPath;
  if (collectionPath) return { eligible: false, reasons: ["collection_or_product_index"] };
  const reasons = [input.hasStructuredProduct && "product_schema", input.hasSku && "sku", input.hasPrice && "price", input.hasAddToCart && "add_to_cart", input.hasProductMeta && "product_meta", input.productImageCount > 0 && "product_image", detailPath && "product_detail_path"].filter((value): value is string => Boolean(value));
  const commerceFacts = [input.hasStructuredProduct, input.hasSku, input.hasPrice, input.hasAddToCart, input.hasProductMeta].filter(Boolean).length;
  const eligible = input.hasStructuredProduct || (detailPath && input.productImageCount > 0 && commerceFacts >= 1) || (input.hasAddToCart && input.hasPrice && input.productImageCount > 0);
  return { eligible, reasons };
}

export function normalizeWebsiteUrl(value: string) {
  const prepared = /^[a-z][a-z0-9+.-]*:\/\//i.test(value.trim()) ? value.trim() : `https://${value.trim()}`;
  const url = new URL(prepared);
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error("Only public HTTP or HTTPS websites are supported");
  if (url.username || url.password) throw new Error("Website URLs cannot contain credentials");
  if (url.port && !['80', '443'].includes(url.port)) throw new Error("Only standard website ports 80 and 443 are supported");
  url.hash = "";
  return canonicalizeUrl(url);
}

export function isForbiddenIp(value: string) {
  const parsed = ipaddr.parse(value);
  if (parsed.kind() === "ipv6" && (parsed as ipaddr.IPv6).isIPv4MappedAddress()) return isForbiddenIp((parsed as ipaddr.IPv6).toIPv4Address().toString());
  return ["unspecified", "broadcast", "multicast", "linkLocal", "loopback", "private", "reserved", "carrierGradeNat", "uniqueLocal"].includes(parsed.range());
}

export async function assertPublicUrl(value: string) {
  const normalized = normalizeWebsiteUrl(value);
  const url = new URL(normalized);
  if (url.hostname === "localhost" || url.hostname.endsWith(".localhost")) throw new Error("Private or local websites are not supported");
  const addresses = await lookup(url.hostname, { all: true, verbatim: true });
  if (!addresses.length || addresses.some(entry => isForbiddenIp(entry.address))) throw new Error("The website resolves to a private, local, or reserved network");
  return { url, addresses };
}

export function canonicalizeUrl(input: URL | string) {
  const url = typeof input === "string" ? new URL(input) : new URL(input.toString());
  url.hash = "";
  url.hostname = url.hostname.toLowerCase();
  for (const key of Array.from(url.searchParams.keys())) {
    if (/^(utm_|fbclid$|gclid$|mc_)/i.test(key)) url.searchParams.delete(key);
  }
  url.searchParams.sort();
  if ((url.protocol === "https:" && url.port === "443") || (url.protocol === "http:" && url.port === "80")) url.port = "";
  if (url.pathname !== "/") url.pathname = url.pathname.replace(/\/+$/, "");
  return url.toString();
}

export function urlHash(url: string) {
  return createHash("sha256").update(canonicalizeUrl(url)).digest("hex");
}

export function sameSite(candidate: string, source: string) {
  const candidateHost = new URL(candidate).hostname.replace(/^www\./, "").toLowerCase();
  const sourceHost = new URL(source).hostname.replace(/^www\./, "").toLowerCase();
  return candidateHost === sourceHost || candidateHost.endsWith(`.${sourceHost}`) || sourceHost.endsWith(`.${candidateHost}`);
}

function requestPinned(url: URL, address: string, maxBytes: number) {
  const transport = url.protocol === "https:" ? https : http;
  return new Promise<{ status: number; contentType: string; body: Buffer; location?: string }>((resolve, reject) => {
    const request = transport.request({
      protocol: url.protocol,
      hostname: address,
      family: ipaddr.parse(address).kind() === "ipv6" ? 6 : 4,
      port: url.port || (url.protocol === "https:" ? 443 : 80),
      path: `${url.pathname}${url.search}`,
      method: "GET",
      servername: url.hostname,
      headers: { Host: url.host, "User-Agent": "FrameBrandCrawler/1.0", Accept: "text/html,application/xhtml+xml,application/xml,text/xml,text/plain;q=0.9,*/*;q=0.1", "Accept-Encoding": "identity" },
      timeout: FETCH_TIMEOUT_MS,
    }, response => {
      const chunks: Buffer[] = [];
      let bytes = 0;
      response.on("data", chunk => {
        bytes += chunk.length;
        if (bytes > maxBytes) { request.destroy(new Error("Website response exceeded the safe size limit")); return; }
        chunks.push(Buffer.from(chunk));
      });
      response.on("end", () => resolve({ status: response.statusCode ?? 0, contentType: String(response.headers["content-type"] ?? "").toLowerCase(), body: Buffer.concat(chunks), location: response.headers.location }));
    });
    request.on("timeout", () => request.destroy(new Error("Website request timed out")));
    request.on("error", reject);
    request.end();
  });
}

export async function safeFetchText(value: string, redirects = 0, rootUrl = value): Promise<{ finalUrl: string; status: number; contentType: string; text: string }> {
  if (redirects > MAX_REDIRECTS) throw new Error("Website redirected too many times");
  const { url, addresses } = await assertPublicUrl(value);
  const response = await requestPinned(url, addresses[0]!.address, MAX_DOCUMENT_BYTES);
  if (response.status >= 300 && response.status < 400 && response.location) {
    const next = new URL(response.location, url);
    if (!sameSite(next.toString(), rootUrl)) throw new Error("Website redirect left the approved site boundary");
    return safeFetchText(next.toString(), redirects + 1, rootUrl);
  }
  const allowed = response.contentType.includes("text/html") || response.contentType.includes("application/xhtml") || response.contentType.includes("xml") || response.contentType.includes("text/plain") || response.contentType.includes("text/css") || response.contentType === "";
  if (!allowed) throw new Error(`Unsupported website content type: ${response.contentType || "unknown"}`);
  return { finalUrl: url.toString(), status: response.status, contentType: response.contentType, text: response.body.toString("utf8") };
}

export async function safeFetchImage(value: string, redirects = 0): Promise<{ finalUrl: string; contentType: string; data: Buffer }> {
  if (redirects > MAX_REDIRECTS) throw new Error("Image redirected too many times");
  const { url, addresses } = await assertPublicUrl(value);
  const response = await requestPinned(url, addresses[0]!.address, 8 * 1024 * 1024);
  if (response.status >= 300 && response.status < 400 && response.location) return safeFetchImage(new URL(response.location, url).toString(), redirects + 1);
  if (response.status >= 400) throw new Error(`Image request failed with HTTP ${response.status}`);
  const contentType = response.contentType.split(";")[0]!.trim();
  if (!['image/jpeg', 'image/png', 'image/webp', 'image/gif'].includes(contentType)) throw new Error(`Unsupported image content type: ${contentType || "unknown"}`);
  return { finalUrl: url.toString(), contentType, data: response.body };
}

function absoluteUrl(value: string | undefined, base: string) {
  if (!value || value.startsWith("data:") || value.startsWith("javascript:")) return null;
  try { const url = new URL(value, base); return ['http:', 'https:'].includes(url.protocol) ? canonicalizeUrl(url) : null; } catch { return null; }
}

function collectJsonLdProducts($: cheerio.CheerioAPI) {
  const products: Array<Record<string, unknown>> = [];
  $('script[type="application/ld+json"]').each((_, element) => {
    try {
      const parsed = JSON.parse($(element).text());
      const queue = Array.isArray(parsed) ? [...parsed] : [parsed];
      while (queue.length) {
        const item = queue.shift();
        if (!item || typeof item !== "object") continue;
        if (Array.isArray(item)) { queue.push(...item); continue; }
        if (item['@graph']) queue.push(...(Array.isArray(item['@graph']) ? item['@graph'] : [item['@graph']]));
        if (item.itemListElement) queue.push(...(Array.isArray(item.itemListElement) ? item.itemListElement.map((entry: Record<string, unknown>) => entry.item ?? entry) : []));
        const type = Array.isArray(item['@type']) ? item['@type'] : [item['@type']];
        if (type.some((value: unknown) => String(value).toLowerCase() === "product")) products.push(item as Record<string, unknown>);
      }
    } catch { /* malformed website data is ignored */ }
  });
  return products.slice(0, 30);
}

function extractColors(source: string) {
  const values = source.match(/#[0-9a-fA-F]{6}\b|#[0-9a-fA-F]{3}\b/g) ?? [];
  return Array.from(new Set(values.map(value => value.length === 4 ? `#${value[1]}${value[1]}${value[2]}${value[2]}${value[3]}${value[3]}`.toUpperCase() : value.toUpperCase()))).filter(value => !["#FFFFFF", "#000000", "#FFF", "#000"].includes(value)).slice(0, 24);
}

function extractFonts(source: string) {
  const fonts = new Set<string>();
  for (const match of Array.from(source.matchAll(/font-family\s*:\s*([^;}]+)/gi))) {
    for (const family of match[1]!.split(",")) {
      const clean = family.trim().replace(/["']/g, "");
      if (clean && !/^(inherit|initial|sans-serif|serif|system-ui|monospace)$/i.test(clean)) fonts.add(clean);
    }
  }
  for (const match of Array.from(source.matchAll(/[?&]family=([^&:"']+)/gi))) fonts.add(decodeURIComponent(match[1]!).replace(/\+/g, " ").split(":")[0]!);
  return Array.from(fonts).slice(0, 16);
}

export function extractPageEvidence(html: string, pageUrl: string, linkedStyles = ""): PageEvidence {
  const $ = cheerio.load(html);
  const structuredProducts = collectJsonLdProducts($);
  const hasSku = $('[itemprop="sku"], [data-sku], meta[property="product:retailer_item_id"]').length > 0 || /\bSKU\s*[:#]/i.test($("body").text());
  const hasPrice = $('[itemprop="price"], meta[property="product:price:amount"], meta[name="twitter:data1"], [data-price]').length > 0;
  const hasAddToCart = $('button, input[type="submit"], [role="button"], form[action]').toArray().some(element => /add\s+to\s+(?:cart|bag)|buy\s+now|purchase/i.test(`${$(element).text()} ${$(element).attr("value") || ""} ${$(element).attr("aria-label") || ""} ${$(element).attr("action") || ""}`));
  const hasProductMeta = /product/i.test($('meta[property="og:type"]').attr("content") || "") || $('[itemtype*="schema.org/Product"]').length > 0;
  const title = $('meta[property="og:title"]').attr("content") || $("title").first().text().trim();
  const description = $('meta[name="description"]').attr("content") || $('meta[property="og:description"]').attr("content") || "";
  const siteName = $('meta[property="og:site_name"]').attr("content") || "";
  const canonicalUrl = absoluteUrl($('link[rel="canonical"]').attr("href"), pageUrl);
  const imageUrls = new Set<string>();
  const logoUrls = new Set<string>();
  const stylesheetUrls = new Set<string>();
  $('link[rel~="stylesheet"][href]').each((_, element) => { const url = absoluteUrl($(element).attr("href"), pageUrl); if (url) stylesheetUrls.add(url); });
  $('meta[property="og:image"], meta[name="twitter:image"]').each((_, element) => { const url = absoluteUrl($(element).attr("content"), pageUrl); if (url) imageUrls.add(url); });
  $('img[src], img[data-src], source[srcset]').each((_, element) => {
    const raw = $(element).attr("src") || $(element).attr("data-src") || $(element).attr("srcset")?.split(",")[0]?.trim().split(/\s+/)[0];
    const url = absoluteUrl(raw, pageUrl); if (!url) return;
    imageUrls.add(url);
    const marker = `${$(element).attr("alt") || ""} ${$(element).attr("class") || ""} ${$(element).attr("id") || ""}`;
    if (/logo|brandmark|wordmark/i.test(marker)) logoUrls.add(url);
  });
  $('link[rel~="icon"]').each((_, element) => { const url = absoluteUrl($(element).attr("href"), pageUrl); if (url) logoUrls.add(url); });
  const internalLinks = new Set<string>();
  $('a[href]').each((_, element) => { const url = absoluteUrl($(element).attr("href"), pageUrl); if (url && sameSite(url, pageUrl) && !BLOCKED_EXTENSIONS.test(new URL(url).pathname)) internalLinks.add(url); });
  const styleSource = `${$('style').map((_, element) => $(element).text()).get().join("\n")}\n${linkedStyles.slice(0, 500_000)}\n${html.slice(0, 300_000)}`;
  $('script,style,noscript,svg,nav,footer').remove();
  const text = $('body').text().replace(/\s+/g, " ").trim().slice(0, 18_000);
  const pathname = new URL(pageUrl).pathname.toLowerCase();
  const productResult = productCandidateFromEvidence({ url: pageUrl, hasStructuredProduct: structuredProducts.length > 0, hasSku, hasPrice, hasAddToCart, hasProductMeta, productImageCount: imageUrls.size });
  const pageType: PageEvidence['pageType'] = isExcludedProductUrl(pageUrl) ? (/\/(contact|support|help)(\/|$)/.test(pathname) ? "contact" : "other") : PRODUCT_SECTION_PATH.test(pathname) && !PRODUCT_DETAIL_PATH.test(pathname) ? "collection" : productResult.eligible ? "product" : /\/about(\/|$)/.test(pathname) ? "about" : /\/contact(\/|$)/.test(pathname) ? "contact" : pathname === "/" ? "home" : "other";
  return { url: canonicalizeUrl(pageUrl), canonicalUrl, title: title.slice(0, 500), description: description.slice(0, 2000), siteName: siteName.slice(0, 300), pageType, text, colors: extractColors(styleSource), fonts: extractFonts(styleSource), imageUrls: Array.from(imageUrls).slice(0, 40), logoUrls: Array.from(logoUrls).slice(0, 10), stylesheetUrls: Array.from(stylesheetUrls).slice(0, 12), internalLinks: Array.from(internalLinks).slice(0, 300), structuredProducts, productCandidate: productResult.eligible, productEvidence: productResult.reasons };
}

export function parseSitemap(xml: string) {
  const parser = new XMLParser({ ignoreAttributes: false, trimValues: true });
  const parsed = parser.parse(xml) as Record<string, unknown>;
  const readLocs = (value: unknown): string[] => {
    if (!value) return [];
    if (Array.isArray(value)) return value.flatMap(readLocs);
    if (typeof value === "object") {
      const object = value as Record<string, unknown>;
      return [...(typeof object.loc === "string" ? [object.loc] : []), ...Object.entries(object).filter(([key]) => key !== "loc").flatMap(([, child]) => readLocs(child))];
    }
    return [];
  };
  const sitemapLocs = readLocs(parsed.sitemapindex);
  const pageLocs = readLocs(parsed.urlset);
  return { sitemapLocs: Array.from(new Set(sitemapLocs)), pageLocs: Array.from(new Set(pageLocs)) };
}

export async function discoverSiteUrls(sourceUrl: string, maxPages: number) {
  const source = normalizeWebsiteUrl(sourceUrl);
  const origin = new URL(source).origin;
  const pages = new Set<string>([source]);
  const productPages = new Set<string>();
  const otherPages = new Set<string>();
  const sitemapQueue = new Set<string>([`${origin}/sitemap.xml`]);
  try {
    const robots = await safeFetchText(`${origin}/robots.txt`);
    for (const match of Array.from(robots.text.matchAll(/^sitemap:\s*(.+)$/gim))) { const value = absoluteUrl(match[1]?.trim(), source); if (value && sameSite(value, source)) sitemapQueue.add(value); }
  } catch { /* robots is optional */ }
  try {
    const homepage = await safeFetchText(source);
    if (homepage.status < 400) {
      for (const link of extractPageEvidence(homepage.text, homepage.finalUrl).internalLinks) {
        if (isProductSectionUrl(link)) productPages.add(link); else otherPages.add(link);
        const linkUrl = new URL(link);
        if (COMMERCE_HOST.test(linkUrl.hostname.replace(/^www\./, ""))) sitemapQueue.add(`${linkUrl.origin}/sitemap.xml`);
      }
    }
  } catch { /* homepage evidence is retried during crawl processing */ }
  const visitedSitemaps = new Set<string>();
  while (sitemapQueue.size && visitedSitemaps.size < 20 && pages.size < maxPages) {
    const batch = Array.from(sitemapQueue).filter(url => !visitedSitemaps.has(url)).slice(0, 4);
    if (!batch.length) break;
    batch.forEach(url => visitedSitemaps.add(url));
    const results = await Promise.allSettled(batch.map(url => safeFetchText(url)));
    results.forEach(result => {
      if (result.status !== "fulfilled" || result.value.status >= 400) return;
      const parsed = parseSitemap(result.value.text);
      for (const sitemap of parsed.sitemapLocs) { const value = absoluteUrl(sitemap, source); if (value && sameSite(value, source) && visitedSitemaps.size + sitemapQueue.size < 40) sitemapQueue.add(value); }
      for (const page of parsed.pageLocs) { const value = absoluteUrl(page, source); if (!value || !sameSite(value, source) || BLOCKED_EXTENSIONS.test(new URL(value).pathname)) continue; if (isProductSectionUrl(value)) productPages.add(value); else otherPages.add(value); }
    });
  }
  for (const value of Array.from(productPages)) { if (pages.size >= maxPages) break; pages.add(value); }
  const otherBudget = Math.max(8, Math.min(30, Math.floor(maxPages * 0.25)));
  for (const value of Array.from(otherPages).slice(0, otherBudget)) { if (pages.size >= maxPages) break; pages.add(value); }
  return Array.from(pages).slice(0, maxPages);
}

export function mergeDiscoveredUrls(existing: string[], discovered: string[], source: string, maxPages: number) {
  const merged = new Set(existing.map(canonicalizeUrl));
  const prioritized = [...discovered.filter(candidate => { try { return isProductSectionUrl(candidate); } catch { return false; } }), ...discovered.filter(candidate => { try { return !isProductSectionUrl(candidate); } catch { return true; } })];
  for (const candidate of prioritized) {
    try {
      const normalized = canonicalizeUrl(candidate);
      if (sameSite(normalized, source) && !BLOCKED_EXTENSIONS.test(new URL(normalized).pathname) && merged.size < maxPages) merged.add(normalized);
    } catch { /* invalid links are ignored */ }
  }
  return Array.from(merged).slice(0, maxPages);
}
