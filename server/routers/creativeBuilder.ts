import type { DraftSaveHook } from "../lib/mcpDraftReceipt";
import { productOverlayPreview } from "../lib/productOverlayPreview";
import {
  readOverlaySources,
  catalogOverlaySources,
} from "../lib/productOverlaySources";
import { productOverlayReplacementsSchema } from "../../shared/productOverlay";
import { manuallyAppliedProductOverlay } from "../../shared/productOverlay";
import type { ProductOverlayFailureDiagnostic } from "../../shared/productOverlay";
import { relatedCatalogSources } from "../../shared/catalogSources";
import {
  findSafeLogoPlacement,
  loadPreservedLogo,
  prepareLogoPlacement,
  renderOriginalLogo,
} from "../lib/logoPreservation";
import { productOverlayPlacementSchema } from "../../shared/productOverlay";
import { generationBrand } from "../lib/brandVoiceSummary";
import { creativePromptDefaults } from "../lib/promptRegistry";
import { alignCopyWithCampaign } from "../../shared/creativeMessaging";
import {
  prepareEnhancement,
  readEnhancementSource,
} from "../lib/imageEnhancement";
import {
  automaticProductOverlay,
  ProductOverlayResolutionError,
  productOverlayFailureDiagnostic,
  renderProductOverlay,
  suggestProductPlacement,
} from "../lib/productOverlay";
import { classifyCopy } from "../../shared/copyTaxonomy";
import { prepareImageRequest } from "../lib/imageRequest";
import {
  imageBatchQuote,
  imageModelQuote,
  resolveModel,
} from "../lib/modelCatalog";
import {
  isReferenceCreative,
  creativeImageOutputs,
} from "../../shared/creativeBuilder";
import { referenceCapacity, generationModel } from "../../shared/modelCatalog";
import type { ProviderRate } from "../../shared/platformAdmin";
import {
  selectedPeople,
  personReferenceKey,
} from "../../shared/creativeBuilder";
import { readLibraryAsset } from "../lib/assetLibrary";
import { parseAssetKey } from "../../shared/assetLibrary";
import sharp from "sharp";
import { randomUUID } from "node:crypto";
import { storagePut, storageGetBase64 } from "../storage";
import {
  loadPreservedProducts,
  layoutPreservedProducts,
  readProductCutout,
} from "../lib/productPreservation";
import {
  findLifestylePerson,
  modelMatchesShot,
} from "../../shared/lifestylePeople";
import { readLifestylePortrait } from "../lib/lifestylePeople";
import { and, desc, eq, inArray, isNotNull } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import {
  brandAssets,
  brandKits,
  campaignBriefs,
  creativeJobs,
  creativeVariants,
  productImages,
  products,
} from "../../drizzle/schema";
import {
  CREATIVE_THEMES,
  creativeCopySchema,
  creativeSetupSchema,
  getCreativeArtStyle,
  getCreativeMood,
  getCreativeTheme,
  formatDetails,
  generationSetupIssues,
  metaCallToAction,
  outputCount,
  type CreativeSetup,
} from "../../shared/creativeBuilder";
import { protectedProcedure, router } from "../_core/trpc";
import { invokeLLM, listLLMModels } from "../_core/llm";
import { getDb } from "../db";
import { requireOrganizationRole } from "../lib/access";
import { appendActivity, withOrganizationTransaction } from "../lib/activity";
import {
  buildCreativePrompt,
  resolveBuilderInputs,
} from "../lib/creativeBuilder";
import { categorizeGenerationError } from "../lib/generation";
import {
  REQUIRED_IMAGE_MODEL_ID,
  requireLatestGptTextModel,
} from "../lib/models";
import { generateSunburstImage } from "../lib/openaiSunburst";
import { stableHash } from "../lib/policy";
import { readGenerationSource } from "../lib/creativeImages";
import { buildCreativeCopyMessages } from "../lib/creativeCopy";
import { previewStudioPage } from "../lib/studioProductPage";
import {
  attachMarketingCategories,
  assertCategorySelection,
} from "../lib/catalogCategories";
import {
  CREATIVE_JOB_LEASE_MS,
  recoverExpiredBuilderJobs,
  renewBuilderJob,
} from "../lib/creativeJobs";

const organizationInput = z.object({
  organizationId: z.number().int().positive(),
});
const editorRoles = ["owner", "admin", "creator"] as const;
type Database = NonNullable<Awaited<ReturnType<typeof getDb>>>;

export async function loadInputs(
  db: Database,
  organizationId: number,
  setup: CreativeSetup
) {
  const ids = setup.products.map(p => p.productId);
  const [kit, catalog, images, logos] = await Promise.all([
    db
      .select()
      .from(brandKits)
      .where(eq(brandKits.organizationId, organizationId))
      .limit(1),
    ids.length
      ? db
          .select()
          .from(products)
          .where(
            and(
              eq(products.organizationId, organizationId),
              inArray(products.id, ids)
            )
          )
      : Promise.resolve([]),
    ids.length
      ? db
          .select()
          .from(productImages)
          .where(
            and(
              eq(productImages.organizationId, organizationId),
              inArray(productImages.productId, ids)
            )
          )
      : Promise.resolve([]),
    setup.logoAssetId
      ? db
          .select()
          .from(brandAssets)
          .where(
            and(
              eq(brandAssets.organizationId, organizationId),
              eq(brandAssets.id, setup.logoAssetId)
            )
          )
      : Promise.resolve([]),
  ]);
  if (!kit[0])
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message: "Set up your Brand Kit first.",
    });
  const personAssets: Array<typeof brandAssets.$inferSelect> = [];
  const identityKeys = new Set<string>();
  for (const person of selectedPeople(setup)) {
    let identityKey = personReferenceKey(person);
    if (person.kind === "asset") {
      const asset = (
        await db
          .select()
          .from(brandAssets)
          .where(
            and(
              eq(brandAssets.id, person.assetId),
              eq(brandAssets.organizationId, organizationId),
              eq(brandAssets.type, "reference"),
              eq(brandAssets.status, "approved")
            )
          )
          .limit(1)
      )[0];
      const libraryPerson =
        typeof asset?.metadata?.libraryId === "string"
          ? findLifestylePerson(asset.metadata.libraryId)
          : undefined;
      if (
        !asset ||
        asset.metadata?.kind !== "lifestyle_person" ||
        !modelMatchesShot(libraryPerson ?? asset.metadata, setup.shot)
      )
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message:
            "Choose an approved person reference matching this setting from this workspace.",
        });
      if (libraryPerson) identityKey = `library:${libraryPerson.id}`;
      personAssets.push(asset);
    }
    if (identityKeys.has(identityKey))
      throw new TRPCError({
        code: "BAD_REQUEST",
        message:
          "Choose different models; a saved favorite and its library portrait are the same person.",
      });
    identityKeys.add(identityKey);
  }
  const personAsset = personAssets[0];
  if (
    setup.promotionMode === "platform" &&
    !kit[0]?.businessProfile?.summary?.trim() &&
    !setup.promotion?.description.trim()
  )
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message:
        "Add promotion details or save your business description in Settings → Company & brand first.",
    });
  if (setup.promotionMode === "platform" && setup.products.length)
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Platform promotion cannot also select catalog offerings.",
    });
  const referenceIds = setup.referenceAssetIds ?? [];
  const references = referenceIds.length
    ? await db
        .select()
        .from(brandAssets)
        .where(
          and(
            eq(brandAssets.organizationId, organizationId),
            eq(brandAssets.type, "reference"),
            eq(brandAssets.status, "approved"),
            inArray(brandAssets.id, referenceIds)
          )
        )
    : [];
  if (
    references.length !== referenceIds.length ||
    references.some(
      r =>
        r.metadata?.kind === "lifestyle_person" ||
        !r.mimeType.startsWith("image/")
    )
  )
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message: "Choose approved campaign references from this workspace.",
    });
  const sourceReferences = await Promise.all(
    (setup.sourceAssetKeys ?? []).map(async key => {
      const asset = await readLibraryAsset(db, organizationId, key);
      if (
        asset.state !== "approved" ||
        asset.mediaType !== "image" ||
        asset.mimeType === "image/gif"
      )
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message:
            "Choose approved JPG, PNG or WebP source images from this workspace.",
        });
      const parsed = parseAssetKey(key);
      const [row] =
        parsed.kind === "asset"
          ? await db
              .select({ storageKey: brandAssets.storageKey })
              .from(brandAssets)
              .where(
                and(
                  eq(brandAssets.id, parsed.id),
                  eq(brandAssets.organizationId, organizationId)
                )
              )
          : await db
              .select({ storageKey: creativeVariants.imageStorageKey })
              .from(creativeVariants)
              .where(
                and(
                  eq(creativeVariants.id, parsed.id),
                  eq(creativeVariants.organizationId, organizationId)
                )
              );
      if (!row?.storageKey)
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "This image needs to be saved to your workspace first.",
        });
      return { id: parsed.id, key, storageKey: row.storageKey, url: asset.url };
    })
  );
  const enhancement = setup.enhancement
    ? (
        await readEnhancementSource(
          db,
          organizationId,
          setup.enhancement.assetKey,
          setup.enhancement.revision
        )
      ).source
    : undefined;
  return {
    ...(enhancement ? { enhancement } : {}),
    references: [
      ...(enhancement ? [enhancement] : []),
      ...sourceReferences,
      ...references,
    ],
    personAssets,
    ...(personAsset ? { personAsset } : {}),
    brand: kit[0],
    ...resolveBuilderInputs(
      organizationId,
      setup,
      await attachMarketingCategories(db, organizationId, catalog),
      images,
      logos
    ),
  };
}

function builderProductGroups(
  setup: CreativeSetup,
  resolved: Awaited<ReturnType<typeof loadInputs>>
) {
  if (setup.enhancement) return [resolved.products];
  return setup.promotionMode === "platform" || isReferenceCreative(setup)
    ? [[]]
    : setup.productMode === "together"
      ? [resolved.products]
      : resolved.products.map(product => [product]);
}

export async function runBuilderJob(
  db: Database,
  args: {
    organizationId: number;
    actorUserId: number;
    briefId: number;
    jobId: number;
    setup: CreativeSetup;
    resolved: Awaited<ReturnType<typeof loadInputs>>;
    rateSnapshot?: ProviderRate;
    rateSnapshots?: ProviderRate[];
  }
) {
  const { organizationId, actorUserId, briefId, jobId, setup, resolved } = args;
  try {
    // Validate every source before making any paid request, including queued jobs.
    const preserved = await loadPreservedProducts(setup, resolved);
    const preservedLogo = await loadPreservedLogo(setup, resolved);
    if (
      args.rateSnapshots &&
      args.rateSnapshots.length !== creativeImageOutputs(setup).length
    )
      throw new Error("The saved image quotes do not match this creative set.");
    const imageModel = setup.modelId ?? REQUIRED_IMAGE_MODEL_ID;
    const promptBrand = await generationBrand(organizationId, resolved.brand);
    const promptDefaults = await creativePromptDefaults(organizationId, setup);
    const logoSource = resolved.logo
      ? await readGenerationSource(resolved.logo.storageKey)
      : null;
    const personSources = await Promise.all(
      selectedPeople(setup).map(async person => {
        if (person.kind === "library") return readLifestylePortrait(person.id);
        // Legacy queued jobs may carry only personAsset.
        const asset = (
          resolved.personAssets ??
          (resolved.personAsset ? [resolved.personAsset] : [])
        ).find(a => a.id === person.assetId);
        if (!asset) throw new Error("Selected person reference is unavailable");
        return readGenerationSource(asset.storageKey);
      })
    );
    const groups = builderProductGroups(setup, resolved);
    const generated: Array<typeof creativeVariants.$inferInsert> = [];
    let outputIndex = 0;
    for (const group of groups) {
      await renewBuilderJob(db, organizationId, jobId);
      const sources = await Promise.all(
        group.flatMap(product =>
          product.image ? [readGenerationSource(product.image.storageKey)] : []
        )
      );
      sources.push(
        ...(await Promise.all(
          (resolved.references ?? []).map(r =>
            readGenerationSource(r.storageKey)
          )
        ))
      );
      if (logoSource) sources.push(logoSource);
      sources.push(...personSources);
      let master: Awaited<ReturnType<typeof readGenerationSource>> | null =
        null;
      // Generate a substantial master before adapting it to compact banner sizes.
      const formats = setup.formatIds
        .map(id => formatDetails(id)!)
        .sort((a, b) => b.width * b.height - a.width * a.height);
      for (const format of formats) {
        await renewBuilderJob(db, organizationId, jobId);
        const cutouts = setup.enhancement
          ? preserved
          : group.length
            ? preserved.filter(p =>
                group.some(g => g.image?.storageKey === p.sourceKey)
              )
            : preserved;
        const productLayers = cutouts.length
          ? await layoutPreservedProducts(cutouts, format, setup.placement)
          : [];
        const logoLayout = preservedLogo
          ? await prepareLogoPlacement(
              preservedLogo,
              format,
              setup.logoPosition
            )
          : undefined;
        let image = await generateSunburstImage({
          modelId: setup.modelId,
          modelOptions: setup.modelOptions,
          rateSnapshot:
            args.rateSnapshots?.[outputIndex++] ?? args.rateSnapshot,
          quality: "medium",
          originalImages: master ? [master, ...sources] : sources,
          prompt: buildCreativePrompt({
            promptDefaults,
            setup,
            brand: promptBrand,
            products: group,
            formatId: format.id,
            hasLogo: !!resolved.logo,
            logoPlacement: logoLayout,
            adaptMaster: !!master,
            enhancementReferencePosition:
              group.filter(p => p.image).length + 1 + (master ? 1 : 0),
          }),
          outputSize: {
            width: format.width,
            height: format.height,
            background: resolved.brand.colors[0] || "#ffffff",
          },
          storagePrefix: "org-" + organizationId + "/creatives/" + jobId,
        });
        if (!image.url || !image.storageKey)
          throw new Error("Image generation returned an incomplete result");
        if (
          !master &&
          (!setup.modelId ||
            referenceCapacity(generationModel(setup.modelId)!) > sources.length)
        )
          master = await readGenerationSource(image.storageKey);
        const originalDesign = { storageKey: image.storageKey, url: image.url };
        if (preservedLogo && logoLayout) {
          const design = Buffer.from(
            await storageGetBase64(image.storageKey),
            "base64"
          );
          logoLayout.placement = await findSafeLogoPlacement(
            design,
            logoLayout.placement
          );
          const png = await renderOriginalLogo(
            design,
            preservedLogo,
            logoLayout.placement
          );
          const stored = await storagePut(
            `org-${organizationId}/creatives/${jobId}/original-logo-${randomUUID()}.png`,
            png,
            "image/png"
          );
          image = { ...image, storageKey: stored.key, url: stored.url };
        }
        // Keep the complete immutable design for optional later refinements.
        const overlayDesign = { storageKey: image.storageKey, url: image.url };
        let preparedProductLayers = productLayers.map(
          ({ sourceKey, sha256, left, top, width, height }) => ({
            sourceKey,
            sha256,
            left,
            top,
            width,
            height,
          })
        );
        let productOverlayApplied = false;
        let automaticFailure:
          | "source_resolution"
          | "alignment_unavailable"
          | undefined;
        let automaticFailureDiagnostic:
          | ProductOverlayFailureDiagnostic
          | undefined;
        if (cutouts.length) {
          let overlayStage: ProductOverlayFailureDiagnostic["stage"] =
            "source_read";
          try {
            const design = Buffer.from(
              await storageGetBase64(image.storageKey),
              "base64"
            );
            overlayStage = "alignment";
            const finished = await automaticProductOverlay(
              design,
              cutouts,
              format
            );
            overlayStage = "storage";
            const stored = await storagePut(
              `org-${organizationId}/creatives/${jobId}/product-finish`,
              finished.png,
              "image/png"
            );
            image = { ...image, storageKey: stored.key, url: stored.url };
            preparedProductLayers = finished.layers;
            productOverlayApplied = true;
          } catch (error) {
            automaticFailureDiagnostic = productOverlayFailureDiagnostic(
              error,
              overlayStage
            );
            automaticFailure =
              error instanceof ProductOverlayResolutionError
                ? "source_resolution"
                : "alignment_unavailable";
            if (
              error instanceof ProductOverlayResolutionError &&
              error.placements
            ) {
              preparedProductLayers = error.placements.map((placement, i) => ({
                ...placement,
                height:
                  placement.height ??
                  Math.round(
                    (placement.width * cutouts[i].height) / cutouts[i].width
                  ),
                sourceKey: cutouts[i].sourceKey,
                sha256: cutouts[i].sha256,
              }));
            }
            // Retain the finished generated design when safe matching is uncertain;
            // never silently apply a generic second product over it.
          }
        }
        generated.push({
          organizationId: organizationId,
          briefId: briefId,
          jobId,
          name: (setup.enhancement
            ? setup.name
            : (group.map(product => product.name).join(" + ") ||
                setup.promotion?.title ||
                resolved.brand.name) +
              " · " +
              format.name
          ).slice(0, 180),
          concept:
            CREATIVE_THEMES[setup.theme].name +
            " · " +
            setup.mood +
            " · " +
            setup.artStyle +
            " · " +
            setup.shot,
          primaryText: setup.copy.subheadline,
          headline: setup.copy.headline,
          description: setup.copy.subheadline,
          callToAction: metaCallToAction(setup.copy.cta),
          format: format.id,
          channel: format.channel,
          imageUrl: image.url,
          imageStorageKey: image.storageKey,
          renderMetadata: {
            requestedSetup: setup,
            ...(setup.enhancement
              ? {
                  enhancement: {
                    sourceAssetKey: setup.enhancement
                      .assetKey as import("../../shared/assetLibrary").AssetKey,
                    sourceRevision: setup.enhancement.revision,
                    instruction: setup.enhancement.instruction,
                  },
                  ...(setup.enhancement.assetKey.startsWith("creative:")
                    ? {
                        parentVariantId: parseAssetKey(
                          setup.enhancement.assetKey
                        ).id,
                      }
                    : {}),
                }
              : {}),
            ...(preservedLogo && logoLayout
              ? {
                  logoPreservation: {
                    method: "original_logo_v1" as const,
                    ...logoLayout.placement,
                    sourceKey: preservedLogo.sourceKey,
                    sha256: preservedLogo.sha256,
                    designStorageKey: originalDesign.storageKey,
                    designUrl: originalDesign.url,
                  },
                }
              : {}),
            ...(productLayers.length
              ? {
                  productPreservation: {
                    method: "editable_original_v3",
                    designStorageKey: overlayDesign.storageKey,
                    designUrl: overlayDesign.url,
                    applied: productOverlayApplied,
                    automaticFailure,
                    automaticFailureDiagnostic,
                    alignment: productOverlayApplied
                      ? "automatic"
                      : "needs_adjustment",
                    layers: preparedProductLayers,
                  },
                }
              : {}),
            campaignPlanId: setup.campaignPlanId,
            productIds: group.map(product => product.id),
            promotion:
              setup.promotionMode === "platform"
                ? (setup.promotion ?? {
                    kind: "platform",
                    title: resolved.brand.name,
                    description: resolved.brand.businessProfile?.summary ?? "",
                  })
                : undefined,
            copy: setup.copy,
            copyTags: classifyCopy({
              headline: [setup.copy.headline],
              subheadline: [setup.copy.subheadline],
            }),
            mood: setup.mood,
            artStyle: setup.artStyle,
            shot: setup.shot,
            width: format.width,
            height: format.height,
          },
          status: "pending",
          createdAtMs: Date.now(),
        });
      }
    }
    await withOrganizationTransaction(db, organizationId, async tx => {
      const active = (
        await tx
          .select()
          .from(creativeJobs)
          .where(
            and(
              eq(creativeJobs.id, jobId),
              eq(creativeJobs.organizationId, organizationId)
            )
          )
          .limit(1)
          .for("update")
      )[0];
      if (active?.status !== "running")
        throw new Error("Generation attempt was interrupted");
      await tx
        .insert(creativeVariants)
        .values(generated)
        .returning({ insertId: creativeVariants.id });
      await tx
        .update(creativeJobs)
        .set({
          status: "completed",
          leaseExpiresAtMs: null,
          completedAtMs: Date.now(),
        })
        .where(
          and(
            eq(creativeJobs.id, jobId),
            eq(creativeJobs.organizationId, organizationId)
          )
        );
      await appendActivity(
        {
          organizationId,
          actorUserId,
          action: "creative_generation.completed",
          entityType: "creative_job",
          entityId: jobId,
          payload: { variantCount: generated.length, imageModel },
        },
        tx
      );
    });
    return { jobId, variantCount: generated.length };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Creative generation failed";
    const diagnostic = categorizeGenerationError(message);
    await withOrganizationTransaction(db, organizationId, async tx => {
      const changed = await tx
        .update(creativeJobs)
        .set({
          status: "failed",
          leaseExpiresAtMs: null,
          errorMessage: message,
          completedAtMs: Date.now(),
        })
        .where(
          and(
            eq(creativeJobs.id, jobId),
            eq(creativeJobs.organizationId, organizationId),
            eq(creativeJobs.status, "running")
          )
        )
        .returning({ id: creativeJobs.id });
      if (changed.length)
        await appendActivity(
          {
            organizationId,
            actorUserId,
            action: "creative_generation.failed",
            entityType: "creative_job",
            entityId: jobId,
            outcome: "failure",
            payload: { category: diagnostic.category },
          },
          tx
        );
    });
  }
}

/** Price the real references and each output, without submitting generation. */
export async function builderImageQuote(
  db: Database,
  organizationId: number,
  setup: CreativeSetup,
  resolved: Awaited<ReturnType<typeof loadInputs>>
) {
  let preservedLogo;
  try {
    await loadPreservedProducts(setup, resolved);
    preservedLogo = await loadPreservedLogo(setup, resolved);
  } catch (error) {
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message:
        error instanceof Error
          ? error.message
          : "Original artwork could not be checked.",
    });
  }
  const model = await resolveModel(db, setup.modelId, "image");
  if (model.provider !== "higgsfield")
    return imageBatchQuote(
      db,
      setup.modelId,
      setup.modelOptions,
      creativeImageOutputs(setup)
    );
  const common = await Promise.all(
    (resolved.references ?? []).map(r => readGenerationSource(r.storageKey))
  );
  const promptBrand = await generationBrand(organizationId, resolved.brand);
  const promptDefaults = await creativePromptDefaults(organizationId, setup);
  if (resolved.logo)
    common.push(await readGenerationSource(resolved.logo.storageKey));
  for (const person of selectedPeople(setup)) {
    if (person.kind === "library")
      common.push(await readLifestylePortrait(person.id));
    else {
      const asset = resolved.personAssets.find(a => a.id === person.assetId);
      if (!asset) throw new Error("Selected person reference is unavailable");
      common.push(await readGenerationSource(asset.storageKey));
    }
  }
  const groups = builderProductGroups(setup, resolved);
  const formats = setup.formatIds
    .map(id => formatDetails(id)!)
    .sort((a, b) => b.width * b.height - a.width * a.height);
  const quotes = [];
  for (const group of groups) {
    const sources = [
      ...(await Promise.all(
        group.flatMap(p =>
          p.image ? [readGenerationSource(p.image.storageKey)] : []
        )
      )),
      ...common,
    ];
    for (const format of formats) {
      const request = await prepareImageRequest(model, {
        prompt: buildCreativePrompt({
          promptDefaults,
          setup,
          brand: promptBrand,
          products: group,
          formatId: format.id,
          hasLogo: !!resolved.logo,
          logoPlacement: preservedLogo
            ? await prepareLogoPlacement(
                preservedLogo,
                format,
                setup.logoPosition
              )
            : undefined,
          adaptMaster: false,
        }),
        originalImages: sources,
        modelOptions: setup.modelOptions,
        storagePrefix: `org-${organizationId}/image-quotes`,
      });
      quotes.push(
        await imageModelQuote(db, model.id, setup.modelOptions, format, request)
      );
    }
  }
  if (!quotes.length)
    throw new Error("Choose an image format and subject first.");
  return {
    model,
    rate: quotes[0].rate,
    quotes,
    credits: quotes.reduce((sum, q) => sum + q.credits, 0),
  };
}

async function readOverlayDesign(
  db: Database,
  organizationId: number,
  variantId: number
) {
  const [variant] = await db
    .select()
    .from(creativeVariants)
    .where(
      and(
        eq(creativeVariants.organizationId, organizationId),
        eq(creativeVariants.id, variantId)
      )
    )
    .limit(1);
  const metadata = variant?.renderMetadata?.productPreservation;
  if (!variant || metadata?.method !== "editable_original_v3")
    throw new TRPCError({
      code: "NOT_FOUND",
      message:
        "This version does not have editable original-product layers. Generate a new design with product overlay enabled.",
    });
  return { variant, metadata };
}

export const creativeDraftSaveInput = organizationInput.extend({
  setup: creativeSetupSchema,
  briefId: z.number().int().positive().optional(),
  expectedUpdatedAtMs: z.number().int().optional(),
});
type CreativeDraftSaveInput = z.infer<typeof creativeDraftSaveInput>;
export type CreativeDraftSaveResult = { briefId: number; updatedAtMs: number };
export function saveCreativeSetup(
  userId: number,
  input: CreativeDraftSaveInput
): Promise<CreativeDraftSaveResult>;
export function saveCreativeSetup<T>(
  userId: number,
  input: CreativeDraftSaveInput,
  aroundSave: DraftSaveHook<CreativeDraftSaveResult, T>
): Promise<T>;
export async function saveCreativeSetup<T>(
  userId: number,
  input: CreativeDraftSaveInput,
  aroundSave?: DraftSaveHook<CreativeDraftSaveResult, T>
): Promise<T | CreativeDraftSaveResult> {
  await requireOrganizationRole(userId, input.organizationId, [...editorRoles]);
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
  return withOrganizationTransaction(db, input.organizationId, async tx => {
    const save = async (): Promise<CreativeDraftSaveResult> => {
      // loadInputs uses only database reads; this transaction supplies the same read interface.
      await loadInputs(
        tx as unknown as Parameters<typeof loadInputs>[0],
        input.organizationId,
        input.setup
      );
      if (input.setup.campaignPlanId) {
        const [plan] = await tx
          .select()
          .from(campaignBriefs)
          .where(
            and(
              eq(campaignBriefs.id, input.setup.campaignPlanId),
              eq(campaignBriefs.organizationId, input.organizationId)
            )
          )
          .limit(1);
        if (!plan || plan.creativeSetup)
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Choose a campaign plan in this workspace.",
          });
      }
      const now = Math.max(Date.now(), (input.expectedUpdatedAtMs ?? 0) + 1);
      const fields = {
        name: input.setup.name,
        creativeSetup: input.setup,
        audience: "",
        offer: input.setup.copy.subheadline,
        channel:
          input.setup.channels.length === 1
            ? input.setup.channels[0]
            : ("multi_channel" as const),
        placements: input.setup.channels,
        formats: input.setup.formatIds,
        creativeDirection:
          input.setup.basePrompt +
          "\n\n" +
          (input.setup.themePrompt ||
            getCreativeTheme(input.setup.theme).direction) +
          "\n\n" +
          "Mood: " +
          getCreativeMood(input.setup.mood).name +
          " — " +
          getCreativeMood(input.setup.mood).direction +
          "\n\n" +
          "Art style: " +
          getCreativeArtStyle(input.setup.artStyle).name +
          " — " +
          getCreativeArtStyle(input.setup.artStyle).direction +
          "\n\n" +
          input.setup.extraDirection,
        assetIds: input.setup.logoAssetId ? [input.setup.logoAssetId] : [],
        productIds: input.setup.products.map(product => product.productId),
        status: "draft" as const,
        approvedAtMs: null,
        approvedByUserId: null,
        updatedAtMs: now,
      };
      let briefId = input.briefId;
      if (briefId) {
        if (input.expectedUpdatedAtMs === undefined)
          throw new TRPCError({
            code: "CONFLICT",
            message: "Reload the saved setup before updating it.",
          });
        const changed = await tx
          .update(campaignBriefs)
          .set(fields)
          .where(
            and(
              eq(campaignBriefs.id, briefId),
              eq(campaignBriefs.organizationId, input.organizationId),
              isNotNull(campaignBriefs.creativeSetup),
              eq(campaignBriefs.updatedAtMs, input.expectedUpdatedAtMs)
            )
          )
          .returning({ id: campaignBriefs.id });
        if (!changed.length)
          throw new TRPCError({
            code: "CONFLICT",
            message:
              "This setup changed in another session. Reload it before saving.",
          });
      } else {
        const inserted = await tx
          .insert(campaignBriefs)
          .values({
            ...fields,
            organizationId: input.organizationId,
            createdByUserId: userId,
            createdAtMs: now,
          })
          .returning({ insertId: campaignBriefs.id });
        briefId = Number(inserted[0].insertId);
      }
      await appendActivity(
        {
          organizationId: input.organizationId,
          actorUserId: userId,
          action: "creative_setup.saved",
          entityType: "campaign_brief",
          entityId: briefId,
          payload: {
            name: input.setup.name,
            theme: input.setup.theme,
            mood: input.setup.mood,
            artStyle: input.setup.artStyle,
          },
        },
        tx
      );

      return { briefId, updatedAtMs: now };
    };
    return aroundSave ? aroundSave(tx, save) : save();
  });
}

export const creativeBuilderRouter = router({
  enhancementSetup: protectedProcedure
    .input(
      organizationInput.extend({
        key: z.string().regex(/^(asset|creative):[1-9][0-9]*$/),
        revision: z.string().regex(/^[a-f0-9]{64}$/),
      })
    )
    .query(async ({ ctx, input }) => {
      await requireOrganizationRole(ctx.user.id, input.organizationId, [
        ...editorRoles,
      ]);
      const db = (await getDb())!;
      const [brand] = await db
        .select()
        .from(brandKits)
        .where(eq(brandKits.organizationId, input.organizationId))
        .limit(1);
      if (!brand)
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "Set up your Brand Kit before enhancing an image.",
        });
      return prepareEnhancement(
        db,
        input.organizationId,
        input.key,
        input.revision,
        brand
      );
    }),
  productOverlay: protectedProcedure
    .input(
      organizationInput.extend({
        variantId: z.number().int().positive(),
        replacements: productOverlayReplacementsSchema,
      })
    )
    .query(async ({ ctx, input }) => {
      await requireOrganizationRole(ctx.user.id, input.organizationId, [
        ...editorRoles,
      ]);
      const db = (await getDb())!;
      const { variant, metadata } = await readOverlayDesign(
        db,
        input.organizationId,
        input.variantId
      );
      const asset = await readLibraryAsset(
        db,
        input.organizationId,
        `creative:${variant.id}`
      );
      const layers = [];
      const sources = await readOverlaySources(
        db,
        input.organizationId,
        metadata,
        input.replacements,
        variant.renderMetadata!.productIds
      );
      for (let index = 0; index < metadata.layers.length; index++) {
        const layer = metadata.layers[index];
        const cutout = sources[index];
        const preview = await sharp(cutout.png)
          .resize({
            width: 800,
            height: 800,
            fit: "inside",
            withoutEnlargement: true,
          })
          .png()
          .toBuffer();
        layers.push({
          productId: variant.renderMetadata!.productIds[index],
          left: layer.left,
          top: layer.top,
          width: layer.width,
          height: layer.height,
          aspect: cutout.width / cutout.height,
          sourceWidth: cutout.width,
          sourceHeight: cutout.height,
          preview: `data:image/png;base64,${preview.toString("base64")}`,
        });
      }
      return {
        designUrl: await productOverlayPreview(metadata.designStorageKey),
        width: variant.renderMetadata!.width,
        height: variant.renderMetadata!.height,
        revision: asset.revision,
        applied: metadata.applied,
        automaticFailure: metadata.automaticFailure,
        automaticFailureDiagnostic: metadata.automaticFailureDiagnostic,
        alignment: metadata.alignment,
        layers,
        replacementSources: (
          await catalogOverlaySources(
            db,
            input.organizationId,
            variant.renderMetadata!.productIds
          )
        ).map(({ storageKey: _storageKey, ...source }) => source),
      };
    }),
  alignProductOverlay: protectedProcedure
    .input(
      organizationInput.extend({
        variantId: z.number().int().positive(),
        replacements: productOverlayReplacementsSchema,
      })
    )
    .mutation(async ({ ctx, input }) => {
      await requireOrganizationRole(ctx.user.id, input.organizationId, [
        ...editorRoles,
      ]);
      const db = (await getDb())!;
      const { variant, metadata } = await readOverlayDesign(
        db,
        input.organizationId,
        input.variantId
      );
      const sources = await readOverlaySources(
        db,
        input.organizationId,
        metadata,
        input.replacements,
        variant.renderMetadata!.productIds
      );
      return suggestProductPlacement(
        Buffer.from(
          await storageGetBase64(metadata.designStorageKey),
          "base64"
        ),
        sources,
        variant.renderMetadata!
      );
    }),
  saveProductOverlay: protectedProcedure
    .input(
      organizationInput.extend({
        variantId: z.number().int().positive(),
        revision: z.string().regex(/^[a-f0-9]{64}$/),
        layers: z.array(productOverlayPlacementSchema).min(1).max(3),
        allowUpscale: z.boolean().default(false),
        replacements: productOverlayReplacementsSchema,
      })
    )
    .mutation(async ({ ctx, input }) => {
      await requireOrganizationRole(ctx.user.id, input.organizationId, [
        ...editorRoles,
      ]);
      const db = (await getDb())!;
      const { variant, metadata } = await readOverlayDesign(
        db,
        input.organizationId,
        input.variantId
      );
      const asset = await readLibraryAsset(
        db,
        input.organizationId,
        `creative:${variant.id}`
      );
      if (asset.revision !== input.revision)
        throw new TRPCError({
          code: "CONFLICT",
          message: "This version changed. Refresh before saving.",
        });
      const cutouts = await readOverlaySources(
        db,
        input.organizationId,
        metadata,
        input.replacements,
        variant.renderMetadata!.productIds
      );
      const design = Buffer.from(
        await storageGetBase64(metadata.designStorageKey),
        "base64"
      );
      // Explicit enlargement consent applies to verified sharper replacements too.
      const result = await renderProductOverlay(
        design,
        cutouts,
        input.layers,
        input.allowUpscale
      );
      const stored = await storagePut(
        `org-${input.organizationId}/creatives/${variant.jobId}/product-overlay.png`,
        result.png,
        "image/png"
      );
      const saved = await withOrganizationTransaction(
        db,
        input.organizationId,
        async tx => {
          const current = await readLibraryAsset(
            tx,
            input.organizationId,
            `creative:${variant.id}`
          );
          if (current.revision !== input.revision)
            throw new TRPCError({
              code: "CONFLICT",
              message: "This version changed. Refresh before saving.",
            });
          // Bind the previewed source revisions and bytes again at commit time.
          const currentSources = await readOverlaySources(
            tx,
            input.organizationId,
            metadata,
            input.replacements,
            variant.renderMetadata!.productIds
          );
          if (
            currentSources.some(
              (source, i) => source.sha256 !== cutouts[i].sha256
            )
          )
            throw new TRPCError({
              code: "CONFLICT",
              message: "A product source changed. Reopen the editor.",
            });
          const {
            id: _id,
            reviewedByUserId: _reviewer,
            reviewedAtMs: _reviewed,
            ...base
          } = variant;
          const [next] = await tx
            .insert(creativeVariants)
            .values({
              ...base,
              name: `${variant.name.replace(/ · Product overlay$/, "")} · Product overlay`.slice(
                0,
                180
              ),
              imageUrl: stored.url,
              imageStorageKey: stored.key,
              status: "pending",
              createdAtMs: Date.now(),
              renderMetadata: {
                ...variant.renderMetadata!,
                parentVariantId: variant.id,
                productPreservation: manuallyAppliedProductOverlay(
                  metadata,
                  result.layers
                ),
              },
            })
            .returning({ id: creativeVariants.id });
          await appendActivity(
            {
              organizationId: input.organizationId,
              actorUserId: ctx.user.id,
              action: "creative.product_overlay_saved",
              entityType: "library_asset",
              entityId: `creative:${next.id}`,
              payload: {
                parentVariantId: variant.id,
                replacements: input.replacements,
              },
            },
            tx
          );
          return next;
        }
      );
      return {
        id: saved.id,
        key: `creative:${saved.id}` as const,
        url: stored.url,
      };
    }),

  studioJob: protectedProcedure
    .input(organizationInput.extend({ jobId: z.number().int().positive() }))
    .query(async ({ ctx, input }) => {
      await requireOrganizationRole(ctx.user.id, input.organizationId, [
        ...editorRoles,
      ]);
      const db = (await getDb())!;
      await recoverExpiredBuilderJobs(db, input.organizationId);
      const [job] = await db
        .select({
          id: creativeJobs.id,
          status: creativeJobs.status,
          errorMessage: creativeJobs.errorMessage,
        })
        .from(creativeJobs)
        .where(
          and(
            eq(creativeJobs.id, input.jobId),
            eq(creativeJobs.organizationId, input.organizationId)
          )
        )
        .limit(1);
      if (!job)
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Generation not found.",
        });
      const variants = await db
        .select({
          id: creativeVariants.id,
          title: creativeVariants.name,
          url: creativeVariants.imageUrl,
          createdAtMs: creativeVariants.createdAtMs,
          status: creativeVariants.status,
        })
        .from(creativeVariants)
        .where(
          and(
            eq(creativeVariants.organizationId, input.organizationId),
            eq(creativeVariants.jobId, job.id)
          )
        )
        .orderBy(creativeVariants.id);
      return {
        ...job,
        errorMessage: job.errorMessage
          ? categorizeGenerationError(job.errorMessage).userMessage
          : null,
        variants,
      };
    }),
  studioHistory: protectedProcedure
    .input(
      organizationInput.extend({
        briefId: z.number().int().positive().optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      await requireOrganizationRole(ctx.user.id, input.organizationId, [
        ...editorRoles,
      ]);
      const db = (await getDb())!;
      const rows = await db
        .select({
          id: creativeVariants.id,
          title: creativeVariants.name,
          url: creativeVariants.imageUrl,
          createdAtMs: creativeVariants.createdAtMs,
          status: creativeVariants.status,
          snapshot: creativeJobs.briefSnapshot,
        })
        .from(creativeVariants)
        .innerJoin(
          creativeJobs,
          and(
            eq(creativeJobs.id, creativeVariants.jobId),
            eq(creativeJobs.organizationId, input.organizationId)
          )
        )
        .where(
          and(
            eq(creativeVariants.organizationId, input.organizationId),
            isNotNull(creativeVariants.imageUrl),
            input.briefId
              ? eq(creativeVariants.briefId, input.briefId)
              : undefined
          )
        )
        .orderBy(desc(creativeVariants.createdAtMs), desc(creativeVariants.id))
        .limit(24);
      return rows.map(({ snapshot, ...item }) => {
        // Only return the validated generation-time settings, never private job metadata.
        const parsed = creativeSetupSchema.safeParse(snapshot?.setup);
        return { ...item, setup: parsed.success ? parsed.data : null };
      });
    }),
  quote: protectedProcedure
    .input(organizationInput.extend({ setup: creativeSetupSchema }))
    .query(async ({ ctx, input }) => {
      await requireOrganizationRole(ctx.user.id, input.organizationId, [
        ...editorRoles,
      ]);
      const db = (await getDb())!;
      const resolved = await loadInputs(db, input.organizationId, input.setup);
      assertCategorySelection(
        resolved.products,
        input.setup.categoryHandling,
        input.setup.productMode === "separate"
      );
      const quote = await builderImageQuote(
        db,
        input.organizationId,
        input.setup,
        resolved
      );
      return { credits: quote.credits, routeId: quote.model.id };
    }),
  people: protectedProcedure
    .input(organizationInput)
    .query(async ({ ctx, input }) => {
      await requireOrganizationRole(ctx.user.id, input.organizationId);
      const db = (await getDb())!;
      return (
        await db
          .select()
          .from(brandAssets)
          .where(
            and(
              eq(brandAssets.organizationId, input.organizationId),
              eq(brandAssets.type, "reference")
            )
          )
          .orderBy(desc(brandAssets.createdAtMs))
      )
        .filter(asset => asset.metadata?.kind === "lifestyle_person")
        .map(asset => ({
          id: asset.id,
          name: asset.name,
          url: asset.url,
          status: asset.status,
          gender: asset.metadata?.gender,
          libraryId: asset.metadata?.libraryId,
          age: asset.metadata?.age ?? "adult_unspecified",
        }));
    }),
  savePerson: protectedProcedure
    .input(
      organizationInput.extend({
        libraryId: z.string().optional(),
        name: z.string().trim().min(2).max(120),
        gender: z.enum(["male", "female"]),
        age: z
          .enum([
            "child",
            "teen",
            "young",
            "adult",
            "senior",
            "adult_unspecified",
          ])
          .default("adult_unspecified"),
        base64: z.string().max(8_500_000).optional(),
        permissionConfirmed: z.boolean().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      await requireOrganizationRole(ctx.user.id, input.organizationId, [
        ...editorRoles,
      ]);
      const db = (await getDb())!;
      const kit = (
        await db
          .select()
          .from(brandKits)
          .where(eq(brandKits.organizationId, input.organizationId))
          .limit(1)
      )[0];
      if (!kit)
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "Set up your brand first.",
        });
      let bytes: Buffer;
      if (input.libraryId) {
        const person = findLifestylePerson(input.libraryId);
        if (!person || person.gender !== input.gender)
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Choose a supported person.",
          });
        const existing = (
          await db
            .select()
            .from(brandAssets)
            .where(
              and(
                eq(brandAssets.organizationId, input.organizationId),
                eq(brandAssets.type, "reference")
              )
            )
        ).find(
          a =>
            a.metadata?.libraryId === input.libraryId && a.status !== "rejected"
        );
        if (existing) return { assetId: existing.id, status: existing.status };
        bytes = Buffer.from(
          (await readLifestylePortrait(input.libraryId)).b64Json,
          "base64"
        );
      } else {
        if (!input.permissionConfirmed || !input.base64)
          throw new TRPCError({
            code: "BAD_REQUEST",
            message:
              "Confirm permission to use this portrait, including parent or guardian permission for a child or teen.",
          });
        const raw = Buffer.from(
          input.base64.replace(/^data:[^;]+;base64,/, ""),
          "base64"
        );
        if (raw.length > 6 * 1024 * 1024)
          throw new TRPCError({
            code: "PAYLOAD_TOO_LARGE",
            message: "Choose an image under 6 MB.",
          });
        try {
          bytes = await sharp(raw, { limitInputPixels: 20_000_000 })
            .rotate()
            .resize({
              width: 1200,
              height: 1200,
              fit: "inside",
              withoutEnlargement: true,
            })
            .png()
            .toBuffer();
        } catch {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Choose a valid JPG, PNG, or WebP portrait.",
          });
        }
      }
      const stored = await storagePut(
        `org-${input.organizationId}/brand/people/${randomUUID()}.png`,
        bytes,
        "image/png"
      );
      const now = Date.now();
      const asset = (
        await db
          .insert(brandAssets)
          .values({
            organizationId: input.organizationId,
            brandKitId: kit.id,
            name: input.name,
            type: "reference",
            storageKey: stored.key,
            url: stored.url,
            mimeType: "image/png",
            status: input.libraryId ? "approved" : "pending",
            metadata: {
              kind: "lifestyle_person",
              gender: input.gender,
              age: input.libraryId
                ? findLifestylePerson(input.libraryId)!.age
                : input.age,
              libraryId: input.libraryId ?? null,
              source: input.libraryId ? "curated_ai_library" : "user_upload",
              permissionConfirmed: input.permissionConfirmed ?? false,
            },
            uploadedByUserId: ctx.user.id,
            createdAtMs: now,
          })
          .returning()
      )[0];
      await appendActivity({
        organizationId: input.organizationId,
        actorUserId: ctx.user.id,
        action: "person_reference.saved",
        entityType: "brand_asset",
        entityId: asset.id,
        payload: {
          source: input.libraryId ? "curated_ai_library" : "user_upload",
        },
      });
      return { assetId: asset.id, status: asset.status };
    }),
  options: protectedProcedure
    .input(organizationInput)
    .query(async ({ ctx, input }) => {
      await requireOrganizationRole(ctx.user.id, input.organizationId);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const [
        approvedCatalog,
        catalog,
        images,
        logos,
        kits,
        drafts,
        references,
      ] = await Promise.all([
        db
          .select()
          .from(products)
          .where(
            and(
              eq(products.organizationId, input.organizationId),
              eq(products.status, "approved")
            )
          )
          .orderBy(products.name)
          .limit(750),
        db
          .select()
          .from(products)
          .where(eq(products.organizationId, input.organizationId))
          .orderBy(products.name)
          .limit(2000),
        db
          .select()
          .from(productImages)
          .where(eq(productImages.organizationId, input.organizationId))
          .orderBy(desc(productImages.isPrimary), productImages.id),
        db
          .select()
          .from(brandAssets)
          .where(
            and(
              eq(brandAssets.organizationId, input.organizationId),
              eq(brandAssets.type, "logo"),
              eq(brandAssets.status, "approved")
            )
          )
          .orderBy(desc(brandAssets.createdAtMs)),
        db
          .select()
          .from(brandKits)
          .where(eq(brandKits.organizationId, input.organizationId))
          .limit(1),
        db
          .select({
            id: campaignBriefs.id,
            name: campaignBriefs.name,
            setup: campaignBriefs.creativeSetup,
            updatedAtMs: campaignBriefs.updatedAtMs,
          })
          .from(campaignBriefs)
          .where(
            and(
              eq(campaignBriefs.organizationId, input.organizationId),
              isNotNull(campaignBriefs.creativeSetup)
            )
          )
          .orderBy(desc(campaignBriefs.updatedAtMs))
          .limit(50),
        db
          .select()
          .from(brandAssets)
          .where(
            and(
              eq(brandAssets.organizationId, input.organizationId),
              eq(brandAssets.type, "reference"),
              eq(brandAssets.status, "approved")
            )
          )
          .orderBy(desc(brandAssets.createdAtMs)),
      ]);
      return {
        references: references.filter(
          r => r.metadata?.kind !== "lifestyle_person"
        ),
        products: (
          await attachMarketingCategories(
            db,
            input.organizationId,
            approvedCatalog
          )
        ).map(product => ({
          relatedSources: relatedCatalogSources(product, catalog),
          ...product,
          images: images.filter(image => image.productId === product.id),
        })),
        logos,
        brand: kits[0] ?? null,
        drafts,
      };
    }),

  save: protectedProcedure
    .input(creativeDraftSaveInput)
    .mutation(({ ctx, input }) => saveCreativeSetup(ctx.user.id, input)),

  refreshCopy: protectedProcedure
    .input(organizationInput.extend({ setup: creativeSetupSchema }))
    .mutation(async ({ ctx, input }) => {
      await requireOrganizationRole(ctx.user.id, input.organizationId, [
        ...editorRoles,
      ]);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const resolved = await loadInputs(db, input.organizationId, input.setup);
      // Older saved page briefs only contained metadata. Read their missing body
      assertCategorySelection(resolved.products, input.setup.categoryHandling);
      // before a paid AI call, retaining the user's reviewed title and summary.
      let copySetup = input.setup;
      if (
        copySetup.promotionMode === "platform" &&
        copySetup.promotion?.sourceUrl &&
        copySetup.promotion.pageContent === undefined
      ) {
        try {
          const page = await previewStudioPage(copySetup.promotion.sourceUrl);
          copySetup = {
            ...copySetup,
            promotion: {
              ...copySetup.promotion,
              pageContent: page.pageContent,
            },
          };
        } catch {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message:
              "The source page could not be read. Open Subject & sources → Page URL to refresh its details, or describe the promotion manually before generating copy.",
          });
        }
      }
      try {
        const model = requireLatestGptTextModel((await listLLMModels()).data);
        const response = await invokeLLM({
          promptTemplateId: "creative.copy",
          promptTemplateOverride: copySetup.copyDefaultInstructions,
          model,
          messages: buildCreativeCopyMessages(
            copySetup,
            resolved.brand,
            resolved.products,
            await creativePromptDefaults(input.organizationId, copySetup)
          ),
          maxTokens: 6000,
          reasoning: { effort: "low" },
          response_format: {
            type: "json_schema",
            json_schema: {
              name: "creative_copy",
              strict: true,
              schema: {
                type: "object",
                properties: {
                  headline: { type: "string" },
                  subheadline: { type: "string" },
                  cta: { type: "string" },
                },
                required: ["headline", "subheadline", "cta"],
                additionalProperties: false,
              },
            },
          },
        });
        const content = response.choices[0]?.message?.content;
        const copy = creativeCopySchema.parse(
          JSON.parse(typeof content === "string" ? content : "{}")
        );
        return alignCopyWithCampaign(copy, copySetup.theme);
      } catch (error) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: categorizeGenerationError(
            error instanceof Error ? error.message : ""
          ).userMessage,
        });
      }
    }),

  generate: protectedProcedure
    .input(
      organizationInput.extend({
        briefId: z.number().int().positive(),
        expectedUpdatedAtMs: z.number().int(),
        requestId: z.string().uuid(),
        quotedCredits: z.number().int().min(0).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      await requireOrganizationRole(ctx.user.id, input.organizationId, [
        ...editorRoles,
      ]);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const brief = (
        await db
          .select()
          .from(campaignBriefs)
          .where(
            and(
              eq(campaignBriefs.id, input.briefId),
              eq(campaignBriefs.organizationId, input.organizationId)
            )
          )
          .limit(1)
      )[0];
      if (!brief?.creativeSetup)
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Creative setup not found.",
        });
      if (brief.updatedAtMs !== input.expectedUpdatedAtMs)
        throw new TRPCError({
          code: "CONFLICT",
          message: "The setup changed. Review and save it again.",
        });
      const setup = creativeSetupSchema.parse(brief.creativeSetup);
      const issues = generationSetupIssues(setup);
      if (issues.length)
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: issues.join(" "),
        });
      const resolved = await loadInputs(db, input.organizationId, setup);
      assertCategorySelection(
        resolved.products,
        setup.categoryHandling,
        setup.productMode === "separate"
      );
      const generationQuote = await builderImageQuote(
        db,
        input.organizationId,
        setup,
        resolved
      );
      const productReferences =
        setup.promotionMode === "platform"
          ? 0
          : setup.productMode === "together"
            ? resolved.products.filter(p => p.image).length
            : resolved.products.some(p => p.image)
              ? 1
              : 0;
      const referenceCount =
        productReferences +
        (resolved.references?.length ?? 0) +
        (resolved.logo ? 1 : 0) +
        selectedPeople(setup).length;
      if (referenceCount > referenceCapacity(generationQuote.model))
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `${generationQuote.model.name} supports ${referenceCapacity(generationQuote.model)} reference images; this creative needs ${referenceCount}. Select a compatible model or fewer references/formats.`,
        });
      if (input.quotedCredits !== generationQuote.credits)
        throw new TRPCError({
          code: "CONFLICT",
          message: "Review the current credit estimate before generating.",
        });
      setup.modelId = generationQuote.model.id;
      if (resolved.brand.status !== "active")
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "Activate your Brand Kit before generating creatives.",
        });
      const snapshot = {
        kind: "builder_v1",
        generationQuote: {
          rate: generationQuote.rate,
          rates: generationQuote.quotes.map(quote => quote.rate),
          credits: generationQuote.credits,
          modelId: generationQuote.model.id,
        },
        resolved,
        setup,
        brand: resolved.brand,
        products: resolved.products,
        requestId: input.requestId,
      };
      const assetSnapshot = [
        ...(resolved.references ?? []).map(r => ({
          kind: "reference",
          id: r.id,
          storageKey: r.storageKey,
          url: r.url,
        })),
        ...selectedPeople(setup).map(selection => {
          const asset =
            selection.kind === "asset"
              ? resolved.personAssets.find(a => a.id === selection.assetId)
              : undefined;
          return {
            kind: "person",
            selection,
            ...(asset ? { storageKey: asset.storageKey, id: asset.id } : {}),
          };
        }),
        ...resolved.products.map(product => ({
          kind: "product",
          productId: product.id,
          ...product.image,
        })),
        ...(resolved.logo
          ? [
              {
                kind: "logo",
                id: resolved.logo.id,
                name: resolved.logo.name,
                storageKey: resolved.logo.storageKey,
                url: resolved.logo.url,
              },
            ]
          : []),
      ];
      await recoverExpiredBuilderJobs(db, input.organizationId);
      const insertedJob = await withOrganizationTransaction(
        db,
        input.organizationId,
        async tx => {
          const locked = (
            await tx
              .select()
              .from(campaignBriefs)
              .where(
                and(
                  eq(campaignBriefs.id, brief.id),
                  eq(campaignBriefs.organizationId, input.organizationId)
                )
              )
              .limit(1)
              .for("update")
          )[0];
          if (locked?.updatedAtMs !== input.expectedUpdatedAtMs)
            throw new TRPCError({
              code: "CONFLICT",
              message: "The setup changed. Review and save it again.",
            });
          const previous = await tx
            .select()
            .from(creativeJobs)
            .where(
              and(
                eq(creativeJobs.organizationId, input.organizationId),
                eq(creativeJobs.briefId, brief.id)
              )
            )
            .orderBy(desc(creativeJobs.id))
            .limit(100);
          const replay = previous.find(
            job => job.briefSnapshot.requestId === input.requestId
          );
          if (replay?.status === "completed")
            return { jobId: replay.id, replay: true };
          if (
            replay ||
            previous.some(
              job => job.status === "running" || job.status === "queued"
            )
          )
            throw new TRPCError({
              code: "CONFLICT",
              message:
                "An attempt already exists for this setup. Check its status in Results.",
            });
          const result = await tx
            .insert(creativeJobs)
            .values({
              organizationId: input.organizationId,
              briefId: brief.id,
              status: "queued",
              inputHash: stableHash({ snapshot, assetSnapshot }),
              briefSnapshot: snapshot,
              assetSnapshot,
              requestedByUserId: ctx.user.id,
              createdAtMs: Date.now(),
              leaseExpiresAtMs: null,
            })
            .returning({ insertId: creativeJobs.id });
          const jobId = Number(result[0].insertId);
          await appendActivity(
            {
              organizationId: input.organizationId,
              actorUserId: ctx.user.id,
              action: "creative_generation.requested",
              entityType: "creative_job",
              entityId: jobId,
              payload: { briefId: brief.id, outputCount: outputCount(setup) },
            },
            tx
          );
          return { jobId, replay: false };
        }
      );
      const { jobId } = insertedJob;
      return {
        jobId,
        status: insertedJob.replay
          ? ("completed" as const)
          : ("queued" as const),
      };
    }),
});
