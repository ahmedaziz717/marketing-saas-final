import { TRPCError } from "@trpc/server";
import type {
  ProductFactSelection,
  SelectedProductFacts,
  StudioProduct,
} from "../../shared/studioProductFacts";

/** Resolve selections against the server's approved catalog, never client-supplied values. */
export function selectProductFacts(
  product: StudioProduct,
  selection: ProductFactSelection
): SelectedProductFacts {
  const specifications = product.specifications ?? {};
  if (
    selection.productId !== product.id ||
    selection.featuredSpecKeys.some(
      key => !Object.hasOwn(specifications, key) || !specifications[key]?.trim()
    )
  )
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message:
        "Product specifications changed. Review the selected specs before continuing.",
    });
  if (
    selection.includePrice &&
    (!product.price?.trim() || !product.currency?.trim())
  )
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message:
        "A selected product needs a catalog price and currency before its price can appear.",
    });
  return {
    id: product.id,
    name: product.name,
    sku: product.sku,
    description: product.description,
    category: product.category,
    recordType: product.recordType,
    serviceDetails: product.serviceDetails,
    specifications,
    featuredSpecifications: Object.fromEntries(
      selection.featuredSpecKeys.map(key => [key, specifications[key]])
    ),
    price: selection.includePrice ? product.price : null,
    currency: selection.includePrice ? product.currency : null,
    includePrice: selection.includePrice,
    includeDescription: !!selection.includeDescription,
    productUrl: product.productUrl,
    updatedAtMs: product.updatedAtMs,
  };
}
