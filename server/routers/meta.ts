import { and, desc, eq } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { campaignBriefs, creativeVariants, metaConnections, publishRequests } from "../../drizzle/schema";
import { protectedProcedure, router } from "../_core/trpc";
import { getDb } from "../db";
import { requireOrganizationRole } from "../lib/access";
import { appendActivity } from "../lib/activity";
import { extractUploadedImageHash, postMeta, validateMetaToken } from "../lib/metaGraph";
import { canExecutePublish, stableHash } from "../lib/policy";
import { decryptToken, encryptToken } from "../lib/secureToken";
import { storageGetSignedUrl } from "../storage";

const requestPayloadSchema = z.object({
  name: z.string().min(2).max(100),
  destinationUrl: z.string().url(),
  adSetId: z.string().min(4).max(120).optional(),
  adId: z.string().min(4).max(120).optional(),
});

export const metaRouter = router({
  overview: protectedProcedure.input(z.object({ organizationId: z.number().int().positive() })).query(async ({ ctx, input }) => {
    await requireOrganizationRole(ctx.user.id, input.organizationId);
    const db = await getDb(); if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    const [connection, requests, variants] = await Promise.all([
      db.select({ id: metaConnections.id, organizationId: metaConnections.organizationId, adAccountId: metaConnections.adAccountId, pageId: metaConnections.pageId, instagramActorId: metaConnections.instagramActorId, status: metaConnections.status, connectedAtMs: metaConnections.connectedAtMs, updatedAtMs: metaConnections.updatedAtMs }).from(metaConnections).where(eq(metaConnections.organizationId, input.organizationId)).limit(1),
      db.select().from(publishRequests).where(eq(publishRequests.organizationId, input.organizationId)).orderBy(desc(publishRequests.createdAtMs)),
      db.select().from(creativeVariants).where(and(eq(creativeVariants.organizationId, input.organizationId), eq(creativeVariants.status, "approved"))).orderBy(desc(creativeVariants.reviewedAtMs)),
    ]);
    return { connection: connection[0] ?? null, requests, variants };
  }),

  connect: protectedProcedure.input(z.object({ organizationId: z.number().int().positive(), adAccountId: z.string().min(4).max(100), pageId: z.string().min(4).max(100), instagramActorId: z.string().max(100).optional(), accessToken: z.string().min(20) })).mutation(async ({ ctx, input }) => {
    await requireOrganizationRole(ctx.user.id, input.organizationId, ["owner", "admin"]);
    const db = await getDb(); if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    try {
      const identity = await validateMetaToken(input.accessToken);
      const encrypted = encryptToken(input.accessToken);
      const now = Date.now();
      await db.insert(metaConnections).values({ organizationId: input.organizationId, adAccountId: input.adAccountId.replace(/^act_/, ""), pageId: input.pageId, instagramActorId: input.instagramActorId || null, accessTokenCiphertext: encrypted.ciphertext, tokenIv: encrypted.iv, tokenTag: encrypted.tag, status: "connected", connectedByUserId: ctx.user.id, connectedAtMs: now, updatedAtMs: now }).onDuplicateKeyUpdate({ set: { adAccountId: input.adAccountId.replace(/^act_/, ""), pageId: input.pageId, instagramActorId: input.instagramActorId || null, accessTokenCiphertext: encrypted.ciphertext, tokenIv: encrypted.iv, tokenTag: encrypted.tag, status: "connected", connectedByUserId: ctx.user.id, connectedAtMs: now, updatedAtMs: now } });
      await appendActivity({ organizationId: input.organizationId, actorUserId: ctx.user.id, action: "meta.connected", entityType: "meta_connection", entityId: input.adAccountId, payload: { adAccountId: input.adAccountId.replace(/^act_/, ""), pageId: input.pageId, validatedIdentityId: identity.id, validatedIdentityName: identity.name } });
      return { success: true, identityName: identity.name ?? "Meta user" };
    } catch (error) {
      await appendActivity({ organizationId: input.organizationId, actorUserId: ctx.user.id, action: "meta.connection_failed", entityType: "meta_connection", entityId: input.adAccountId, outcome: "failure", payload: { message: error instanceof Error ? error.message : "Validation failed" } });
      throw new TRPCError({ code: "BAD_REQUEST", message: error instanceof Error ? error.message : "Meta connection validation failed" });
    }
  }),

  createRequest: protectedProcedure.input(z.object({ organizationId: z.number().int().positive(), variantId: z.number().int().positive(), action: z.enum(["create", "update"]), payload: requestPayloadSchema })).mutation(async ({ ctx, input }) => {
    await requireOrganizationRole(ctx.user.id, input.organizationId, ["owner", "admin", "creator", "publisher"]);
    const db = await getDb(); if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    const variant = (await db.select().from(creativeVariants).where(and(eq(creativeVariants.id, input.variantId), eq(creativeVariants.organizationId, input.organizationId))).limit(1))[0];
    const connection = (await db.select().from(metaConnections).where(eq(metaConnections.organizationId, input.organizationId)).limit(1))[0];
    if (!variant || variant.status !== "approved") throw new TRPCError({ code: "PRECONDITION_FAILED", message: "The creative must be approved before a publish request can be created" });
    if (!connection || connection.status !== "connected") throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Connect a Meta ad account first" });
    if (input.action === "create" && !input.payload.adSetId) throw new TRPCError({ code: "BAD_REQUEST", message: "An ad set ID is required to create an ad" });
    if (input.action === "update" && !input.payload.adId) throw new TRPCError({ code: "BAD_REQUEST", message: "An ad ID is required to update an ad" });
    const frozenPayload = { ...input.payload, variant: { id: variant.id, imageUrl: variant.imageUrl, primaryText: variant.primaryText, headline: variant.headline, description: variant.description, callToAction: variant.callToAction, reviewedAtMs: variant.reviewedAtMs } };
    const payloadHash = stableHash(frozenPayload);
    const now = Date.now();
    const inserted = await db.insert(publishRequests).values({ organizationId: input.organizationId, variantId: variant.id, connectionId: connection.id, action: input.action, payload: frozenPayload, payloadHash, status: "awaiting_approval", createdByUserId: ctx.user.id, createdAtMs: now, updatedAtMs: now });
    const requestId = Number(inserted[0].insertId);
    await appendActivity({ organizationId: input.organizationId, actorUserId: ctx.user.id, action: "publish_request.created", entityType: "publish_request", entityId: requestId, payload: { action: input.action, variantId: variant.id, payloadHash } });
    return { requestId };
  }),

  approveRequest: protectedProcedure.input(z.object({ organizationId: z.number().int().positive(), requestId: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
    await requireOrganizationRole(ctx.user.id, input.organizationId, ["owner", "admin", "publisher"]);
    const db = await getDb(); if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    const request = (await db.select().from(publishRequests).where(and(eq(publishRequests.id, input.requestId), eq(publishRequests.organizationId, input.organizationId))).limit(1))[0];
    if (!request || request.status !== "awaiting_approval") throw new TRPCError({ code: "PRECONDITION_FAILED", message: "This request is not awaiting approval" });
    const currentHash = stableHash(request.payload);
    if (currentHash !== request.payloadHash) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "The request payload changed and cannot be approved" });
    await db.update(publishRequests).set({ status: "approved", approvedHash: currentHash, approvedByUserId: ctx.user.id, approvedAtMs: Date.now(), updatedAtMs: Date.now() }).where(eq(publishRequests.id, input.requestId));
    await appendActivity({ organizationId: input.organizationId, actorUserId: ctx.user.id, action: "publish_request.approved", entityType: "publish_request", entityId: input.requestId, payload: { approvedHash: currentHash } });
    return { success: true };
  }),

  executeRequest: protectedProcedure.input(z.object({ organizationId: z.number().int().positive(), requestId: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
    await requireOrganizationRole(ctx.user.id, input.organizationId, ["owner", "admin", "publisher"]);
    const db = await getDb(); if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    const request = (await db.select().from(publishRequests).where(and(eq(publishRequests.id, input.requestId), eq(publishRequests.organizationId, input.organizationId))).limit(1))[0];
    if (!request) throw new TRPCError({ code: "NOT_FOUND" });
    const variant = (await db.select().from(creativeVariants).where(and(eq(creativeVariants.id, request.variantId), eq(creativeVariants.organizationId, input.organizationId))).limit(1))[0];
    const connection = (await db.select().from(metaConnections).where(and(eq(metaConnections.id, request.connectionId), eq(metaConnections.organizationId, input.organizationId))).limit(1))[0];
    if (!variant || !connection) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Publishing dependencies are unavailable" });
    const currentHash = stableHash(request.payload);
    if (!canExecutePublish({ requestStatus: request.status, creativeStatus: variant.status, payloadHash: currentHash, approvedHash: request.approvedHash, connectionStatus: connection.status })) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Publishing is blocked because approval, creative status, connection status, or the frozen payload no longer matches" });
    if (!connection.accessTokenCiphertext || !connection.tokenIv || !connection.tokenTag || !connection.pageId) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "The Meta connection is incomplete" });
    const payload = request.payload as { name: string; destinationUrl: string; adSetId?: string; adId?: string; variant: { imageUrl: string } };
    const accessToken = decryptToken({ ciphertext: connection.accessTokenCiphertext, iv: connection.tokenIv, tag: connection.tokenTag });
    await db.update(publishRequests).set({ status: "publishing", publishedByUserId: ctx.user.id, updatedAtMs: Date.now() }).where(eq(publishRequests.id, request.id));
    await appendActivity({ organizationId: input.organizationId, actorUserId: ctx.user.id, action: "publish.execution_started", entityType: "publish_request", entityId: request.id, payload: { action: request.action, approvedHash: request.approvedHash } });
    try {
      const imageKey = variant.imageUrl.replace(/^\/manus-storage\//, "");
      const imageUrl = variant.imageUrl.startsWith("/manus-storage/") ? await storageGetSignedUrl(imageKey) : variant.imageUrl;
      const imageResponse = await fetch(imageUrl);
      if (!imageResponse.ok) throw new Error("Approved creative image could not be retrieved");
      const imageBytes = Buffer.from(await imageResponse.arrayBuffer()).toString("base64");
      const imageUpload = await postMeta(`act_${connection.adAccountId}/adimages`, accessToken, { bytes: imageBytes });
      const imageHash = extractUploadedImageHash(imageUpload);
      await appendActivity({ organizationId: input.organizationId, actorUserId: ctx.user.id, action: "meta.image_uploaded", entityType: "publish_request", entityId: request.id, payload: { imageHash } });

      const objectStorySpec = { page_id: connection.pageId, link_data: { image_hash: imageHash, link: payload.destinationUrl, message: variant.primaryText, name: variant.headline, description: variant.description || "", call_to_action: { type: variant.callToAction, value: { link: payload.destinationUrl } } }, ...(connection.instagramActorId ? { instagram_actor_id: connection.instagramActorId } : {}) };
      const creativeResult = await postMeta(`act_${connection.adAccountId}/adcreatives`, accessToken, { name: `${payload.name} · Frame creative`, object_story_spec: JSON.stringify(objectStorySpec) });
      const creativeId = String(creativeResult.id || "");
      if (!creativeId) throw new Error("Meta did not return a creative ID");
      await appendActivity({ organizationId: input.organizationId, actorUserId: ctx.user.id, action: "meta.creative_created", entityType: "publish_request", entityId: request.id, payload: { creativeId } });

      const adResult = request.action === "create"
        ? await postMeta(`act_${connection.adAccountId}/ads`, accessToken, { name: payload.name, adset_id: payload.adSetId!, creative: JSON.stringify({ creative_id: creativeId }), status: "PAUSED" })
        : await postMeta(payload.adId!, accessToken, { name: payload.name, creative: JSON.stringify({ creative_id: creativeId }), status: "PAUSED" });
      const adId = String(adResult.id || payload.adId || "");
      await db.update(publishRequests).set({ status: "published", metaObjectId: adId, result: { creativeId, adId, status: "PAUSED" }, updatedAtMs: Date.now() }).where(eq(publishRequests.id, request.id));
      await appendActivity({ organizationId: input.organizationId, actorUserId: ctx.user.id, action: request.action === "create" ? "meta.ad_created" : "meta.ad_updated", entityType: "publish_request", entityId: request.id, payload: { creativeId, adId, status: "PAUSED" } });
      return { success: true, creativeId, adId, status: "PAUSED" as const };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Meta publishing failed";
      await db.update(publishRequests).set({ status: "failed", result: { error: message }, updatedAtMs: Date.now() }).where(eq(publishRequests.id, request.id));
      await appendActivity({ organizationId: input.organizationId, actorUserId: ctx.user.id, action: "publish.execution_failed", entityType: "publish_request", entityId: request.id, outcome: "failure", payload: { message } });
      throw new TRPCError({ code: "BAD_GATEWAY", message: `Meta publishing failed safely: ${message}` });
    }
  }),
});
