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
  return sku ? stableHash({ sku }) : stableHash({ productUrl: input.productUrl.trim().toLowerCase(), name: input.name.trim().toLowerCase() });
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
