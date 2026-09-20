import { and, desc, eq, inArray } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { activityEvents, brandAssets, creativeVariants } from "../../drizzle/schema";
import { assetState, parseAssetKey, WORKFLOW_ACTIONS, type AssetKey, type LibraryAsset, type WorkflowSnapshot } from "../../shared/assetLibrary";
import { getDb } from "../db";
import { stableHash } from "./policy";
export type LibraryDatabase = NonNullable<Awaited<ReturnType<typeof getDb>>>;
export type LibraryTransaction = Parameters<Parameters<LibraryDatabase["transaction"]>[0]>[0];
type Runner = LibraryDatabase | LibraryTransaction;
export async function libraryDatabase() { const db = await getDb(); if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" }); return db; }
function libraryMetadata(metadata: Record<string, unknown> | null) {
  const raw = metadata?.library;
  const value = raw && typeof raw === "object" && !Array.isArray(raw) ? raw as Record<string, unknown> : {};
  let parentKey: AssetKey | null = null;
  if (typeof value.parentKey === "string") { try { parseAssetKey(value.parentKey); parentKey = value.parentKey as AssetKey; } catch { /* Ignore invalid legacy metadata. */ } }
  return { purpose: value.purpose === "finished" ? "finished" as const : "source" as const, isUgc: value.isUgc === true, parentKey, digest: typeof value.digest === "string" ? value.digest : null };
}
export function normalizeUpload(row: typeof brandAssets.$inferSelect, workflow?: WorkflowSnapshot): LibraryAsset {
  const metadata = libraryMetadata(row.metadata);
  const fingerprint = stableHash({ name: row.name, key: row.storageKey, mimeType: row.mimeType, type: row.type, ...metadata });
  // Legacy font records are not one of the supported media upload categories.
  // Keep their original database type and fingerprint; only normalize the UI hint.
  const sourceType = row.type === "font" ? "other" : row.type;
  return { key: `asset:${row.id}`, name: row.name, origin: "uploaded", url: row.url, mediaType: row.mimeType.startsWith("video/") ? "video" : row.mimeType.startsWith("image/") ? "image" : "other", mimeType: row.mimeType, sourceType, purpose: metadata.purpose, isUgc: metadata.isUgc, state: assetState(row.status, workflow, fingerprint), fingerprint, revision: stableHash({ fingerprint, status: row.status, event: workflow?.id ?? null }), parentKey: metadata.parentKey, createdAtMs: row.createdAtMs, reviewedAtMs: row.reviewedAtMs, reviewedByUserId: row.reviewedByUserId };
}
export function normalizeCreative(row: typeof creativeVariants.$inferSelect, workflow?: WorkflowSnapshot): LibraryAsset {
  const fingerprint = stableHash({ name: row.name, imageUrl: row.imageUrl, imageStorageKey: row.imageStorageKey, headline: row.headline, primaryText: row.primaryText, description: row.description, callToAction: row.callToAction, channel: row.channel, format: row.format, renderMetadata: row.renderMetadata });
  const copy = row.renderMetadata?.copy;
  const copyText = copy ? [copy.headline, copy.subheadline, "CTA: " + copy.cta].join("\n") : [row.primaryText, "", row.headline, row.description ?? "", "CTA: " + row.callToAction].join("\n");
  return { key: `creative:${row.id}`, name: row.name, origin: "generated", url: row.imageUrl, mediaType: "image", mimeType: "image/*", purpose: "finished", isUgc: false, state: assetState(row.status, workflow, fingerprint), fingerprint, revision: stableHash({ fingerprint, status: row.status, event: workflow?.id ?? null }), parentKey: null, createdAtMs: row.createdAtMs, reviewedAtMs: row.reviewedAtMs, reviewedByUserId: row.reviewedByUserId, headline: row.headline, primaryText: row.primaryText, format: row.format, copyText };
}
async function latestWorkflow(db: Runner, organizationId: number, key: string) { return (await db.select().from(activityEvents).where(and(eq(activityEvents.organizationId, organizationId), eq(activityEvents.entityType, "library_asset"), eq(activityEvents.entityId, key), inArray(activityEvents.action, WORKFLOW_ACTIONS))).orderBy(desc(activityEvents.id)).limit(1))[0]; }
export async function listLibrary(db: Runner, organizationId: number): Promise<LibraryAsset[]> {
  const [uploads, creatives, events] = await Promise.all([
    db.select().from(brandAssets).where(eq(brandAssets.organizationId, organizationId)),
    db.select().from(creativeVariants).where(eq(creativeVariants.organizationId, organizationId)),
    db.selectDistinctOn([activityEvents.entityId]).from(activityEvents).where(and(eq(activityEvents.organizationId, organizationId), eq(activityEvents.entityType, "library_asset"), inArray(activityEvents.action, WORKFLOW_ACTIONS))).orderBy(activityEvents.entityId, desc(activityEvents.id)),
  ]);
  const latest = new Map(events.map(event => [event.entityId, event]));
  return [...uploads.map(row => normalizeUpload(row, latest.get(`asset:${row.id}`))), ...creatives.map(row => normalizeCreative(row, latest.get(`creative:${row.id}`)))].sort((a, b) => b.createdAtMs - a.createdAtMs || a.key.localeCompare(b.key));
}
export async function readLibraryAsset(db: Runner, organizationId: number, key: string) {
  let reference; try { reference = parseAssetKey(key); } catch { throw new TRPCError({ code: "BAD_REQUEST", message: "Invalid asset reference" }); }
  const workflow = await latestWorkflow(db, organizationId, key);
  if (reference.kind === "asset") { const row = (await db.select().from(brandAssets).where(and(eq(brandAssets.organizationId, organizationId), eq(brandAssets.id, reference.id))).limit(1))[0]; if (row) return normalizeUpload(row, workflow); }
  else { const row = (await db.select().from(creativeVariants).where(and(eq(creativeVariants.organizationId, organizationId), eq(creativeVariants.id, reference.id))).limit(1))[0]; if (row) return normalizeCreative(row, workflow); }
  throw new TRPCError({ code: "NOT_FOUND", message: "Asset not found in this workspace" });
}
export async function writeAssetStatus(db: LibraryTransaction, organizationId: number, key: string, data: { status: "pending" | "approved" | "rejected"; reviewedByUserId: number | null; reviewedAtMs: number | null }) {
  const reference = parseAssetKey(key);
  if (reference.kind === "asset") await db.update(brandAssets).set(data).where(and(eq(brandAssets.organizationId, organizationId), eq(brandAssets.id, reference.id)));
  else await db.update(creativeVariants).set(data).where(and(eq(creativeVariants.organizationId, organizationId), eq(creativeVariants.id, reference.id)));
}
export function detectAssetMime(bytes: Buffer): string | null {
  if (bytes.length < 12) return null;
  if (bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return "image/png";
  if (bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) return "image/jpeg";
  if (bytes.subarray(0, 4).toString() === "RIFF" && bytes.subarray(8, 12).toString() === "WEBP") return "image/webp";
  if (["GIF87a", "GIF89a"].includes(bytes.subarray(0, 6).toString())) return "image/gif";
  if (bytes.subarray(4, 8).toString() === "ftyp" && /^(isom|iso[2-9]|mp4[12]|avc1|M4V |MSNV|dash)$/.test(bytes.subarray(8, 12).toString())) return "video/mp4";
  if (bytes.subarray(0, 4).equals(Buffer.from([26, 69, 223, 163])) && bytes.subarray(0, 4096).includes(Buffer.from("webm"))) return "video/webm";
  return null;
}
