import { TRPCError } from "@trpc/server";
import { structuredCatalogFacts } from "../../shared/catalogFacts";
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
  const { specifications, features, availability } =
    structuredCatalogFacts(product);
  if (
    (selection.featuredFeatures ?? []).some(
      feature => !features.includes(feature)
    ) ||
    (selection.includeAvailability &&
      (!availability || availability.toLowerCase() === "unknown"))
  )
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message:
        "Product features or availability changed. Review Product details before continuing.",
    });
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
    features,
    featuredFeatures: selection.featuredFeatures ?? [],
    availability: selection.includeAvailability ? availability : null,
    includeAvailability: !!selection.includeAvailability,
    featuredSpecifications: Object.fromEntries(
      Object.entries(specifications).filter(([key]) =>
        selection.featuredSpecKeys.includes(key)
      )
    ),
    price: selection.includePrice ? product.price : null,
    currency: selection.includePrice ? product.currency : null,
    includePrice: selection.includePrice,
    includeDescription: !!selection.includeDescription,
    productUrl: product.productUrl,
    updatedAtMs: product.updatedAtMs,
  };
}
