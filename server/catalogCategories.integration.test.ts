import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { eq } from "drizzle-orm";
import { beforeAll, afterAll, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({ db: null as any }));
vi.mock("./db", () => ({ getDb: async () => state.db }));
import {
  users,
  organizations,
  organizationMemberships,
  products,
  catalogSources,
} from "../drizzle/schema";
import {
  saveCategorySettings,
  setProductCategoryOverride,
  attachMarketingCategories,
  assertCategorySelection,
} from "./lib/catalogCategories";
import { catalogRouter } from "./routers/catalog";
import { categorySettingsSchema } from "../shared/catalogCategories";
import { reconcileCatalogRefresh } from "../shared/catalogRefresh";
const engine = new PGlite();
const a = "10000000-0000-4000-8000-000000000001",
  b = "10000000-0000-4000-8000-000000000002";
const settings = categorySettingsSchema.parse({
  categories: [
    { id: a, name: "Gaming", audience: "Players" },
    { id: b, name: "Workstation", audience: "Creators" },
  ],
  mappings: [{ sourceId: 1, sourceCategory: "PRECNFGGMRAMD", categoryId: a }],
});
let product: any;
beforeAll(async () => {
  state.db = drizzle(engine);
  await migrate(state.db, { migrationsFolder: "drizzle/postgres" });
  await state.db.insert(users).values([
    { id: 1, openId: "category-owner" },
    { id: 2, openId: "category-outsider" },
  ]);
  await state.db
    .insert(organizations)
    .values(
      [1, 2].map(id => ({
        id,
        name: `Workspace ${id}`,
        slug: `category-${id}`,
        createdByUserId: 1,
        createdAtMs: 1,
      }))
    );
  await state.db
    .insert(organizationMemberships)
    .values({
      organizationId: 1,
      userId: 1,
      role: "owner",
      status: "active",
      createdAtMs: 1,
    });
  await state.db
    .insert(catalogSources)
    .values(
      [1, 2].map(id => ({
        id,
        organizationId: id,
        provider: "api",
        name: `Source ${id}`,
        storeUrl: `https://example.test/${id}`,
        createdByUserId: 1,
        updatedAtMs: 1,
      }))
    );
  const rows = await state.db
    .insert(products)
    .values(
      [1, 2].map(id => ({
        id,
        organizationId: id,
        sourceId: id,
        name: "HORUS system",
        category: "PRECNFGGMRAMD",
        dedupeKey: `category-product-${id}`,
        productUrl: "https://example.test/product",
        specifications: {},
        provenance: { source: "api" },
        status: "approved",
        createdAtMs: 1,
        updatedAtMs: 1,
      }))
    )
    .returning();
  product = rows[0];
}, 30000);
afterAll(() => engine.close());
it("rejects foreign source, workspace and product IDs and stale mapping revisions", async () => {
  await expect(
    saveCategorySettings(2, {
      organizationId: 1,
      revision: 0,
      settings,
      confirm: true,
    })
  ).rejects.toMatchObject({ code: "FORBIDDEN" });
  await expect(
    saveCategorySettings(1, {
      organizationId: 1,
      revision: 0,
      settings: {
        ...settings,
        mappings: [{ ...settings.mappings[0], sourceId: 2 }],
      },
      confirm: true,
    })
  ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  await saveCategorySettings(1, {
    organizationId: 1,
    revision: 0,
    settings,
    confirm: true,
  });
  await expect(
    saveCategorySettings(1, {
      organizationId: 1,
      revision: 0,
      settings,
      confirm: true,
    })
  ).rejects.toMatchObject({ code: "CONFLICT" });
  await expect(
    setProductCategoryOverride(1, {
      organizationId: 1,
      productId: 2,
      categoryId: a,
      categoryRevision: 1,
      updatedAtMs: 1,
    })
  ).rejects.toMatchObject({ code: "NOT_FOUND" });
});
it("resolves authoritative mappings, preserves overrides through sync and filters confirmed categories", async () => {
  const mapped = await attachMarketingCategories(state.db, 1, [product]);
  expect(mapped[0].marketingCategory.category?.id).toBe(a);
  assertCategorySelection(mapped);
  product = await setProductCategoryOverride(1, {
    organizationId: 1,
    productId: 1,
    categoryId: b,
    categoryRevision: 1,
    updatedAtMs: product.updatedAtMs,
  });
  const refreshed = reconcileCatalogRefresh(
    product,
    { category: "NEW_SOURCE_CODE" },
    { source: "api" },
    "api"
  );
  const after = await attachMarketingCategories(state.db, 1, [
    { ...product, ...refreshed.values, provenance: refreshed.provenance },
  ]);
  expect(after[0].marketingCategory.category?.id).toBe(b);
  await expect(
    setProductCategoryOverride(1, {
      organizationId: 1,
      productId: 1,
      categoryId: a,
      categoryRevision: 1,
      updatedAtMs: 1,
    })
  ).rejects.toMatchObject({ code: "CONFLICT" });
  const caller = catalogRouter.createCaller({
    user: { id: 1 },
    req: {},
    res: {},
  } as any);
  expect(
    (
      await caller.overview({ organizationId: 1, marketingCategory: b })
    ).products.map(p => p.id)
  ).toEqual([1]);
  expect(
    (await caller.overview({ organizationId: 1, marketingCategory: a })).total
  ).toBe(0);
  expect(
    (
      await caller.overview({
        organizationId: 1,
        marketingCategory: "unmapped",
      })
    ).total
  ).toBe(0);
});
it("allows one concurrent mapping save and preserves the winning revision", async () => {
  const outcomes = await Promise.allSettled([
    saveCategorySettings(1, {
      organizationId: 1,
      revision: 1,
      settings,
      confirm: true,
    }),
    saveCategorySettings(1, {
      organizationId: 1,
      revision: 1,
      settings,
      confirm: true,
    }),
  ]);
  expect(outcomes.filter(result => result.status === "fulfilled")).toHaveLength(
    1
  );
  expect(outcomes.find(result => result.status === "rejected")).toMatchObject({
    reason: { code: "CONFLICT" },
  });
  await expect(
    attachMarketingCategories(state.db, 1, [{ ...product, organizationId: 2 }])
  ).rejects.toMatchObject({ code: "FORBIDDEN" });
});
it("requires an explicit neutral choice and rejects removed membership", async () => {
  expect(() => assertCategorySelection([{}])).toThrow(/neutral wording/);
  expect(() => assertCategorySelection([{}], "neutral")).not.toThrow();
  await state.db
    .update(organizationMemberships)
    .set({ status: "suspended" })
    .where(eq(organizationMemberships.userId, 1));
  await expect(
    saveCategorySettings(1, {
      organizationId: 1,
      revision: 1,
      settings,
      confirm: true,
    })
  ).rejects.toMatchObject({ code: "FORBIDDEN" });
});
