import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const mockState = vi.hoisted(() => ({
  productUrl: "https://shop.router-test.example/products/apex",
  productName: "Apex Printer",
}));

vi.mock("./lib/websiteCrawler", async importOriginal => {
  const actual = await importOriginal<typeof import("./lib/websiteCrawler")>();
  return {
    ...actual,
    discoverSiteUrls: vi.fn(async () => [mockState.productUrl]),
    safeFetchText: vi.fn(async (url: string) => ({
      text: `<html><head><meta property="og:type" content="product"><meta property="product:price:amount" content="1499"></head><body><h1>${mockState.productName}</h1><img src="/apex.jpg" alt="${mockState.productName}"><p>SKU APX-1</p><p>Price $1,499</p><p>Build volume 300 mm</p><button>Add to cart</button></body></html>`,
      finalUrl: url,
      status: 200,
      contentType: "text/html",
    })),
    safeFetchImage: vi.fn(async () => { throw new Error("No image requested in this fixture"); }),
  };
});

vi.mock("./_core/llm", () => ({
  listLLMModels: vi.fn(async () => ({ data: [{ id: "gpt-5.5" }] })),
  invokeLLM: vi.fn(),
}));

import {
  activityEvents,
  campaignBriefs,
  organizationMemberships,
  organizations,
  productImages,
  products,
  users,
  websiteCrawlJobs,
  websiteCrawlPages,
} from "../drizzle/schema";
import { invokeLLM } from "./_core/llm";
import type { TrpcContext } from "./_core/context";
import { getDb } from "./db";
import { productDedupeKey } from "./lib/brandImport";
import { discoverSiteUrls } from "./lib/websiteCrawler";
import { removeCatalogProducts } from "./routers/catalog";
import { appRouter } from "./routers";

const suffix = `${Date.now()}-${Math.floor(Math.random() * 100000)}`;
let userId = 0;
let creatorUserId = 0;
let organizationId = 0;
let caller: ReturnType<typeof appRouter.createCaller>;
let creatorCaller: ReturnType<typeof appRouter.createCaller>;

function analysis(name: string) {
  return {
    choices: [{ message: { content: JSON.stringify({
      brand: { companyName: "", summary: "", voice: "", requiredClaims: [], prohibitedContent: [], colors: [], fonts: [], logoUrls: [] },
      products: [{ sourcePageId: 0, name, sku: "APX-1", category: "Printers", description: `${name} description`, productUrl: mockState.productUrl, price: "$1,499", currency: "USD", specifications: [{ name: "Build volume", value: "300 mm" }], imageUrls: [] }],
    }) } }],
  } as never;
}

async function cleanupFixture() {
  const db = await getDb();
  if (!db || !organizationId) return;
  await db.delete(activityEvents).where(eq(activityEvents.organizationId, organizationId));
  await db.delete(productImages).where(eq(productImages.organizationId, organizationId));
  await db.delete(products).where(eq(products.organizationId, organizationId));
  await db.delete(campaignBriefs).where(eq(campaignBriefs.organizationId, organizationId));
  await db.delete(websiteCrawlPages).where(eq(websiteCrawlPages.organizationId, organizationId));
  await db.delete(websiteCrawlJobs).where(eq(websiteCrawlJobs.organizationId, organizationId));
  await db.delete(organizationMemberships).where(eq(organizationMemberships.organizationId, organizationId));
  await db.delete(organizations).where(eq(organizations.id, organizationId));
  if (creatorUserId) await db.delete(users).where(eq(users.id, creatorUserId));
  await db.delete(users).where(eq(users.id, userId));
}

beforeAll(async () => {
  const db = await getDb();
  if (!db) throw new Error("Integration database unavailable");
  const insertedUser = await db.insert(users).values({ openId: `catalog-router-${suffix}`, email: `catalog-router-${suffix}@example.test`, name: "Catalog Router Test", loginMethod: "test" }).returning({ insertId: users.id });
  userId = Number(insertedUser[0].insertId);
  const insertedOrg = await db.insert(organizations).values({ name: "Catalog Router Test", slug: `catalog-router-${suffix}`, createdByUserId: userId, createdAtMs: Date.now() }).returning({ insertId: organizations.id });
  organizationId = Number(insertedOrg[0].insertId);
  await db.insert(organizationMemberships).values({ organizationId, userId, role: "owner", status: "active", createdAtMs: Date.now() }).returning({ insertId: organizationMemberships.id });
  const insertedCreator = await db.insert(users).values({ openId: `catalog-creator-${suffix}`, email: `catalog-creator-${suffix}@example.test`, name: "Catalog Creator Test", loginMethod: "test" }).returning({ insertId: users.id });
  creatorUserId = Number(insertedCreator[0].insertId);
  await db.insert(organizationMemberships).values({ organizationId, userId: creatorUserId, role: "creator", status: "active", createdAtMs: Date.now() }).returning({ insertId: organizationMemberships.id });
  const user = (await db.select().from(users).where(eq(users.id, userId)).limit(1))[0]!;
  const creatorUser = (await db.select().from(users).where(eq(users.id, creatorUserId)).limit(1))[0]!;
  caller = appRouter.createCaller({ user, req: {} as TrpcContext["req"], res: {} as TrpcContext["res"] });
  creatorCaller = appRouter.createCaller({ user: creatorUser, req: {} as TrpcContext["req"], res: {} as TrpcContext["res"] });
});

afterAll(cleanupFixture);

describe.sequential("catalog router deletion safeguards", () => {
  it("toggles approval back to pending, clears reviewer fields, records both events, and rejects creator review access", async () => {
    const db = await getDb(); if (!db) throw new Error("Database unavailable");
    const now = Date.now();
    const productId = Number((await db.insert(products).values({ organizationId, name: "Approval Toggle Product", dedupeKey: `approval-toggle-${suffix}`, productUrl: "https://router-test.example/products/approval-toggle", specifications: {}, provenance: {}, status: "pending", createdAtMs: now, updatedAtMs: now }).returning({ insertId: products.id }))[0].insertId);

    await caller.catalog.reviewProduct({ organizationId, productId, decision: "approved" });
    expect((await db.select().from(products).where(eq(products.id, productId)).limit(1))[0]).toMatchObject({ status: "approved", reviewedByUserId: userId });

    await expect(creatorCaller.catalog.reviewProduct({ organizationId, productId, decision: "pending" })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await caller.catalog.reviewProduct({ organizationId, productId, decision: "pending" });
    expect((await db.select().from(products).where(eq(products.id, productId)).limit(1))[0]).toMatchObject({ status: "pending", reviewedByUserId: null, reviewedAtMs: null });

    const actions = (await db.select().from(activityEvents).where(and(eq(activityEvents.organizationId, organizationId), eq(activityEvents.entityId, String(productId))))).map(event => event.action);
    expect(actions).toContain("catalog.product_approved");
    expect(actions).toContain("catalog.product_unapproved");
    await db.delete(activityEvents).where(and(eq(activityEvents.organizationId, organizationId), eq(activityEvents.entityId, String(productId))));
    await db.delete(products).where(eq(products.id, productId));
  });

  it("removes dependent images, prunes brief selections, and records delete and cleanup events", async () => {
    const db = await getDb(); if (!db) throw new Error("Database unavailable");
    const now = Date.now();
    const insertedJob = await db.insert(websiteCrawlJobs).values({ organizationId, sourceUrl: "https://router-test.example", sourceOrigin: "https://router-test.example", scanMode: "brand_and_products", status: "completed", discoveredUrls: [], cursor: 0, pagesDiscovered: 2, pagesProcessed: 2, maxPages: 10, createdByUserId: userId, createdAtMs: now, updatedAtMs: now, completedAtMs: now }).returning({ insertId: websiteCrawlJobs.id });
    const jobId = Number(insertedJob[0].insertId);
    const validPageInsert = await db.insert(websiteCrawlPages).values({ organizationId, jobId, url: "https://router-test.example/products/apex", urlHash: `valid-${suffix}`, pageType: "product", textContent: "Apex", metadata: { productCandidate: true }, colors: [], fonts: [], imageUrls: [], status: "analyzed", fetchedAtMs: now }).returning({ insertId: websiteCrawlPages.id });
    const invalidPageInsert = await db.insert(websiteCrawlPages).values({ organizationId, jobId, url: "https://router-test.example/support/apex", urlHash: `invalid-${suffix}`, pageType: "other", textContent: "Support", metadata: { productCandidate: false }, colors: [], fonts: [], imageUrls: [], status: "analyzed", fetchedAtMs: now }).returning({ insertId: websiteCrawlPages.id });
    const validId = Number((await db.insert(products).values({ organizationId, crawlJobId: jobId, sourcePageId: Number(validPageInsert[0].insertId), name: "Apex", dedupeKey: `valid-product-${suffix}`, productUrl: "https://router-test.example/products/apex", specifications: {}, provenance: {}, status: "pending", createdAtMs: now, updatedAtMs: now }).returning({ insertId: products.id }))[0].insertId);
    const invalidId = Number((await db.insert(products).values({ organizationId, crawlJobId: jobId, sourcePageId: Number(invalidPageInsert[0].insertId), name: "Apex Support", dedupeKey: `invalid-product-${suffix}`, productUrl: "https://router-test.example/support/apex", specifications: {}, provenance: {}, status: "pending", createdAtMs: now, updatedAtMs: now }).returning({ insertId: products.id }))[0].insertId);
    await db.insert(productImages).values([{ organizationId, productId: validId, sourceUrl: "https://router-test.example/apex.jpg", storageKey: `test/${suffix}/apex.jpg`, url: "https://storage.test/apex.jpg", createdAtMs: now }, { organizationId, productId: invalidId, sourceUrl: "https://router-test.example/support.jpg", storageKey: `test/${suffix}/support.jpg`, url: "https://storage.test/support.jpg", createdAtMs: now }]).returning({ insertId: productImages.id });
    const briefId = Number((await db.insert(campaignBriefs).values({ organizationId, name: "Router test brief", audience: "Test audience", offer: "Test offer", channel: "meta", placements: ["feed"], formats: ["square_1_1"], creativeDirection: "Test direction", assetIds: [], productIds: [validId, invalidId], status: "approved", createdByUserId: userId, approvedByUserId: userId, approvedAtMs: now, createdAtMs: now, updatedAtMs: now }).returning({ insertId: campaignBriefs.id }))[0].insertId);

    const deleted = await caller.catalog.deleteProduct({ organizationId, productId: validId });
    expect(deleted.removed).toBe(1);
    expect(await db.select().from(productImages).where(and(eq(productImages.organizationId, organizationId), eq(productImages.productId, validId)))).toHaveLength(0);
    expect((await db.select().from(campaignBriefs).where(eq(campaignBriefs.id, briefId)).limit(1))[0]?.productIds).toEqual([invalidId]);

    const cleaned = await caller.catalog.cleanupNonProducts({ organizationId });
    expect(cleaned.removed).toBe(1);
    expect(await db.select().from(products).where(eq(products.organizationId, organizationId))).toHaveLength(0);
    expect(await db.select().from(productImages).where(eq(productImages.organizationId, organizationId))).toHaveLength(0);
    expect((await db.select().from(campaignBriefs).where(eq(campaignBriefs.id, briefId)).limit(1))[0]?.productIds).toEqual([]);
    const actions = (await db.select().from(activityEvents).where(eq(activityEvents.organizationId, organizationId))).map(event => event.action);
    expect(actions).toContain("catalog.product_deleted");
    expect(actions).toContain("catalog.non_products_cleaned");
  });

  it("rolls back brief pruning and image deletion when the product transaction aborts", async () => {
    const db = await getDb(); if (!db) throw new Error("Database unavailable");
    const now = Date.now();
    const jobId = Number((await db.insert(websiteCrawlJobs).values({ organizationId, sourceUrl: "https://rollback-test.example", sourceOrigin: "https://rollback-test.example", scanMode: "brand_and_products", status: "completed", discoveredUrls: [], cursor: 0, pagesDiscovered: 1, pagesProcessed: 1, maxPages: 10, createdByUserId: userId, createdAtMs: now, updatedAtMs: now, completedAtMs: now }).returning({ insertId: websiteCrawlJobs.id }))[0].insertId);
    const pageId = Number((await db.insert(websiteCrawlPages).values({ organizationId, jobId, url: "https://rollback-test.example/products/keep", urlHash: `rollback-${suffix}`, pageType: "product", textContent: "Keep", metadata: { productCandidate: true }, colors: [], fonts: [], imageUrls: [], status: "analyzed", fetchedAtMs: now }).returning({ insertId: websiteCrawlPages.id }))[0].insertId);
    const productId = Number((await db.insert(products).values({ organizationId, crawlJobId: jobId, sourcePageId: pageId, name: "Keep Product", dedupeKey: `rollback-product-${suffix}`, productUrl: "https://rollback-test.example/products/keep", specifications: {}, provenance: {}, status: "pending", createdAtMs: now, updatedAtMs: now }).returning({ insertId: products.id }))[0].insertId);
    await db.insert(productImages).values({ organizationId, productId, sourceUrl: "https://rollback-test.example/keep.jpg", storageKey: `test/${suffix}/keep.jpg`, url: "https://storage.test/keep.jpg", createdAtMs: now }).returning({ insertId: productImages.id });
    const briefId = Number((await db.insert(campaignBriefs).values({ organizationId, name: "Rollback brief", audience: "Test audience", offer: "Test offer", channel: "meta", placements: ["feed"], formats: ["square_1_1"], creativeDirection: "Test direction", assetIds: [], productIds: [productId], status: "approved", createdByUserId: userId, approvedByUserId: userId, approvedAtMs: now, createdAtMs: now, updatedAtMs: now }).returning({ insertId: campaignBriefs.id }))[0].insertId);

    await expect(removeCatalogProducts(db, organizationId, [productId], { beforeProductDelete: () => { throw new Error("forced rollback"); } })).rejects.toThrow("forced rollback");
    expect(await db.select().from(products).where(eq(products.id, productId))).toHaveLength(1);
    expect(await db.select().from(productImages).where(eq(productImages.productId, productId))).toHaveLength(1);
    expect((await db.select().from(campaignBriefs).where(eq(campaignBriefs.id, briefId)).limit(1))[0]).toMatchObject({ productIds: [productId], status: "approved", approvedByUserId: userId });
    await removeCatalogProducts(db, organizationId, [productId]);
    await db.delete(campaignBriefs).where(eq(campaignBriefs.id, briefId));
  });
});

describe.sequential("crawl router repeat product scans", () => {
  it("blocks overlap, deduplicates canonical URL variants, then matches a changed URL by SKU while preserving approval", async () => {
    const db = await getDb(); if (!db) throw new Error("Database unavailable");
    mockState.productUrl = "https://shop.router-test.example/products/apex?variant=first";
    mockState.productName = "Apex Printer";
    await expect(caller.crawl.start({ organizationId, websiteUrl: "https://router-test.example", maxPages: 251, scanMode: "products_only" })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    const first = await caller.crawl.start({ organizationId, websiteUrl: "https://router-test.example", maxPages: 10, scanMode: "products_only" });
    await expect(caller.crawl.start({ organizationId, websiteUrl: "https://router-test.example", maxPages: 10, scanMode: "products_only" })).rejects.toMatchObject({ code: "CONFLICT" });
    await caller.crawl.processBatch({ organizationId, jobId: first.jobId, batchSize: 4 });
    const firstPage = (await db.select().from(websiteCrawlPages).where(and(eq(websiteCrawlPages.organizationId, organizationId), eq(websiteCrawlPages.jobId, first.jobId))).limit(1))[0]!;
    vi.mocked(invokeLLM).mockResolvedValueOnce({ choices: [{ message: { content: JSON.stringify({ brand: { companyName: "", summary: "", voice: "", requiredClaims: [], prohibitedContent: [], colors: [], fonts: [], logoUrls: [] }, products: [{ sourcePageId: firstPage.id, name: "Apex Printer", sku: null, category: "Printers", description: "Apex Printer description", productUrl: mockState.productUrl, price: "$1,499", currency: "USD", specifications: [{ name: "Build volume", value: "300 mm" }], imageUrls: [] }] }) } }] } as never);
    await caller.crawl.analyzeBatch({ organizationId, jobId: first.jobId, batchSize: 5 });
    await caller.crawl.analyzeBatch({ organizationId, jobId: first.jobId, batchSize: 5 });
    const original = (await db.select().from(products).where(eq(products.organizationId, organizationId)).limit(1))[0]!;
    await db.update(products).set({ status: "approved", reviewedByUserId: userId, reviewedAtMs: Date.now() }).where(eq(products.id, original.id));

    mockState.productUrl = "https://shop.router-test.example/products/apex/?variant=second";
    mockState.productName = "Apex Printer Updated";
    const second = await caller.crawl.start({ organizationId, websiteUrl: "https://router-test.example", maxPages: 10, scanMode: "products_only" });
    const secondDiscoveryCall = vi.mocked(discoverSiteUrls).mock.calls.at(-1);
    expect(secondDiscoveryCall?.[2]).toContain(mockState.productUrl.replace("/?variant=second", "?variant=first"));
    await caller.crawl.processBatch({ organizationId, jobId: second.jobId, batchSize: 4 });
    const secondPage = (await db.select().from(websiteCrawlPages).where(and(eq(websiteCrawlPages.organizationId, organizationId), eq(websiteCrawlPages.jobId, second.jobId))).limit(1))[0]!;
    expect(secondPage.url).toContain("variant=second");
    vi.mocked(invokeLLM).mockResolvedValueOnce({ choices: [{ message: { content: JSON.stringify({ brand: { companyName: "", summary: "", voice: "", requiredClaims: [], prohibitedContent: [], colors: [], fonts: [], logoUrls: [] }, products: [{ sourcePageId: secondPage.id, name: "Apex Printer Updated", sku: "APX-1", category: "Printers", description: "Updated description", productUrl: secondPage.url, price: "$1,499", currency: "USD", specifications: [{ name: "Build volume", value: "300 mm" }], imageUrls: [] }] }) } }] } as never);
    const secondAnalysis = await caller.crawl.analyzeBatch({ organizationId, jobId: second.jobId, batchSize: 5 });
    expect(secondAnalysis.productsFound).toBe(1);
    await caller.crawl.analyzeBatch({ organizationId, jobId: second.jobId, batchSize: 5 });
    const afterCanonicalUrlRescan = await db.select().from(products).where(eq(products.organizationId, organizationId));
    expect(afterCanonicalUrlRescan).toHaveLength(1);
    expect(afterCanonicalUrlRescan[0]).toMatchObject({ id: original.id, name: "Apex Printer Updated", sku: "APX-1", status: "approved" });

    mockState.productUrl = "https://shop.router-test.example/products/apex-pro?variant=third";
    mockState.productName = "Apex Printer Pro";
    const third = await caller.crawl.start({ organizationId, websiteUrl: "https://router-test.example", maxPages: 10, scanMode: "products_only" });
    await caller.crawl.processBatch({ organizationId, jobId: third.jobId, batchSize: 4 });
    const thirdPage = (await db.select().from(websiteCrawlPages).where(and(eq(websiteCrawlPages.organizationId, organizationId), eq(websiteCrawlPages.jobId, third.jobId))).limit(1))[0]!;
    vi.mocked(invokeLLM).mockResolvedValueOnce({ choices: [{ message: { content: JSON.stringify({ brand: { companyName: "", summary: "", voice: "", requiredClaims: [], prohibitedContent: [], colors: [], fonts: [], logoUrls: [] }, products: [{ sourcePageId: thirdPage.id, name: "Apex Printer Pro", sku: "APX-1", category: "Printers", description: "Apex Printer Pro description", productUrl: thirdPage.url, price: "$1,499", currency: "USD", specifications: [{ name: "Build volume", value: "300 mm" }], imageUrls: [] }] }) } }] } as never);
    await caller.crawl.analyzeBatch({ organizationId, jobId: third.jobId, batchSize: 5 });
    await caller.crawl.analyzeBatch({ organizationId, jobId: third.jobId, batchSize: 5 });
    const afterSkuRescan = await db.select().from(products).where(eq(products.organizationId, organizationId));
    expect(afterSkuRescan).toHaveLength(1);
    expect(afterSkuRescan[0]).toMatchObject({ id: original.id, name: "Apex Printer Pro", sku: "APX-1", productUrl: thirdPage.url, status: "approved" });
    expect(afterSkuRescan[0]!.dedupeKey).toBe(productDedupeKey({ sku: "APX-1", productUrl: thirdPage.url, name: "any" }));
  }, 30000);
});

describe.sequential("campaign brief draft saves", () => {
  it("saves the reported short populated form, normalizes its bare domain, and keeps products and assets optional", async () => {
    const db = await getDb(); if (!db) throw new Error("Database unavailable");
    const created = await caller.briefs.create({ organizationId, name: "Test", audience: "Test", offer: "Test", creativeDirection: "Test", destinationUrl: "bambulab.com", requiredClaims: "Test", placements: ["facebook_feed", "instagram_feed"], formats: ["square_1_1", "portrait_4_5"], assetIds: [], productIds: [] });
    const brief = (await db.select().from(campaignBriefs).where(eq(campaignBriefs.id, created.briefId)).limit(1))[0];
    expect(brief).toMatchObject({ name: "Test", audience: "Test", offer: "Test", creativeDirection: "Test", destinationUrl: "https://bambulab.com/", requiredClaims: "Test", assetIds: [], productIds: [], status: "draft" });
    await expect(caller.briefs.submit({ organizationId, briefId: created.briefId })).rejects.toMatchObject({ code: "PRECONDITION_FAILED", message: expect.stringContaining("Audience must contain at least 10 characters") });
    await db.delete(campaignBriefs).where(eq(campaignBriefs.id, created.briefId));
  });
});
