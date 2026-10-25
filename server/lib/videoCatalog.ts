import { componentIdentityContext } from "../../shared/studioProductFacts";
import { catalogImageEligible } from "../../shared/catalogMedia";
import { attachMarketingCategories } from "./catalogCategories";
import { and, desc, eq, ilike, inArray, or } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { productImages, products } from "../../drizzle/schema";
import type {
  VideoImageChoice,
  VideoReference,
} from "../../shared/videoCreation";
import type { LibraryDatabase, LibraryTransaction } from "./assetLibrary";
import { stableHash } from "./policy";

type Database = LibraryDatabase | LibraryTransaction;
const selection = {
  image: productImages,
  product: products,
};
const owned = (organizationId: number) =>
  and(
    eq(productImages.organizationId, organizationId),
    eq(products.organizationId, organizationId),
    eq(products.status, "approved")
  );
type Row = {
  image: typeof productImages.$inferSelect;
  product: typeof products.$inferSelect;
};
function productFacts(row: Row) {
  const p = row.product;
  return {
    id: p.id,
    name: p.name,
    sku: p.sku,
    description: p.description,
    category: p.category,
    recordType: p.recordType,
    ...componentIdentityContext(p),
    specifications: p.specifications,
    // Empty migration defaults must not invalidate already queued catalog references.
    ...(p.features?.length ? { features: p.features } : {}),
    ...(p.availability ? { availability: p.availability } : {}),
    price: p.price,
    currency: p.currency,
    serviceDetails: p.serviceDetails,
    productUrl: p.productUrl,
    updatedAtMs: p.updatedAtMs,
    ...(row.image.media?.references.length
      ? {
          visualSource: row.image.media.references
            .map(ref => p.mediaGroups?.find(group => group.id === ref.groupId))
            .filter(Boolean)
            .map(group => ({
              name: group!.name,
              role: group!.role,
              note:
                group!.role === "optional_component"
                  ? "Optional component appearance, not the exact configured SKU or a price/configuration change."
                  : "Source-provided gallery.",
            })),
        }
      : {}),
  };
}
function choice(row: Row): VideoImageChoice {
  return {
    key: `product_image:${row.image.id}`,
    name: row.product.name,
    url: row.image.url,
    origin: "catalog",
    isPrimary: !!row.image.isPrimary,
    media: row.image.media,
    mediaGroups: row.product.mediaGroups,
    width: row.image.media?.width,
    height: row.image.media?.height,
    product: {
      ...productFacts(row),
      sourceId: row.product.sourceId,
      provenance: row.product.provenance,
    },
    detail:
      row.image.altText ||
      (row.image.isPrimary ? "Primary product image" : "Product image"),
  };
}
export async function listVideoCatalogImages(
  db: Database,
  organizationId: number,
  input: {
    search: string;
    offset: number;
    selectedOnly: boolean;
    selectedKeys: string[];
  }
) {
  const ids = input.selectedKeys.map(key => Number(key.split(":")[1]));
  if (input.selectedOnly && !ids.length)
    return {
      items: [] as VideoImageChoice[],
      nextOffset: null as number | null,
    };
  const search = input.search.trim().replace(/[\\%_]/g, "\\$&");
  // Page stable products, then load their complete photo groups. A product must
  // never be split into duplicate tiles across image-page boundaries.
  const page = input.selectedOnly
    ? []
    : await db
        .select({ id: products.id, name: products.name })
        .from(products)
        .innerJoin(productImages, eq(productImages.productId, products.id))
        .where(
          and(
            owned(organizationId),
            search
              ? or(
                  ilike(products.name, `%${search}%`),
                  ilike(products.sku, `%${search}%`)
                )
              : undefined
          )
        )
        .groupBy(products.id, products.name)
        .orderBy(products.name, products.id)
        .offset(input.offset)
        .limit(61);
  const productIds = page.slice(0, 60).map(p => p.id);
  if (!input.selectedOnly && !productIds.length)
    return { items: [] as VideoImageChoice[], nextOffset: null };
  const rows = await db
    .select(selection)
    .from(productImages)
    .innerJoin(products, eq(products.id, productImages.productId))
    .where(
      and(
        owned(organizationId),
        input.selectedOnly
          ? inArray(productImages.id, ids)
          : inArray(products.id, productIds)
      )
    )
    .orderBy(
      products.name,
      products.id,
      desc(productImages.isPrimary),
      productImages.id
    );
  const enriched = await attachMarketingCategories(
    db,
    organizationId,
    rows.map(row => row.product)
  );
  return {
    items: rows.map((row, index) => {
      const item = choice(row);
      return {
        ...item,
        product: item.product
          ? {
              ...item.product,
              marketingCategory: enriched[index].marketingCategory,
            }
          : undefined,
      };
    }),
    nextOffset:
      !input.selectedOnly && page.length > 60 ? input.offset + 60 : null,
  };
}
export async function readVideoCatalogImage(
  db: Database,
  organizationId: number,
  key: string
) {
  const match = /^product_image:([1-9][0-9]*)$/.exec(key);
  const [row] = match
    ? await db
        .select(selection)
        .from(productImages)
        .innerJoin(products, eq(products.id, productImages.productId))
        .where(
          and(owned(organizationId), eq(productImages.id, Number(match[1])))
        )
        .limit(1)
    : [];
  if (
    !row ||
    !row.image.storageKey ||
    !catalogImageEligible(row.image, row.product.mediaGroups)
  )
    throw new TRPCError({
      code: "NOT_FOUND",
      message:
        "This product image is unavailable. Choose an image from an approved product in this workspace.",
    });
  const marketingCategory = (
    await attachMarketingCategories(db, organizationId, [row.product])
  )[0].marketingCategory;
  const reference: VideoReference = {
    key,
    storageKey: row.image.storageKey,
    name: row.product.name,
    mimeType: "image/*",
    fingerprint: stableHash({
      id: row.image.id,
      productId: row.image.productId,
      storageKey: row.image.storageKey,
      url: row.image.url,
      name: row.product.name,
      description: row.product.description,
    }),
    catalogFingerprint: stableHash(productFacts(row)),
    categoryFingerprint: stableHash(marketingCategory),
  };
  return {
    reference,
    choice: choice(row),
    facts: { ...productFacts(row), marketingCategory },
  };
}
