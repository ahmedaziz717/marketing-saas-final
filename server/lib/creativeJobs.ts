import { and, eq, lt } from "drizzle-orm";
import { creativeJobs } from "../../drizzle/schema";
import { getDb } from "../db";
import { appendActivity } from "./activity";

export const CREATIVE_JOB_LEASE_MS = 10 * 60 * 1000;
type Database = NonNullable<Awaited<ReturnType<typeof getDb>>>;

// A process restart must not leave an attempt permanently blocking its saved setup.
export async function recoverExpiredBuilderJobs(
  db: Database,
  organizationId: number
) {
  await db.transaction(async tx => {
    const expired = await tx
      .select()
      .from(creativeJobs)
      .where(
        and(
          eq(creativeJobs.organizationId, organizationId),
          eq(creativeJobs.status, "running"),
          lt(creativeJobs.leaseExpiresAtMs, Date.now())
        )
      )
      .for("update");
    for (const job of expired) {
      await tx
        .update(creativeJobs)
        .set({
          status: "failed",
          errorMessage: "Generation timed out after interruption",
          leaseExpiresAtMs: null,
          completedAtMs: Date.now(),
        })
        .where(eq(creativeJobs.id, job.id));
      await appendActivity(
        {
          organizationId,
          actorUserId: job.requestedByUserId,
          action: "creative_generation.failed",
          entityType: "creative_job",
          entityId: job.id,
          outcome: "failure",
          payload: { category: "timeout" },
        },
        tx
      );
    }
  });
}

export async function renewBuilderJob(
  db: Database,
  organizationId: number,
  jobId: number
) {
  const updated = await db
    .update(creativeJobs)
    .set({ leaseExpiresAtMs: Date.now() + CREATIVE_JOB_LEASE_MS })
    .where(
      and(
        eq(creativeJobs.id, jobId),
        eq(creativeJobs.organizationId, organizationId),
        eq(creativeJobs.status, "running")
      )
    );
  if (!updated[0].affectedRows)
    throw new Error("Generation attempt was interrupted");
}
