import { structuredCatalogFacts } from "./catalogFacts";

type CatalogIdentity = {
  id: number;
  name: string;
  sku?: string | null;
  externalId?: string | null;
  sourceId?: number | null;
  productUrl?: string;
  status: string;
  specifications?: Record<string, string>;
  provenance?: Record<string, string>;
};
export type RelatedCatalogSource = {
  id: number;
  name: string;
  sourceId: number | null;
  status: string;
  specifications: Record<string, string>;
  sku: string;
  source: string;
};
const identity = (value?: string | null) => value?.trim().toLowerCase() || "";
const page = (value?: string) => {
  try {
    const url = new URL(value || "");
    return `${url.hostname.toLowerCase()}${url.pathname.replace(/\/$/, "")}${url.search}`;
  } catch {
    return "";
  }
};
/** Same-workspace candidates only. Never merge by name or fuzzy SKU prefixes. */
export function relatedCatalogSources(
  product: CatalogIdentity,
  candidates: CatalogIdentity[]
): RelatedCatalogSource[] {
  const keys = [identity(product.sku), identity(product.externalId)].filter(
    Boolean
  );
  const url = page(product.productUrl);
  return candidates
    .filter(
      other =>
        other.id !== product.id &&
        other.sourceId !== product.sourceId &&
        other.status !== "rejected" &&
        ((!!url && page(other.productUrl) === url) ||
          [identity(other.sku), identity(other.externalId)].some(
            key => !!key && keys.includes(key)
          ))
    )
    .map(other => ({
      id: other.id,
      name: other.name,
      sourceId: other.sourceId ?? null,
      status: other.status,
      specifications: structuredCatalogFacts(other).specifications,
      sku: other.sku ?? "",
      source:
        other.provenance?.source ||
        (other.sourceId ? "Connected catalog" : "Website scan"),
    }));
}
