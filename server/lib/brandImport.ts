import { stableHash } from "./policy";

export type BrandImportDraft = {
  companyName: string;
  summary: string;
  voice: string;
  requiredClaims: string[];
  prohibitedContent: string[];
  colors: string[];
  fonts: string[];
  logoUrls: string[];
};

export function mergeBrandDraft(current: Partial<BrandImportDraft> | null | undefined, incoming: BrandImportDraft): BrandImportDraft {
  const unique = (values: string[], max: number) => Array.from(new Set(values.map(value => value.trim()).filter(Boolean))).slice(0, max);
  return {
    companyName: current?.companyName || incoming.companyName,
    summary: [current?.summary, incoming.summary].filter(Boolean).join(" ").slice(0, 4000),
    voice: current?.voice || incoming.voice,
    requiredClaims: unique([...(current?.requiredClaims ?? []), ...incoming.requiredClaims], 40),
    prohibitedContent: unique([...(current?.prohibitedContent ?? []), ...incoming.prohibitedContent], 40),
    colors: unique([...(current?.colors ?? []), ...incoming.colors].map(value => value.toUpperCase()), 24),
    fonts: unique([...(current?.fonts ?? []), ...incoming.fonts], 16),
    logoUrls: unique([...(current?.logoUrls ?? []), ...incoming.logoUrls], 20),
  };
}

export function productDedupeKey(input: { sku?: string | null; productUrl: string; name: string }) {
  const sku = input.sku?.trim().toLowerCase();
  return sku ? stableHash({ sku }) : stableHash({ productUrl: canonicalProductIdentityUrl(input.productUrl) });
}

export function canonicalProductIdentityUrl(value: string) {
  const url = new URL(value);
  url.hash = "";
  url.search = "";
  url.hostname = url.hostname.toLowerCase().replace(/^www\./, "");
  url.pathname = url.pathname.replace(/\/+$/, "") || "/";
  return url.toString().toLowerCase();
}

export const ACTIVE_CRAWL_STATUSES = ["queued", "discovering", "crawling", "analyzing"] as const;

export function canStartNewCrawl(latestStatus: string | null | undefined) {
  return !latestStatus || !ACTIVE_CRAWL_STATUSES.includes(latestStatus as (typeof ACTIVE_CRAWL_STATUSES)[number]);
}

export function approvedProductsOnly<T extends { status: string }>(products: T[]) {
  return products.filter(product => product.status === "approved");
}

export function importedProductCanBeUsed(status: string) {
  return status === "approved";
}

export function nextCrawlResumeStatus(cursor: number, discoveredCount: number) {
  return cursor < discoveredCount ? "crawling" as const : "analyzing" as const;
}

export function editedProductProvenance(previous: Record<string, string>, userId: number, now: number) {
  const marker = `user:${userId}@${now}`;
  return { ...previous, name: marker, sku: marker, category: marker, description: marker, price: marker, specifications: marker };
}

export function pruneDeletedProductIds(current: number[] | null | undefined, deletedIds: number[]) {
  const removed = new Set(deletedIds);
  return (current ?? []).filter(id => !removed.has(id));
}

function normalizeEvidence(value: string) {
  return value.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();
}

function evidenceContains(haystack: string, value: string) {
  const needle = normalizeEvidence(value);
  if (!needle) return false;
  return normalizeEvidence(haystack).includes(needle);
}

export function validateExtractedProduct(input: {
  candidate: { name: string; sku?: string | null; price?: string | null; currency?: string | null; specifications: Array<{ name: string; value: string }> };
  page: { pageType: string; productCandidate: boolean; productEvidence: string[]; text: string; structuredProducts: unknown[] };
}) {
  const source = `${input.page.text}\n${JSON.stringify(input.page.structuredProducts)}`;
  const eligible = input.page.pageType === "product" && input.page.productCandidate && input.page.productEvidence.length > 0 && evidenceContains(source, input.candidate.name);
  if (!eligible) return { eligible: false, sku: null, price: null, currency: null, specifications: [] as Array<{ name: string; value: string }> };
  const sku = input.candidate.sku && evidenceContains(source, input.candidate.sku) ? input.candidate.sku : null;
  const price = input.candidate.price && evidenceContains(source, input.candidate.price) ? input.candidate.price : null;
  const specifications = input.candidate.specifications.filter(item => evidenceContains(source, item.name) && evidenceContains(source, item.value));
  return { eligible: true, sku, price, currency: price ? input.candidate.currency ?? null : null, specifications };
}

type SchemaOffer = { url?: string; price?: string | number; priceCurrency?: string; availability?: string };
type SchemaVariant = { name?: string; sku?: string; image?: string | string[]; offers?: SchemaOffer | SchemaOffer[] };

function schemaValues<T = unknown>(value: T | T[] | null | undefined): T[] {
  return Array.isArray(value) ? value : value == null ? [] : [value];
}

function schemaTypes(record: Record<string, unknown>) {
  return schemaValues(record["@type"]).map(String).map(value => value.toLowerCase());
}

export function deterministicProductFromPage(input: { url: string; title: string | null; description: string; structuredProducts: Array<Record<string, unknown>>; specifications: Record<string, string>; imageUrls: string[]; commerceMeta?: { sku: string | null; price: string | null; currency: string | null; availability: string | null } }) {
  const root = input.structuredProducts.find(record => schemaTypes(record).some(type => type === "productgroup" || type === "product")) ?? (input.commerceMeta && (input.commerceMeta.sku || input.commerceMeta.price) ? { "@type": "Product", name: input.title, description: input.description, sku: input.commerceMeta.sku, image: input.imageUrls[0], offers: { price: input.commerceMeta.price, priceCurrency: input.commerceMeta.currency, availability: input.commerceMeta.availability }, url: input.url } : null);
  if (!root) return null;
  const variants = schemaTypes(root).includes("productgroup")
    ? schemaValues(root.hasVariant).filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object") as SchemaVariant[]
    : [root as SchemaVariant];
  const offers = variants.flatMap(variant => schemaValues(variant.offers).filter((item): item is SchemaOffer => Boolean(item) && typeof item === "object"));
  const prices = offers.map(offer => Number(offer.price)).filter(price => Number.isFinite(price) && price > 0);
  const variantNames = variants.map(variant => String(variant.name ?? "").trim()).filter(Boolean);
  const variantSkus = variants.map(variant => ({ name: String(variant.name ?? "Variant").trim(), sku: String(variant.sku ?? "").trim() })).filter(item => item.sku);
  const variantPrices = variants.flatMap(variant => schemaValues(variant.offers).filter((item): item is SchemaOffer => Boolean(item) && typeof item === "object").map(offer => ({ name: String(variant.name ?? "Variant").trim(), offer }))).filter(item => item.offer.price != null);
  const imageUrls = Array.from(new Set([...variants.flatMap(variant => schemaValues(variant.image).map(String)), ...input.imageUrls])).filter(value => /^https?:\/\//i.test(value));
  const name = String(root.name ?? input.title ?? "").trim();
  if (!name) return null;
  const specifications: Record<string, string> = { ...input.specifications };
  if (variantNames.length > 1) specifications["Available variants"] = variantNames.join("; ");
  if (variantSkus.length) specifications["Variant SKUs"] = variantSkus.map(item => `${item.name}: ${item.sku}`).join("; ");
  if (variantPrices.length) specifications["Variant prices"] = variantPrices.map(item => `${item.name}: ${item.offer.priceCurrency ?? ""} ${item.offer.price}`.trim()).join("; ");
  const availability = Array.from(new Set(offers.map(offer => String(offer.availability ?? "").split("/").pop()).filter(Boolean)));
  if (availability.length) specifications.Availability = availability.join(", ");
  const description = String(root.description ?? input.description ?? "").trim() || null;
  const normalizedVariants = variants.map(variant => {
    const offer = schemaValues(variant.offers).find((item): item is SchemaOffer => Boolean(item) && typeof item === "object");
    return { name: String(variant.name ?? name), sku: variant.sku ? String(variant.sku) : null, price: offer?.price != null && Number(offer.price) > 0 ? String(offer.price) : null, currency: offer?.priceCurrency ?? null, availability: offer?.availability ? String(offer.availability).split("/").pop() ?? null : null, imageSourceUrl: schemaValues(variant.image).map(String).find(value => /^https?:\/\//i.test(value)) ?? null, productUrl: offer?.url ?? input.url };
  });
  return { name, sku: variants.length === 1 && variants[0]?.sku ? String(variants[0].sku) : null, category: inferProductCategory(name, input.url, description ?? ""), recordType: inferProductRecordType(name, input.url, description ?? "", variants.length), description, productUrl: String(root.url ?? input.url), price: prices.length ? String(Math.min(...prices)) : null, currency: prices.length ? offers.find(offer => Number(offer.price) > 0 && offer.priceCurrency)?.priceCurrency ?? null : null, specifications, imageUrls, variants: normalizedVariants, variantCount: variants.length };
}

export function inferProductCategory(name: string, url: string, description = "") {
  const marker = `${name} ${new URL(url).pathname} ${description}`.toLowerCase();
  if (/\b3d[ -]?printer\b|\bprinter\b|\b3d printing\b/.test(marker)) return "3D Printers";
  if (/\bams\b|automatic material system/.test(marker)) return "Material Systems";
  if (/\bfilament\b|\bpla\b|\bpetg\b|\babs\b|\basa\b|\btpu\b|\bpaht\b/.test(marker)) return "Filaments & Materials";
  if (/\bsoftware\b|\bapp\b|\bstudio\b|\bfirmware\b/.test(marker)) return "Software";
  if (/\bnozzle\b|\bhotend\b|\bplate\b|\bkit\b|\bcable\b|\bassembly\b|\bunit\b|\breplacement\b|\bspare\b/.test(marker)) return "Accessories & Parts";
  return "Products";
}

export function inferProductRecordType(name: string, url: string, description = "", variantCount = 1): "family" | "standalone" | "accessory" | "material" | "software" | "service" | "bundle" {
  const marker = `${name} ${new URL(url).pathname} ${description}`.toLowerCase();
  if (/\bsoftware\b|\bapp\b|\bfirmware\b/.test(marker)) return "software";
  if (/\bservice\b|\bsupport plan\b|\bconsulting\b/.test(marker)) return "service";
  if (/\b3d[ -]?printer\b|\bprinter\b|\b3d printing\b/.test(marker)) return variantCount > 1 ? "family" : "standalone";
  if (/\bams\b|automatic material system/.test(marker)) return variantCount > 1 ? "family" : "standalone";
  if (/\bbundle\b|\bcombo\b/.test(marker) && variantCount <= 1) return "bundle";
  if (/\bfilament\b|\bpla\b|\bpetg\b|\babs\b|\basa\b|\btpu\b|\bpaht\b|\bmaterial\b/.test(marker)) return "material";
  if (/\bnozzle\b|\bhotend\b|\bplate\b|\bkit\b|\bcable\b|\bassembly\b|\bunit\b|\breplacement\b|\bspare\b|\baccessor/.test(marker)) return "accessory";
  if (variantCount > 1) return "family";
  return "standalone";
}
