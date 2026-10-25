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
  productImages,
  catalogSources,
  productComponents,
} from "../drizzle/schema";
import {
  previewCatalogComponents,
  createCatalogComponents,
} from "./lib/catalogComponents";
import { catalogRouter } from "./routers/catalog";
import { catalogCardGallery } from "../shared/catalogMedia";
import { selectProductFacts } from "./lib/productFacts";
const engine = new PGlite();
const group = (id: string, amount: string) => ({
  id,
  name: "Verified enclosure",
  role: "optional_component" as const,
  eligible: true,
  declaredImages: 1,
  imageIds: ["front"],
  component: {
    sourceCode: "case-1",
    kind: "Chassis",
    optionAmount: amount,
    amountMeaning: "upgrade_delta" as const,
  },
});
let first: any, second: any, foreign: any;
beforeAll(async () => {
  state.db = drizzle(engine);
  await migrate(state.db, { migrationsFolder: "drizzle/postgres" });
  await state.db.insert(users).values([
    { id: 1, openId: "component-owner" },
    { id: 2, openId: "outsider" },
  ]);
  await state.db.insert(organizations).values(
    [1, 2].map(id => ({
      id,
      name: `Org ${id}`,
      slug: `component-${id}`,
      createdByUserId: 1,
      createdAtMs: 1,
    }))
  );
  await state.db.insert(organizationMemberships).values({
    organizationId: 1,
    userId: 1,
    role: "owner",
    status: "active",
    createdAtMs: 1,
  });
  await state.db.insert(catalogSources).values(
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
  [first, second, foreign] = await state.db
    .insert(products)
    .values(
      [1, 2, 3].map(id => ({
        organizationId: id === 3 ? 2 : 1,
        sourceId: id === 3 ? 2 : 1,
        name: `System ${id}`,
        dedupeKey: `parent-${id}`,
        productUrl: `https://example.test/system-${id}`,
        price: "2999",
        specifications: { CPU: "System CPU" },
        provenance: { source: "api" },
        mediaGroups: [group(`option-${id}`, id === 1 ? "50" : "75")],
        status: "approved",
        createdAtMs: 1,
        updatedAtMs: 1,
      }))
    )
    .returning();
  await state.db.insert(productImages).values(
    [first, second, foreign].map((p, index) => ({
      organizationId: p.organizationId,
      productId: p.id,
      sourceUrl: "https://images.test/case-front.png",
      storageKey: `org${p.organizationId}/original.png`,
      url: `https://images.test/${p.organizationId}/original.png`,
      isPrimary: 1,
      media: {
        width: 700,
        height: 700,
        hasAlpha: true,
        candidates: ["https://images.test/case-front.png"],
        selectedSourceUrl: "https://images.test/case-front.png",
        references: [
          { groupId: `option-${index + 1}`, imageId: "front", position: 0 },
        ],
        unavailableCandidates: 0,
      },
      createdAtMs: 1,
    }))
  );
}, 30000);
afterAll(() => engine.close());
it("rejects foreign IDs, missing membership, stale snapshots and unknown legacy identities", async () => {
  await expect(
    previewCatalogComponents(state.db, 1, foreign.id)
  ).rejects.toMatchObject({ code: "NOT_FOUND" });
  const preview = await previewCatalogComponents(state.db, 1, first.id);
  await expect(
    createCatalogComponents(1, first.id, preview.hash, 2)
  ).rejects.toMatchObject({ code: "FORBIDDEN" });
  await state.db
    .update(products)
    .set({ updatedAtMs: 2 })
    .where(eq(products.id, first.id));
  await expect(
    createCatalogComponents(1, first.id, preview.hash, 1)
  ).rejects.toMatchObject({ code: "CONFLICT" });
  const legacy = { ...group("legacy", "5"), component: undefined };
  await state.db
    .update(products)
    .set({ mediaGroups: [legacy] })
    .where(eq(products.id, first.id));
  await expect(previewCatalogComponents(state.db, 1, first.id)).rejects.toThrow(
    "Refresh"
  );
  await state.db
    .update(products)
    .set({ mediaGroups: [group("option-1", "50")] })
    .where(eq(products.id, first.id));
});
it("deduplicates shared source components, preserves original selections and system-specific deltas, and retries safely", async () => {
  const before = await state.db.select().from(productImages);
  const preview = await previewCatalogComponents(state.db, 1, first.id);
  expect(preview.components).toHaveLength(1);
  expect(preview.components[0]).toMatchObject({
    code: "case-1",
    imageCount: 1,
    minimumWidth: 700,
  });
  expect(preview.components[0].parents.map(p => p.amount)).toEqual([
    "50",
    "75",
  ]);
  const result = await createCatalogComponents(1, first.id, preview.hash, 1);
  expect(
    (await createCatalogComponents(1, first.id, preview.hash, 1)).componentIds
  ).toEqual(result.componentIds);
  const [component] = await state.db
    .select()
    .from(products)
    .where(eq(products.id, result.componentIds[0]));
  expect(component).toMatchObject({
    recordType: "accessory",
    status: "pending",
    price: null,
    currency: null,
    productUrl: "",
  });
  expect(component.specifications).toEqual({
    "Component type": "Chassis",
    "Source component code": "case-1",
  });
  const facts = selectProductFacts(component, {
    productId: component.id,
    featuredSpecKeys: [],
    includePrice: false,
  });
  expect(facts.recordType).toBe("accessory");
  expect(facts.componentIdentity).toEqual({
    sourceCode: "case-1",
    kind: "Chassis",
    scope: "component_only",
  });
  expect(facts.specifications).not.toHaveProperty("CPU");
  await expect(
    Promise.resolve().then(() =>
      selectProductFacts(component, {
        productId: component.id,
        featuredSpecKeys: [],
        includePrice: true,
      })
    )
  ).rejects.toThrow("price");
  const allImages = await state.db.select().from(productImages);
  expect(allImages.filter((i: any) => i.productId !== component.id)).toEqual(
    before
  );
  expect(
    allImages.filter((i: any) => i.productId === component.id)
  ).toHaveLength(1);
  expect(await state.db.select().from(productComponents)).toHaveLength(2);
  await state.db
    .update(products)
    .set({
      name: "My manual chassis label",
      provenance: { ...component.provenance, name: "user:1" },
    })
    .where(eq(products.id, component.id));
  await createCatalogComponents(1, first.id, preview.hash, 1);
  expect(
    (
      await state.db
        .select()
        .from(products)
        .where(eq(products.id, component.id))
    )[0].name
  ).toBe("My manual chassis label");
  const caller = catalogRouter.createCaller({ user: { id: 1 } } as any);
  const catalog = await caller.overview({ organizationId: 1 });
  const system = catalog.products.find(p => p.id === first.id)!;
  expect(system.representedGroupIds).toEqual(["option-1"]);
  expect(
    catalogCardGallery(
      system.images,
      system.mediaGroups,
      system.representedGroupIds
    ).images
  ).toEqual([]);
  expect(system.images).toHaveLength(1);
  const standalone = catalog.products.find(p => p.id === component.id)!;
  expect(standalone.componentLinks.map(l => l.parentProductId)).toEqual([
    first.id,
    second.id,
  ]);
  // Removing a compatibility option restores its old nested presentation, without corrupting saved selections.
  await state.db
    .update(products)
    .set({ mediaGroups: [{ ...group("option-1", "50"), eligible: false }] })
    .where(eq(products.id, first.id));
  expect(
    (await caller.overview({ organizationId: 1 })).products.find(
      p => p.id === first.id
    )!.representedGroupIds
  ).toEqual([]);
});
it("rejects incomplete/thumbnail galleries and revoked membership, and handles concurrent retries", async () => {
  await state.db
    .update(products)
    .set({ mediaGroups: [group("option-1", "50")] })
    .where(eq(products.id, first.id));
  const originals = await state.db.select().from(productImages);
  for (const image of originals.filter(
    (i: any) => i.productId === first.id || i.productId === second.id
  ))
    await state.db
      .update(productImages)
      .set({ media: { ...image.media, width: 260, height: 260 } })
      .where(eq(productImages.id, image.id));
  await expect(previewCatalogComponents(state.db, 1, first.id)).rejects.toThrow(
    "600"
  );
  for (const image of originals)
    await state.db
      .update(productImages)
      .set({ media: image.media })
      .where(eq(productImages.id, image.id));
  await state.db
    .update(products)
    .set({ mediaGroups: [{ ...group("option-1", "50"), expectedCount: 2 }] })
    .where(eq(products.id, first.id));
  await expect(previewCatalogComponents(state.db, 1, first.id)).rejects.toThrow(
    "incomplete"
  );
  await state.db
    .update(products)
    .set({ mediaGroups: [group("option-1", "50")] })
    .where(eq(products.id, first.id));
  const plan = await previewCatalogComponents(state.db, 1, first.id);
  const result = await Promise.all([
    createCatalogComponents(1, first.id, plan.hash, 1),
    createCatalogComponents(1, first.id, plan.hash, 1),
  ]);
  expect(result[0]).toEqual(result[1]);
  expect(await state.db.select().from(productComponents)).toHaveLength(2);
  await state.db
    .delete(organizationMemberships)
    .where(eq(organizationMemberships.userId, 1));
  await expect(
    createCatalogComponents(1, first.id, plan.hash, 1)
  ).rejects.toMatchObject({ code: "FORBIDDEN" });
});
