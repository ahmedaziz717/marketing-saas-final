import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const generationState = vi.hoisted(() => ({ failSecond: true, calls: 0 }));

vi.mock("./_core/llm", () => ({
  listLLMModels: vi.fn(async () => ({ data: [{ id: "gpt-5.5" }] })),
  invokeLLM: vi.fn(async () => ({
    choices: [{ message: { content: JSON.stringify({ concepts: [
      { name: "Concept one", concept: "First", primaryText: "First primary text", headline: "First headline", description: "First description", callToAction: "SHOP_NOW", imagePrompt: "First product composition" },
      { name: "Concept two", concept: "Second", primaryText: "Second primary text", headline: "Second headline", description: "Second description", callToAction: "LEARN_MORE", imagePrompt: "Second product composition" },
    ] }) } }],
  })),
}));

vi.mock("./_core/imageGeneration", () => ({
  listImageModels: vi.fn(async () => ({ models: [{ model: "MODEL_GPT_IMAGE_2", id: "gpt-image-2" }] })),
  generateImage: vi.fn(async () => {
    generationState.calls += 1;
    if (generationState.failSecond && generationState.calls === 2) throw new Error("HTTP 403: Forbidden for source image");
    return { url: `/manus-storage/generated/test-${generationState.calls}.png` };
  }),
}));

vi.mock("./storage", async importOriginal => {
  const actual = await importOriginal<typeof import("./storage")>();
  return { ...actual, storageGetBase64: vi.fn(async () => Buffer.from("raster-test").toString("base64")) };
});

import {
  activityEvents,
  brandAssets,
  brandKits,
  campaignBriefs,
  creativeJobs,
  creativeVariants,
  organizationMemberships,
  organizations,
  users,
} from "../drizzle/schema";
import type { TrpcContext } from "./_core/context";
import { getDb } from "./db";
import { appRouter } from "./routers";

const suffix = `${Date.now()}-${Math.floor(Math.random() * 100000)}`;
let userId = 0;
let organizationId = 0;
let briefId = 0;
let caller: ReturnType<typeof appRouter.createCaller>;

async function cleanup() {
  const db = await getDb();
  if (!db || !organizationId) return;
  await db.delete(activityEvents).where(eq(activityEvents.organizationId, organizationId));
  await db.delete(creativeVariants).where(eq(creativeVariants.organizationId, organizationId));
  await db.delete(creativeJobs).where(eq(creativeJobs.organizationId, organizationId));
  await db.delete(campaignBriefs).where(eq(campaignBriefs.organizationId, organizationId));
  await db.delete(brandAssets).where(eq(brandAssets.organizationId, organizationId));
  await db.delete(brandKits).where(eq(brandKits.organizationId, organizationId));
  await db.delete(organizationMemberships).where(eq(organizationMemberships.organizationId, organizationId));
  await db.delete(organizations).where(eq(organizations.id, organizationId));
  await db.delete(users).where(eq(users.id, userId));
}

beforeAll(async () => {
  const db = await getDb();
  if (!db) throw new Error("Integration database unavailable");
  const insertedUser = await db.insert(users).values({ openId: `creative-router-${suffix}`, email: `creative-router-${suffix}@example.test`, name: "Creative Router Test", loginMethod: "test", lastSignedIn: new Date() });
  userId = Number(insertedUser[0].insertId);
  const insertedOrganization = await db.insert(organizations).values({ name: `Creative Router ${suffix}`, slug: `creative-router-${suffix}`, createdByUserId: userId, createdAtMs: Date.now() });
  organizationId = Number(insertedOrganization[0].insertId);
  await db.insert(organizationMemberships).values({ organizationId, userId, role: "owner", status: "active", createdAtMs: Date.now() });
  const insertedKit = await db.insert(brandKits).values({ organizationId, name: "Test Brand", voice: "Clear", colors: ["#111111"], fonts: ["Inter"], requiredClaims: "", prohibitedContent: "", status: "active", updatedByUserId: userId, updatedAtMs: Date.now() });
  const brandKitId = Number(insertedKit[0].insertId);
  const insertedAsset = await db.insert(brandAssets).values({ organizationId, brandKitId, name: "Approved product image", type: "product", storageKey: `test/${suffix}.png`, url: `/manus-storage/test/${suffix}.png`, mimeType: "image/png", status: "approved", uploadedByUserId: userId, reviewedByUserId: userId, reviewedAtMs: Date.now(), createdAtMs: Date.now() });
  const assetId = Number(insertedAsset[0].insertId);
  const insertedBrief = await db.insert(campaignBriefs).values({ organizationId, name: "Approved generation brief", audience: "Qualified buyers", offer: "Explore the product", placements: ["facebook_feed"], formats: ["square_1_1"], creativeDirection: "Premium product focus", destinationUrl: "https://example.test", requiredClaims: "", assetIds: [assetId], productIds: [], status: "approved", createdByUserId: userId, approvedByUserId: userId, approvedAtMs: Date.now(), createdAtMs: Date.now(), updatedAtMs: Date.now() });
  briefId = Number(insertedBrief[0].insertId);
  const user = (await db.select().from(users).where(eq(users.id, userId)).limit(1))[0]!;
  caller = appRouter.createCaller({ user, req: { protocol: "https", headers: {} }, res: { clearCookie() {} } } as unknown as TrpcContext);
});

afterAll(cleanup);

describe("creative generation failure and retry history", () => {
  it("persists no partial variants after a failed multi-variant attempt, then retries as a new successful job", async () => {
    const db = await getDb();
    if (!db) throw new Error("Integration database unavailable");
    await expect(caller.creatives.generate({ organizationId, briefId, count: 2 })).rejects.toThrow("PNG, JPEG, or WebP");

    const failedJobs = await db.select().from(creativeJobs).where(eq(creativeJobs.organizationId, organizationId));
    expect(failedJobs).toHaveLength(1);
    expect(failedJobs[0]?.status).toBe("failed");
    expect(await db.select().from(creativeVariants).where(eq(creativeVariants.organizationId, organizationId))).toHaveLength(0);

    generationState.failSecond = false;
    generationState.calls = 0;
    await expect(caller.creatives.generate({ organizationId, briefId, count: 2 })).resolves.toMatchObject({ variantCount: 2 });

    const allJobs = await db.select().from(creativeJobs).where(eq(creativeJobs.organizationId, organizationId));
    expect(allJobs.map(job => job.status).sort()).toEqual(["completed", "failed"]);
    expect(allJobs.find(job => job.status === "failed")?.errorMessage).toContain("403");
    const variants = await db.select().from(creativeVariants).where(eq(creativeVariants.organizationId, organizationId));
    expect(variants).toHaveLength(2);
    expect(variants.every(variant => variant.status === "pending")).toBe(true);
    const events = await db.select().from(activityEvents).where(and(eq(activityEvents.organizationId, organizationId), eq(activityEvents.entityType, "creative_job")));
    expect(events.filter(event => event.action === "creative_generation.requested")).toHaveLength(2);
    expect(events.filter(event => event.action === "creative_generation.failed")).toHaveLength(1);
    expect(events.filter(event => event.action === "creative_generation.completed")).toHaveLength(1);
  });
});
