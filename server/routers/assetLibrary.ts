import { createHash, randomUUID } from "node:crypto";
import { and, desc, eq } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import sharp from "sharp";
import { activityEvents, brandAssets, brandKits, reviewComments, users } from "../../drizzle/schema";
import { canReviewAsset, canSubmitAsset } from "../../shared/assetLibrary";
import { protectedProcedure, router } from "../_core/trpc";
import { requireOrganizationRole } from "../lib/access";
import { appendActivity, withOrganizationTransaction } from "../lib/activity";
import { detectAssetMime, libraryDatabase, listLibrary, readLibraryAsset, writeAssetStatus } from "../lib/assetLibrary";
import { assetBucket, storageClient, storagePut } from "../storage";
const scope = z.object({ organizationId: z.number().int().positive() });
const reference = scope.extend({ key: z.string().regex(/^(asset|creative):[1-9][0-9]*$/) });
const version = reference.extend({ revision: z.string().regex(/^[a-f0-9]{64}$/) });
export const assetLibraryRouter = router({
  list: protectedProcedure.input(scope).query(async ({ ctx, input }) => {
    await requireOrganizationRole(ctx.user.id, input.organizationId);
    return listLibrary(await libraryDatabase(), input.organizationId);
  }),
  history: protectedProcedure.input(reference).query(async ({ ctx, input }) => {
    await requireOrganizationRole(ctx.user.id, input.organizationId);
    const db = await libraryDatabase();
    await readLibraryAsset(db, input.organizationId, input.key);
    const events = await db.select({ id: activityEvents.id, action: activityEvents.action, payload: activityEvents.payload, createdAtMs: activityEvents.createdAtMs, author: users.name }).from(activityEvents).leftJoin(users, eq(users.id, activityEvents.actorUserId)).where(and(eq(activityEvents.organizationId, input.organizationId), eq(activityEvents.entityType, "library_asset"), eq(activityEvents.entityId, input.key))).orderBy(desc(activityEvents.id)).limit(100);
    const items = events.map(event => ({ id: `event:${event.id}`, action: event.action.replace("asset_library.", ""), body: typeof event.payload?.note === "string" ? event.payload.note : "", author: event.author ?? "Workspace member", createdAtMs: event.createdAtMs }));
    if (input.key.startsWith("creative:")) {
      const comments = await db.select({ id: reviewComments.id, body: reviewComments.body, author: users.name, createdAtMs: reviewComments.createdAtMs }).from(reviewComments).leftJoin(users, eq(users.id, reviewComments.authorUserId)).where(and(eq(reviewComments.organizationId, input.organizationId), eq(reviewComments.variantId, Number(input.key.split(":")[1])))).orderBy(desc(reviewComments.id)).limit(100);
      items.push(...comments.map(comment => ({ id: `legacy:${comment.id}`, action: "commented", body: comment.body, author: comment.author ?? "Workspace member", createdAtMs: comment.createdAtMs })));
    }
    return items.sort((a, b) => b.createdAtMs - a.createdAtMs).slice(0, 100);
  }),
  upload: protectedProcedure.input(scope.extend({ name: z.string().trim().min(1).max(180), mimeType: z.enum(["image/jpeg", "image/png", "image/webp", "image/gif", "video/mp4", "video/webm"]), base64: z.string().min(16).max(28 * 1024 * 1024), purpose: z.enum(["source", "finished"]), sourceType: z.enum(["logo", "product", "reference", "other"]).default("other"), isUgc: z.boolean().default(false), usagePermissionConfirmed: z.boolean().default(false), parentKey: z.string().regex(/^(asset|creative):[1-9][0-9]*$/).optional() })).mutation(async ({ ctx, input }) => {
    await requireOrganizationRole(ctx.user.id, input.organizationId, ["owner", "admin", "creator"]);
    if (input.isUgc && !input.usagePermissionConfirmed) throw new TRPCError({ code: "BAD_REQUEST", message: "Confirm permission to use this creator/customer content before uploading." });
    if (input.base64.length % 4 || !/^[A-Za-z0-9+/]+={0,2}$/.test(input.base64)) throw new TRPCError({ code: "BAD_REQUEST", message: "Invalid file encoding" });
    const bytes = Buffer.from(input.base64, "base64");
    const mimeType = detectAssetMime(bytes);
    if (!mimeType || mimeType !== input.mimeType) throw new TRPCError({ code: "BAD_REQUEST", message: "The file contents do not match a supported image or video format." });
    const limit = mimeType.startsWith("video/") ? 20 : 12;
    if (bytes.length > limit * 1024 * 1024) throw new TRPCError({ code: "PAYLOAD_TOO_LARGE", message: `This file must be ${limit} MB or smaller.` });
    if (mimeType.startsWith("image/")) {
      try {
        const info = await sharp(bytes, { limitInputPixels: 40_000_000 }).metadata();
        if (!info.width || !info.height || info.width * info.height > 40_000_000) throw new Error("Image too large");
      } catch { throw new TRPCError({ code: "BAD_REQUEST", message: "This image is damaged or exceeds the image-size limit." }); }
    }
    const db = await libraryDatabase();
    const kit = (await db.select().from(brandKits).where(eq(brandKits.organizationId, input.organizationId)).limit(1))[0];
    if (!kit) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Finish workspace setup before uploading assets." });
    if (input.parentKey) await readLibraryAsset(db, input.organizationId, input.parentKey);
    const extension = mimeType.split("/")[1].replace("jpeg", "jpg");
    const stored = await storagePut(`org-${input.organizationId}/library/${randomUUID()}.${extension}`, bytes, mimeType);
    try {
      return await withOrganizationTransaction(db, input.organizationId, async tx => {
        const now = Date.now();
        const [asset] = await tx.insert(brandAssets).values({ organizationId: input.organizationId, brandKitId: kit.id, name: input.name, type: input.purpose === "source" ? input.sourceType : "other", storageKey: stored.key, url: stored.url, mimeType, status: "pending", metadata: { library: { purpose: input.purpose, isUgc: input.isUgc, digest: createHash("sha256").update(bytes).digest("hex"), ...(input.isUgc ? { rightsConfirmedAtMs: now, rightsConfirmedByUserId: ctx.user.id } : {}), ...(input.parentKey ? { parentKey: input.parentKey } : {}) } }, uploadedByUserId: ctx.user.id, createdAtMs: now }).returning({ id: brandAssets.id });
        const key = `asset:${asset.id}` as const;
        await appendActivity({ organizationId: input.organizationId, actorUserId: ctx.user.id, action: "asset_library.uploaded", entityType: "library_asset", entityId: key, payload: { mimeType, purpose: input.purpose, isUgc: input.isUgc, parentKey: input.parentKey ?? null } }, tx);
        return { key };
      });
    } catch (error) {
      // Remove only this attempt's new object when its database transaction failed.
      try { await storageClient().storage.from(assetBucket()).remove([stored.key]); } catch { /* Keep the original failure. */ }
      throw error;
    }
  }),
  submit: protectedProcedure.input(version).mutation(async ({ ctx, input }) => {
    await requireOrganizationRole(ctx.user.id, input.organizationId, ["owner", "admin", "creator"]);
    return withOrganizationTransaction(await libraryDatabase(), input.organizationId, async tx => {
      const asset = await readLibraryAsset(tx, input.organizationId, input.key);
      if (asset.revision !== input.revision) throw new TRPCError({ code: "CONFLICT", message: "The asset or review status changed. Refresh before continuing." });
      if (!canSubmitAsset(asset.state)) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Only drafts or returned assets can be submitted." });
      await writeAssetStatus(tx, input.organizationId, input.key, { status: "pending", reviewedAtMs: null, reviewedByUserId: null });
      await appendActivity({ organizationId: input.organizationId, actorUserId: ctx.user.id, action: "asset_library.submitted", entityType: "library_asset", entityId: input.key, payload: { fingerprint: asset.fingerprint } }, tx);
      return { success: true };
    });
  }),
  review: protectedProcedure.input(version.extend({ decision: z.enum(["approved", "changes_requested", "rejected"]), note: z.string().trim().max(3000).default("") })).mutation(async ({ ctx, input }) => {
    await requireOrganizationRole(ctx.user.id, input.organizationId, ["owner", "admin", "reviewer"]);
    return withOrganizationTransaction(await libraryDatabase(), input.organizationId, async tx => {
      const asset = await readLibraryAsset(tx, input.organizationId, input.key);
      if (asset.revision !== input.revision) throw new TRPCError({ code: "CONFLICT", message: "The asset or review status changed. Refresh before reviewing." });
      if (!canReviewAsset(asset.state, input.decision)) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Submit this version for review first." });
      if (input.decision === "changes_requested" && !input.note) throw new TRPCError({ code: "BAD_REQUEST", message: "Describe the changes needed." });
      const now = Date.now();
      await writeAssetStatus(tx, input.organizationId, input.key, { status: input.decision === "approved" ? "approved" : "rejected", reviewedByUserId: ctx.user.id, reviewedAtMs: now });
      await appendActivity({ organizationId: input.organizationId, actorUserId: ctx.user.id, action: `asset_library.${input.decision}`, entityType: "library_asset", entityId: input.key, payload: { fingerprint: asset.fingerprint, note: input.note, purpose: asset.purpose } }, tx);
      return { success: true };
    });
  }),
  comment: protectedProcedure.input(version.extend({ body: z.string().trim().min(1).max(3000) })).mutation(async ({ ctx, input }) => {
    await requireOrganizationRole(ctx.user.id, input.organizationId);
    return withOrganizationTransaction(await libraryDatabase(), input.organizationId, async tx => {
      const asset = await readLibraryAsset(tx, input.organizationId, input.key);
      if (asset.revision !== input.revision) throw new TRPCError({ code: "CONFLICT", message: "Refresh before commenting on this version." });
      await appendActivity({ organizationId: input.organizationId, actorUserId: ctx.user.id, action: "asset_library.commented", entityType: "library_asset", entityId: input.key, payload: { note: input.body, fingerprint: asset.fingerprint } }, tx);
      return { success: true };
    });
  }),
});
