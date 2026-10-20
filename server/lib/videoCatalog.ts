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
    specifications: p.specifications,
    price: p.price,
    currency: p.currency,
    serviceDetails: p.serviceDetails,
    productUrl: p.productUrl,
    updatedAtMs: p.updatedAtMs,
  };
}
function choice(row: Row): VideoImageChoice {
  return {
    key: `product_image:${row.image.id}`,
    name: row.product.name,
    url: row.image.url,
    origin: "catalog",
    product: productFacts(row),
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
  const rows = await db
    .select(selection)
    .from(productImages)
    .innerJoin(products, eq(products.id, productImages.productId))
    .where(
      and(
        owned(organizationId),
        input.selectedOnly
          ? inArray(productImages.id, ids)
          : search
            ? or(
                ilike(products.name, `%${search}%`),
                ilike(products.sku, `%${search}%`)
              )
            : undefined
      )
    )
    .orderBy(
      products.name,
      products.id,
      desc(productImages.isPrimary),
      productImages.id
    )
    .offset(input.selectedOnly ? 0 : input.offset)
    .limit(input.selectedOnly ? 30 : 61);
  return {
    items: rows.slice(0, 60).map(choice),
    nextOffset:
      !input.selectedOnly && rows.length > 60 ? input.offset + 60 : null,
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
  if (!row || !row.image.storageKey)
    throw new TRPCError({
      code: "NOT_FOUND",
      message:
        "This product image is unavailable. Choose an image from an approved product in this workspace.",
    });
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
  };
  return {
    reference,
    choice: choice(row),
    facts: productFacts(row),
  };
}
