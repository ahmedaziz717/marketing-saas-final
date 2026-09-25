import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { catalogSources } from "../../drizzle/schema";
import { STORE_PROVIDERS, catalogEntrySchema } from "../../shared/catalog";
import { protectedProcedure, router } from "../_core/trpc";
import { getDb } from "../db";
import { requireOrganizationRole } from "../lib/access";
import { encryptToken, catalogEncryptionKey } from "../lib/secureToken";
import { readStorePage, storeAddress } from "../lib/storeCatalog";
import { importCatalogEntry } from "../lib/catalogImport";
import { appendActivity } from "../lib/activity";
const org = z.object({ organizationId: z.number().int().positive() });
const idInput = org.extend({ sourceId: z.number().int().positive() });
async function owner(userId: number, organizationId: number) {
  await requireOrganizationRole(userId, organizationId, ["owner", "admin"]);
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
  return db;
}
export const catalogSourcesRouter = router({
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
      org.extend({
        provider: z.enum(STORE_PROVIDERS),
        storeUrl: z.string().url(),
        token: z.string().min(8).max(4000),
        secret: z.string().max(4000).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const db = await owner(ctx.user.id, input.organizationId);
      const address = storeAddress(input.provider, input.storeUrl);
      catalogEncryptionKey();
      await readStorePage(
        input.provider,
        address,
        { token: input.token, secret: input.secret },
        null
      );
      const credentials = encryptToken(
        JSON.stringify({ token: input.token, secret: input.secret }),
        catalogEncryptionKey()
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
