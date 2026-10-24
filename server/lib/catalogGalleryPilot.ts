import { createHash } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { catalogSources, products, productImages } from "../../drizzle/schema";
import { apiCatalogConfigSchema } from "../../shared/apiCatalog";
import {
  galleryPilotRecipeSchema,
  GALLERY_PILOT_MAX_IMAGES,
  GALLERY_PILOT_MAX_CANDIDATES,
} from "../../shared/catalogGalleryPilot";
import { catalogDraftEntrySchema } from "../../shared/catalog";
import { getDb } from "../db";
import {
  fetchApiCatalog,
  apiCatalogAddress,
  catalogUrlFromTemplate,
  jsonField,
} from "./apiCatalog";
import { mapCatalogMediaGroups } from "./catalogMediaMapping";
import { decryptToken, encryptToken } from "./secureToken";
import { catalogMediaPlans } from "./catalogMediaPlans";
type DB = NonNullable<Awaited<ReturnType<typeof getDb>>>;
export const pilotFingerprint = (value: unknown) =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex");
export async function pilotRecords(
  db: Pick<DB, "select">,
  organizationId: number,
  sourceId: number,
  productId: number
) {
  const [source] = await db
    .select()
    .from(catalogSources)
    .where(
      and(
        eq(catalogSources.id, sourceId),
        eq(catalogSources.organizationId, organizationId)
      )
    );
  const [product] = await db
    .select()
    .from(products)
    .where(
      and(
        eq(products.id, productId),
        eq(products.organizationId, organizationId),
        eq(products.sourceId, sourceId)
      )
    );
  if (
    !source ||
    source.provider !== "api" ||
    !source.credentials ||
    !product?.externalId
  )
    throw new Error(
      "Select an existing API product belonging to this source and workspace."
    );
  const images = await db
    .select()
    .from(productImages)
    .where(
      and(
        eq(productImages.productId, productId),
        eq(productImages.organizationId, organizationId)
      )
    )
    .orderBy(productImages.id);
  return { source, product, images };
}
export async function previewGalleryPilot(
  db: DB,
  organizationId: number,
  sourceId: number,
  productId: number,
  actorUserId: number,
  rawRecipe: unknown
) {
  const { source, product, images } = await pilotRecords(
    db,
    organizationId,
    sourceId,
    productId
  );
  if (["queued", "syncing"].includes(source.status) || source.leaseUntil)
    throw new Error("Wait for the current source job to finish.");
  const recipe = galleryPilotRecipeSchema.parse(rawRecipe);
  const credentials = JSON.parse(decryptToken(source.credentials!));
  if (credentials.galleryPilot && !credentials.galleryPilot.completed)
    throw new Error("Resume or finish the existing gallery pilot first.");
  const config = apiCatalogConfigSchema.parse({
    ...credentials.api,
    ...recipe,
    skipImages: false,
    mediaGroupsFromDetails: true,
  });
  const detailUrl = apiCatalogAddress(
    catalogUrlFromTemplate(recipe.detailUrlTemplate, {
      code: product.externalId,
      id: product.externalId,
      externalId: product.externalId,
      sku: product.sku,
    })
  );
  if (new URL(detailUrl).origin !== new URL(source.storeUrl).origin)
    throw new Error(
      "Gallery detail requests must stay on the source API origin."
    );
  const detail = await fetchApiCatalog(detailUrl, config);
  const payload = recipe.detailRootPath
    ? jsonField(detail, recipe.detailRootPath)
    : detail;
  const returnedIdentity = jsonField(payload, recipe.detailIdentityPath);
  if (
    !["string", "number"].includes(typeof returnedIdentity) || String(returnedIdentity) !== product.externalId
  )
    throw new Error(
      "The detail response does not match the selected product identity."
    );
  const mediaGroups = mapCatalogMediaGroups(payload, config, detailUrl) ?? [];
  const entry = catalogDraftEntrySchema.parse({
    name: product.name,
    productUrl: product.productUrl,
    mediaGroups,
  });
  const plans = catalogMediaPlans(entry);
  const candidates = new Set(plans.flatMap(plan => plan.candidates));
  const candidateAttempts = plans.reduce((sum, plan) => sum + plan.candidates.length, 0);
  if (
    !plans.length ||
    plans.length > GALLERY_PILOT_MAX_IMAGES ||
    candidateAttempts > GALLERY_PILOT_MAX_CANDIDATES
  )
    throw new Error(
      "Pilot requires 1-250 distinct image views and at most 500 candidate URLs."
    );
  const cached = plans.filter(({ candidates: urls }) =>
    images.some(
      image =>
        image.media &&
        !image.media.unavailableCandidates &&
        urls.includes(image.sourceUrl) &&
        urls.every(url => image.media!.candidates.includes(url))
    )
  ).length;
  const plan = {
    kind: "catalog-gallery-pilot-v1" as const,
    organizationId,
    sourceId,
    productId,
    actorUserId,
    sourceUpdatedAtMs: source.updatedAtMs,
    productFingerprint: pilotFingerprint(product),
    imageFingerprint: pilotFingerprint(images),
    expiresAt: Date.now() + 30 * 60_000,
    externalId: product.externalId,
    detailUrl,
    recipe,
    entry,
    total: plans.length,
    candidateCount: candidates.size,
    completed: false,
  };
  const serialized = JSON.stringify(plan);
  if (Buffer.byteLength(serialized, "utf8") > 1_000_000) throw new Error("Gallery preview is too large; reduce the source recipe to fewer views.");
  return {
    token: encryptToken(serialized),
    productId,
    externalId: product.externalId,
    productName: product.name,
    sourceId,
    groups: mediaGroups.map(({ images, ...group }) => ({
      ...group,
      images: images.length,
    })),
    distinctImages: plans.length,
    candidateUrls: candidates.size,
    cachedImages: cached,
    maximumImageAttempts: candidateAttempts * 3,
    detailRequests: 1,
    sourceMappingChanges: false,
    expiresAt: plan.expiresAt,
    existingImages: images.length,
    groupsAdded: mediaGroups
      .filter(group => !product.mediaGroups?.some(old => old.id === group.id))
      .map(group => group.id),
    groupsReplaced: mediaGroups
      .filter(group => product.mediaGroups?.some(old => old.id === group.id))
      .map(group => group.id),
    existingImagesReferenced: images
      .filter(image =>
        plans.some(
          plan =>
            plan.candidates.includes(image.sourceUrl) ||
            image.media?.references.some(ref =>
              plan.references.some(
                next =>
                  next.groupId === ref.groupId && next.imageId === ref.imageId
              )
            )
        )
      )
      .map(image => image.id),
    maximumNewImages: plans.length - cached,
  };
}
export type GalleryPilotPlan = {
  kind: "catalog-gallery-pilot-v1";
  organizationId: number;
  sourceId: number;
  productId: number;
  actorUserId: number;
  sourceUpdatedAtMs: number;
  productFingerprint: string;
  imageFingerprint: string;
  expiresAt: number;
  externalId: string;
  detailUrl: string;
  recipe: unknown;
  entry: ReturnType<typeof catalogDraftEntrySchema.parse>;
  total: number;
  candidateCount: number;
  completed: boolean;
  previousProgress?: {
    processed: number;
    total: number | null;
    cursor: string | null;
  };
  offset?: number;
};
