import { imageDraftProductStatuses } from "../../shared/catalogReadiness";
import { TRPCError } from "@trpc/server";
import type { ProductOverlayMetadata, ProductOverlayReplacement } from "../../shared/productOverlay";
import type { LibraryDatabase, LibraryTransaction } from "./assetLibrary";
import { readEnhancementSource } from "./imageEnhancement";
import { readProductCutout } from "./productPreservation";
import { and, eq, inArray } from "drizzle-orm";
import { products, productImages } from "../../drizzle/schema";
import { catalogImageEligible } from "../../shared/catalogMedia";
import { stableHash } from "./policy";

export async function catalogOverlaySources(db: LibraryDatabase | LibraryTransaction, organizationId: number, productIds: number[]) {
  if (!productIds.length) return [];
  const rows = await db.select({image: productImages, product: products}).from(productImages).innerJoin(products,
    and(eq(products.id, productImages.productId), eq(products.organizationId, productImages.organizationId)))
    .where(and(eq(productImages.organizationId, organizationId), inArray(productImages.productId, productIds), inArray(products.status, [...imageDraftProductStatuses])));
  return rows.filter(({image, product}) => catalogImageEligible(image, product.mediaGroups)).map(({image, product}) => ({
    key: `catalog-image:${image.id}`, name: `${product.name} — photo ${image.id}`, url: image.url,
    productId: product.id,
    revision: stableHash({image, productRevision: product.updatedAtMs, status: product.status}), storageKey: image.storageKey,
  }));
}

/** No URL inference, catalog substitution, uploads or provider calls. Every
 * replacement is a reviewed workspace source explicitly selected by the user. */
export async function readOverlaySources(db: LibraryDatabase | LibraryTransaction, organizationId: number,
  metadata: ProductOverlayMetadata, replacements: ProductOverlayReplacement[] = [], productIds: number[] = []) {
  if (new Set(replacements.map(item => item.index)).size !== replacements.length ||
      replacements.some(item => item.index < 0 || item.index >= metadata.layers.length || !item.sameViewConfirmed))
    throw new TRPCError({ code: "BAD_REQUEST", message: "Confirm one same-view source per product layer." });
  const sources = [];
  for (let index = 0; index < metadata.layers.length; index++) {
    const layer = metadata.layers[index];
    const original = await readProductCutout(layer.sourceKey);
    if (original.sha256 !== layer.sha256)
      throw new TRPCError({ code: "CONFLICT", message: "The saved original changed. Reopen the editor." });
    const replacement = replacements.find(item => item.index === index);
    if (!replacement) { sources.push(original); continue; }
    let storageKey: string;
    if (replacement.key.startsWith("catalog-image:")) {
      const candidate = (await catalogOverlaySources(db, organizationId, productIds[index] ? [productIds[index]] : [])).find(item => item.key === replacement.key);
      if (!candidate || candidate.revision !== replacement.revision)
        throw new TRPCError({code: "CONFLICT", message: "The same-product catalog source changed or is unavailable. Reopen the editor."});
      storageKey = candidate.storageKey;
    } else {
      const resolved = await readEnhancementSource(db, organizationId, replacement.key, replacement.revision);
      if (!replacement.key.startsWith("asset:") || resolved.asset.origin !== "uploaded" ||
        resolved.asset.purpose !== "source" || resolved.asset.sourceType !== "product" || resolved.asset.state !== "approved")
        throw new TRPCError({ code: "BAD_REQUEST", message: "Choose an approved uploaded product source from this workspace." });
      storageKey = resolved.source.storageKey;
    }
    const source = await readProductCutout(storageKey);
    if (source.width <= original.width || Math.abs((source.width / source.height) / (original.width / original.height) - 1) > 0.02)
      throw new TRPCError({ code: "BAD_REQUEST", message: "Use a higher-resolution cutout of the same product and view, with matching proportions." });
    sources.push(source);
  }
  return sources;
}
