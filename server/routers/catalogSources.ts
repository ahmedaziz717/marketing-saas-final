import { fetchCatalogImage } from "../lib/catalogImages";
import { readApiProductDetails } from "../lib/apiProductDetails";
import { discoverOfferings } from "../lib/marketingDrafts";
import { brandKits, products, productImages } from "../../drizzle/schema";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { catalogSources } from "../../drizzle/schema";
import { STORE_PROVIDERS, catalogEntrySchema } from "../../shared/catalog";
import { protectedProcedure, router } from "../_core/trpc";
import { getDb } from "../db";
import { requireOrganizationRole } from "../lib/access";
import {
  encryptToken,
  decryptToken,
  catalogEncryptionKey,
} from "../lib/secureToken";
import { readStorePage, storeAddress } from "../lib/storeCatalog";
import { importCatalogEntry } from "../lib/catalogImport";
import { appendActivity, withOrganizationTransaction } from "../lib/activity";
import {
  previewStudioPage,
  previewStudioProductPage,
} from "../lib/studioProductPage";
import {
  apiCatalogConfigSchema,
  apiInstructionFileSchema,
  apiEndpointSchema,
  apiCatalogMappingSchema,
} from "../../shared/apiCatalog";
import {
  apiCatalogAddress,
  fetchApiCatalog,
  parseApiCatalog,
  apiCatalogRows,
  inferProductLinkRule,
  apiMappingRevision,
} from "../lib/apiCatalog";
import { suggestApiMapping } from "../lib/apiInstructions";
import {
  galleryPilotRecipeSchema,
  galleryPilotTokenSchema,
} from "../../shared/catalogGalleryPilot";
import {
  previewGalleryPilot,
  pilotRecords,
  pilotFingerprint,
  type GalleryPilotPlan,
} from "../lib/catalogGalleryPilot";
const org = z.object({ organizationId: z.number().int().positive() });
const idInput = org.extend({ sourceId: z.number().int().positive() });
async function owner(userId: number, organizationId: number) {
  await requireOrganizationRole(userId, organizationId, ["owner", "admin"]);
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
  return db;
}
export const catalogSourcesRouter = router({
  galleryRecipeSettings: protectedProcedure
    .input(idInput)
    .query(async ({ ctx, input }) => {
      const db = await owner(ctx.user.id, input.organizationId);
      const [source] = await db
        .select()
        .from(catalogSources)
        .where(
          and(
            eq(catalogSources.id, input.sourceId),
            eq(catalogSources.organizationId, input.organizationId)
          )
        );
      if (!source?.credentials || source.provider !== "api")
        throw new TRPCError({ code: "NOT_FOUND" });
      const credentials = JSON.parse(decryptToken(source.credentials));
      const saved = galleryPilotRecipeSchema.safeParse(
        credentials.galleryRecipe
      );
      const previous = galleryPilotRecipeSchema.safeParse(
        credentials.galleryPilot?.completed
          ? credentials.galleryPilot.recipe
          : undefined
      );
      const coverage = await db
        .select({
          id: products.id,
          groupCount: sql<number>`coalesce(json_array_length(${products.mediaGroups}), 0)`,
        })
        .from(products)
        .where(
          and(
            eq(products.organizationId, input.organizationId),
            eq(products.sourceId, input.sourceId),
            sql`${products.provenance}->>'component.sourceCode' is null`
          )
        )
        .orderBy(products.id)
        .limit(500);
      // Keep aggregation separate: raw correlated columns in a single-table
      // Drizzle selection lose qualification and can bind to the inner table.
      const counts = coverage.length
        ? await db
            .select({
              productId: productImages.productId,
              imageCount: sql<number>`count(*)::int`,
            })
            .from(productImages)
            .where(
              and(
                eq(productImages.organizationId, input.organizationId),
                inArray(
                  productImages.productId,
                  coverage.map(product => product.id)
                ),
                sql`coalesce((${productImages.media}->>'retired')::boolean, false) = false`
              )
            )
            .groupBy(productImages.productId)
        : [];
      const countByProduct = new Map(
        counts.map(row => [row.productId, row.imageCount])
      );
      return {
        updatedAtMs: source.updatedAtMs,
        autoSync: !!source.autoSync,
        nextSyncAt: source.nextSyncAt,
        recipe: saved.success
          ? saved.data
          : previous.success
            ? previous.data
            : null,
        recipeOrigin: saved.success
          ? ("saved" as const)
          : previous.success
            ? ("last_repair" as const)
            : null,
        coverage: coverage.map(product => ({
          ...product,
          imageCount: countByProduct.get(product.id) ?? 0,
        })),
      };
    }),
  saveGalleryRecipe: protectedProcedure
    .input(
      idInput.extend({
        token: galleryPilotTokenSchema,
        expectedUpdatedAtMs: z.number(),
        confirmed: z.literal(true),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const db = await owner(ctx.user.id, input.organizationId);
      let plan: GalleryPilotPlan;
      try {
        plan = JSON.parse(decryptToken(input.token));
      } catch {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Preview this gallery recipe again.",
        });
      }
      if (
        plan.kind !== "catalog-gallery-pilot-v1" ||
        plan.organizationId !== input.organizationId ||
        plan.sourceId !== input.sourceId ||
        plan.actorUserId !== ctx.user.id ||
        plan.expiresAt < Date.now()
      )
        throw new TRPCError({
          code: "BAD_REQUEST",
          message:
            "The gallery preview expired or belongs to another scope. Preview again.",
        });
      const recipe = galleryPilotRecipeSchema.parse(plan.recipe);
      return withOrganizationTransaction(db, input.organizationId, async tx => {
        await tx
          .select({ id: catalogSources.id })
          .from(catalogSources)
          .where(
            and(
              eq(catalogSources.id, input.sourceId),
              eq(catalogSources.organizationId, input.organizationId)
            )
          )
          .for("update");
        await tx
          .select({ id: products.id })
          .from(products)
          .where(
            and(
              eq(products.id, plan.productId),
              eq(products.organizationId, input.organizationId)
            )
          )
          .for("update");
        const { source, product, images } = await pilotRecords(
          tx,
          input.organizationId,
          input.sourceId,
          plan.productId
        );
        if (
          source.updatedAtMs !== input.expectedUpdatedAtMs ||
          source.updatedAtMs !== plan.sourceUpdatedAtMs ||
          source.leaseUntil ||
          ["queued", "syncing"].includes(source.status) ||
          pilotFingerprint(product) !== plan.productFingerprint ||
          pilotFingerprint(images) !== plan.imageFingerprint
        )
          throw new TRPCError({
            code: "CONFLICT",
            message: "Source or product changed. Preview again before saving.",
          });
        const credentials = JSON.parse(decryptToken(source.credentials!));
        if (credentials.galleryPilot && !credentials.galleryPilot.completed)
          throw new TRPCError({
            code: "CONFLICT",
            message: "Finish the pending one-product gallery repair first.",
          });
        credentials.api = apiCatalogConfigSchema.parse({
          ...credentials.api,
          ...recipe,
          mediaGroupsFromDetails: true,
        });
        credentials.galleryRecipe = recipe;
        await tx
          .update(catalogSources)
          .set({
            credentials: encryptToken(JSON.stringify(credentials)),
            updatedAtMs: Date.now(),
          })
          .where(eq(catalogSources.id, source.id));
        await appendActivity(
          {
            organizationId: input.organizationId,
            actorUserId: ctx.user.id,
            action: "catalog.gallery_recipe_saved",
            entityType: "catalog_source",
            entityId: source.id,
            payload: {
              reviewedProductId: plan.productId,
              recipeRevision: pilotFingerprint(recipe),
              queued: false,
            },
          },
          tx
        );
        return { saved: true, queued: false };
      });
    }),
  galleryPilotProducts: protectedProcedure
    .input(idInput)
    .query(async ({ ctx, input }) => {
      const db = await owner(ctx.user.id, input.organizationId);
      return db
        .select({
          id: products.id,
          externalId: products.externalId,
          name: products.name,
        })
        .from(products)
        .where(
          and(
            eq(products.organizationId, input.organizationId),
            eq(products.sourceId, input.sourceId),
            sql`${products.provenance}->>'component.sourceCode' is null`
          )
        )
        .orderBy(products.id)
        .limit(500);
    }),
  previewGalleryPilot: protectedProcedure
    .input(
      idInput.extend({
        productId: z.number().int().positive(),
        recipe: galleryPilotRecipeSchema,
      })
    )
    .mutation(async ({ ctx, input }) => {
      const db = await owner(ctx.user.id, input.organizationId);
      return previewGalleryPilot(
        db,
        input.organizationId,
        input.sourceId,
        input.productId,
        ctx.user.id,
        input.recipe
      );
    }),
  queueGalleryPilot: protectedProcedure
    .input(idInput.extend({ token: galleryPilotTokenSchema }))
    .mutation(async ({ ctx, input }) => {
      const db = await owner(ctx.user.id, input.organizationId);
      let plan: GalleryPilotPlan;
      try {
        plan = JSON.parse(decryptToken(input.token));
      } catch {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Preview this gallery repair again.",
        });
      }
      if (
        plan.kind !== "catalog-gallery-pilot-v1" ||
        plan.organizationId !== input.organizationId ||
        plan.sourceId !== input.sourceId ||
        plan.actorUserId !== ctx.user.id ||
        plan.expiresAt < Date.now()
      )
        throw new TRPCError({
          code: "BAD_REQUEST",
          message:
            "The gallery preview expired or belongs to another scope. Preview again.",
        });
      return withOrganizationTransaction(db, input.organizationId, async tx => {
        await tx
          .select({ id: catalogSources.id })
          .from(catalogSources)
          .where(
            and(
              eq(catalogSources.id, input.sourceId),
              eq(catalogSources.organizationId, input.organizationId)
            )
          )
          .for("update");
        await tx
          .select({ id: products.id })
          .from(products)
          .where(
            and(
              eq(products.id, plan.productId),
              eq(products.organizationId, input.organizationId)
            )
          )
          .for("update");
        const { source, product, images } = await pilotRecords(
          tx,
          input.organizationId,
          input.sourceId,
          plan.productId
        );
        if (
          source.updatedAtMs !== plan.sourceUpdatedAtMs ||
          source.leaseUntil ||
          ["queued", "syncing"].includes(source.status) ||
          pilotFingerprint(product) !== plan.productFingerprint ||
          pilotFingerprint(images) !== plan.imageFingerprint
        )
          throw new TRPCError({
            code: "CONFLICT",
            message:
              "Source or product changed. Preview again before repairing.",
          });
        const credentials = JSON.parse(decryptToken(source.credentials!));
        if (credentials.galleryPilot && !credentials.galleryPilot.completed)
          throw new TRPCError({
            code: "CONFLICT",
            message: "A gallery pilot is already pending.",
          });
        credentials.galleryPilot = {
          ...plan,
          offset: 0,
          previousLifecycle: {
            status: source.status,
            error: source.error,
            createdByUserId: source.createdByUserId,
          },
          previousProgress: {
            processed: source.processed,
            total: source.total,
            cursor: source.cursor,
          },
        };
        await tx
          .update(catalogSources)
          .set({
            credentials: encryptToken(JSON.stringify(credentials)),
            status: "queued",
            error: null,
            createdByUserId: ctx.user.id,
            updatedAtMs: Date.now(),
          })
          .where(eq(catalogSources.id, source.id));
        await appendActivity(
          {
            organizationId: input.organizationId,
            actorUserId: ctx.user.id,
            action: "catalog.gallery_pilot_queued",
            entityType: "catalog_source",
            entityId: source.id,
            payload: {
              productId: plan.productId,
              externalId: plan.externalId,
              images: plan.total,
              candidateUrls: plan.candidateCount,
              recipeRevision: pilotFingerprint(plan.recipe),
            },
          },
          tx
        );
        return { queued: true, productId: plan.productId, images: plan.total };
      });
    }),
  galleryPilotStatus: protectedProcedure
    .input(idInput)
    .query(async ({ ctx, input }) => {
      const db = await owner(ctx.user.id, input.organizationId);
      const [source] = await db
        .select()
        .from(catalogSources)
        .where(
          and(
            eq(catalogSources.id, input.sourceId),
            eq(catalogSources.organizationId, input.organizationId)
          )
        );
      if (!source?.credentials || source.provider !== "api")
        throw new TRPCError({ code: "NOT_FOUND" });
      const plan: GalleryPilotPlan | undefined = JSON.parse(
        decryptToken(source.credentials)
      ).galleryPilot;
      return plan
        ? {
            productId: plan.productId,
            externalId: plan.externalId,
            processed: plan.offset ?? 0,
            total: plan.total,
            completed: plan.completed,
            status: source.status,
            error: plan.completed ? null : source.error,
            sourceError: plan.completed ? source.error : null,
            sourceScheduleHeld: !!plan.sourceScheduleHeld,
          }
        : null;
    }),
  imageSettings: protectedProcedure
    .input(idInput)
    .query(async ({ ctx, input }) => {
      const db = await owner(ctx.user.id, input.organizationId);
      const [source] = await db
        .select()
        .from(catalogSources)
        .where(
          and(
            eq(catalogSources.id, input.sourceId),
            eq(catalogSources.organizationId, input.organizationId)
          )
        );
      if (!source || source.provider !== "api" || !source.credentials)
        throw new TRPCError({ code: "NOT_FOUND" });
      const config = apiCatalogConfigSchema.parse(
        JSON.parse(decryptToken(source.credentials)).api
      );
      return {
        imageBaseUrl: config.imageBaseUrl ?? "",
        imagePathMode: config.imagePathMode ?? "url",
        imagesPath: config.imagesPath ?? "",
        updatedAtMs: source.updatedAtMs,
      };
    }),
  repairImages: protectedProcedure
    .input(
      idInput.extend({
        expectedUpdatedAtMs: z.number(),
        imageBaseUrl: apiCatalogMappingSchema.shape.imageBaseUrl,
        imagePathMode: z.enum(["url", "directory"]),
        imagesPath: apiCatalogMappingSchema.shape.imagesPath,
      })
    )
    .mutation(async ({ ctx, input }) => {
      const db = await owner(ctx.user.id, input.organizationId);
      return withOrganizationTransaction(db, input.organizationId, async tx => {
        const [source] = await tx
          .select()
          .from(catalogSources)
          .where(
            and(
              eq(catalogSources.id, input.sourceId),
              eq(catalogSources.organizationId, input.organizationId)
            )
          )
          .for("update");
        if (!source || source.provider !== "api" || !source.credentials)
          throw new TRPCError({ code: "NOT_FOUND" });
        if (
          source.updatedAtMs !== input.expectedUpdatedAtMs ||
          ["syncing", "queued"].includes(source.status)
        )
          throw new TRPCError({
            code: "CONFLICT",
            message:
              "This source changed or is syncing. Refresh its settings first.",
          });
        const credentials = JSON.parse(decryptToken(source.credentials));
        if (credentials.galleryPilot && !credentials.galleryPilot.completed)
          throw new TRPCError({
            code: "CONFLICT",
            message: "Finish the pending one-product gallery repair first.",
          });
        credentials.api = apiCatalogConfigSchema.parse({
          ...credentials.api,
          imageBaseUrl: input.imageBaseUrl,
          imagePathMode: input.imagePathMode,
          imagesPath: input.imagesPath,
        });
        credentials.imageRepairOnly = true;
        await tx
          .update(catalogSources)
          .set({
            credentials: encryptToken(JSON.stringify(credentials)),
            cursor: null,
            processed: 0,
            total: null,
            error: null,
            status: "queued",
            createdByUserId: ctx.user.id,
            updatedAtMs: Date.now(),
          })
          .where(eq(catalogSources.id, source.id));
        await appendActivity(
          {
            organizationId: input.organizationId,
            actorUserId: ctx.user.id,
            action: "catalog.image_repair_queued",
            entityType: "catalog_source",
            entityId: source.id,
            payload: {
              mappingRevision: apiMappingRevision(
                source.storeUrl,
                credentials.api
              ),
            },
          },
          tx
        );
        return { queued: true };
      });
    }),
  productDetails: protectedProcedure
    .input(org.extend({ productId: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      await requireOrganizationRole(ctx.user.id, input.organizationId);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const [product] = await db
        .select()
        .from(products)
        .where(
          and(
            eq(products.id, input.productId),
            eq(products.organizationId, input.organizationId)
          )
        )
        .limit(1);
      if (!product?.sourceId || !product.provenance["api.detailUrl"])
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "This product has no configured detail endpoint.",
        });
      const [source] = await db
        .select()
        .from(catalogSources)
        .where(
          and(
            eq(catalogSources.id, product.sourceId),
            eq(catalogSources.organizationId, input.organizationId)
          )
        )
        .limit(1);
      if (
        source?.provider !== "api" ||
        !source.credentials ||
        source.status === "disconnected"
      )
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "Reconnect this API source to inspect its configuration.",
        });
      const credentials = JSON.parse(decryptToken(source.credentials));
      try {
        return await readApiProductDetails(
          source.storeUrl,
          product.provenance["api.detailUrl"],
          apiCatalogConfigSchema.parse(credentials.api),
          `${input.organizationId}:${source.id}:${source.updatedAtMs}`
        );
      } catch (error) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message:
            error instanceof Error
              ? error.message
              : "Could not read product configuration.",
        });
      }
    }),
  previewApi: protectedProcedure
    .input(
      org.extend({
        endpoint: apiEndpointSchema,
        config: apiCatalogConfigSchema,
        files: z.array(apiInstructionFileSchema).max(3).default([]),
        interpretInstructions: z.boolean().default(false),
        exampleProductUrl: z.string().trim().max(2048).default(""),
      })
    )
    .mutation(async ({ ctx, input }) => {
      await owner(ctx.user.id, input.organizationId);
      const endpoint = apiCatalogAddress(input.endpoint);
      const data = await fetchApiCatalog(endpoint, input.config);
      const suggested = input.interpretInstructions
        ? await suggestApiMapping(data, input.config.notes, input.files)
        : input.config;
      const mapping = {
        ...suggested,
        ...Object.fromEntries(
          Object.entries(input.config).filter(
            ([key, value]) =>
              !["auth", "notes", "fields"].includes(key) &&
              value !== "" &&
              value !== undefined
          )
        ),
        fields: {
          ...suggested.fields,
          ...Object.fromEntries(
            Object.entries(input.config.fields).filter(([, value]) => !!value)
          ),
        },
      };
      let exampleWarning: string | undefined;
      if (input.exampleProductUrl) {
        let inferred: ReturnType<typeof inferProductLinkRule> = null;
        try {
          inferred = inferProductLinkRule(
            input.exampleProductUrl,
            apiCatalogRows(data, mapping.itemsPath)
          );
        } catch {
          /* Explain an invalid example beside the setup. */
        }
        if (!inferred)
          exampleWarning =
            "That example could not be matched to a product code in this feed. It was not applied. You can still import products for review.";
        if (inferred?.rule) {
          const rule = inferred.rule;
          mapping.productUrlRules = [
            ...(mapping.productUrlRules ?? []).filter(
              r => r.path !== rule.path || r.equals !== rule.equals
            ),
            rule,
          ];
        } else if (inferred) mapping.productUrlTemplate = inferred.template;
      }
      const resolved = apiCatalogConfigSchema.parse({
        ...input.config,
        ...mapping,
      });
      const result = parseApiCatalog(data, endpoint, resolved, {
        preview: true,
      });
      const checked = await Promise.allSettled(
        result.items.slice(0, 3).map(async item => {
          if (!item.imageUrl) return;
          await fetchCatalogImage(item.imageUrl);
        })
      );
      checked.forEach((check, index) => {
        if (check.status === "rejected")
          result.issues.push({
            index,
            product: result.items[index].name,
            field: "imageUrl",
            blocking: false,
            message:
              "This preview image could not be loaded. Product data can still be imported for review; check the image address or add an image later.",
          });
      });
      return {
        mapping: apiCatalogMappingSchema.parse(resolved),
        mappingRevision: apiMappingRevision(endpoint, resolved),
        exampleWarning,
        count: result.items.length,
        total: result.total,
        hasNext: !!result.next,
        ready:
          result.items.length > 0 &&
          !result.issues.some(issue => issue.blocking),
        reviewProductCount: new Set(result.issues.map(issue => issue.index))
          .size,
        issues: result.issues.slice(0, 100),
        issueCount: result.issues.length,
        samples: result.items
          .slice(0, 6)
          .map(
            ({
              name,
              sku,
              productUrl,
              imageUrl,
              price,
              currency,
              specifications,
              features,
              availability,
            }) => ({
              name,
              sku,
              productUrl,
              imageUrl,
              price,
              currency,
              specifications,
              features,
              availability,
            })
          ),
      };
    }),
  previewPage: protectedProcedure
    .input(org.extend({ website: z.string().trim().min(3).max(2048) }))
    .mutation(async ({ ctx, input }) => {
      await requireOrganizationRole(ctx.user.id, input.organizationId, [
        "owner",
        "admin",
        "creator",
      ]);
      try {
        return await previewStudioPage(input.website);
      } catch (error) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message:
            error instanceof Error
              ? error.message
              : "Could not read this page.",
        });
      }
    }),
  previewProductPage: protectedProcedure
    .input(org.extend({ website: z.string().trim().min(3).max(2048) }))
    .mutation(async ({ ctx, input }) => {
      await requireOrganizationRole(ctx.user.id, input.organizationId, [
        "owner",
        "admin",
        "creator",
      ]);
      try {
        return await previewStudioProductPage(input.website);
      } catch (error) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message:
            error instanceof Error
              ? error.message
              : "Could not read this product page.",
        });
      }
    }),
  discoverOfferings: protectedProcedure
    .input(org.extend({ website: z.string().url() }))
    .mutation(async ({ ctx, input }) => {
      const db = await owner(ctx.user.id, input.organizationId);
      const [brand] = await db
        .select()
        .from(brandKits)
        .where(eq(brandKits.organizationId, input.organizationId))
        .limit(1);
      return discoverOfferings(input.website, brand?.businessProfile);
    }),
  list: protectedProcedure.input(org).query(async ({ ctx, input }) => {
    await requireOrganizationRole(ctx.user.id, input.organizationId);
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    const rows = await db
      .select({
        id: catalogSources.id,
        provider: catalogSources.provider,
        name: catalogSources.name,
        storeUrl: catalogSources.storeUrl,
        status: catalogSources.status,
        processed: catalogSources.processed,
        total: catalogSources.total,
        error: catalogSources.error,
        lastSyncAt: catalogSources.lastSyncAt,
        autoSync: catalogSources.autoSync,
      })
      .from(catalogSources)
      .where(eq(catalogSources.organizationId, input.organizationId))
      .orderBy(desc(catalogSources.updatedAtMs));
    const media = await db
      .select({
        sourceId: products.sourceId,
        status: sql<string>`coalesce(${products.provenance}->>'media.status', ${products.provenance}->>'api.imageStatus', 'pending')`,
        count: sql<number>`count(*)::int`,
      })
      .from(products)
      .where(eq(products.organizationId, input.organizationId))
      .groupBy(
        products.sourceId,
        sql`coalesce(${products.provenance}->>'media.status', ${products.provenance}->>'api.imageStatus', 'pending')`
      );
    const files = await db
      .select({
        sourceId: products.sourceId,
        stored: sql<number>`count(*)::int`,
        products: sql<number>`count(distinct ${products.id})::int`,
      })
      .from(productImages)
      .innerJoin(
        products,
        and(
          eq(productImages.productId, products.id),
          eq(productImages.organizationId, products.organizationId)
        )
      )
      .where(eq(products.organizationId, input.organizationId))
      .groupBy(products.sourceId);
    return rows.map(row => ({
      ...row,
      storedFiles: files.find(f => f.sourceId === row.id)?.stored ?? 0,
      productsWithStoredImages:
        files.find(f => f.sourceId === row.id)?.products ?? 0,
      media: Object.fromEntries(
        media.filter(m => m.sourceId === row.id).map(m => [m.status, m.count])
      ),
    }));
  }),
  connect: protectedProcedure
    .input(
      org
        .extend({
          provider: z.enum(STORE_PROVIDERS),
          storeUrl: z.string().url(),
          token: z.string().max(4000).default(""),
          secret: z.string().max(4000).optional(),
          api: apiCatalogConfigSchema.optional(),
          previewRevision: z
            .string()
            .regex(/^[a-f0-9]{64}$/)
            .optional(),
        })
        .refine(
          input =>
            input.provider === "api" ? !!input.api : input.token.length >= 8,
          "Provide the API configuration or store credentials."
        )
    )
    .mutation(async ({ ctx, input }) => {
      const db = await owner(ctx.user.id, input.organizationId);
      const address = storeAddress(input.provider, input.storeUrl);
      const [activeSource] = await db
        .select({
          status: catalogSources.status,
          credentials: catalogSources.credentials,
        })
        .from(catalogSources)
        .where(
          and(
            eq(catalogSources.organizationId, input.organizationId),
            eq(catalogSources.provider, input.provider),
            eq(catalogSources.storeUrl, address)
          )
        );
      if (input.provider === "api" && activeSource?.credentials) {
        const pilot = JSON.parse(
          decryptToken(activeSource.credentials)
        ).galleryPilot;
        if (pilot && !pilot.completed)
          throw new TRPCError({
            code: "CONFLICT",
            message:
              "Finish the existing gallery pilot before replacing source settings.",
          });
      }
      if (activeSource && ["queued", "syncing"].includes(activeSource.status))
        throw new TRPCError({
          code: "CONFLICT",
          message:
            "Pause the current catalog sync before replacing its settings.",
        });
      if (
        input.provider === "api" &&
        input.previewRevision &&
        apiMappingRevision(address, input.api!) !== input.previewRevision
      )
        throw new TRPCError({
          code: "CONFLICT",
          message:
            "Catalog settings changed after preview. Preview again before importing.",
        });
      if (input.provider !== "api") catalogEncryptionKey();
      await readStorePage(
        input.provider,
        address,
        { token: input.token, secret: input.secret, api: input.api },
        null
      );
      const credentials = encryptToken(
        JSON.stringify({
          token: input.token,
          secret: input.secret,
          api: input.api,
        }),
        input.provider === "api" ? undefined : catalogEncryptionKey()
      );
      const [source] = await db
        .insert(catalogSources)
        .values({
          organizationId: input.organizationId,
          provider: input.provider,
          name: input.provider,
          storeUrl: address,
          credentials,
          status: "queued",
          createdByUserId: ctx.user.id,
          updatedAtMs: Date.now(),
        })
        .onConflictDoUpdate({
          target: [
            catalogSources.organizationId,
            catalogSources.provider,
            catalogSources.storeUrl,
          ],
          set: {
            credentials,
            status: "queued",
            cursor: null,
            processed: 0,
            total: null,
            error: null,
            createdByUserId: ctx.user.id,
            updatedAtMs: Date.now(),
          },
        })
        .returning({ id: catalogSources.id });
      await appendActivity({
        organizationId: input.organizationId,
        actorUserId: ctx.user.id,
        action: "catalog.source_connected",
        entityType: "catalog_source",
        entityId: source.id,
        payload: { provider: input.provider },
      });
      return source;
    }),
  action: protectedProcedure
    .input(
      idInput.extend({
        action: z.enum([
          "sync",
          "disconnect",
          "pause",
          "resume",
          "automatic_on",
          "automatic_off",
        ]),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const db = await owner(ctx.user.id, input.organizationId);
      const [source] = await db
        .select()
        .from(catalogSources)
        .where(
          and(
            eq(catalogSources.id, input.sourceId),
            eq(catalogSources.organizationId, input.organizationId)
          )
        );
      if (!source) throw new TRPCError({ code: "NOT_FOUND" });
      if (input.action !== "disconnect" && !source.credentials)
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "Reconnect this store first.",
        });
      if (
        input.action === "sync" &&
        ["queued", "syncing"].includes(source.status)
      )
        throw new TRPCError({
          code: "CONFLICT",
          message: "This source is already syncing.",
        });
      if (
        input.action === "sync" &&
        source.provider === "api" &&
        source.credentials
      ) {
        const pilot = JSON.parse(decryptToken(source.credentials)).galleryPilot;
        if (pilot && !pilot.completed)
          throw new TRPCError({
            code: "CONFLICT",
            message:
              "Resume the pending gallery pilot instead of starting a full-source sync.",
          });
      }
      const update =
        input.action === "disconnect"
          ? { credentials: null, status: "disconnected", autoSync: 0 }
          : input.action === "sync"
            ? {
                status: "queued",
                cursor: null,
                processed: 0,
                total: null,
                error: null,
              }
            : input.action === "pause"
              ? { status: "paused" }
              : input.action === "resume"
                ? { status: "queued", error: null }
                : input.action === "automatic_on"
                  ? { autoSync: 1, nextSyncAt: Date.now() + 21600000 }
                  : { autoSync: 0 };
      if (
        input.action === "sync" &&
        source.provider === "api" &&
        source.credentials
      ) {
        const credentials = JSON.parse(decryptToken(source.credentials));
        delete credentials.imageRepairOnly;
        Object.assign(update, {
          credentials: encryptToken(JSON.stringify(credentials)),
        });
      }
      await db
        .update(catalogSources)
        .set({ ...update, updatedAtMs: Date.now() })
        .where(
          and(
            eq(catalogSources.id, source.id),
            eq(catalogSources.organizationId, input.organizationId)
          )
        );
      await appendActivity({
        organizationId: input.organizationId,
        actorUserId: ctx.user.id,
        action: `catalog.source_${input.action}`,
        entityType: "catalog_source",
        entityId: source.id,
        payload: { provider: source.provider },
      });
      return { success: true };
    }),
  addEntries: protectedProcedure
    .input(org.extend({ entries: z.array(catalogEntrySchema).min(1).max(25) }))
    .mutation(async ({ ctx, input }) => {
      await requireOrganizationRole(ctx.user.id, input.organizationId, [
        "owner",
        "admin",
        "creator",
      ]);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const results = [];
      for (const [index, entry] of Array.from(input.entries.entries())) {
        try {
          const record = await importCatalogEntry(
            db,
            input.organizationId,
            entry
          );
          results.push({ index, id: record.id, error: null as string | null });
        } catch (error) {
          results.push({
            index,
            id: null,
            error:
              error instanceof Error
                ? error.message
                : "Could not import this row",
          });
        }
      }
      await appendActivity({
        organizationId: input.organizationId,
        actorUserId: ctx.user.id,
        action: "catalog.entries_added",
        entityType: "catalog_batch",
        entityId: "manual",
        payload: {
          successful: results.filter(r => r.id).length,
          failed: results.filter(r => r.error).length,
        },
      });
      return results;
    }),
});
