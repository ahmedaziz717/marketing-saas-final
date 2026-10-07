import { prepareVideoRequest } from "../lib/videoRequest";
import { providerRequestRate } from "../lib/providerQuote";
import { createHash, randomUUID } from "node:crypto";
import { and, eq, inArray, lte, gte, isNotNull, desc } from "drizzle-orm";
import { aiUsage } from "../../drizzle/platformSchema";
import { brandAssets, brandKits } from "../../drizzle/schema";
import { providerWorkers, videoJobs } from "../../drizzle/videoSchema";
import { activeVideoStatuses } from "../../shared/videoCreation";
import { appendActivity, withOrganizationTransaction } from "../lib/activity";
import { requireOrganizationRole } from "../lib/access";
import { studioRoles } from "../../shared/assetWorkflow";
import type { LibraryDatabase } from "../lib/assetLibrary";
import { creditState } from "../lib/aiMetering";
import {
  finishVideoFailure,
  getVideoJob,
  validateVideoReferences,
  validateVideoPeople,
  type VideoJob,
} from "../lib/videoJobs";
import { videoQuote } from "../lib/videoPricing";
import {
  cancelHiggsfield,
  downloadVideo,
  HiggsfieldError,
  higgsfieldConfigured,
  pollHiggsfield,
  providerUrls,
  submitHiggsfield,
  videoProviderFailureMessage,
  type HiggsfieldResult,
} from "../lib/higgsfield";
import {
  assetBucket,
  assetUrl,
  normalizeStorageKey,
  storageClient,
} from "../storage";
import { mp4Info } from "../lib/videoMedia";
import { videoFailureDiagnostic } from "../lib/videoDiagnostics";

export async function videoWorkerHeartbeat(db: LibraryDatabase) {
  const value = {
    id: "higgsfield",
    ready: higgsfieldConfigured() ? 1 : 0,
    heartbeatAtMs: Date.now(),
  };
  await db
    .insert(providerWorkers)
    .values(value)
    .onConflictDoUpdate({ target: providerWorkers.id, set: value });
}

/** Recover the reason for previously failed jobs. This only GETs an existing
 * request; it never resubmits generation, changes outcome, or touches credits.
 */
export async function refreshFailedVideoDiagnostic(db: LibraryDatabase) {
  if (!higgsfieldConfigured()) return;
  const legacyError =
    "The provider could not generate this video. AI credits refunded.";
  const [job] = await db
    .select()
    .from(videoJobs)
    .where(
      and(
        eq(videoJobs.status, "failed"),
        eq(videoJobs.error, legacyError),
        isNotNull(videoJobs.providerRequestId),
        isNotNull(videoJobs.providerStatusUrl),
        gte(videoJobs.updatedAtMs, Date.now() - 7 * 86400000),
        lte(videoJobs.nextPollAtMs, Date.now())
      )
    )
    .orderBy(desc(videoJobs.updatedAtMs))
    .limit(1);
  if (!job) return;
  const guard = and(
    eq(videoJobs.id, job.id),
    eq(videoJobs.status, "failed"),
    eq(videoJobs.error, legacyError)
  );
  try {
    const result = await pollHiggsfield(
      job.providerRequestId!,
      job.providerStatusUrl!
    );
    if (["failed", "nsfw", "canceled"].includes(result.status)) {
      await db
        .update(videoJobs)
        .set({ error: videoProviderFailureMessage(result) })
        .where(guard);
      return;
    }
  } catch {
    // A missing/temporarily unavailable provider record must not alter billing.
  }
  await db
    .update(videoJobs)
    .set({ nextPollAtMs: Date.now() + 3600000 })
    .where(guard);
}
async function updateLeased(
  db: LibraryDatabase,
  job: VideoJob,
  update: Partial<typeof videoJobs.$inferInsert>
) {
  const [saved] = await db
    .update(videoJobs)
    .set({ ...update, updatedAtMs: Date.now() })
    .where(
      and(eq(videoJobs.id, job.id), eq(videoJobs.leaseOwner, job.leaseOwner!))
    )
    .returning();
  if (!saved)
    throw new Error("Video worker lease no longer belongs to this process");
  return saved;
}
async function release(
  db: LibraryDatabase,
  job: VideoJob,
  update: Partial<typeof videoJobs.$inferInsert>
) {
  return updateLeased(db, job, {
    ...update,
    leaseOwner: null,
    leaseUntilMs: 0,
  });
}
async function terminal(
  db: LibraryDatabase,
  job: VideoJob,
  status: "failed" | "canceled",
  message: string
) {
  await withOrganizationTransaction(db, job.organizationId, async tx => {
    const current = await getVideoJob(tx, job.organizationId, job.id);
    if (current.leaseOwner !== job.leaseOwner) return;
    await finishVideoFailure(tx, current, status, message);
  });
}
async function recordProviderResult(
  db: LibraryDatabase,
  job: VideoJob,
  result: HiggsfieldResult
) {
  const urls = providerUrls(result);
  job = await updateLeased(db, job, urls);
  if (["failed", "nsfw", "canceled"].includes(result.status)) {
    await terminal(
      db,
      job,
      result.status === "canceled" ? "canceled" : "failed",
      videoProviderFailureMessage(result)
    );
    return;
  }
  if (result.status === "completed") {
    await withOrganizationTransaction(db, job.organizationId, async tx => {
      const current = await getVideoJob(tx, job.organizationId, job.id);
      if (current.leaseOwner !== job.leaseOwner) return;
      const [usage] = await tx
        .select()
        .from(aiUsage)
        .where(eq(aiUsage.id, job.id));
      const quote = usage?.rateSnapshot
        ? videoQuote(job.setup, job.references, usage.rateSnapshot)
        : null;
      await tx
        .update(aiUsage)
        .set({
          status: "succeeded",
          finishedAtMs: Date.now(),
          costMicros: quote?.costMicros ?? null,
          usage: {
            providerRequestId: result.request_id,
            costBasis:
              usage?.rateSnapshot?.costBasis ?? "published_rate_estimate",
            source: "higgsfield",
            ...quote,
          },
        })
        .where(eq(aiUsage.id, job.id));
      await tx
        .update(videoJobs)
        .set({
          status: result.video?.url ? "saving" : "attention",
          outputUrl: result.video?.url ?? null,
          error: result.video?.url
            ? null
            : "Generation completed, but no download URL was returned. Contact your administrator; do not submit another paid request.",
          requestBody: null,
          attempts: 0,
          leaseOwner: null,
          leaseUntilMs: 0,
          nextPollAtMs: 0,
          updatedAtMs: Date.now(),
        })
        .where(eq(videoJobs.id, job.id));
    });
    return;
  }
  await release(db, job, {
    status: "generating",
    error: job.error?.startsWith("Generation has already started")
      ? job.error
      : null,
    attempts: 0,
    nextPollAtMs: Date.now() + 12000,
  });
}
async function saveOutput(db: LibraryDatabase, job: VideoJob) {
  if (!job.outputUrl) throw new Error("Output URL unavailable");
  const bytes = await downloadVideo(job.outputUrl),
    info = mp4Info(bytes);
  const key = normalizeStorageKey(
    `org-${job.organizationId}/video/${job.id}.mp4`
  );
  // A deterministic, job-owned path survives a crash between upload and DB commit.
  // The asset becomes reviewable only after the transaction below commits.
  const { error } = await storageClient()
    .storage.from(assetBucket())
    .upload(key, bytes, { contentType: "video/mp4", upsert: true });
  if (error)
    throw new Error("Generated video storage is temporarily unavailable");
  await withOrganizationTransaction(db, job.organizationId, async tx => {
    const current = await getVideoJob(tx, job.organizationId, job.id);
    if (current.leaseOwner !== job.leaseOwner || current.outputAssetId) return;
    const [kit] = await tx
      .select()
      .from(brandKits)
      .where(eq(brandKits.organizationId, job.organizationId));
    if (!kit) throw new Error("Workspace brand kit is unavailable");
    const now = Date.now();
    const [asset] = await tx
      .insert(brandAssets)
      .values({
        organizationId: job.organizationId,
        brandKitId: kit.id,
        name: job.setup.title,
        type: "other",
        storageKey: key,
        url: assetUrl(key),
        mimeType: "video/mp4",
        status: "pending",
        metadata: {
          ...info,
          campaignPlanId: job.setup.campaignPlanId,
          generatedVideo: {
            jobId: job.id,
            provider: "higgsfield",
            requestId: job.providerRequestId,
          },
          library: {
            purpose: "finished",
            isUgc: false,
            digest: createHash("sha256").update(bytes).digest("hex"),
          },
        },
        uploadedByUserId: job.actorUserId,
        createdAtMs: now,
      })
      .returning();
    const [usage] = await tx
      .select()
      .from(aiUsage)
      .where(eq(aiUsage.id, job.id));
    if (usage?.rateSnapshot) {
      const quote = videoQuote(
        job.setup,
        job.references,
        usage.rateSnapshot,
        info
      );
      await tx
        .update(aiUsage)
        .set({
          credits: job.credits,
          costMicros: quote.costMicros,
          usage: {
            ...usage.usage,
            ...quote,
            reservedCredits: job.credits,
            retailMicros:
              job.credits * (usage.rateSnapshot.creditValueMicros ?? 10000),
            credits: job.credits,
            outputWidth: info.width,
            outputHeight: info.height,
            outputDurationSeconds: info.durationSeconds,
            costBasis:
              usage?.rateSnapshot?.costBasis ?? "published_rate_estimate",
          },
        })
        .where(eq(aiUsage.id, job.id));
    }
    await tx
      .update(videoJobs)
      .set({
        status: "completed",
        credits: job.credits,
        outputAssetId: asset.id,
        outputUrl: null,
        requestBody: null,
        error: null,
        leaseOwner: null,
        leaseUntilMs: 0,
        updatedAtMs: now,
      })
      .where(eq(videoJobs.id, job.id));
    await appendActivity(
      {
        organizationId: job.organizationId,
        actorUserId: job.actorUserId,
        action: "video.completed",
        entityType: "library_asset",
        entityId: `asset:${asset.id}`,
        payload: {
          jobId: job.id,
          durationSeconds: info.durationSeconds,
          state: "draft",
        },
      },
      tx
    );
  });
}

export async function processNextVideoJob(db: LibraryDatabase) {
  if (!higgsfieldConfigured()) return false;
  const now = Date.now();
  let job = await db.transaction(async tx => {
    const [next] = await tx
      .select()
      .from(videoJobs)
      .where(
        and(
          inArray(videoJobs.status, activeVideoStatuses),
          lte(videoJobs.nextPollAtMs, now),
          lte(videoJobs.leaseUntilMs, now)
        )
      )
      .orderBy(videoJobs.nextPollAtMs, videoJobs.createdAtMs)
      .limit(1)
      .for("update", { skipLocked: true });
    if (!next) return null;
    const [claimed] = await tx
      .update(videoJobs)
      .set({ leaseOwner: randomUUID(), leaseUntilMs: now + 300000 })
      .where(eq(videoJobs.id, next.id))
      .returning();
    return claimed;
  });
  if (!job) return false;
  try {
    if (job.status === "saving") {
      await saveOutput(db, job);
      return true;
    }
    if (
      job.cancelRequested &&
      !job.providerRequestId &&
      (job.status === "queued" || !job.attempts)
    ) {
      await terminal(
        db,
        job,
        "canceled",
        "Canceled before generation. AI credits refunded."
      );
      return true;
    }
    if (job.status === "queued") {
      try {
        await requireOrganizationRole(job.actorUserId, job.organizationId, [
          ...studioRoles,
        ]);
        if ((await creditState(db, job.organizationId)).account?.aiPaused)
          throw new Error("AI generation is paused.");
        await validateVideoPeople(db, job.organizationId, {
          ...job.setup,
          people: job.setup.people ?? [],
        });
        await validateVideoReferences(db, job);
      } catch {
        await terminal(
          db,
          job,
          "failed",
          "Workspace access, AI availability, or reference assets changed before generation. AI credits refunded."
        );
        return true;
      }
      const request =
        job.requestBody ??
        (await prepareVideoRequest(
          job.organizationId,
          job.setup,
          job.references
        ));
      const [usage] = await db
        .select()
        .from(aiUsage)
        .where(eq(aiUsage.id, job.id));
      if (!usage?.rateSnapshot)
        throw new Error("The saved credit quote is unavailable.");
      // Includes legacy queued jobs. Recheck before paid submission; never silently
      // increase the accepted charge if the account price/settings have changed.
      try {
        const currentRate = await providerRequestRate(
          usage.rateSnapshot,
          job.endpoint!,
          request
        );
        const currentCredits = videoQuote(
          job.setup,
          job.references,
          currentRate
        ).credits;
        if (currentCredits !== job.credits)
          throw new Error("Credit price changed");
        await db
          .update(aiUsage)
          .set({ rateSnapshot: currentRate })
          .where(eq(aiUsage.id, job.id));
      } catch {
        await terminal(
          db,
          job,
          "failed",
          "The credit quote could not be confirmed. Request a new quote and try again. AI credits refunded."
        );
        return true;
      }
      // Persist the exact URLs and body before the first network submission.
      // Idempotent replays must not regenerate signed URLs or change URL ordering.
      await release(db, job, {
        status: "submitting",
        requestBody: request,
        requestPreparedAtMs: job.requestPreparedAtMs ?? Date.now(),
        attempts: 0,
        nextPollAtMs: 0,
      });
      return true;
    }
    if (job.status === "submitting") {
      if (!job.attempts) {
        try {
          await requireOrganizationRole(job.actorUserId, job.organizationId, [
            ...studioRoles,
          ]);
          if ((await creditState(db, job.organizationId)).account?.aiPaused)
            throw new Error("AI paused");
          await validateVideoPeople(db, job.organizationId, {
            ...job.setup,
            people: job.setup.people ?? [],
          });
          await validateVideoReferences(db, job);
        } catch {
          await terminal(
            db,
            job,
            "failed",
            "Workspace access, AI availability, or reference assets changed before submission. AI credits refunded."
          );
          return true;
        }
      }
      if (!job.requestBody || !job.endpoint)
        throw new Error("Generation request snapshot is unavailable");
      if (Date.now() - (job.requestPreparedAtMs ?? 0) > 20 * 3600000) {
        await release(db, job, {
          status: "attention",
          error:
            "This request needs administrator reconciliation before retrying. Its reference links have expired; we have not submitted a replacement request.",
        });
        return true;
      }
      job = await updateLeased(db, job, { attempts: job.attempts + 1 });
      await recordProviderResult(
        db,
        job,
        await submitHiggsfield(job.endpoint!, job.requestBody!, job.id)
      );
      return true;
    }
    if (!job.providerRequestId || !job.providerStatusUrl)
      throw new Error("Provider request ID is unavailable");
    const result = await pollHiggsfield(
      job.providerRequestId,
      job.providerStatusUrl
    );
    if (
      job.cancelRequested &&
      result.status === "queued" &&
      job.providerCancelUrl
    ) {
      try {
        await cancelHiggsfield(job.providerRequestId, job.providerCancelUrl);
      } catch (error) {
        if (!(error instanceof HiggsfieldError && error.status === 400))
          throw error;
      }
      await release(db, job, { nextPollAtMs: Date.now() + 8000 });
      return true;
    }
    if (job.cancelRequested && result.status === "in_progress")
      job = await updateLeased(db, job, {
        cancelRequested: 0,
        error:
          "Generation has already started, so the provider cannot cancel it.",
      });
    await recordProviderResult(db, job, result);
  } catch (error) {
    console.error(
      JSON.stringify({
        event: "video.processing_error",
        jobId: job.id,
        phase: job.status,
        attempt: job.attempts,
        diagnostic: videoFailureDiagnostic(error),
      })
    );
    if (
      error instanceof HiggsfieldError &&
      !error.ambiguous &&
      job.status === "submitting" &&
      job.attempts === 1
    ) {
      await terminal(
        db,
        job,
        "failed",
        error.message + " AI credits refunded."
      );
    } else if (job.status === "queued" && job.attempts >= 7) {
      await terminal(
        db,
        job,
        "failed",
        "The reference files could not be prepared. No generation was submitted. AI credits refunded."
      );
    } else {
      const attempts = job.attempts + 1;
      const attention = attempts >= 8;
      const message =
        job.status === "saving"
          ? "Your video was generated, but saving it needs another attempt. Checking again will not generate or charge for a second video."
          : attention
            ? "Automatic checks could not confirm this request’s outcome. Check the same request again or contact your administrator. Your credits remain reserved while the outcome is unknown."
            : error instanceof HiggsfieldError
              ? error.message
              : "This video request needs another status check. We will resume the same job.";
      await release(db, job, {
        attempts,
        status: attention ? "attention" : job.status,
        error: message,
        nextPollAtMs:
          Date.now() + Math.min(300000, 10000 * 2 ** Math.min(attempts, 5)),
      });
    }
  }
  return true;
}
