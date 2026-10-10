import { afterAll, beforeAll, describe, it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { eq } from "drizzle-orm";
const state = vi.hoisted(() => ({ db: null as any }));
vi.mock("./db", () => ({ getDb: async () => state.db }));
vi.mock("./lib/storeCatalog", async load => ({
  ...(await load<any>()),
  readStorePage: vi.fn(),
}));
import { catalogSourcesRouter } from "./routers/catalogSources";
import { readStorePage, storeAddress } from "./lib/storeCatalog";
import { processNextStoreJob } from "./jobs/storeWorker";
import {
  products,
  catalogSources,
  organizations,
  organizationMemberships,
  users,
} from "../drizzle/schema";
import { parseCatalogCsv } from "../shared/catalogCsv";
import { catalogEntrySchema } from "../shared/catalog";
import type { TrpcContext } from "./_core/context";
let engine: PGlite,
  caller: ReturnType<typeof catalogSourcesRouter.createCaller>,
  outsider: typeof caller,
  orgId: number,
  userId: number;
beforeAll(async () => {
  engine = new PGlite();
  await engine.exec(
    readFileSync("drizzle/postgres/0000_long_mad_thinker.sql", "utf8")
  );
  await engine.exec(
    readFileSync("drizzle/postgres/0001_wooden_gideon.sql", "utf8")
  );
  state.db = drizzle(engine);
  const [user] = await state.db
    .insert(users)
    .values({ openId: "catalog-owner" })
    .returning();
  userId = user.id;
  const [org] = await state.db
    .insert(organizations)
    .values({
      name: "Catalog",
      slug: "catalog",
      createdByUserId: user.id,
      createdAtMs: 1,
    })
    .returning();
  orgId = org.id;
  await state.db
    .insert(organizationMemberships)
    .values({
      organizationId: orgId,
      userId: user.id,
      role: "owner",
      status: "active",
      createdAtMs: 1,
    });
  const [other] = await state.db
    .insert(users)
    .values({ openId: "catalog-outsider" })
    .returning();
  caller = catalogSourcesRouter.createCaller({
    user,
    req: {} as TrpcContext["req"],
    res: {} as TrpcContext["res"],
  });
  outsider = catalogSourcesRouter.createCaller({
    user: other,
    req: {} as TrpcContext["req"],
    res: {} as TrpcContext["res"],
  });
  process.env.CATALOG_TOKEN_ENCRYPTION_SECRET = "isolated-test-key";
}, 30000);
afterAll(async () => {
  await engine.close();
  delete process.env.CATALOG_TOKEN_ENCRYPTION_SECRET;
});
describe("Catalog sources", () => {
  it("parses CSV quotations, embedded newlines and service fields", () => {
    const rows = parseCatalogCsv(
      'name,productUrl,recordType,description,pricing\r\n"IT, support",https://example.com/it,service,"Remote\nsupport",quote'
    );
    expect(rows[0]).toMatchObject({
      name: "IT, support",
      description: "Remote\nsupport",
      recordType: "service",
      serviceDetails: { pricing: "quote" },
    });
    expect(() => parseCatalogCsv("title\nAnything")).toThrow(
      "name and productUrl"
    );
  });
  it("rejects credentials in URLs and restricts provider hosts", () => {
    expect(() => storeAddress("shopify", "https://attacker.test")).toThrow();
    expect(() => storeAddress("woocommerce", "http://store.test")).toThrow();
    expect(() =>
      storeAddress("woocommerce", "https://u:p@store.test")
    ).toThrow();
  });
  it("saves services and blocks cross-tenant changes", async () => {
    const entry = catalogEntrySchema.parse({
      name: "IT Support",
      productUrl: "https://example.com/it",
      recordType: "service",
      serviceDetails: { pricing: "quote" },
    });
    const result = await caller.addEntries({
      organizationId: orgId,
      entries: [entry],
    });
    expect(result[0].error).toBeNull();
    expect((await state.db.select().from(products))[0]).toMatchObject({
      recordType: "service",
      status: "pending",
      serviceDetails: { pricing: "quote" },
    });
    await expect(
      outsider.addEntries({ organizationId: orgId, entries: [entry] })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
  it("keeps credentials private, imports all pages, and makes repeat sync idempotent", async () => {
    const first = {
      ...catalogEntrySchema.parse({
        name: "First",
        productUrl: "https://shop.example.com/products/1",
      }),
      externalId: "1",
      variants: [],
    };
    const second = {
      ...first,
      name: "Second",
      productUrl: "https://shop.example.com/products/2",
      externalId: "2",
    };
    vi.mocked(readStorePage).mockImplementation(async (_p, _a, _c, cursor) =>
      cursor
        ? { items: [second], next: null, total: 2 }
        : { items: [first], next: "2", total: 2 }
    );
    const { id } = await caller.connect({
      organizationId: orgId,
      provider: "shopify",
      storeUrl: "https://example.myshopify.com",
      token: "secret-token-123",
    });
    const list = await caller.list({ organizationId: orgId });
    expect(JSON.stringify(list)).not.toContain("secret-token");
    expect(list[0]).not.toHaveProperty("credentials");
    await expect(
      outsider.action({
        organizationId: orgId,
        sourceId: id,
        action: "disconnect",
      })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(await processNextStoreJob(state.db)).toBe(true);
    expect((await caller.list({ organizationId: orgId }))[0]).toMatchObject({
      processed: 1,
      status: "syncing",
    });
    await processNextStoreJob(state.db);
    expect((await caller.list({ organizationId: orgId }))[0]).toMatchObject({
      processed: 2,
      status: "connected",
    });
    await caller.action({
      organizationId: orgId,
      sourceId: id,
      action: "sync",
    });
    await processNextStoreJob(state.db);
    await processNextStoreJob(state.db);
    expect(
      await state.db.select().from(products).where(eq(products.sourceId, id))
    ).toHaveLength(2);
    await caller.action({
      organizationId: orgId,
      sourceId: id,
      action: "disconnect",
    });
    expect(
      (
        await state.db
          .select()
          .from(catalogSources)
          .where(eq(catalogSources.id, id))
      )[0].credentials
    ).toBeNull();
    expect(
      await state.db.select().from(products).where(eq(products.sourceId, id))
    ).toHaveLength(2);
  });
});
