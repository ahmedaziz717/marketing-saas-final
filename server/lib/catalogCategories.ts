import { and, eq, inArray } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import {
  catalogCategorySettings,
  catalogSources,
  products,
} from "../../drizzle/schema";
import {
  categorySettingsSchema,
  emptyCategorySettings,
  resolveMarketingCategory,
  categorySelectionState,
  type ResolvedMarketingCategory,
  type CategorySettings,
  type CategoryProduct,
} from "../../shared/catalogCategories";
import { getDb } from "../db";
import { requireOrganizationRole } from "./access";
import { appendActivity, withOrganizationTransaction } from "./activity";
import type { LibraryDatabase, LibraryTransaction } from "./assetLibrary";
import type { DraftSaveHook } from "./mcpDraftReceipt";
type CategorySettingsResult = {
  organizationId: number;
  revision: number;
  settings: CategorySettings;
  updatedByUserId: number;
  updatedAtMs: number;
};
type Database = LibraryDatabase | LibraryTransaction;
export function assertCategorySelection(
  items: Array<{ marketingCategory?: ResolvedMarketingCategory }>,
  handling?: string,
  separate = false
) {
  const state = categorySelectionState(items);
  if (
    handling !== "neutral" &&
    (state.unmapped > 0 || (state.mixed && !separate))
  )
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message: state.unmapped
        ? "Some selected products have no confirmed marketing category. Review category mappings or explicitly choose neutral wording in Product details."
        : "This selection mixes marketing categories. Split the selection or explicitly choose neutral wording in Product details.",
    });
}

export async function readCategorySettings(
  db: Database,
  organizationId: number
) {
  const [row] = await db
    .select()
    .from(catalogCategorySettings)
    .where(eq(catalogCategorySettings.organizationId, organizationId))
    .limit(1);
  return row
    ? { ...row, settings: categorySettingsSchema.parse(row.settings) }
    : {
        organizationId,
        revision: 0,
        settings: emptyCategorySettings,
        updatedAtMs: 0,
        updatedByUserId: null,
      };
}
export async function attachMarketingCategories<T extends CategoryProduct>(
  db: Database,
  organizationId: number,
  items: T[]
) {
  if (!items.length)
    return [] as Array<T & { marketingCategory: ResolvedMarketingCategory }>;
  // Callers retrieve tenant-owned rows; reject accidental cross-tenant enrichment.
  if (
    items.some(
      item => "organizationId" in item && item.organizationId !== organizationId
    )
  )
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Product belongs to another workspace.",
    });
  const config = await readCategorySettings(db, organizationId);
  return items.map(item => ({
    ...item,
    marketingCategory: resolveMarketingCategory(
      item,
      config.settings,
      config.revision
    ),
  }));
}
export async function saveCategorySettings<T = CategorySettingsResult>(
  userId: number,
  input: {
    organizationId: number;
    revision: number;
    settings: CategorySettings;
    confirm: true;
  },
  aroundSave?: DraftSaveHook<CategorySettingsResult, T>
) {
  await requireOrganizationRole(userId, input.organizationId, [
    "owner",
    "admin",
    "creator",
  ]);
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
  const settings = categorySettingsSchema.parse(input.settings);
  return withOrganizationTransaction(db, input.organizationId, async tx => {
    const save = async () => {
      const old = await readCategorySettings(tx, input.organizationId);
      if (old.revision !== input.revision)
        throw new TRPCError({
          code: "CONFLICT",
          message: "Category mappings changed. Reload and review your changes.",
        });
      const sourceIds = Array.from(
        new Set(
          settings.mappings.flatMap(m =>
            m.sourceId == null ? [] : [m.sourceId]
          )
        )
      );
      if (sourceIds.length) {
        const owned = await tx
          .select({ id: catalogSources.id })
          .from(catalogSources)
          .where(
            and(
              eq(catalogSources.organizationId, input.organizationId),
              inArray(catalogSources.id, sourceIds)
            )
          );
        if (owned.length !== sourceIds.length)
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Choose catalog sources from this workspace.",
          });
      }
      const value = {
        organizationId: input.organizationId,
        revision: old.revision + 1,
        settings,
        updatedByUserId: userId,
        updatedAtMs: Date.now(),
      };
      if (old.revision)
        await tx
          .update(catalogCategorySettings)
          .set(value)
          .where(
            eq(catalogCategorySettings.organizationId, input.organizationId)
          );
      else await tx.insert(catalogCategorySettings).values(value);
      await appendActivity(
        {
          organizationId: input.organizationId,
          actorUserId: userId,
          action: "catalog.categories.confirmed",
          entityType: "catalog_category_settings",
          entityId: input.organizationId,
          payload: {
            before: old.settings,
            after: settings,
            revision: value.revision,
          },
        },
        tx
      );
      return value;
    };
    return aroundSave ? aroundSave(tx, save) : save();
  });
}
export async function setProductCategoryOverride<
  T = typeof products.$inferSelect,
>(
  userId: number,
  input: {
    organizationId: number;
    productId: number;
    updatedAtMs: number;
    categoryId: string | null;
    categoryRevision: number;
  },
  aroundSave?: DraftSaveHook<typeof products.$inferSelect, T>
) {
  await requireOrganizationRole(userId, input.organizationId, [
    "owner",
    "admin",
    "creator",
  ]);
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
  return withOrganizationTransaction(db, input.organizationId, async tx => {
    const save = async () => {
      const config = await readCategorySettings(tx, input.organizationId);
      if (config.revision !== input.categoryRevision)
        throw new TRPCError({
          code: "CONFLICT",
          message: "Category mappings changed. Review this assignment again.",
        });
      if (
        input.categoryId &&
        !config.settings.categories.some(c => c.id === input.categoryId)
      )
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Choose a category from this workspace.",
        });
      const [product] = await tx
        .select()
        .from(products)
        .where(
          and(
            eq(products.organizationId, input.organizationId),
            eq(products.id, input.productId)
          )
        )
        .limit(1);
      if (!product) throw new TRPCError({ code: "NOT_FOUND" });
      if (product.updatedAtMs !== input.updatedAtMs)
        throw new TRPCError({
          code: "CONFLICT",
          message:
            "This product changed. Reload before assigning its category.",
        });
      const provenance = { ...product.provenance };
      if (input.categoryId) {
        provenance["marketing.categoryOverride"] = JSON.stringify({
          categoryId: input.categoryId,
          userId,
          confirmedAtMs: Date.now(),
        });
        provenance["marketing.categoryId"] = input.categoryId;
      } else {
        delete provenance["marketing.categoryOverride"];
        delete provenance["marketing.categoryId"];
      }
      const [updated] = await tx
        .update(products)
        .set({
          provenance,
          updatedAtMs: Math.max(Date.now(), product.updatedAtMs + 1),
        })
        .where(
          and(
            eq(products.organizationId, input.organizationId),
            eq(products.id, input.productId),
            eq(products.updatedAtMs, input.updatedAtMs)
          )
        )
        .returning();
      if (!updated)
        throw new TRPCError({
          code: "CONFLICT",
          message:
            "This product changed during category assignment. Reload and review.",
        });
      await appendActivity(
        {
          organizationId: input.organizationId,
          actorUserId: userId,
          action: "catalog.category.override",
          entityType: "product",
          entityId: input.productId,
          payload: { categoryId: input.categoryId, revision: config.revision },
        },
        tx
      );
      return updated;
    };
    return aroundSave ? aroundSave(tx, save) : save();
  });
}
