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
