import { and, eq, or } from "drizzle-orm";
import { products, productImages, productVariants } from "../../drizzle/schema";
import { getDb } from "../db";
import {
  catalogEntrySchema,
  catalogDraftEntrySchema,
  type CatalogEntry,
} from "../../shared/catalog";
import { stableHash } from "./policy";
import { safeFetchImage } from "./websiteCrawler";
import { storagePut } from "../storage";
import type { StoreItem } from "./storeCatalog";
import { structuredCatalogFacts } from "../../shared/catalogFacts";
import { reconcileCatalogRefresh } from "../../shared/catalogRefresh";

type Database = NonNullable<Awaited<ReturnType<typeof getDb>>>;
export async function importCatalogEntry(
  db: Database,
  organizationId: number,
  entry: CatalogEntry,
  source?: {
    id: number;
    externalId: string;
    provider: string;
    detailUrl?: string;
  },
  variants: StoreItem["variants"] = []
) {
  const apiSource = source?.provider === "api";
  const item = (apiSource ? catalogDraftEntrySchema : catalogEntrySchema).parse(
    entry
  );
  if (apiSource && !source?.externalId.trim())
    throw new Error("API products require a stable source ID or SKU.");
  const key = stableHash(
    source
      ? { source: source.id, id: source.externalId }
      : { url: item.productUrl, name: item.name }
  );
  const [old] = await db
    .select()
    .from(products)
    .where(
      and(
        eq(products.organizationId, organizationId),
        source
          ? or(
              and(
                eq(products.sourceId, source.id),
                eq(products.externalId, source.externalId)
              ),
              eq(products.dedupeKey, key),
              // Unresolved links are not identity keys: two blank URLs must
              // never merge different products (or overwrite another source).
              item.productUrl
                ? eq(products.productUrl, item.productUrl)
                : undefined
            )
          : eq(products.dedupeKey, key)
      )
    )
    .limit(1);
  let truth = {
    name: item.name,
    description: item.description,
    sku: item.sku,
    category: item.category,
    recordType: item.recordType,
    productUrl: item.productUrl,
    price: item.price,
    currency: item.currency,
    ...structuredCatalogFacts(item),
    serviceDetails: item.serviceDetails,
    variantCount: variants.length,
  };
  const refreshed = old
    ? reconcileCatalogRefresh(old, truth, {}, source?.provider ?? "manual")
    : null;
  if (refreshed) truth = refreshed.values;
  // Imported changes require review again. Never silently approve updated claims.
  const previousTruth = old ? { ...old, ...structuredCatalogFacts(old) } : null;
  const unchanged =
    previousTruth &&
    Object.entries(truth).every(
      ([k, v]) =>
        JSON.stringify((previousTruth as any)[k] ?? "") ===
        JSON.stringify(v ?? "")
    );
  const values = {
    ...truth,
    organizationId,
    dedupeKey: old?.dedupeKey ?? key,
    sourceId: source?.id ?? old?.sourceId,
    externalId: source?.externalId ?? old?.externalId,
    provenance: {
      ...(refreshed?.provenance ?? old?.provenance),
      source: source?.provider ?? "manual",
      importedAt: new Date().toISOString(),
      ...(source?.detailUrl ? { "api.detailUrl": source.detailUrl } : {}),
    },
    status: unchanged ? old.status : ("pending" as const),
    reviewedByUserId: unchanged ? old.reviewedByUserId : null,
    reviewedAtMs: unchanged ? old.reviewedAtMs : null,
    updatedAtMs: Date.now(),
  };
  const [product] = old
    ? await db
        .update(products)
        .set(values)
        .where(
          and(
            eq(products.id, old.id),
            eq(products.organizationId, organizationId)
          )
        )
        .returning()
    : await db
        .insert(products)
        .values({ ...values, createdAtMs: Date.now() })
        .returning();
  for (const v of variants) {
    const value = {
      organizationId,
      productId: product.id,
      sourceKey: stableHash(v.id),
      name: v.name.slice(0, 500),
      sku: v.sku.slice(0, 180),
      price: v.price,
      currency: item.currency,
      imageSourceUrl: v.imageUrl || null,
      availability: v.availability,
      metadata: { sourceId: source?.id },
      updatedAtMs: Date.now(),
    };
    await db
      .insert(productVariants)
      .values({ ...value, createdAtMs: Date.now() })
      .onConflictDoUpdate({
        target: [
          productVariants.organizationId,
          productVariants.productId,
          productVariants.sourceKey,
        ],
        set: value,
      });
  }
  let imageState = item.imageUrl ? "available" : "missing";
  if (item.imageUrl) {
    const [present] = await db
      .select()
      .from(productImages)
      .where(
        and(
          eq(productImages.organizationId, organizationId),
          eq(productImages.productId, product.id),
          eq(productImages.sourceUrl, item.imageUrl)
        )
      )
      .limit(1);
    if (!present) {
      // A missing/blocked remote image is a product review issue, not an API
      // connection failure. Safe fetching remains mandatory; no unsafe URL is
      // retried through an unguarded request. Storage/DB failures still surface.
      const image = await safeFetchImage(item.imageUrl).catch(error => {
        if (!apiSource) throw error;
        imageState = "unavailable";
        return null;
      });
      if (image) {
        const stored = await storagePut(
          `organizations/${organizationId}/products/${product.id}/import`,
          image.data,
          image.contentType
        );
        await db.insert(productImages).values({
          organizationId,
          productId: product.id,
          sourceUrl: item.imageUrl,
          storageKey: stored.key,
          url: stored.url,
          altText: item.name,
          isPrimary: 1,
          createdAtMs: Date.now(),
        });
      }
    }
  }
  if (apiSource) {
    const [updated] = await db
      .update(products)
      .set({
        provenance: {
          ...values.provenance,
          "api.imageStatus": imageState,
          "api.imageSourceUrl": item.imageUrl,
        },
      })
      .where(
        and(
          eq(products.id, product.id),
          eq(products.organizationId, organizationId)
        )
      )
      .returning();
    return updated;
  }
  return product;
}
