import { randomUUID } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { eq } from "drizzle-orm";
import { beforeAll, afterAll, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({
  db: null as any,
  resolve: vi.fn(() => {
    throw new Error("No media resolution in draft save");
  }),
  quote: vi.fn(() => {
    throw new Error("No pricing in draft save");
  }),
}));
vi.mock("./db", () => ({ getDb: async () => state.db }));
vi.mock("./lib/videoJobs", async original => ({
  ...(await original<typeof import("./lib/videoJobs")>()),
  resolveVideoReferences: state.resolve,
}));
vi.mock("./lib/videoPricing", () => ({ quotedVideoRequest: state.quote }));
import {
  users,
  organizations,
  organizationMemberships,
  products,
  productImages,
  activityEvents,
} from "../drizzle/schema";
import { videoJobs } from "../drizzle/videoSchema";
import { defaultVideoSetup } from "../shared/videoCreation";
import { saveMcpVideoDraft } from "./lib/mcpVideoDrafts";
const engine = new PGlite();
const guard = vi.fn(async () => {});
const fetchSpy = vi.fn(() => {
  throw new Error("No network in draft save");
});
beforeAll(async () => {
  state.db = drizzle(engine);
  await migrate(state.db, { migrationsFolder: "drizzle/postgres" });
  await state.db.insert(users).values([
    { id: 1, openId: "video-owner" },
    { id: 2, openId: "video-other" },
  ]);
  await state.db.insert(organizations).values(
    [1, 2].map(id => ({
      id,
      name: `Video ${id}`,
      slug: `mcp-video-${id}`,
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
  await state.db.insert(products).values(
    [1, 2, 3, 4].map(id => ({
      id,
      organizationId: id === 2 ? 2 : 1,
      name: `Product ${id}`,
      dedupeKey: `mcp-video-product-${id}`,
      productUrl: `https://example.test/product/${id}`,
      specifications: {},
      provenance: {},
      status: id === 3 ? "pending" : id === 4 ? "rejected" : "approved",
      createdAtMs: 1,
      updatedAtMs: 1,
    }))
  );
  await state.db.insert(productImages).values(
    [1, 2, 3, 4].map(id => ({
      id,
      organizationId: id === 2 ? 2 : 1,
      productId: id,
      sourceUrl: `https://example.test/${id}.png`,
      storageKey: `products/${id}.png`,
      url: `https://example.test/${id}.png`,
      isPrimary: 1,
      createdAtMs: 1,
    }))
  );
  vi.stubGlobal("fetch", fetchSpy);
});
afterAll(async () => {
  vi.unstubAllGlobals();
  await engine.close();
});
const input = () => ({
  organizationId: 1,
  requestId: randomUUID(),
  setup: {
    ...defaultVideoSetup,
    title: "Video draft",
    imageKeys: ["product_image:1"],
  },
});

it("creates/updates one draft and returns durable replay without preparing or queueing media", async () => {
  const first = input();
  const [saved, duplicate] = await Promise.all([
    saveMcpVideoDraft(1, guard, first),
    saveMcpVideoDraft(1, guard, first),
  ]);
  expect(saved).toEqual(duplicate);
  expect(saved).toMatchObject({ status: "draft", revision: 1 });
  expect(Object.keys(saved).sort()).toEqual([
    "id",
    "revision",
    "status",
    "updatedAtMs",
  ]);
  const edit = {
    ...input(),
    id: saved.id,
    revision: 1,
    setup: { ...first.setup, title: "Edited" },
  };
  expect(await saveMcpVideoDraft(1, guard, edit)).toMatchObject({
    id: saved.id,
    revision: 2,
  });
  await state.db
    .update(products)
    .set({ status: "pending" })
    .where(eq(products.id, 1));
  expect(await saveMcpVideoDraft(1, guard, first)).toEqual(saved);
  await state.db
    .update(products)
    .set({ status: "approved" })
    .where(eq(products.id, 1));
  const [row] = await state.db
    .select()
    .from(videoJobs)
    .where(eq(videoJobs.id, saved.id));
  expect(row).toMatchObject({
    status: "draft",
    credits: 0,
    references: [],
    requestBody: null,
    providerRequestId: null,
    revision: 2,
  });
  expect(state.resolve).not.toHaveBeenCalled();
  expect(state.quote).not.toHaveBeenCalled();
  expect(fetchSpy).not.toHaveBeenCalled();
});

it("requires exact request hashes and paired current revision on updates", async () => {
  const first = input();
  const saved = await saveMcpVideoDraft(1, guard, first);
  await expect(
    saveMcpVideoDraft(1, guard, {
      ...first,
      setup: { ...first.setup, title: "Different" },
    })
  ).rejects.toMatchObject({ code: "CONFLICT" });
  await expect(
    saveMcpVideoDraft(1, guard, { ...input(), id: saved.id })
  ).rejects.toThrow();
  await expect(
    saveMcpVideoDraft(1, guard, { ...input(), revision: 1 })
  ).rejects.toThrow();
  await expect(
    saveMcpVideoDraft(1, guard, { ...input(), id: saved.id, revision: 9 })
  ).rejects.toMatchObject({ code: "CONFLICT" });
  await expect(
    saveMcpVideoDraft(1, guard, { ...input(), status: "queued" })
  ).rejects.toThrow();
  await expect(
    saveMcpVideoDraft(1, guard, {
      ...input(),
      setup: { ...first.setup, activate: true },
    })
  ).rejects.toThrow();
});

it("allows pending product photos for an unbilled draft without approving the product", async () => {
  const request = {
    ...input(),
    setup: { ...defaultVideoSetup, imageKeys: ["product_image:3"] },
  };
  const saved = await saveMcpVideoDraft(1, guard, request);
  expect(saved).toMatchObject({ status: "draft", revision: 1 });
  const [product] = await state.db
    .select()
    .from(products)
    .where(eq(products.id, 3));
  expect(product.status).toBe("pending");
  const [draft] = await state.db
    .select()
    .from(videoJobs)
    .where(eq(videoJobs.id, saved.id));
  expect(draft).toMatchObject({
    credits: 0,
    status: "draft",
    providerRequestId: null,
  });
  expect(state.resolve).not.toHaveBeenCalled();
  expect(state.quote).not.toHaveBeenCalled();
  expect(fetchSpy).not.toHaveBeenCalled();
});

it("rejects tenant/approval/plan/reference mismatches and leaves no request receipt", async () => {
  for (const setup of [
    { ...defaultVideoSetup, imageKeys: ["product_image:2"] },
    { ...defaultVideoSetup, imageKeys: ["product_image:4"] },
    { ...defaultVideoSetup, imageKeys: ["asset:999999"] },
    { ...defaultVideoSetup, sourceVideoKey: "asset:999999" },
    { ...defaultVideoSetup, campaignPlanId: 999999 },
    {
      ...defaultVideoSetup,
      imageKeys: ["product_image:1"],
      productSelections: [
        { productId: 2, featuredSpecKeys: [], includePrice: false },
      ],
    },
    { ...defaultVideoSetup, logoAssetId: 999999 },
  ]) {
    const request = { ...input(), setup };
    await expect(saveMcpVideoDraft(1, guard, request)).rejects.toThrow();
    expect(
      await state.db
        .select()
        .from(activityEvents)
        .where(eq(activityEvents.correlationId, request.requestId))
    ).toHaveLength(0);
  }
  await expect(
    saveMcpVideoDraft(1, guard, { ...input(), organizationId: 2 })
  ).rejects.toMatchObject({ code: "FORBIDDEN" });
  expect(fetchSpy).not.toHaveBeenCalled();
});

it("rechecks revoked grants and suspended membership even for receipt replay", async () => {
  const first = input();
  await saveMcpVideoDraft(1, guard, first);
  await expect(
    saveMcpVideoDraft(
      1,
      async () => {
        throw new Error("revoked");
      },
      first
    )
  ).rejects.toThrow("revoked");
  await expect(saveMcpVideoDraft(2, guard, first)).rejects.toMatchObject({
    code: "FORBIDDEN",
  });
  await state.db
    .update(organizationMemberships)
    .set({ status: "suspended" })
    .where(eq(organizationMemberships.userId, 1));
  await expect(saveMcpVideoDraft(1, guard, first)).rejects.toMatchObject({
    code: "FORBIDDEN",
  });
  await state.db
    .update(organizationMemberships)
    .set({ status: "active" })
    .where(eq(organizationMemberships.userId, 1));
});
