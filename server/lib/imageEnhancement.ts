import { and, eq } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import {
  brandAssets,
  creativeVariants,
  creativeJobs,
} from "../../drizzle/schema";
import {
  CREATIVE_FORMATS,
  creativeSetupSchema,
  defaultCreativeSetup,
  type CreativeSetup,
} from "../../shared/creativeBuilder";
import {
  DEFAULT_IMAGE_MODEL,
  generationModel,
  referenceCapacity,
} from "../../shared/modelCatalog";
import {
  canEnhanceImage,
  parseAssetKey,
  type AssetKey,
} from "../../shared/assetLibrary";
import { readLibraryAsset, type LibraryDatabase, type LibraryTransaction } from "./assetLibrary";
import type { BuilderBrandKit } from "./creativeBuilder";

export async function readEnhancementSource(
  db: LibraryDatabase | LibraryTransaction,
  organizationId: number,
  key: string,
  revision?: string
) {
  const asset = await readLibraryAsset(db, organizationId, key);
  if (!canEnhanceImage(asset))
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Choose a saved JPG, PNG or WebP image to enhance.",
    });
  if (revision && revision !== asset.revision)
    throw new TRPCError({
      code: "CONFLICT",
      message:
        "This image changed. Reopen Enhance to review its current version.",
    });
  const parsed = parseAssetKey(key);
  const [row] =
    parsed.kind === "asset"
      ? await db
          .select()
          .from(brandAssets)
          .where(
            and(
              eq(brandAssets.organizationId, organizationId),
              eq(brandAssets.id, parsed.id)
            )
          )
          .limit(1)
      : await db
          .select()
          .from(creativeVariants)
          .where(
            and(
              eq(creativeVariants.organizationId, organizationId),
              eq(creativeVariants.id, parsed.id)
            )
          )
          .limit(1);
  const variant =
    parsed.kind === "creative"
      ? (row as typeof creativeVariants.$inferSelect)
      : null;
  const storageKey =
    variant?.imageStorageKey ??
    (row as typeof brandAssets.$inferSelect)?.storageKey;
  if (!storageKey)
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message: "Save this image in the workspace before enhancing it.",
    });
  return {
    asset,
    variant,
    source: {
      id: parsed.id,
      key: key as AssetKey,
      storageKey,
      url: asset.url,
      revision: asset.revision,
      ...(variant?.renderMetadata?.productPreservation?.method ===
      "editable_original_v3"
        ? { productOverlay: variant.renderMetadata.productPreservation }
        : {}),
    },
  };
}

export async function prepareEnhancement(
  db: LibraryDatabase,
  organizationId: number,
  key: string,
  revision: string,
  brand: BuilderBrandKit
) {
  const { asset, variant } = await readEnhancementSource(
    db,
    organizationId,
    key,
    revision
  );
  const [job] = variant
    ? await db
        .select()
        .from(creativeJobs)
        .where(
          and(
            eq(creativeJobs.organizationId, organizationId),
            eq(creativeJobs.id, variant.jobId)
          )
        )
        .limit(1)
    : [];
  const saved = creativeSetupSchema.safeParse(job?.briefSnapshot?.setup);
  const original = saved.success ? saved.data : defaultCreativeSetup();
  const format =
    CREATIVE_FORMATS.find(f => f.id === asset.format) ??
    [...CREATIVE_FORMATS].sort(
      (a, b) =>
        Math.abs(
          a.width / a.height - (asset.width || 1) / (asset.height || 1)
        ) -
        Math.abs(b.width / b.height - (asset.width || 1) / (asset.height || 1))
    )[0];
  const shortBrand = brand.name.split(/[|:]/)[0].trim();
  const instruction = `Recreate this ${shortBrand}${original.products.length || brand.businessProfile?.model === "products" ? " product" : ""} advertisement as a stunning, professional ad creative with dramatically improved visual quality.`;
  const sourceModel = generationModel(original.modelId || "");
  const setup: CreativeSetup = {
    ...original,
    name: `${asset.name} · Enhanced`.slice(0, 180),
    modelId:
      sourceModel && referenceCapacity(sourceModel) > 0
        ? original.modelId
        : DEFAULT_IMAGE_MODEL,
    modelOptions:
      sourceModel && referenceCapacity(sourceModel) > 0
        ? original.modelOptions
        : undefined,
    formatIds: [format.id],
    channels: [format.channel],
    productMode: "together",
    preserveProduct: !!asset.hasProductOverlay,
    copy: variant?.renderMetadata?.copy ?? {
      headline: asset.headline || "",
      subheadline: asset.subheadline || "",
      cta: "",
    },
    enhancement: { assetKey: asset.key, revision: asset.revision, instruction },
  };
  return {
    setup,
    source: asset,
    width: format.width,
    height: format.height,
    hasProductOverlay: !!asset.hasProductOverlay,
    canPreserveProductOverlay:
      !!asset.hasProductOverlay ||
      (setup.products.length > 0 &&
        setup.products.every(p => p.imageId !== null)) ||
      !!setup.sourceAssetKeys?.length,
  };
}
