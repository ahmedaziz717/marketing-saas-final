import { afterAll, beforeAll, describe, it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { eq } from "drizzle-orm";
import { catalogDraftEntrySchema } from "../shared/catalog";
import { parseApiCatalog } from "./lib/apiCatalog";
import { apiCatalogConfigSchema } from "../shared/apiCatalog";
import { catalogRouter } from "./routers/catalog";
import { safeFetchImage, safeStoreRequest } from "./lib/websiteCrawler";
import { storagePut } from "./storage";
vi.mock("./lib/websiteCrawler", async load => ({
  ...(await load<any>()),
  safeFetchImage: vi.fn(),
  safeStoreRequest: vi.fn(),
}));
vi.mock("./storage", () => ({ storagePut: vi.fn() }));
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
  await engine.exec(
    readFileSync("drizzle/postgres/0018_structured_product_facts.sql", "utf8")
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
  await state.db.insert(organizationMemberships).values({
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

it("connects a public API with encrypted configuration and keeps it private from list responses", async () => {
  process.env.INTEGRATION_TOKEN_ENCRYPTION_SECRET = "integration-api-test-key";
  try {
    vi.mocked(readStorePage).mockResolvedValue({
      items: [],
      next: null,
      total: 0,
    });
    const source = await caller.connect({
      organizationId: orgId,
      provider: "api",
      storeUrl: "https://api.example/catalog?limit=20",
      api: {
        auth: { type: "none" },
        itemsPath: "items",
        nextPath: "",
        fields: {},
        notes: "Products are in items.",
      },
    });
    const [row] = await state.db
      .select()
      .from(catalogSources)
      .where(eq(catalogSources.id, source.id));
    expect(row.credentials.ciphertext).toBeTruthy();
    expect(JSON.stringify(row.credentials)).not.toContain(
      "Products are in items"
    );
    const publicRow = (await caller.list({ organizationId: orgId })).find(
      row => row.id === source.id
    )!;
    expect(publicRow.storeUrl).toBe("https://api.example/catalog?limit=20");
    expect(publicRow).not.toHaveProperty("credentials");
    expect(publicRow).not.toHaveProperty("api");
    await expect(
      outsider.connect({
        organizationId: orgId,
        provider: "api",
        storeUrl: "https://api.example/catalog",
        api: {
          auth: { type: "none" },
          itemsPath: "",
          nextPath: "",
          fields: {},
          notes: "",
        },
      })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  } finally {
    delete process.env.INTEGRATION_TOKEN_ENCRYPTION_SECRET;
  }
});

it("previews missing product links and failed images without blocking the connection", async () => {
  vi.mocked(safeStoreRequest).mockResolvedValue({
    data: [
      {
        code: "a",
        name: "Missing page",
        imageUrl: "https://cdn.example/missing.png",
        price: 1200,
      },
      { code: "b", name: "Second product" },
    ],
  } as any);
  vi.mocked(safeFetchImage).mockRejectedValue(new Error("Image not found"));
  const result = await caller.previewApi({
    organizationId: orgId,
    endpoint: "https://api.example/kits",
    config: apiCatalogConfigSchema.parse({
      imageBaseUrl: "https://cdn.example/clx",
    }),
    exampleProductUrl: "https://shop.example/products/not-in-feed",
  });
  expect(result.ready).toBe(true);
  expect(result.count).toBe(2);
  expect(result.reviewProductCount).toBe(2);
  expect(result.exampleWarning).toContain("not applied");
  expect(result.issues.every(i => !i.blocking)).toBe(true);
  expect(result.samples[0].productUrl).toBe("");
  expect(result.mapping.imageBaseUrl).toBe("https://cdn.example/clx/");
  await expect(
    outsider.previewApi({
      organizationId: orgId,
      endpoint: "https://api.example/kits",
      config: apiCatalogConfigSchema.parse({}),
    })
  ).rejects.toMatchObject({ code: "FORBIDDEN" });
});

it("completes a mixed API import, keeps blank URLs distinct, supports repair and retries images on sync", async () => {
  process.env.INTEGRATION_TOKEN_ENCRYPTION_SECRET = "isolated-draft-test-key";
  try {
    // Only the isolated test database is affected; do not run an older queued fixture.
    await state.db.update(catalogSources).set({ status: "disconnected" });
    const entries = parseApiCatalog(
      [
        {
          code: "draft-a",
          name: "No page",
          imageUrl: "https://cdn.example/fail.png",
          price: 1500,
          features: ["Liquid cooling"],
        },
        {
          code: "draft-b",
          name: "Second",
          imageUrl: "https://cdn.example/good.png",
        },
      ],
      "https://api.example/draft-kits",
      apiCatalogConfigSchema.parse({})
    ).items;
    vi.mocked(readStorePage).mockResolvedValue({
      items: entries,
      next: null,
      total: 2,
    });
    vi.mocked(safeFetchImage).mockImplementation(async url => {
      if (url.includes("fail")) throw new Error("Image not found");
      return { data: Buffer.from("image"), contentType: "image/png" } as any;
    });
    vi.mocked(storagePut).mockResolvedValue({
      key: "test/image",
      url: "https://storage.example/image.png",
    });
    const { id } = await caller.connect({
      organizationId: orgId,
      provider: "api",
      storeUrl: "https://api.example/draft-kits",
      api: apiCatalogConfigSchema.parse({}),
    });
    await processNextStoreJob(state.db);
    let rows = await state.db
      .select()
      .from(products)
      .where(eq(products.sourceId, id));
    expect(rows).toHaveLength(2);
    const first = rows.find((p: any) => p.externalId === "draft-a");
    const second = rows.find((p: any) => p.externalId === "draft-b");
    expect(first.id).not.toBe(second.id);
    expect(first).toMatchObject({
      productUrl: "",
      status: "pending",
      features: ["Liquid cooling"],
      provenance: { "api.imageStatus": "unavailable" },
    });
    expect(second.provenance["api.imageStatus"]).toBe("available");
    expect(
      (await caller.list({ organizationId: orgId })).find(s => s.id === id)
    ).toMatchObject({ status: "connected", processed: 2, error: null });
    const user = (
      await state.db.select().from(users).where(eq(users.id, userId))
    )[0];
    const catalog = catalogRouter.createCaller({
      user,
      req: {} as TrpcContext["req"],
      res: {} as TrpcContext["res"],
    });
    await catalog.updateProduct({
      organizationId: orgId,
      productId: first.id,
      product: { name: "Reviewed name", productUrl: "", specifications: {} },
    });
    await catalog.updateProduct({
      organizationId: orgId,
      productId: first.id,
      product: {
        name: "Reviewed name",
        productUrl: "https://shop.example/repaired",
        specifications: {},
        currency: "USD",
      },
    });
    vi.mocked(safeFetchImage).mockResolvedValue({
      data: Buffer.from("image"),
      contentType: "image/png",
    } as any);
    await caller.action({
      organizationId: orgId,
      sourceId: id,
      action: "sync",
    });
    await processNextStoreJob(state.db);
    rows = await state.db
      .select()
      .from(products)
      .where(eq(products.sourceId, id));
    expect(rows).toHaveLength(2);
    expect(rows.find((p: any) => p.id === first.id)).toMatchObject({
      name: "Reviewed name",
      productUrl: "https://shop.example/repaired",
      currency: "USD",
      provenance: { "api.imageStatus": "available" },
    });
    expect(
      catalogEntrySchema.safeParse({ name: "Manual", productUrl: "" }).success
    ).toBe(false);
    expect(
      catalogDraftEntrySchema.safeParse({ name: "API draft", productUrl: "" })
        .success
    ).toBe(true);
  } finally {
    delete process.env.INTEGRATION_TOKEN_ENCRYPTION_SECRET;
  }
});
