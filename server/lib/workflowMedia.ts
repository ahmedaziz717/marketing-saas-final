import { and, asc, desc, eq, ilike, inArray, or } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { productImages, products } from "../../drizzle/schema";
import {
  parseWorkflowMediaSelection,
  workflowProductContent,
  type AppField,
} from "../../shared/workflowInputs";
import {
  listLibrary,
  readLibraryAsset,
  type LibraryDatabase,
} from "./assetLibrary";

export async function workflowMediaChoices(
  db: LibraryDatabase,
  organizationId: number,
  input: {
    search: string;
    offset: number;
    selectedValue: string;
    kind: "asset" | "product";
  }
) {
  const selected = parseWorkflowMediaSelection(input.selectedValue, input.kind);
  const imageId = selected?.imageKey?.startsWith("product_image:")
    ? Number(selected.imageKey.split(":")[1])
    : undefined;
  const selectedImage = imageId
    ? (
        await db
          .select()
          .from(productImages)
          .where(
            and(
              eq(productImages.organizationId, organizationId),
              eq(productImages.id, imageId)
            )
          )
      )[0]
    : undefined;
  const selectedId = selected?.productId ?? selectedImage?.productId;
  const search = input.search.trim().replace(/[\\%_]/g, "\\$&");
  const owned = and(
    eq(products.organizationId, organizationId),
    eq(products.status, "approved")
  );
  const rows = await db
    .select()
    .from(products)
    .where(
      and(
        owned,
        search
          ? or(
              ilike(products.name, `%${search}%`),
              ilike(products.sku, `%${search}%`)
            )
          : undefined
      )
    )
    .orderBy(asc(products.name), asc(products.id))
    .offset(input.offset)
    .limit(25);
  const chosen = selectedId
    ? (
        await db
          .select()
          .from(products)
          .where(and(owned, eq(products.id, selectedId)))
      )[0]
    : undefined;
  const catalog = [
    ...rows.slice(0, 24),
    ...(chosen && !rows.slice(0, 24).some(p => p.id === chosen.id)
      ? [chosen]
      : []),
  ];
  const images = catalog.length
    ? await db
        .select()
        .from(productImages)
        .where(
          and(
            eq(productImages.organizationId, organizationId),
            inArray(
              productImages.productId,
              catalog.map(p => p.id)
            )
          )
        )
        .orderBy(desc(productImages.isPrimary), asc(productImages.id))
    : [];
  return {
    products: catalog.map(p => ({
      id: p.id,
      name: p.name,
      description: p.description,
      price: p.price,
      currency: p.currency,
      productUrl: p.productUrl,
      specifications: p.specifications,
      images: images
        .filter(i => i.productId === p.id && i.storageKey)
        .map(i => ({
          key: `product_image:${i.id}`,
          url: i.url,
          name: i.altText || p.name,
        })),
    })),
    pageIds: rows.slice(0, 24).map(p => p.id),
    nextOffset: rows.length > 24 ? input.offset + 24 : null,
    assets: (await listLibrary(db, organizationId)).filter(
      a =>
        a.state === "approved" &&
        a.mediaType === "image" &&
        a.mimeType !== "image/gif"
    ),
  };
}

/** Resolve choices from owned, approved records; never trust client-supplied facts or prices. */
export async function resolveWorkflowMedia(
  db: LibraryDatabase,
  organizationId: number,
  field: AppField,
  value: string
) {
  const selected = parseWorkflowMediaSelection(
    value,
    field.kind as "asset" | "product"
  )!;
  let productId = selected.productId;
  if (selected.imageKey?.startsWith("product_image:")) {
    const [image] = await db
      .select()
      .from(productImages)
      .where(
        and(
          eq(productImages.organizationId, organizationId),
          eq(productImages.id, Number(selected.imageKey.split(":")[1]))
        )
      );
    if (!image?.storageKey || (productId && productId !== image.productId))
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "Choose an available image belonging to the selected product.",
      });
    productId = image.productId;
  } else if (selected.imageKey) {
    if (field.kind === "product" || productId)
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "Choose an image from the selected product.",
      });
    const asset = await readLibraryAsset(db, organizationId, selected.imageKey);
    if (
      asset.state !== "approved" ||
      asset.mediaType !== "image" ||
      asset.mimeType === "image/gif"
    )
      throw new TRPCError({
        code: "BAD_REQUEST",
        message:
          "Choose an approved JPEG, PNG, or WebP image. Uploaded drafts must be approved before use.",
      });
  }
  if (!productId) return { imageKey: selected.imageKey ?? null, text: "" };
  const [product] = await db
    .select()
    .from(products)
    .where(
      and(
        eq(products.organizationId, organizationId),
        eq(products.id, productId),
        eq(products.status, "approved")
      )
    );
  if (!product)
    throw new TRPCError({
      code: "BAD_REQUEST",
      message:
        "This catalog item is unavailable in this workspace or has not been approved.",
    });
  // Existing numeric product defaults retain their original specification selection.
  if (/^[1-9][0-9]*$/.test(value) && !field.media)
    selected.featuredSpecKeys = Object.keys(product.specifications).slice(
      0,
      20
    );
  const content = workflowProductContent(
    field,
    selected,
    product.specifications
  );
  if (
    content.featuredSpecKeys.some(key => !product.specifications[key]?.trim())
  )
    throw new TRPCError({
      code: "BAD_REQUEST",
      message:
        "A selected bullet is no longer available. Review the product details.",
    });
  if (content.includePrice && (!product.price || !product.currency))
    throw new TRPCError({
      code: "BAD_REQUEST",
      message:
        "This product has no verified price and currency. Turn off price or update the catalog.",
    });
  const facts = {
    name: product.name,
    ...(content.includeDescription ? { description: product.description } : {}),
    bullets: Object.fromEntries(
      content.featuredSpecKeys.map(key => [key, product.specifications[key]])
    ),
    ...(content.includePrice
      ? { price: product.price, currency: product.currency }
      : {}),
    ...(content.includeLink ? { productUrl: product.productUrl } : {}),
  };
  return {
    imageKey: selected.imageKey ?? null,
    text: `Product content choices: ${JSON.stringify(facts)}\nUse only the selected bullets above as featured claims; do not add other specification bullets. ${content.includePrice ? "Show the supplied price and currency." : "Do not show a price, discount, or inferred price."} ${content.includeDescription ? "The supplied description may inform copy." : "Do not include a product description."} ${content.includeLink ? "Use the supplied product URL when a link is needed." : "Do not include a product URL."}`,
  };
}
