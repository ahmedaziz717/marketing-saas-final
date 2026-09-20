import { and, asc, eq, sql } from "drizzle-orm";
import { creativeJobs } from "../../drizzle/schema";
import { creativeSetupSchema } from "../../shared/creativeBuilder";
import { getDb } from "../db";
import { requireOrganizationRole } from "../lib/access";
import { assertBuilderSourceApprovals } from "../lib/assetApproval";
import { appendActivity, withOrganizationTransaction } from "../lib/activity";
import { CREATIVE_JOB_LEASE_MS, recoverExpiredBuilderJobs } from "../lib/creativeJobs";
import { stableHash } from "../lib/policy";
import { loadInputs, runBuilderJob } from "../routers/creativeBuilder";

type Database = NonNullable<Awaited<ReturnType<typeof getDb>>>;

export async function claimBuilderJob(db: Database) {
  return db.transaction(async tx => {
    const [job] = await tx.select().from(creativeJobs).where(and(
      eq(creativeJobs.status, "queued"),
      sql`${creativeJobs.briefSnapshot}->>'kind' = 'builder_v1'`,
    )).orderBy(asc(creativeJobs.createdAtMs), asc(creativeJobs.id)).limit(1).for("update", { skipLocked: true });
    if (!job) return null;
    await tx.update(creativeJobs).set({ status: "running", leaseExpiresAtMs: Date.now() + CREATIVE_JOB_LEASE_MS }).where(eq(creativeJobs.id, job.id));
    return job;
  });
}

export async function processNextBuilderJob(db: Database) {
  const job = await claimBuilderJob(db);
  if (!job) return false;
  try {
    await requireOrganizationRole(job.requestedByUserId, job.organizationId, ["owner", "admin", "creator"]);
    const setup = creativeSetupSchema.parse(job.briefSnapshot.setup);
    await assertBuilderSourceApprovals(db, job.organizationId, setup);
    const resolved = await loadInputs(db, job.organizationId, setup);
    if (stableHash(resolved) !== stableHash(job.briefSnapshot.resolved)) {
      throw new Error("Selected source data changed while this job was queued. Review the setup and retry.");
    }
    await runBuilderJob(db, { organizationId: job.organizationId, actorUserId: job.requestedByUserId, briefId: job.briefId, jobId: job.id, setup, resolved });
  } catch {
    await withOrganizationTransaction(db, job.organizationId, async tx => {
      const changed = await tx.update(creativeJobs).set({ status: "failed", leaseExpiresAtMs: null, completedAtMs: Date.now(), errorMessage: "Queued generation could not be started. Review the source approvals and setup, then retry." })
        .where(and(eq(creativeJobs.id, job.id), eq(creativeJobs.status, "running"))).returning({ id: creativeJobs.id });
      if (changed.length) await appendActivity({ organizationId: job.organizationId, actorUserId: job.requestedByUserId, action: "creative_generation.failed", entityType: "creative_job", entityId: job.id, outcome: "failure", payload: { category: "queue_start" } }, tx);
    });
  }
  return true;
}

export async function recoverInterruptedJobs(db: Database) {
  const organizations = await db.selectDistinct({ id: creativeJobs.organizationId }).from(creativeJobs)
    .where(and(eq(creativeJobs.status, "running"), sql`${creativeJobs.leaseExpiresAtMs} < ${Date.now()}`));
  for (const { id } of organizations) await recoverExpiredBuilderJobs(db, id);
}
