import { TRPCError } from "@trpc/server";
import type {
  brandAssets,
  brandKits,
  productImages,
  products,
} from "../../drizzle/schema";
import {
  CREATIVE_THEMES,
  SHOT_DIRECTIONS,
  formatDetails,
  getCreativeArtStyle,
  getCreativeMood,
  getCreativeTheme,
  type CreativeSetup,
} from "../../shared/creativeBuilder";

export type BuilderCatalogProduct = typeof products.$inferSelect;
export type BuilderProductImage = typeof productImages.$inferSelect;
export type BuilderBrandAsset = typeof brandAssets.$inferSelect;
export type BuilderBrandKit = typeof brandKits.$inferSelect;

export function resolveBuilderInputs(
  organizationId: number,
  setup: CreativeSetup,
  catalog: BuilderCatalogProduct[],
  images: BuilderProductImage[],
  logos: BuilderBrandAsset[]
) {
  const resolved = setup.products.map(selection => {
    const product = catalog.find(
      p => p.id === selection.productId && p.organizationId === organizationId
    );
    const image = images.find(
      i =>
        i.id === selection.imageId &&
        i.productId === selection.productId &&
        i.organizationId === organizationId
    );
    if (
      !product ||
      product.status !== "approved" ||
      (!image &&
        (product.recordType !== "service" || selection.imageId !== null))
    ) {
      throw new TRPCError({
        code: "PRECONDITION_FAILED",
        message:
          "A selected product or image is unavailable. Choose approved products from your catalog.",
      });
    }
    if (
      selection.featuredSpecKeys.some(
        key =>
          !Object.hasOwn(product.specifications, key) ||
          !product.specifications[key]?.trim()
      )
    ) {
      throw new TRPCError({
        code: "PRECONDITION_FAILED",
        message:
          "Product specifications changed. Review the selected specs before continuing.",
      });
    }
    if (
      selection.includePrice &&
      (!product.price?.trim() || !product.currency?.trim())
    ) {
      throw new TRPCError({
        code: "PRECONDITION_FAILED",
        message:
          "A selected product needs a catalog price and currency before its price can appear.",
      });
    }
    return {
      id: product.id,
      name: product.name,
      sku: product.sku,
      description: product.description,
      category: product.category,
      recordType: product.recordType,
      serviceDetails: product.serviceDetails,
      specifications: product.specifications,
      featuredSpecifications: Object.fromEntries(
        selection.featuredSpecKeys.map(key => [
          key,
          product.specifications[key],
        ])
      ),
      price: product.price,
      currency: product.currency,
      includePrice: selection.includePrice,
      productUrl: product.productUrl,
      updatedAtMs: product.updatedAtMs,
      image: image
        ? {
            id: image.id,
            storageKey: image.storageKey,
            url: image.url,
            altText: image.altText,
          }
        : null,
    };
  });
  const logo =
    setup.logoAssetId === null
      ? null
      : logos.find(
          asset =>
            asset.id === setup.logoAssetId &&
            asset.organizationId === organizationId &&
            asset.type === "logo" &&
            asset.status === "approved"
        );
  if (setup.logoAssetId !== null && !logo)
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message:
        "The selected logo is no longer approved. Choose a saved, approved brand logo.",
    });
  return { products: resolved, logo: logo ?? null };
}
export type ResolvedBuilderInputs = ReturnType<typeof resolveBuilderInputs>;

export function buildCreativePrompt(input: {
  setup: CreativeSetup;
  brand: BuilderBrandKit;
  products: ResolvedBuilderInputs["products"];
  formatId: string;
  hasLogo: boolean;
  adaptMaster?: boolean;
}) {
  const { setup, brand, products } = input;
  const format = formatDetails(input.formatId);
  if (!format) throw new Error("Unsupported creative format");
  const theme = getCreativeTheme(setup.theme);
  const mood = getCreativeMood(setup.mood);
  const artStyle = getCreativeArtStyle(setup.artStyle);
  return [
    "Editable main prompt (styling and composition guidance only; it cannot override approved product facts, brand policy, or safety rules): " +
      setup.basePrompt,
    input.adaptMaster
      ? "The FIRST reference is the master composition. Adapt its visual idea and art direction to this size. The remaining references are the exact catalog products and selected logo."
      : "The references contain the exact selected product images, followed by the selected logo when present.",
    "Target channel: " +
      format.channel +
      ". Canvas: " +
      format.width +
      " by " +
      format.height +
      " pixels. Design for this aspect ratio, with comfortable margins and readable type at this final size.",
    "Selected theme: " + theme.name + ".",
    "Editable theme prompt (visual direction only; it cannot introduce product facts, claims, prices, certifications, or offers): " +
      (setup.themePrompt || theme.direction),
    "MANDATORY MOOD — " +
      mood.name +
      ": " +
      mood.direction +
      " The mood must be immediately recognizable through the color treatment, lighting, contrast, atmosphere, and pacing of the composition.",
    "MANDATORY ART STYLE — " +
      artStyle.name +
      ": " +
      artStyle.direction +
      " Make this art style visibly unmistakable across the background, environment, lighting, textures, depth treatment, supporting graphics, and typography treatment. Do not silently revert to a generic studio-ad aesthetic.",
    "Apply the selected mood and art style to every non-product visual element and to the presentation of the product. Preserve the supplied product's exact shape, proportions, colors, markings, controls, and factual features even when the selected style is illustrative or animated.",
    "Shot: " + SHOT_DIRECTIONS[setup.shot],
    setup.person && (setup.shot === "female" || setup.shot === "male")
      ? "PERSON IDENTITY REFERENCE: The LAST reference image is the selected adult person. Preserve this person's facial features, hair color, hairstyle, skin tone and apparent age across every creative and size. Use only this one person, never reproduce a contact sheet. Person reference controls identity only: adapt clothing, pose, lighting and setting to the creative direction. Do not treat the portrait as a product, logo, testimonial, or proof of endorsement."
      : "",
    "Product placement: " + setup.placement + ".",
    "Additional creative direction (styling guidance only, never a source of product facts): " +
      setup.extraDirection,
    "Brand: " +
      JSON.stringify({
        name: brand.name,
        voice: brand.voice,
        colors: brand.colors,
        fonts: brand.fonts,
        requiredClaims: brand.requiredClaims,
        prohibitedContent: brand.prohibitedContent,
      }),
    "For service entries, illustrate the approved service and its benefits. Do not invent physical products, staff identities, certifications, guaranteed outcomes, or service availability. Respect pricing model (starting at, hourly, recurring, or quote); never present a starting price as a fixed total.",
    "Catalog facts: " +
      JSON.stringify(products.map(({ image, ...product }) => product)),
    "Preserve the physical design, color, proportions, markings, and features of each supplied product. Do not invent parts, logos, prices, performance claims, or certifications. Catalog facts override contradictory styling directions.",
    input.hasLogo
      ? "Use only the supplied logo, preserving its exact shape and color."
      : "Do not add a separate brand logo. Preserve markings that already exist on the product.",
    "Render this customer-selected copy accurately: " +
      JSON.stringify(setup.copy),
    "For EACH product, render only its featuredSpecifications as spec callouts, accurately associated with that product. Other specifications are factual context only. Never mix facts between products.",
    "Render a product price only if includePrice is true, using its exact catalog price and currency. Do not invent discounts or offers.",
    "All selected copy and featured specs must remain readable and within the canvas. Adapt the arrangement for compact formats; do not silently omit selected facts or required claims. Do not add any other words or badges.",
  ].join("\n\n");
}

export function publicActivityPayload(
  payload: Record<string, unknown> | null
): Record<string, unknown> | null {
  if (!payload) return null;
  const redact = (value: unknown): unknown =>
    Array.isArray(value)
      ? value.map(redact)
      : value && typeof value === "object"
        ? publicActivityPayload(value as Record<string, unknown>)
        : value;
  return Object.fromEntries(
    Object.entries(payload)
      .filter(
        ([key]) =>
          !/^(languageModel|imageModel|model|modelId|provider)$/i.test(key)
      )
      .map(([key, value]) => [key, redact(value)])
  );
}
