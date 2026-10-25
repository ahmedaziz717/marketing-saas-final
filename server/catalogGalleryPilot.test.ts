import { afterAll, beforeAll, expect, it, vi } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { eq } from "drizzle-orm";
import sharp from "sharp";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import observedRecipe from "../docs/catalog-recipes/clx-chassis.json";
import observedDetail from "./fixtures/clx-chassis-gallery.json";
import { galleryPilotRecipeSchema } from "../shared/catalogGalleryPilot";
const state = vi.hoisted(() => ({
  db: null as any,
  detail: null as any,
  fail: true,
  imageCalls: [] as string[],
  beforeImage: undefined as undefined | (() => Promise<void>),
}));
vi.mock("./db", () => ({ getDb: async () => state.db }));
vi.mock("./lib/apiCatalog", async load => ({
  ...(await load<any>()),
  fetchApiCatalog: vi.fn(async () => state.detail),
}));
vi.mock("./lib/storeCatalog", async load => ({
  ...(await load<any>()),
  readStorePage: vi.fn(async () => {
    throw Error("Full-source hydration must not run");
  }),
}));
vi.mock("./lib/websiteCrawler", () => ({
  safeFetchImage: vi.fn(async (url: string) => {
    state.imageCalls.push(url);
    if (state.beforeImage) {
      const hook = state.beforeImage;
      state.beforeImage = undefined;
      await hook();
    }
    if (state.fail && url.endsWith("/7.png")) throw Error("HTTP 404");
    if (
      process.env.CATALOG_REAL_GALLERY_ROOT &&
      url.startsWith("https://static.cybertron.com/")
    ) {
      const match = url.match(/components\/([^/]+)\/gallery\/(\d+)\.png$/)!;
      return {
        data: readFileSync(
          join(
            process.env.CATALOG_REAL_GALLERY_ROOT,
            `${match[1]}-${match[2]}.png`
          )
        ),
        contentType: "image/png",
      };
    }
    return {
      data: await sharp({
        create: { width: 700, height: 700, channels: 3, background: "white" },
      })
        .png()
        .toBuffer(),
      contentType: "image/png",
    };
  }),
}));
vi.mock("./storage", () => ({
  storagePut: vi.fn(async () => ({
    key: `photo-${state.imageCalls.length}`,
    url: `https://storage.test/${state.imageCalls.length}.png`,
  })),
}));
import {
  users,
  organizations,
  organizationMemberships,
  catalogSources,
  products,
  productImages,
} from "../drizzle/schema";
import { catalogSourcesRouter } from "./routers/catalogSources";
import { processNextStoreJob } from "./jobs/storeWorker";
import { encryptToken, decryptToken } from "./lib/secureToken";
import { fetchApiCatalog } from "./lib/apiCatalog";
import { readStorePage } from "./lib/storeCatalog";
const engine = new PGlite();
let caller: ReturnType<typeof catalogSourcesRouter.createCaller>,
  outsider: typeof caller;
const recipe = {
  detailUrlTemplate: "https://api.example/products/{code}",
  detailIdentityPath: "code",
  mediaGroupRules: [
    {
      key: "case",
      role: "base_component" as const,
      itemsPath: "",
      idPath: "code",
      namePath: "name",
      indexedGallery: {
        countPath: "count",
        urlTemplate: "https://cdn.example/{code}/{index}.png",
        startIndex: 1,
      },
    },
  ],
};
beforeAll(async () => {
  process.env.INTEGRATION_TOKEN_ENCRYPTION_SECRET = "gallery-pilot-test";
  state.db = drizzle(engine);
  await migrate(state.db, { migrationsFolder: "drizzle/postgres" });
  await state.db.insert(users).values([
    { id: 880, openId: "pilot-owner" },
    { id: 881, openId: "pilot-outsider" },
  ]);
  await state.db.insert(organizations).values({
    id: 880,
    name: "Pilot",
    slug: "pilot",
    createdByUserId: 880,
    createdAtMs: 1,
  });
  await state.db.insert(organizationMemberships).values({
    organizationId: 880,
    userId: 880,
    role: "owner",
    status: "active",
    createdAtMs: 1,
  });
  const context = (id: number) => ({ user: { id }, req: {}, res: {} }) as any;
  caller = catalogSourcesRouter.createCaller(context(880));
  outsider = catalogSourcesRouter.createCaller(context(881));
  await state.db.insert(catalogSources).values({
    id: 880,
    organizationId: 880,
    provider: "api",
    name: "Test source",
    storeUrl: "https://api.example/products",
    credentials: encryptToken(
      JSON.stringify({ api: { auth: { type: "none" } } })
    ),
    autoSync: 0,
    status: "connected",
    processed: 159,
    total: 159,
    createdByUserId: 880,
    updatedAtMs: 1,
  });
  await state.db.insert(products).values([
    {
      id: 880,
      organizationId: 880,
      sourceId: 880,
      externalId: "case-a",
      name: "Manual title",
      dedupeKey: "pilot-a",
      productUrl: "https://shop.example/a",
      status: "approved",
      reviewedByUserId: 880,
      reviewedAtMs: 123,
      specifications: {},
      provenance: {},
      mediaGroups: [
        {
          id: "manual",
          name: "Kept",
          role: "system",
          eligible: true,
          declaredImages: 1,
          imageIds: ["manual"],
        },
      ],
      createdAtMs: 1,
      updatedAtMs: 1,
    },
    {
      id: 881,
      organizationId: 880,
      sourceId: 880,
      externalId: "other",
      name: "Untouched",
      dedupeKey: "pilot-b",
      productUrl: "https://shop.example/b",
      specifications: {},
      provenance: {},
      createdAtMs: 1,
      updatedAtMs: 1,
    },
  ]);
  await state.db.insert(productImages).values({
    id: 880,
    organizationId: 880,
    productId: 880,
    sourceUrl: "https://cdn.example/manual.png",
    storageKey: "manual",
    url: "https://storage.test/manual.png",
    isPrimary: 1,
    createdAtMs: 1,
  });
  state.detail = { code: "case-a", name: "Provider title", count: 13 };
}, 30000);
afterAll(async () => {
  await engine.close();
  delete process.env.INTEGRATION_TOKEN_ENCRYPTION_SECRET;
});
const scope = { organizationId: 880, sourceId: 880 };
it("requires workspace ownership and matching product/detail identity", async () => {
  await expect(
    outsider.previewGalleryPilot({ ...scope, productId: 880, recipe })
  ).rejects.toMatchObject({ code: "FORBIDDEN" });
  await expect(
    caller.previewGalleryPilot({ ...scope, productId: 999, recipe })
  ).rejects.toThrow(/belonging/);
  state.detail.code = "wrong";
  await expect(
    caller.previewGalleryPilot({ ...scope, productId: 880, recipe })
  ).rejects.toThrow(/identity/);
  state.detail.code = "case-a";
});
it("rejects tampered and stale previews without queuing or changing source mapping", async () => {
  const preview = await caller.previewGalleryPilot({
    ...scope,
    productId: 880,
    recipe,
  });
  await expect(
    caller.queueGalleryPilot({
      ...scope,
      token: { ...preview.token, tag: "invalid" },
    })
  ).rejects.toThrow(/Preview/);
  await state.db
    .update(products)
    .set({ name: "New manual title", updatedAtMs: 2 })
    .where(eq(products.id, 880));
  await expect(
    caller.queueGalleryPilot({ ...scope, token: preview.token })
  ).rejects.toThrow(/changed/);
});
it("bounds image counts and rejects cross-origin or expired review plans", async () => {
  state.detail.count = 251;
  await expect(
    caller.previewGalleryPilot({ ...scope, productId: 880, recipe })
  ).rejects.toThrow(/1-250/);
  state.detail.count = 13;
  await expect(
    caller.previewGalleryPilot({
      ...scope,
      productId: 880,
      recipe: { ...recipe, detailUrlTemplate: "https://other.example/{code}" },
    })
  ).rejects.toThrow(/source API origin/);
  const preview = await caller.previewGalleryPilot({
    ...scope,
    productId: 880,
    recipe,
  });
  const plan = JSON.parse(decryptToken(preview.token));
  plan.expiresAt = 1;
  await expect(
    caller.queueGalleryPilot({
      ...scope,
      token: encryptToken(JSON.stringify(plan)),
    })
  ).rejects.toThrow(/expired/);
});
it("hydrates once, bounds batches, resumes only missing media and preserves unrelated data and approvals", async () => {
  vi.mocked(fetchApiCatalog).mockClear();
  const preview = await caller.previewGalleryPilot({
    ...scope,
    productId: 880,
    recipe,
  });
  expect(preview).toMatchObject({
    distinctImages: 13,
    candidateUrls: 13,
    maximumImageAttempts: 39,
    detailRequests: 1,
    sourceMappingChanges: false,
  });
  expect(state.imageCalls).toEqual([]);
  await caller.queueGalleryPilot({ ...scope, token: preview.token });
  await expect(
    caller.queueGalleryPilot({ ...scope, token: preview.token })
  ).rejects.toThrow(/changed/);
  await processNextStoreJob(state.db);
  expect(state.imageCalls).toHaveLength(12);
  expect(await caller.galleryPilotStatus(scope)).toMatchObject({
    status: "error",
    processed: 0,
    total: 13,
    completed: false,
  });
  await expect(caller.action({ ...scope, action: "sync" })).rejects.toThrow(
    /pending gallery/
  );
  state.fail = false;
  await caller.action({ ...scope, action: "resume" });
  await processNextStoreJob(state.db);
  expect(state.imageCalls).toHaveLength(13);
  expect(await caller.galleryPilotStatus(scope)).toMatchObject({
    processed: 12,
    completed: false,
  });
  await processNextStoreJob(state.db);
  expect(state.imageCalls).toHaveLength(14);
  expect(await caller.galleryPilotStatus(scope)).toMatchObject({
    processed: 13,
    completed: true,
    status: "connected",
  });
  expect(fetchApiCatalog).toHaveBeenCalledTimes(1);
  expect(readStorePage).not.toHaveBeenCalled();
  const [source] = await state.db
    .select()
    .from(catalogSources)
    .where(eq(catalogSources.id, 880));
  expect(source).toMatchObject({ processed: 159, total: 159, autoSync: 0 });
  expect(JSON.parse(decryptToken(source.credentials)).api).toEqual({
    auth: { type: "none" },
  });
  const rows = await state.db.select().from(products);
  expect(rows.find((p: any) => p.id === 880)).toMatchObject({
    name: "New manual title",
    status: "approved",
    reviewedByUserId: 880,
    reviewedAtMs: 123,
  });
  expect(
    rows.find((p: any) => p.id === 880).mediaGroups.map((g: any) => g.id)
  ).toEqual(["manual", "case:case-a"]);
  expect(rows.find((p: any) => p.id === 881)).toMatchObject({
    name: "Untouched",
    updatedAtMs: 1,
  });
  const photos = await state.db.select().from(productImages);
  expect(photos).toHaveLength(14);
  expect(photos.find((p: any) => p.id === 880)).toMatchObject({
    storageKey: "manual",
    isPrimary: 1,
  });
  expect(photos.filter((p: any) => p.isPrimary)).toHaveLength(1);
}, 30000);
it("imports the complete observed 183-photo pilot through 16 bounded worker batches", async () => {
  state.detail = observedDetail;
  state.fail = false;
  state.imageCalls = [];
  vi.mocked(fetchApiCatalog).mockClear();
  await state.db.insert(products).values({
    id: 882,
    organizationId: 880,
    sourceId: 880,
    externalId: observedDetail.code,
    name: "Observed system",
    dedupeKey: "observed",
    productUrl: "https://shop.example/observed",
    specifications: {},
    provenance: {},
    createdAtMs: 1,
    updatedAtMs: 1,
  });
  // The test source has the same origin as this recipe; no production source is touched.
  await state.db
    .update(catalogSources)
    .set({
      storeUrl: "https://api.cybertron.com/v1/products/kits?pagination=false",
    })
    .where(eq(catalogSources.id, 880));
  const preview = await caller.previewGalleryPilot({
    ...scope,
    productId: 882,
    recipe: { ...observedRecipe, detailIdentityPath: "code" },
  });
  expect(preview).toMatchObject({
    distinctImages: 183,
    candidateUrls: 183,
    maximumImageAttempts: 549,
    groupsAdded: expect.any(Array),
  });
  expect(preview.groups).toHaveLength(21);
  await caller.queueGalleryPilot({ ...scope, token: preview.token });
  for (let batch = 0; batch < 16; batch++) {
    const previousCalls = state.imageCalls.length;
    await processNextStoreJob(state.db);
    expect(state.imageCalls.length - previousCalls).toBeLessThanOrEqual(12);
  }
  expect(await caller.galleryPilotStatus(scope)).toMatchObject({
    completed: true,
    processed: 183,
    total: 183,
  });
  expect(new Set(state.imageCalls).size).toBe(183);
  expect(state.imageCalls).toHaveLength(183);
  expect(fetchApiCatalog).toHaveBeenCalledTimes(1);
  expect(readStorePage).not.toHaveBeenCalled();
  const [product] = await state.db
    .select()
    .from(products)
    .where(eq(products.id, 882));
  const images = await state.db
    .select()
    .from(productImages)
    .where(eq(productImages.productId, 882));
  expect(images).toHaveLength(183);
  expect(product.mediaGroups).toHaveLength(21);
  if (process.env.CATALOG_REAL_GALLERY_ROOT)
    writeFileSync(
      join(
        process.env.CATALOG_REAL_GALLERY_ROOT,
        "pilot-imported-product.json"
      ),
      JSON.stringify({ product, images }, null, 2)
    );
}, 120000);
it("honors a pause during download without committing the image and resumes the same snapshot", async () => {
  state.detail = { code: "other", name: "Other", count: 2 };
  state.fail = false;
  state.imageCalls = [];
  await state.db
    .update(catalogSources)
    .set({ storeUrl: "https://api.example/products" })
    .where(eq(catalogSources.id, 880));
  const preview = await caller.previewGalleryPilot({
    ...scope,
    productId: 881,
    recipe,
  });
  await caller.queueGalleryPilot({ ...scope, token: preview.token });
  state.beforeImage = async () => {
    await caller.action({ ...scope, action: "pause" });
  };
  await processNextStoreJob(state.db);
  expect(await caller.galleryPilotStatus(scope)).toMatchObject({
    status: "paused",
    processed: 0,
    completed: false,
  });
  expect(
    await state.db
      .select()
      .from(productImages)
      .where(eq(productImages.productId, 881))
  ).toHaveLength(0);
  await caller.action({ ...scope, action: "resume" });
  await processNextStoreJob(state.db);
  expect(await caller.galleryPilotStatus(scope)).toMatchObject({
    completed: true,
    processed: 2,
  });
  expect(state.imageCalls).toHaveLength(3);
});
it.each(["paused", "error", "connected"])(
  "does not start an overdue full-source sync after a pilot from %s",
  async originalStatus => {
    state.detail = { code: "other", name: "Other", count: 2 };
    state.fail = false;
    const originalError =
      originalStatus === "error" ? "Existing source error" : null;
    await state.db
      .update(catalogSources)
      .set({
        status: originalStatus,
        error: originalError,
        createdByUserId: 881,
        autoSync: 1,
        nextSyncAt: 1,
        lastSyncAt: 123,
        leaseUntil: null,
      })
      .where(eq(catalogSources.id, 880));
    const preview = await caller.previewGalleryPilot({
      ...scope,
      productId: 881,
      recipe,
    });
    await caller.queueGalleryPilot({ ...scope, token: preview.token });
    await processNextStoreJob(state.db);
    const [source] = await state.db
      .select()
      .from(catalogSources)
      .where(eq(catalogSources.id, 880));
    expect(source).toMatchObject({
      status: originalStatus === "connected" ? "paused" : originalStatus,
      error: originalError,
      createdByUserId: 881,
      autoSync: 1,
      nextSyncAt: 1,
      lastSyncAt: 123,
      processed: 159,
      total: 159,
    });
    expect(await caller.galleryPilotStatus(scope)).toMatchObject({
      completed: true,
      sourceScheduleHeld: originalStatus === "connected",
    });
    expect(await processNextStoreJob(state.db)).toBe(false);
    expect(readStorePage).not.toHaveBeenCalled();
  }
);

it("saves only an owned fresh reviewed recipe, preserving lifecycle, credentials and products without queuing", async () => {
  state.detail = { code: "other", name: "Other", count: 2 };
  const [before] = await state.db
    .select()
    .from(catalogSources)
    .where(eq(catalogSources.id, 880));
  const settings = await caller.galleryRecipeSettings(scope);
  expect(settings.recipeOrigin).toBe("last_repair");
  // The existing primary plus deduplicated imported gallery are two stored rows.
  expect(settings.coverage.find(p => p.id === 881)?.imageCount).toBe(2);
  await expect(outsider.galleryRecipeSettings(scope)).rejects.toMatchObject({
    code: "FORBIDDEN",
  });
  const preview = await caller.previewGalleryPilot({
    ...scope,
    productId: 881,
    recipe,
  });
  const input = {
    ...scope,
    token: preview.token,
    expectedUpdatedAtMs: before.updatedAtMs,
    confirmed: true as const,
  };
  await expect(outsider.saveGalleryRecipe(input)).rejects.toMatchObject({
    code: "FORBIDDEN",
  });
  await expect(
    caller.saveGalleryRecipe({ ...input, sourceId: 999 })
  ).rejects.toThrow(/scope/);
  await expect(
    caller.saveGalleryRecipe({ ...input, expectedUpdatedAtMs: -1 })
  ).rejects.toMatchObject({ code: "CONFLICT" });
  const expiredPlan = JSON.parse(decryptToken(preview.token));
  expiredPlan.expiresAt = 1;
  await expect(
    caller.saveGalleryRecipe({
      ...input,
      token: encryptToken(JSON.stringify(expiredPlan)),
    })
  ).rejects.toThrow(/expired/);
  const pendingCredentials = JSON.parse(decryptToken(before.credentials));
  pendingCredentials.galleryPilot.completed = false;
  await state.db
    .update(catalogSources)
    .set({ credentials: encryptToken(JSON.stringify(pendingCredentials)) })
    .where(eq(catalogSources.id, 880));
  await expect(caller.saveGalleryRecipe(input)).rejects.toThrow(/pending/);
  await state.db
    .update(catalogSources)
    .set({ credentials: before.credentials })
    .where(eq(catalogSources.id, 880));
  await state.db
    .update(catalogSources)
    .set({ leaseUntil: Date.now() + 1000 })
    .where(eq(catalogSources.id, 880));
  await expect(caller.saveGalleryRecipe(input)).rejects.toMatchObject({
    code: "CONFLICT",
  });
  await state.db
    .update(catalogSources)
    .set({ leaseUntil: null })
    .where(eq(catalogSources.id, 880));
  const productsBefore = await state.db.select().from(products);
  const imagesBefore = await state.db.select().from(productImages);
  state.imageCalls = [];
  expect(await caller.saveGalleryRecipe(input)).toEqual({
    saved: true,
    queued: false,
  });
  const [after] = await state.db
    .select()
    .from(catalogSources)
    .where(eq(catalogSources.id, 880));
  expect({ ...after, credentials: null, updatedAtMs: null }).toEqual({
    ...before,
    credentials: null,
    updatedAtMs: null,
  });
  const originalCredentials = JSON.parse(decryptToken(before.credentials));
  const newCredentials = JSON.parse(decryptToken(after.credentials));
  expect(newCredentials.api.auth).toEqual(originalCredentials.api.auth);
  expect(newCredentials.galleryPilot).toEqual(originalCredentials.galleryPilot);
  expect(newCredentials.api.mediaGroupRules).toEqual(
    galleryPilotRecipeSchema.parse(recipe).mediaGroupRules
  );
  expect(newCredentials.api.mediaGroupsFromDetails).toBe(true);
  expect(await state.db.select().from(products)).toEqual(productsBefore);
  expect(await state.db.select().from(productImages)).toEqual(imagesBefore);
  expect(state.imageCalls).toHaveLength(0);
  expect(await caller.galleryRecipeSettings(scope)).toMatchObject({
    recipeOrigin: "saved",
    recipe,
  });
  await expect(
    caller.queueGalleryPilot({ ...scope, token: preview.token })
  ).rejects.toMatchObject({ code: "CONFLICT" });
  await expect(caller.saveGalleryRecipe(input)).rejects.toMatchObject({
    code: "CONFLICT",
  });
});
it("counts each source product's active images independently with different row IDs and tenant isolation", async () => {
  await state.db
    .insert(organizations)
    .values({
      id: 882,
      name: "Other coverage",
      slug: "other-coverage",
      createdByUserId: 880,
      createdAtMs: 1,
    });
  const seed = {
    productUrl: "https://shop.example/coverage",
    organizationId: 880,
    sourceId: 880,
    status: "approved",
    specifications: {},
    provenance: {},
    createdAtMs: 1,
    updatedAtMs: 1,
  };
  await state.db.insert(products).values([
    {
      ...seed,
      id: 9101,
      externalId: "coverage-a",
      name: "Two photos",
      dedupeKey: "coverage-a",
    },
    {
      ...seed,
      id: 9102,
      externalId: "coverage-b",
      name: "One photo",
      dedupeKey: "coverage-b",
    },
    {
      ...seed,
      id: 9103,
      externalId: "coverage-c",
      name: "No photos",
      dedupeKey: "coverage-c",
    },
    {
      ...seed,
      id: 9104,
      sourceId: null,
      externalId: "coverage-other-source",
      name: "Unrelated",
      dedupeKey: "coverage-other-source",
    },
  ]);
  const photo = {
    organizationId: 880,
    url: "https://images.example/photo.png",
    sourceUrl: "https://images.example/photo.png",
    storageKey: "coverage-photo",
    isPrimary: 0,
    createdAtMs: 1,
  };
  await state.db.insert(productImages).values([
    { ...photo, id: 9201, productId: 9101 },
    { ...photo, id: 9202, productId: 9101 },
    {
      ...photo,
      id: 9203,
      productId: 9101,
      media: { retired: true, references: [] },
    },
    { ...photo, id: 9204, productId: 9102 },
    // Deliberately inconsistent foreign-tenant ownership must not count.
    { ...photo, id: 9205, organizationId: 882, productId: 9101 },
    { ...photo, id: 9206, productId: 9104 },
  ]);
  const result = await caller.galleryRecipeSettings(scope);
  expect(result.coverage.find(p => p.id === 9101)?.imageCount).toBe(2);
  expect(result.coverage.find(p => p.id === 9102)?.imageCount).toBe(1);
  expect(result.coverage.find(p => p.id === 9103)?.imageCount).toBe(0);
  expect(result.coverage.some(p => p.id === 9104)).toBe(false);
});
