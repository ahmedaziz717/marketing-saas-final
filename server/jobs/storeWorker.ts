import { GALLERY_PILOT_BATCH } from "../../shared/catalogGalleryPilot";
import type { GalleryPilotPlan } from "../lib/catalogGalleryPilot";
import { and, asc, eq, inArray, isNull, lt, or } from "drizzle-orm";
import { catalogSources, products } from "../../drizzle/schema";
import { apiMappingRevision } from "../lib/apiCatalog";
import type { StoreProvider } from "../../shared/catalog";
import { getDb } from "../db";
import { requireOrganizationRole } from "../lib/access";
import {
  decryptToken,
  encryptToken,
  catalogEncryptionKey,
} from "../lib/secureToken";
import { readStorePage } from "../lib/storeCatalog";
import { importCatalogEntry } from "../lib/catalogImport";

type Database = NonNullable<Awaited<ReturnType<typeof getDb>>>;
export async function processNextStoreJob(db: Database) {
  const source = await db.transaction(async tx => {
    const [row] = await tx
      .select()
      .from(catalogSources)
      .where(
        and(
          or(
            inArray(catalogSources.status, ["queued", "syncing"]),
            and(
              eq(catalogSources.status, "connected"),
              eq(catalogSources.autoSync, 1),
              lt(catalogSources.nextSyncAt, Date.now())
            )
          ),
          or(
            isNull(catalogSources.leaseUntil),
            lt(catalogSources.leaseUntil, Date.now())
          )
        )
      )
      .orderBy(asc(catalogSources.updatedAtMs))
      .limit(1)
      .for("update", { skipLocked: true });
    if (!row) return null;
    const fresh = row.status === "connected";
    const leaseUntil = Date.now() + 600000;
    await tx
      .update(catalogSources)
      .set({
        status: "syncing",
        leaseUntil,
        ...(fresh ? { cursor: null, processed: 0, total: null } : {}),
      })
      .where(eq(catalogSources.id, row.id));
    return {
      ...row,
      leaseUntil,
      ...(fresh ? { cursor: null, processed: 0 } : {}),
    };
  });
  if (!source) return false;
  try {
    await requireOrganizationRole(
      source.createdByUserId,
      source.organizationId,
      ["owner", "admin"]
    );
    if (!source.credentials) throw new Error("Reconnect this store.");
    const credentials = JSON.parse(
      decryptToken(
        source.credentials,
        source.provider === "api" ? undefined : catalogEncryptionKey()
      )
    );
    const pilot: GalleryPilotPlan | undefined = credentials.galleryPilot;
    if (pilot && !pilot.completed) {
      if (pilot.organizationId !== source.organizationId || pilot.sourceId !== source.id) throw new Error("Gallery pilot scope mismatch.");
      const offset = pilot.offset ?? 0;
      await importCatalogEntry(db, source.organizationId, pilot.entry, {
        id: source.id, externalId: pilot.externalId, provider: "api", imageRepairOnly: true,
        galleryPilot: { productId: pilot.productId, offset, limit: GALLERY_PILOT_BATCH, assertActive: async () => {
          const [active] = await db.select({ status: catalogSources.status, leaseUntil: catalogSources.leaseUntil, updatedAtMs: catalogSources.updatedAtMs }).from(catalogSources).where(eq(catalogSources.id, source.id));
          if (active?.status !== "syncing" || active.leaseUntil !== source.leaseUntil || active.updatedAtMs !== source.updatedAtMs || Date.now() >= source.leaseUntil) throw new Error("Gallery pilot paused or lease changed; resume from the saved batch.");
        } },
      });
      pilot.offset = Math.min(pilot.total, offset + GALLERY_PILOT_BATCH);
      pilot.completed = pilot.offset === pilot.total;
      await db.update(catalogSources).set({
        credentials: encryptToken(JSON.stringify(credentials)),
        status: pilot.completed ? "connected" : "syncing", error: null, updatedAtMs: Date.now(),
        ...(pilot.completed ? { processed: pilot.previousProgress?.processed ?? source.processed, total: pilot.previousProgress?.total ?? source.total, cursor: pilot.previousProgress?.cursor ?? null } : {}),
      }).where(and(eq(catalogSources.id, source.id), eq(catalogSources.status, "syncing"), eq(catalogSources.leaseUntil, source.leaseUntil), eq(catalogSources.updatedAtMs, source.updatedAtMs)));
      return true;
    }
    let pageCursor = source.cursor;
    let offset = 0;
    if (pageCursor) {
      try {
        const checkpoint = JSON.parse(pageCursor);
        if (checkpoint.workerVersion === 1) {
          pageCursor = checkpoint.page;
          offset = checkpoint.offset;
        }
      } catch {
        /* Provider cursor is opaque. */
      }
    }
    if (!Number.isSafeInteger(offset) || offset < 0)
      throw new Error("Invalid saved import checkpoint.");
    const result = await readStorePage(
      source.provider as StoreProvider,
      source.storeUrl,
      credentials,
      pageCursor
    );
    const batch = result.items.slice(offset, offset + 10);
    const failures: string[] = [];
    for (const item of batch) {
      const [current] = await db
        .select({
          status: catalogSources.status,
          leaseUntil: catalogSources.leaseUntil,
          updatedAtMs: catalogSources.updatedAtMs,
        })
        .from(catalogSources)
        .where(
          and(
            eq(catalogSources.id, source.id),
            eq(catalogSources.leaseUntil, source.leaseUntil)
          )
        );
      if (
        current?.status !== "syncing" ||
        current.leaseUntil !== source.leaseUntil ||
        current.updatedAtMs !== source.updatedAtMs ||
        Date.now() >= source.leaseUntil
      )
        return true;
      if (credentials.imageRepairOnly) {
        const [existing] = await db
          .select({ id: products.id })
          .from(products)
          .where(
            and(
              eq(products.organizationId, source.organizationId),
              eq(products.sourceId, source.id),
              eq(products.externalId, item.externalId)
            )
          )
          .limit(1);
        if (!existing) continue;
      }
      try {
        await importCatalogEntry(
          db,
          source.organizationId,
          item,
          {
            id: source.id,
            externalId: item.externalId,
            provider: source.provider,
            detailUrl: item.detailUrl,
            mappingRevision: credentials.api
              ? apiMappingRevision(source.storeUrl, credentials.api)
              : undefined,
            imageRepairOnly: !!credentials.imageRepairOnly,
          },
          item.variants
        );
      } catch {
        failures.push(item.externalId);
      }
    }
    if (failures.length)
      throw new Error(
        `${failures.length} product(s) in this batch could not be saved. Independent products were retained. Resume to retry this checkpoint.`
      );
    const next =
      offset + batch.length < result.items.length
        ? JSON.stringify({
            workerVersion: 1,
            page: pageCursor,
            offset: offset + batch.length,
          })
        : result.next;
    const finishedRepair = !next && credentials.imageRepairOnly;
    if (finishedRepair) delete credentials.imageRepairOnly;
    await db
      .update(catalogSources)
      .set({
        cursor: next,
        processed: source.processed + batch.length,
        total:
          result.total ??
          (!result.next
            ? source.processed - offset + result.items.length
            : null),
        status: next ? "syncing" : "connected",
        error: null,
        lastSyncAt: next ? source.lastSyncAt : Date.now(),
        nextSyncAt: Date.now() + 21600000,
        updatedAtMs: Date.now(),
        ...(finishedRepair
          ? { credentials: encryptToken(JSON.stringify(credentials)) }
          : {}),
      })
      .where(
        and(
          eq(catalogSources.id, source.id),
          eq(catalogSources.status, "syncing"),
          eq(catalogSources.leaseUntil, source.leaseUntil),
          eq(catalogSources.updatedAtMs, source.updatedAtMs)
        )
      );
  } catch (error) {
    await db
      .update(catalogSources)
      .set({
        status: "error",
        error: error instanceof Error ? error.message : "Store sync failed",
        updatedAtMs: Date.now(),
      })
      .where(
        and(
          eq(catalogSources.id, source.id),
          eq(catalogSources.status, "syncing"),
          eq(catalogSources.leaseUntil, source.leaseUntil),
          eq(catalogSources.updatedAtMs, source.updatedAtMs)
        )
      );
  } finally {
    await db
      .update(catalogSources)
      .set({ leaseUntil: null })
      .where(
        and(
          eq(catalogSources.id, source.id),
          eq(catalogSources.leaseUntil, source.leaseUntil)
        )
      );
  }
  return true;
}
