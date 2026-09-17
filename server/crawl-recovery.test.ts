import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { eq } from "drizzle-orm";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

const state = vi.hoisted(() => ({ db: null as any }));
vi.mock("./db", () => ({ getDb: async () => state.db }));
vi.mock("./lib/websiteCrawler", async importOriginal => {
  const original =
    await importOriginal<typeof import("./lib/websiteCrawler")>();
  return {
    ...original,
    safeFetchText: vi.fn(),
    extractPageEvidence: vi.fn(original.extractPageEvidence),
  };
});

import {
  organizations,
  organizationMemberships,
  users,
  websiteCrawlJobs,
  websiteCrawlPages,
} from "../drizzle/schema";
import { processNextWebsiteJob } from "./jobs/catalogWorker";
import { crawlRouter } from "./routers/crawl";
import { extractPageEvidence, safeFetchText } from "./lib/websiteCrawler";
import type { TrpcContext } from "./_core/context";

let engine: PGlite;
let caller: ReturnType<typeof crawlRouter.createCaller>;
let organizationId: number;
let userId: number;

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
    .values({ openId: "crawl-recovery", email: "owner@example.test" })
    .returning();
  userId = user.id;
  const [organization] = await state.db
    .insert(organizations)
    .values({
      name: "Recovery test",
      slug: "recovery-test",
      createdByUserId: user.id,
      createdAtMs: 1,
    })
    .returning();
  organizationId = organization.id;
  await state.db
    .insert(organizationMemberships)
    .values({
      organizationId,
      userId,
      role: "owner",
      status: "active",
      createdAtMs: 1,
    });
  caller = crawlRouter.createCaller({
    user,
    catalogWorker: true,
    req: {} as TrpcContext["req"],
    res: {} as TrpcContext["res"],
  });
}, 30_000);

afterAll(async () => {
  await engine?.close();
});

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(safeFetchText).mockImplementation(async url => ({
    finalUrl: url,
    status: 200,
    contentType: url.endsWith(".css") ? "text/css" : "text/html",
    text: url.endsWith(".css")
      ? "body{color:#12AB34;font-family:BrandFont;}"
      : '<html><head><link rel="stylesheet" href="/brand.css"><script type="application/ld+json">{"@type":"Product","name":"Pendant","sku":"P-1"}</script></head><body><h1>Pendant</h1><button>Add to cart</button></body></html>',
  }));
});

async function createJob(
  scanMode: "products_only" | "brand_and_products",
  count: number
) {
  const discoveredUrls = Array.from(
    { length: count },
    (_, index) => `https://shop.example.test/products/item-${index}`
  );
  const [job] = await state.db
    .insert(websiteCrawlJobs)
    .values({
      organizationId,
      sourceUrl: "https://shop.example.test/",
      sourceOrigin: "https://shop.example.test",
      scanMode,
      background: 1,
      status: "crawling",
      discoveredUrls,
      cursor: 0,
      pagesDiscovered: count,
      pagesProcessed: 0,
      maxPages: 100,
      createdByUserId: userId,
      createdAtMs: 1,
      updatedAtMs: 1,
    })
    .returning();
  return job.id as number;
}

describe("bounded, resumable website scanning", () => {
  it("checkpoints each product page and skips stylesheets even when the caller asks for six pages", async () => {
    const jobId = await createJob("products_only", 3);
    const input = { organizationId, jobId, batchSize: 6 };
    expect(await caller.processBatch(input)).toMatchObject({
      pagesProcessed: 1,
      status: "crawling",
      done: false,
    });
    expect(safeFetchText).toHaveBeenCalledTimes(1);
    expect(extractPageEvidence).toHaveBeenCalledTimes(1);
    // Resume reads durable state instead of replaying the first page.
    expect(await caller.resume({ organizationId, jobId })).toEqual({
      status: "crawling",
    });
    expect(await caller.processBatch(input)).toMatchObject({
      pagesProcessed: 2,
      status: "crawling",
    });
    expect(vi.mocked(safeFetchText).mock.calls.map(([url]) => url)).toEqual([
      "https://shop.example.test/products/item-0",
      "https://shop.example.test/products/item-1",
    ]);
    expect(await caller.processBatch(input)).toMatchObject({
      pagesProcessed: 3,
      status: "analyzing",
      done: true,
    });
    expect(
      await state.db
        .select()
        .from(websiteCrawlPages)
        .where(eq(websiteCrawlPages.jobId, jobId))
    ).toHaveLength(3);
  });

  it("records an interrupted website response and continues to the next saved page", async () => {
    const jobId = await createJob("products_only", 2);
    vi.mocked(safeFetchText).mockRejectedValueOnce(
      new Error("Website response was interrupted")
    );
    expect(await caller.processBatch({ organizationId, jobId })).toMatchObject({
      pagesProcessed: 1,
    });
    const [failed] = await state.db
      .select()
      .from(websiteCrawlPages)
      .where(eq(websiteCrawlPages.jobId, jobId));
    expect(failed).toMatchObject({
      status: "failed",
      errorMessage: "Website response was interrupted",
    });
    expect(await caller.processBatch({ organizationId, jobId })).toMatchObject({
      pagesProcessed: 2,
      status: "analyzing",
    });
  });

  it("keeps linked brand colors and fonts without parsing HTML a second time", async () => {
    const jobId = await createJob("brand_and_products", 1);
    await caller.processBatch({ organizationId, jobId });
    expect(safeFetchText).toHaveBeenCalledTimes(2);
    expect(extractPageEvidence).toHaveBeenCalledTimes(1);
    const [page] = await state.db
      .select()
      .from(websiteCrawlPages)
      .where(eq(websiteCrawlPages.jobId, jobId));
    expect(page.colors).toContain("#12AB34");
    expect(page.fonts).toContain("BrandFont");
    expect(page.metadata.structuredProducts[0]).toMatchObject({
      name: "Pendant",
      sku: "P-1",
    });
  });
});

it("discovers more than 250 pages in the background and respects pause", async () => {
  // Previous tests intentionally leave analyzed work behind; isolate this queue.
  await state.db.update(websiteCrawlJobs).set({ background: 0 });
  const [job] = await state.db
    .insert(websiteCrawlJobs)
    .values({
      organizationId,
      sourceUrl: "https://shop.example.test/",
      sourceOrigin: "https://shop.example.test",
      scanMode: "products_only",
      background: 1,
      status: "discovering",
      discoveredUrls: ["https://shop.example.test/"],
      discovery: {
        pending: ["https://shop.example.test/sitemap.xml"],
        visited: [],
        failures: [],
      },
      cursor: 0,
      pagesDiscovered: 1,
      pagesProcessed: 0,
      maxPages: 100000,
      createdByUserId: userId,
      createdAtMs: 1,
      updatedAtMs: 1,
    })
    .returning();
  vi.mocked(safeFetchText).mockResolvedValueOnce({
    finalUrl: "https://shop.example.test/sitemap.xml",
    status: 200,
    contentType: "application/xml",
    text:
      "<urlset>" +
      Array.from(
        { length: 600 },
        (_, i) =>
          `<url><loc>https://shop.example.test/products/${i}</loc></url>`
      ).join("") +
      "</urlset>",
  });
  await processNextWebsiteJob(state.db);
  expect(
    (
      await state.db
        .select()
        .from(websiteCrawlJobs)
        .where(eq(websiteCrawlJobs.id, job.id))
    )[0]
  ).toMatchObject({
    pagesDiscovered: 601,
    status: "crawling",
    leaseUntil: null,
  });
  await caller.cancel({ organizationId, jobId: job.id });
  expect(await processNextWebsiteJob(state.db)).toBe(false);
  await caller.resume({ organizationId, jobId: job.id });
  await processNextWebsiteJob(state.db);
  expect(
    (
      await state.db
        .select()
        .from(websiteCrawlJobs)
        .where(eq(websiteCrawlJobs.id, job.id))
    )[0]
  ).toMatchObject({ pagesProcessed: 1, status: "crawling" });
});
