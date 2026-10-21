import { safeFetchImage } from "../lib/websiteCrawler";
import { readApiProductDetails } from "../lib/apiProductDetails";
import { discoverOfferings } from "../lib/marketingDrafts";
import { brandKits, products } from "../../drizzle/schema";
import { and, desc, eq } from "drizzle-orm";
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
import { appendActivity } from "../lib/activity";
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
} from "../lib/apiCatalog";
import { suggestApiMapping } from "../lib/apiInstructions";
const org = z.object({ organizationId: z.number().int().positive() });
const idInput = org.extend({ sourceId: z.number().int().positive() });
async function owner(userId: number, organizationId: number) {
  await requireOrganizationRole(userId, organizationId, ["owner", "admin"]);
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
  return db;
}
export const catalogSourcesRouter = router({
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
          await safeFetchImage(item.imageUrl);
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
    return rows;
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
