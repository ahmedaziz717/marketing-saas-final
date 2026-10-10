import { and, asc, eq, inArray, isNull, lt, or } from "drizzle-orm";
import { catalogSources } from "../../drizzle/schema";
import type { StoreProvider } from "../../shared/catalog";
import { getDb } from "../db";
import { requireOrganizationRole } from "../lib/access";
import { decryptToken, catalogEncryptionKey } from "../lib/secureToken";
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
    await tx
      .update(catalogSources)
      .set({
        status: "syncing",
        leaseUntil: Date.now() + 600000,
        ...(fresh ? { cursor: null, processed: 0, total: null } : {}),
      })
      .where(eq(catalogSources.id, row.id));
    return { ...row, ...(fresh ? { cursor: null, processed: 0 } : {}) };
  });
  if (!source) return false;
  try {
    await requireOrganizationRole(
      source.createdByUserId,
      source.organizationId,
      ["owner", "admin"]
    );
    if (!source.credentials) throw new Error("Reconnect this store.");
    const result = await readStorePage(
      source.provider as StoreProvider,
      source.storeUrl,
      JSON.parse(decryptToken(source.credentials, catalogEncryptionKey())),
      source.cursor
    );
    for (const item of result.items) {
      const [current] = await db
        .select({ status: catalogSources.status })
        .from(catalogSources)
        .where(eq(catalogSources.id, source.id));
      if (current?.status !== "syncing") return true;
      await importCatalogEntry(
        db,
        source.organizationId,
        item,
        {
          id: source.id,
          externalId: item.externalId,
          provider: source.provider,
        },
        item.variants
      );
    }
    await db
      .update(catalogSources)
      .set({
        cursor: result.next,
        processed: source.processed + result.items.length,
        total: result.total,
        status: result.next ? "syncing" : "connected",
        error: null,
        lastSyncAt: result.next ? source.lastSyncAt : Date.now(),
        nextSyncAt: Date.now() + 21600000,
        updatedAtMs: Date.now(),
      })
      .where(
        and(
          eq(catalogSources.id, source.id),
          eq(catalogSources.status, "syncing")
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
          eq(catalogSources.status, "syncing")
        )
      );
  } finally {
    await db
      .update(catalogSources)
      .set({ leaseUntil: null })
      .where(eq(catalogSources.id, source.id));
  }
  return true;
}
