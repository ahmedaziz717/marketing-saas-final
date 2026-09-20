import { and, eq } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { campaignBriefs, creativeVariants, publishRequests } from "../../drizzle/schema";
import { creativeSetupSchema, type CreativeSetup } from "../../shared/creativeBuilder";
import { requireOrganizationRole } from "./access";
import { libraryDatabase, readLibraryAsset, type LibraryDatabase } from "./assetLibrary";
import { stableHash } from "./policy";

const generationPaths = new Set(["creatives.generate", "creativeBuilder.generate", "creativeBuilder.save", "creativeBuilder.refreshCopy"]);
const publishingPaths = new Set(["meta.createRequest", "meta.approveRequest", "meta.executeRequest"]);
const retiredReviewPaths = new Set(["brand.reviewAsset", "creatives.reviewVariant"]);
const scopedInput = z.object({ organizationId: z.number().int().positive() }).passthrough();
const positiveId = z.number().int().positive();

export function hasLibraryPolicy(path: string): boolean {
  return generationPaths.has(path) || publishingPaths.has(path) || retiredReviewPaths.has(path);
}

export async function requireApprovedLibraryAsset(
  db: LibraryDatabase,
  organizationId: number,
  key: string,
  purpose: "source" | "finished",
) {
  const asset = await readLibraryAsset(db, organizationId, key);
  if (asset.state !== "approved" || asset.purpose !== purpose) {
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message: `Review the current version of ${asset.name} in Asset Library before using it as ${purpose === "source" ? "source material" : "a finished publishing asset"}.`,
    });
  }
  return asset;
}

/** Also called by the worker: API middleware alone cannot protect queued jobs. */
export async function assertBuilderSourceApprovals(db: LibraryDatabase, organizationId: number, setup: CreativeSetup) {
  const ids = new Set<number>();
  if (setup.logoAssetId) ids.add(setup.logoAssetId);
  if (setup.person?.kind === "asset") ids.add(setup.person.assetId);
  for (const id of ids) await requireApprovedLibraryAsset(db, organizationId, `asset:${id}`, "source");
}

function readId(input: Record<string, unknown>, key: string): number {
  const result = positiveId.safeParse(input[key]);
  if (!result.success) throw new TRPCError({ code: "BAD_REQUEST", message: `A valid ${key} is required.` });
  return result.data;
}

/** Central migration boundary for old API routes that still read legacy status columns. */
export async function assertLibraryConsumer(path: string, rawInput: unknown, userId: number) {
  if (!hasLibraryPolicy(path)) return;
  const parsed = scopedInput.safeParse(rawInput);
  if (!parsed.success) throw new TRPCError({ code: "BAD_REQUEST", message: "A valid workspace is required." });
  const input = parsed.data;
  const organizationId = input.organizationId;
  await requireOrganizationRole(userId, organizationId);
  if (retiredReviewPaths.has(path)) {
    throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Asset reviews now take place in Asset Library. Open the asset, submit it for review, and review that exact version there." });
  }
  const db = await libraryDatabase();
  if (generationPaths.has(path)) {
    await requireOrganizationRole(userId, organizationId, ["owner", "admin", "creator"]);
    if (path === "creativeBuilder.save" || path === "creativeBuilder.refreshCopy") {
      const setup = creativeSetupSchema.safeParse(input.setup);
      if (!setup.success) throw new TRPCError({ code: "BAD_REQUEST", message: "A valid creative setup is required." });
      await assertBuilderSourceApprovals(db, organizationId, setup.data);
      return;
    }
    const briefId = readId(input, "briefId");
    const brief = (await db.select().from(campaignBriefs).where(and(eq(campaignBriefs.id, briefId), eq(campaignBriefs.organizationId, organizationId))).limit(1))[0];
    if (!brief) throw new TRPCError({ code: "NOT_FOUND", message: "Brief not found in this workspace." });
    if (path === "creativeBuilder.generate") {
      const setup = creativeSetupSchema.safeParse(brief.creativeSetup);
      if (!setup.success) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Save a valid creative setup before generating." });
      await assertBuilderSourceApprovals(db, organizationId, setup.data);
    } else {
      for (const assetId of new Set(brief.assetIds)) await requireApprovedLibraryAsset(db, organizationId, `asset:${assetId}`, "source");
    }
    return;
  }
  await requireOrganizationRole(userId, organizationId, path === "meta.createRequest" ? ["owner", "admin", "creator", "publisher"] : ["owner", "admin", "publisher"]);
  if (path === "meta.createRequest") {
    await requireApprovedLibraryAsset(db, organizationId, `creative:${readId(input, "variantId")}`, "finished");
    return;
  }
  const requestId = readId(input, "requestId");
  const request = (await db.select().from(publishRequests).where(and(eq(publishRequests.id, requestId), eq(publishRequests.organizationId, organizationId))).limit(1))[0];
  if (!request) throw new TRPCError({ code: "NOT_FOUND", message: "Publish request not found in this workspace." });
  await requireApprovedLibraryAsset(db, organizationId, `creative:${request.variantId}`, "finished");
  const variant = (await db.select().from(creativeVariants).where(and(eq(creativeVariants.id, request.variantId), eq(creativeVariants.organizationId, organizationId))).limit(1))[0];
  if (!variant) throw new TRPCError({ code: "NOT_FOUND", message: "Publishing asset is unavailable." });
  const frozen = request.payload.variant;
  const current = { id: variant.id, imageUrl: variant.imageUrl, primaryText: variant.primaryText, headline: variant.headline, description: variant.description, callToAction: variant.callToAction, reviewedAtMs: variant.reviewedAtMs };
  if (stableHash(frozen ?? null) !== stableHash(current)) {
    throw new TRPCError({ code: "PRECONDITION_FAILED", message: "The asset or its approval changed after this request was prepared. Create and approve a new publishing request." });
  }
}
