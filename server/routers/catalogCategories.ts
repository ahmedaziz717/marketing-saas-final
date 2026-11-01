import { z } from "zod";
import { eq, sql } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { catalogSources, products } from "../../drizzle/schema";
import { categorySettingsSchema } from "../../shared/catalogCategories";
import { protectedProcedure, router } from "../_core/trpc";
import { getDb } from "../db";
import { requireOrganizationRole } from "../lib/access";
import { readCategorySettings, saveCategorySettings, setProductCategoryOverride } from "../lib/catalogCategories";
const scope = z.object({ organizationId: z.number().int().positive() });
export const catalogCategoriesRouter = router({
  read: protectedProcedure.input(scope).query(async ({ ctx, input }) => {
    await requireOrganizationRole(ctx.user.id, input.organizationId);
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    const [config, sources, codes] = await Promise.all([
      readCategorySettings(db, input.organizationId),
      db.select({ id: catalogSources.id, name: catalogSources.name }).from(catalogSources).where(eq(catalogSources.organizationId, input.organizationId)),
      db.select({ sourceId: products.sourceId, category: products.category, count: sql<number>`count(*)::int`, overrides: sql<number>`count(*) filter (where ${products.provenance}->>'marketing.categoryOverride' is not null)::int` }).from(products).where(eq(products.organizationId, input.organizationId)).groupBy(products.sourceId, products.category),
    ]);
    return { ...config, sources, codes };
  }),
  save: protectedProcedure.input(scope.extend({ revision: z.number().int().nonnegative(), settings: categorySettingsSchema, confirm: z.literal(true) }))
    .mutation(({ ctx, input }) => saveCategorySettings(ctx.user.id, input)),
  override: protectedProcedure.input(scope.extend({ productId: z.number().int().positive(), updatedAtMs: z.number().finite(), categoryRevision: z.number().int().nonnegative(), categoryId: z.string().uuid().nullable() }))
    .mutation(({ ctx, input }) => setProductCategoryOverride(ctx.user.id, input)),
});
