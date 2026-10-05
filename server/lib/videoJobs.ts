import { and, eq, inArray } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { brandAssets, creativeVariants } from "../../drizzle/schema";
import { aiUsage, creditLedger } from "../../drizzle/platformSchema";
import { providerWorkers, videoJobs } from "../../drizzle/videoSchema";
import { parseAssetKey } from "../../shared/assetLibrary";
import {
  videoSetupProblem,
  defaultVideoSetup,
  ugcGenerationMessage,
  type VideoReference,
  type VideoSetup,
} from "../../shared/videoCreation";
import { personReferenceKey } from "../../shared/creativeBuilder";
import { findLifestylePerson } from "../../shared/lifestylePeople";
import {
  readLibraryAsset,
  type LibraryDatabase,
  type LibraryTransaction,
} from "./assetLibrary";
import { storageGetBase64 } from "../storage";
import { mp4Info } from "./videoMedia";
import { higgsfieldConfigured } from "./higgsfield";
import { appendActivity } from "./activity";
import { readVideoCatalogImage } from "./videoCatalog";

export type VideoJob = typeof videoJobs.$inferSelect;
export function publicVideoJob(job: VideoJob) {
  return {
    id: job.id,
    setup: {
      ...defaultVideoSetup,
      ...job.setup,
      direction: job.setup.direction ?? null,
    },
    revision: job.revision,
    status: job.status,
    credits: job.credits,
    error: job.error,
    cancelRequested: !!job.cancelRequested,
    assetKey: job.outputAssetId ? `asset:${job.outputAssetId}` : null,
    createdAtMs: job.createdAtMs,
    updatedAtMs: job.updatedAtMs,
  };
}
export function requireProductVideo(setup: VideoSetup) {
  if (setup.category === "ugc")
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message: ugcGenerationMessage,
    });
}

/** Saved portraits must be approved references owned by this workspace. */
export async function validateVideoPeople(
  db: LibraryDatabase | LibraryTransaction,
  organizationId: number,
  setup: VideoSetup
) {
  const ids = setup.people.flatMap(person =>
    person.kind === "asset" ? [person.assetId] : []
  );
  const rows = ids.length
    ? await db
        .select()
        .from(brandAssets)
        .where(
          and(
            eq(brandAssets.organizationId, organizationId),
            inArray(brandAssets.id, ids),
            eq(brandAssets.type, "reference"),
            eq(brandAssets.status, "approved")
          )
        )
    : [];
  const identities = new Set<string>();
  for (const person of setup.people) {
    let identity = personReferenceKey(person);
    if (person.kind === "asset") {
      const asset = rows.find(row => row.id === person.assetId);
      if (!asset || asset.metadata?.kind !== "lifestyle_person")
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "Choose an approved model from this workspace.",
        });
      const libraryPerson =
        typeof asset.metadata.libraryId === "string"
          ? findLifestylePerson(asset.metadata.libraryId)
          : undefined;
      if (libraryPerson) identity = `library:${libraryPerson.id}`;
    }
    if (identities.has(identity))
      throw new TRPCError({
        code: "BAD_REQUEST",
        message:
          "Choose different models; a saved favorite and its library portrait are the same person.",
      });
    identities.add(identity);
  }
}
export async function videoReadiness(db: LibraryDatabase | LibraryTransaction) {
  const [worker] = await db
    .select()
    .from(providerWorkers)
    .where(eq(providerWorkers.id, "higgsfield"));
  const ready =
    higgsfieldConfigured() &&
    worker?.ready === 1 &&
    Date.now() - worker.heartbeatAtMs < 90000;
  return {
    ready,
    reason: ready
      ? null
      : "Video generation is awaiting administrator setup. You can save a draft while it is being connected.",
  };
}
export async function getVideoJob(
  db: LibraryDatabase | LibraryTransaction,
  organizationId: number,
  id: string
) {
  const [job] = await db
    .select()
    .from(videoJobs)
    .where(
      and(eq(videoJobs.id, id), eq(videoJobs.organizationId, organizationId))
    );
  if (!job)
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "Video not found in this workspace.",
    });
  return job;
}
export async function resolveVideoReferences(
  db: LibraryDatabase | LibraryTransaction,
  organizationId: number,
  setup: VideoSetup
) {
  const problem = videoSetupProblem(setup);
  if (problem) throw new TRPCError({ code: "BAD_REQUEST", message: problem });
  const refs: VideoReference[] = [];
  const keys = [
    ...setup.imageKeys,
    ...(setup.mode !== "create" && setup.sourceVideoKey
      ? [setup.sourceVideoKey]
      : []),
  ];
  for (const key of keys) {
    if (key.startsWith("product_image:")) {
      refs.push(
        (await readVideoCatalogImage(db, organizationId, key)).reference
      );
      continue;
    }
    const asset = await readLibraryAsset(db, organizationId, key),
      video = key === setup.sourceVideoKey && setup.mode !== "create";
    if (
      video
        ? asset.mimeType !== "video/mp4"
        : asset.mediaType !== "image" || asset.mimeType === "image/gif"
    )
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: video
          ? "Choose an MP4 source video."
          : "Choose JPEG, PNG, or WebP reference images.",
      });
    if (["rejected", "changes_requested"].includes(asset.state))
      throw new TRPCError({
        code: "PRECONDITION_FAILED",
        message: `Resolve the review feedback on “${asset.name}” before using it as a reference.`,
      });
    const parsed = parseAssetKey(key);
    const row =
      parsed.kind === "asset"
        ? (
            await db
              .select()
              .from(brandAssets)
              .where(
                and(
                  eq(brandAssets.organizationId, organizationId),
                  eq(brandAssets.id, parsed.id)
                )
              )
          )[0]
        : null;
    const creative =
      parsed.kind === "creative"
        ? (
            await db
              .select()
              .from(creativeVariants)
              .where(
                and(
                  eq(creativeVariants.organizationId, organizationId),
                  eq(creativeVariants.id, parsed.id)
                )
              )
          )[0]
        : null;
    const storageKey = row?.storageKey ?? creative?.imageStorageKey;
    if (!storageKey)
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "This reference needs to be saved to the workspace first.",
      });
    let timing: { durationSeconds?: number; width?: number; height?: number } =
      {};
    if (video) {
      const savedDuration = Number(row?.metadata?.durationSeconds);
      if (savedDuration > 0 && asset.width && asset.height)
        timing = {
          durationSeconds: savedDuration,
          width: asset.width,
          height: asset.height,
        };
      else {
        try {
          timing = mp4Info(
            Buffer.from(
              await storageGetBase64(storageKey, 20 * 1024 * 1024),
              "base64"
            )
          );
        } catch {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message:
              "The source video’s timing could not be read. Upload an MP4 clip of 4–30 seconds, up to 20 MB.",
          });
        }
      }
      if (
        !timing.durationSeconds ||
        timing.durationSeconds < 4 ||
        timing.durationSeconds > 30
      )
        throw new TRPCError({
          code: "BAD_REQUEST",
          message:
            "Use a source clip between 4 and 30 seconds. Trim longer videos before uploading.",
        });
    }
    refs.push({
      key,
      storageKey,
      fingerprint: asset.fingerprint,
      name: asset.name,
      mimeType: asset.mimeType,
      width: asset.width,
      height: asset.height,
      ...timing,
    });
  }
  return refs;
}
export async function validateVideoReferences(
  db: LibraryDatabase | LibraryTransaction,
  job: Pick<VideoJob, "organizationId" | "references">
) {
  for (const ref of job.references) {
    if (ref.key.startsWith("product_image:")) {
      const current = await readVideoCatalogImage(
        db,
        job.organizationId,
        ref.key
      );
      if (current.reference.fingerprint !== ref.fingerprint)
        throw new Error(
          "A product reference changed. Prepare a new draft with the current product images."
        );
      continue;
    }
    const asset = await readLibraryAsset(db, job.organizationId, ref.key);
    if (
      asset.fingerprint !== ref.fingerprint ||
      ["rejected", "changes_requested"].includes(asset.state)
    )
      throw new Error(
        "A reference changed or was rejected. Prepare a new draft with the current assets."
      );
  }
}
/** Only confirmed terminal failures/cancellations refund. Unknown provider outcomes retain the reservation. */
export async function finishVideoFailure(
  tx: LibraryTransaction,
  job: VideoJob,
  status: "failed" | "canceled",
  message: string
) {
  const [usage] = await tx.select().from(aiUsage).where(eq(aiUsage.id, job.id));
  if (usage?.status === "succeeded")
    throw new Error(
      "A completed provider request cannot be refunded as a failed request"
    );
  const now = Date.now();
  await tx
    .update(videoJobs)
    .set({
      status,
      error: message,
      requestBody: null,
      leaseOwner: null,
      leaseUntilMs: 0,
      updatedAtMs: now,
    })
    .where(eq(videoJobs.id, job.id));
  if (usage) {
    await tx
      .update(aiUsage)
      .set({
        status: "failed",
        costMicros: 0,
        finishedAtMs: now,
        usage: { outcome: status, providerRequestId: job.providerRequestId },
      })
      .where(eq(aiUsage.id, job.id));
    await tx
      .insert(creditLedger)
      .values({
        id: `refund:${job.id}`,
        organizationId: job.organizationId,
        actorUserId: job.actorUserId,
        period: usage.period,
        amount: usage.credits,
        reason: `Video generation ${status}: credit refund`,
        createdAtMs: now,
      })
      .onConflictDoNothing();
  }
  await appendActivity(
    {
      organizationId: job.organizationId,
      actorUserId: job.actorUserId,
      action: `video.${status}`,
      entityType: "video_job",
      entityId: job.id,
      outcome: status === "failed" ? "failure" : "success",
      payload: { creditsRefunded: usage?.credits ?? 0 },
    },
    tx
  );
}
