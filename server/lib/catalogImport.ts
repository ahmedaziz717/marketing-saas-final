import { and, eq, or } from "drizzle-orm";
import { products, productImages, productVariants } from "../../drizzle/schema";
import { getDb } from "../db";
import { catalogEntrySchema, type CatalogEntry } from "../../shared/catalog";
import { stableHash } from "./policy";
import { safeFetchImage } from "./websiteCrawler";
import { storagePut } from "../storage";
import type { StoreItem } from "./storeCatalog";

type Database = NonNullable<Awaited<ReturnType<typeof getDb>>>;
export async function importCatalogEntry(
  db: Database,
  organizationId: number,
  entry: CatalogEntry,
  source?: { id: number; externalId: string; provider: string },
  variants: StoreItem["variants"] = []
) {
  const item = catalogEntrySchema.parse(entry);
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
              eq(products.productUrl, item.productUrl)
            )
          : eq(products.dedupeKey, key)
      )
    )
    .limit(1);
  const truth = {
    name: item.name,
    description: item.description,
    sku: item.sku,
    category: item.category,
    recordType: item.recordType,
    productUrl: item.productUrl,
    price: item.price,
    currency: item.currency,
    specifications: item.specifications,
    serviceDetails: item.serviceDetails,
    variantCount: variants.length,
  };
  // Imported changes require review again. Never silently approve updated claims.
  const unchanged =
    old &&
    Object.entries(truth).every(
      ([k, v]) =>
        JSON.stringify((old as any)[k] ?? "") === JSON.stringify(v ?? "")
    );
  const values = {
    ...truth,
    organizationId,
    dedupeKey: old?.dedupeKey ?? key,
    sourceId: source?.id ?? old?.sourceId,
    externalId: source?.externalId ?? old?.externalId,
    provenance: {
      ...old?.provenance,
      source: source?.provider ?? "manual",
      importedAt: new Date().toISOString(),
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
      const image = await safeFetchImage(item.imageUrl);
      const stored = await storagePut(
        `organizations/${organizationId}/products/${product.id}/import`,
        image.data,
        image.contentType
      );
      await db
        .insert(productImages)
        .values({
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
  return product;
}
