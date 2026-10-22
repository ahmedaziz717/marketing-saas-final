import { and, eq, or } from "drizzle-orm";
import { products, productImages, productVariants } from "../../drizzle/schema";
import { getDb } from "../db";
import {
  catalogEntrySchema,
  catalogDraftEntrySchema,
  type CatalogEntry,
} from "../../shared/catalog";
import { stableHash } from "./policy";
import { fetchCatalogImage } from "./catalogImages";
import { storagePut } from "../storage";
import type { StoreItem } from "./storeCatalog";
import { structuredCatalogFacts } from "../../shared/catalogFacts";
import {
  catalogFactsEqual,
  reconcileCatalogRefresh,
} from "../../shared/catalogRefresh";

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
    mappingRevision?: string;
    imageRepairOnly?: boolean;
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
                ? and(
                    eq(products.productUrl, item.productUrl),
                    eq(products.sourceId, source.id)
                  )
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
  if (source?.imageRepairOnly && old) {
    for (const key of Object.keys(truth))
      (truth as any)[key] = (old as any)[key];
  }
  // Imported changes require review again. Never silently approve updated claims.
  const previousTruth = old ? { ...old, ...structuredCatalogFacts(old) } : null;
  const unchanged =
    (source?.imageRepairOnly && !!old) ||
    (previousTruth &&
      Object.entries(truth).every(([k, v]) =>
        catalogFactsEqual((previousTruth as any)[k] ?? "", v ?? "")
      ));
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
      ...(source?.mappingRevision
        ? { "api.mappingRevision": source.mappingRevision }
        : {}),
      ...(item.specificationOrder && !source?.imageRepairOnly
        ? {
            "specifications.order.source": JSON.stringify(
              item.specificationOrder
            ),
          }
        : {}),
    },
    status: unchanged ? old.status : ("pending" as const),
    reviewedByUserId: unchanged ? old.reviewedByUserId : null,
    reviewedAtMs: unchanged ? old.reviewedAtMs : null,
    updatedAtMs: Date.now(),
  };
  const [product] =
    old && source?.imageRepairOnly
      ? [old]
      : old
        ? await db
            .update(products)
            .set(values)
            .where(
              and(
                eq(products.id, old.id),
                eq(products.organizationId, organizationId),
                eq(products.updatedAtMs, old.updatedAtMs)
              )
            )
            .returning()
        : await db
            .insert(products)
            .values({ ...values, createdAtMs: Date.now() })
            .returning();
  if (!product)
    throw new Error(
      "Product changed during import. Resume to reconcile the newer version."
    );
  for (const v of source?.imageRepairOnly ? [] : variants) {
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
  const imageUrls = Array.from(
    new Set([item.imageUrl, ...(item.imageUrls ?? [])].filter(Boolean))
  );
  let saved = 0;
  const failures: Array<{
    position: number;
    reason: string;
    retryable: boolean;
  }> = [];
  let storageFailed = false;
  for (const [position, imageUrl] of Array.from(imageUrls.entries())) {
    const present = await db
      .select({ id: productImages.id })
      .from(productImages)
      .where(
        and(
          eq(productImages.organizationId, organizationId),
          eq(productImages.productId, product.id),
          eq(productImages.sourceUrl, imageUrl)
        )
      )
      .limit(1);
    if (present.length) {
      saved++;
      continue;
    }
    let image: Awaited<ReturnType<typeof fetchCatalogImage>> | undefined;
    try {
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          image = await fetchCatalogImage(imageUrl);
          break;
        } catch (error) {
          const temporary =
            /HTTP (429|5\d\d)|timeout|timed out|ECONNRESET|EAI_AGAIN/i.test(
              String(error)
            );
          if (!temporary || attempt === 2) throw error;
          await new Promise(resolve => setTimeout(resolve, 250 * 2 ** attempt));
        }
      }
    } catch (error) {
      if (!source)
        throw new Error(
          "The supplied image could not be decoded or downloaded."
        );
      const status = String(error).match(/HTTP (\d{3})/)?.[1];
      failures.push({
        position,
        reason: status
          ? `Image server returned HTTP ${status}.`
          : "Image unavailable, blocked, oversized or not a supported decodable image.",
        retryable:
          /HTTP (429|5\d\d)|timeout|timed out|ECONNRESET|EAI_AGAIN/i.test(
            String(error)
          ),
      });
      continue;
    }
    try {
      await db.transaction(async tx => {
        await tx
          .select({ id: products.id })
          .from(products)
          .where(
            and(
              eq(products.id, product.id),
              eq(products.organizationId, organizationId)
            )
          )
          .for("update");
        const existing = await tx
          .select()
          .from(productImages)
          .where(
            and(
              eq(productImages.organizationId, organizationId),
              eq(productImages.productId, product.id)
            )
          );
        if (existing.some(v => v.sourceUrl === imageUrl)) return;
        const stored = await storagePut(
          `organizations/${organizationId}/products/${product.id}/import`,
          image!.data,
          image!.contentType
        );
        await tx.insert(productImages).values({
          organizationId,
          productId: product.id,
          sourceUrl: imageUrl,
          storageKey: stored.key,
          url: stored.url,
          altText: item.name,
          isPrimary: existing.some(v => v.isPrimary) ? 0 : 1,
          createdAtMs: Date.now(),
        });
      });
      saved++;
    } catch {
      storageFailed = true;
      failures.push({
        position,
        reason: "Image could not be saved. Retry image repair.",
        retryable: true,
      });
    }
  }
  const imageState = !imageUrls.length
    ? "missing"
    : failures.length
      ? saved
        ? "partial"
        : "unavailable"
      : "available";
  const updated = await db.transaction(async tx => {
    const [latest] = await tx
      .select()
      .from(products)
      .where(
        and(
          eq(products.id, product.id),
          eq(products.organizationId, organizationId)
        )
      )
      .for("update");
    if (!latest) throw new Error("Product no longer exists.");
    const [updated] = await tx
      .update(products)
      .set({
        provenance: {
          ...latest.provenance,
          ...(source?.mappingRevision
            ? { "api.mappingRevision": source.mappingRevision }
            : {}),
          ...(apiSource
            ? {
                "api.imageStatus": imageState,
                "api.imageSourceUrl": item.imageUrl,
              }
            : {}),
          "media.status": imageState,
          "media.summary": JSON.stringify({
            supplied: imageUrls.length,
            saved,
            failed: failures.length,
            failures,
            checkedAt: new Date().toISOString(),
          }),
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
  });
  if (storageFailed)
    throw new Error(
      "Product imported, but image storage failed. Resume to retry; existing images are preserved."
    );
  return updated;
}
