import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { activityEvents, brandAssets, brandKits, campaignBriefs, creativeJobs, creativeVariants, metaConnections, organizationMemberships, organizations, publishRequests, users } from "../drizzle/schema";
import { defaultCreativeSetup } from "../shared/creativeBuilder";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";
import { getDb } from "./db";
import { assertBuilderSourceApprovals, assertLibraryConsumer, hasLibraryPolicy, requireApprovedLibraryAsset } from "./lib/assetApproval";
import { stableHash } from "./lib/policy";

let organizationId = 0, userId = 0, sourceId = 0, finishedId = 0, briefId = 0, variantId = 0, connectionId = 0;
let caller: ReturnType<typeof appRouter.createCaller>;
const database = async () => { const db = await getDb(); if (!db) throw new Error("Use an isolated test database"); return db; };
const asset = async (key: string) => {
  const row = (await caller.assetLibrary.studioList({ organizationId })).find(row => row.key === key);
  if (!row) throw new Error("Test asset missing");
  return row;
};
const approve = async (key: string) => {
  const draft = await asset(key);
  await caller.assetLibrary.submit({ organizationId, key, revision: draft.revision });
  const submitted = await asset(key);
  await caller.assetLibrary.review({ organizationId, key, revision: submitted.revision, decision: "approved" });
};

beforeAll(async () => {
  const db = await database(), now = Date.now(), suffix = randomUUID();
  const [user] = await db.insert(users).values({ openId: `approval-${suffix}`, name: "Approval test", email: "approval@example.test", loginMethod: "test" }).returning();
  userId = user.id;
  const [organization] = await db.insert(organizations).values({ name: "Approval integration", slug: `approval-${suffix}`, createdByUserId: userId, createdAtMs: now }).returning();
  organizationId = organization.id;
  await db.insert(organizationMemberships).values({ userId, organizationId, role: "owner", status: "active", createdAtMs: now });
  const [kit] = await db.insert(brandKits).values({ organizationId, name: "Approval brand", colors: ["#ffffff"], fonts: ["Inter"], status: "active", updatedByUserId: userId, updatedAtMs: now }).returning();
  const inserts = await db.insert(brandAssets).values(["source", "finished"].map(purpose => ({ organizationId, brandKitId: kit.id, name: `${purpose}.png`, type: "logo" as const, storageKey: `org-${organizationId}/${purpose}.png`, url: `/media/org-${organizationId}/${purpose}.png`, mimeType: "image/png", status: "pending" as const, metadata: { library: { purpose } }, uploadedByUserId: userId, createdAtMs: now }))).returning();
  sourceId = inserts[0].id; finishedId = inserts[1].id;
  const [brief] = await db.insert(campaignBriefs).values({ organizationId, name: "Approval brief", audience: "Test", offer: "Test", placements: ["facebook_feed"], formats: ["square_1_1"], creativeDirection: "Test", assetIds: [sourceId], productIds: [], status: "approved", createdByUserId: userId, createdAtMs: now, updatedAtMs: now }).returning();
  briefId = brief.id;
  const [job] = await db.insert(creativeJobs).values({ organizationId, briefId, inputHash: stableHash({ fixture: suffix }), briefSnapshot: {}, assetSnapshot: [], requestedByUserId: userId, createdAtMs: now, status: "completed" }).returning();
  const [variant] = await db.insert(creativeVariants).values({ organizationId, briefId, jobId: job.id, name: "Finished creative", concept: "Test", primaryText: "Original text", headline: "Original headline", description: "Original description", callToAction: "LEARN_MORE", format: "square_1_1", channel: "meta", imageUrl: `/media/org-${organizationId}/creative.png`, imageStorageKey: `org-${organizationId}/creative.png`, createdAtMs: now, status: "pending" }).returning();
  variantId = variant.id;
  const [connection] = await db.insert(metaConnections).values({ organizationId, adAccountId: "123456789", pageId: "987654321", connectedByUserId: userId, status: "connected", updatedAtMs: now }).returning();
  connectionId = connection.id;
  caller = appRouter.createCaller({ user, req: {}, res: {} } as TrpcContext);
});
afterAll(async () => {
  if (!organizationId) return;
  const db = await database();
  for (const table of [activityEvents, publishRequests, metaConnections, creativeVariants, creativeJobs, campaignBriefs, brandAssets, brandKits, organizationMemberships]) await db.delete(table).where(eq(table.organizationId, organizationId));
  await db.delete(organizations).where(eq(organizations.id, organizationId));
  await db.delete(users).where(eq(users.id, userId));
});
describe.sequential("library approval consumers", () => {
  it("leaves unrelated routes outside the compatibility policy", () => { expect(hasLibraryPolicy("auth.me")).toBe(false); expect(hasLibraryPolicy("assetLibrary.review")).toBe(false); expect(hasLibraryPolicy("meta.executeRequest")).toBe(true); });
  it("rejects the old Brand direct-approval endpoint", async () => { await expect(caller.brand.reviewAsset({ organizationId, assetId: sourceId, decision: "approved" })).rejects.toMatchObject({ code: "PRECONDITION_FAILED" }); expect((await asset(`asset:${sourceId}`)).state).toBe("draft"); });
  it("rejects the old Creative direct-approval endpoint", async () => { await expect(caller.creatives.reviewVariant({ organizationId, variantId, decision: "approved" })).rejects.toMatchObject({ code: "PRECONDITION_FAILED" }); expect((await asset(`creative:${variantId}`)).state).toBe("draft"); });
  it("accepts source material only after explicit library review", async () => { await approve(`asset:${sourceId}`); await expect(assertLibraryConsumer("creatives.generate", { organizationId, briefId }, userId)).resolves.toBeUndefined(); });
  it("does not allow approved finished content as a source asset", async () => { await approve(`asset:${finishedId}`); await expect(requireApprovedLibraryAsset(await database(), organizationId, `asset:${finishedId}`, "source")).rejects.toMatchObject({ code: "PRECONDITION_FAILED" }); });
  it("blocks an altered source even while its old status says approved", async () => { const db = await database(); await db.update(brandAssets).set({ name: "Altered source" }).where(eq(brandAssets.id, sourceId)); await expect(assertLibraryConsumer("creatives.generate", { organizationId, briefId }, userId)).rejects.toMatchObject({ code: "PRECONDITION_FAILED" }); await expect(caller.creatives.generate({ organizationId, briefId, count: 2 })).rejects.toMatchObject({ code: "PRECONDITION_FAILED" }); });
  it("also blocks stale approvals when a queued worker starts", async () => { const setup = { ...defaultCreativeSetup(), logoAssetId: sourceId }; await expect(assertBuilderSourceApprovals(await database(), organizationId, setup)).rejects.toMatchObject({ code: "PRECONDITION_FAILED" }); });
  it("accepts the modified source after a fresh submission and review", async () => { await approve(`asset:${sourceId}`); await expect(assertBuilderSourceApprovals(await database(), organizationId, { ...defaultCreativeSetup(), logoAssetId: sourceId })).resolves.toBeUndefined(); });
  it("blocks a foreign workspace before inspecting assets", async () => { await expect(assertLibraryConsumer("meta.createRequest", { organizationId: organizationId + 1000000, variantId }, userId)).rejects.toMatchObject({ code: "FORBIDDEN" }); });
  it("validates new publishing assets using the library state", async () => { await expect(assertLibraryConsumer("meta.createRequest", { organizationId, variantId }, userId)).rejects.toMatchObject({ code: "PRECONDITION_FAILED" }); await approve(`creative:${variantId}`); await expect(assertLibraryConsumer("meta.createRequest", { organizationId, variantId }, userId)).resolves.toBeUndefined(); });
  it("rejects a publishing payload with stale creative text", async () => {
    const db = await database();
    const [variant] = await db.select().from(creativeVariants).where(eq(creativeVariants.id, variantId));
    const payload = { name: "Original request", variant: { id: variant.id, imageUrl: variant.imageUrl, primaryText: "Different unapproved text", headline: variant.headline, description: variant.description, callToAction: variant.callToAction, reviewedAtMs: variant.reviewedAtMs } };
    const [request] = await db.insert(publishRequests).values({ organizationId, variantId, connectionId, action: "create", payload, payloadHash: stableHash(payload), status: "awaiting_approval", createdByUserId: userId, createdAtMs: Date.now(), updatedAtMs: Date.now() }).returning();
    await expect(assertLibraryConsumer("meta.approveRequest", { organizationId, requestId: request.id }, userId)).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
    payload.variant.primaryText = variant.primaryText;
    await db.update(publishRequests).set({ payload, payloadHash: stableHash(payload) }).where(eq(publishRequests.id, request.id));
    await expect(assertLibraryConsumer("meta.approveRequest", { organizationId, requestId: request.id }, userId)).resolves.toBeUndefined();
  });
  it("rejects revocation before publishing", async () => { const current = await asset(`creative:${variantId}`); await caller.assetLibrary.review({ organizationId, key: current.key, revision: current.revision, decision: "changes_requested", note: "New image needed" }); await expect(assertLibraryConsumer("meta.createRequest", { organizationId, variantId }, userId)).rejects.toMatchObject({ code: "PRECONDITION_FAILED" }); });
});
