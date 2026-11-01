import { and, eq } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { activityEvents, organizationMemberships } from "../../drizzle/schema";
import {
  authoringOAuthGrants,
  creativeWorkflowRuns,
} from "../../drizzle/workflowSchema";
import { aiUsage } from "../../drizzle/platformSchema";
import { videoJobs } from "../../drizzle/videoSchema";
import type { McpVideoPolicy } from "../../shared/mcpVideoPolicy";
import {
  videoEndpoint,
  type VideoSetup,
  type VideoReference,
} from "../../shared/videoCreation";
import type { CreativeWorkflowRun } from "./creativeWorkflows";
import type { DraftTransaction } from "./mcpDraftReceipt";
import type { LibraryDatabase } from "./assetLibrary";
import type { VideoJob } from "./videoJobs";
import { membershipAuthorization } from "./access";
import { mcpScopeRoles } from "./mcpScopeRoles";
import { stableHash } from "./policy";
import { withOrganizationTransaction } from "./activity";
import { guardMcpWorkflowStep } from "./mcpWorkflowExecution";

function deny(): never {
  throw new TRPCError({
    code: "FORBIDDEN",
    message:
      "Video execution approval, connection, inputs or budget changed. Prepare a new reviewed run.",
  });
}
async function receipt(
  tx: DraftTransaction,
  run: CreativeWorkflowRun,
  action: string
) {
  return (
    await tx
      .select()
      .from(activityEvents)
      .where(
        and(
          eq(activityEvents.organizationId, run.organizationId),
          eq(activityEvents.actorUserId, run.actorUserId),
          eq(activityEvents.correlationId, run.id),
          eq(activityEvents.action, action)
        )
      )
      .limit(1)
  )[0]?.payload;
}
async function authorize(
  tx: DraftTransaction,
  p: McpVideoPolicy,
  run: CreativeWorkflowRun
) {
  const i = p.identity;
  if (
    !i ||
    p.version !== 1 ||
    i.userId !== run.actorUserId ||
    i.organizationId !== run.organizationId ||
    run.stopRequested ||
    !["queued", "running"].includes(run.status)
  )
    deny();
  const [member] = await tx
    .select()
    .from(organizationMemberships)
    .where(
      and(
        eq(organizationMemberships.organizationId, i.organizationId),
        eq(organizationMemberships.userId, i.userId)
      )
    )
    .for("share");
  const [grant] = await tx
    .select()
    .from(authoringOAuthGrants)
    .where(
      and(
        eq(authoringOAuthGrants.id, i.connectionId),
        eq(authoringOAuthGrants.organizationId, i.organizationId),
        eq(authoringOAuthGrants.userId, i.userId)
      )
    )
    .for("share");
  if (
    !grant ||
    grant.revokedAtMs ||
    grant.expiresAtMs <= Date.now() ||
    grant.resource !== i.resource ||
    !["workflows:read", "workflows:execute", "creatives:generate_video"].every(
      s => grant.scope.split(" ").includes(s)
    )
  )
    deny();
  for (const roles of [
    ["owner", "admin", "creator"] as const,
    mcpScopeRoles(grant.scope),
  ]) {
    if (
      !membershipAuthorization({
        membership: member,
        userId: i.userId,
        organizationId: i.organizationId,
        allowedRoles: [...roles],
      }).allowed
    )
      deny();
  }
  const queued = await receipt(tx, run, "mcp.execution.queued");
  const approved = await receipt(tx, run, "mcp.execution.approved");
  if (
    !queued ||
    !approved ||
    stableHash(queued.identity) !== stableHash(i) ||
    queued.hash !== p.approvalHash ||
    approved.hash !== p.approvalHash ||
    approved.maxCredits !== p.maxCredits ||
    queued.maxCredits !== p.maxCredits ||
    queued.graphHash !== stableHash(run.graph) ||
    queued.referencesHash !== stableHash(run.references) ||
    stableHash(queued.creditsByNode) !== stableHash(run.creditsByNode) ||
    stableHash(queued.context) !== p.contextHash
  )
    deny();
  const total = Object.values(run.creditsByNode).reduce(
    (sum, value) => sum + value,
    0
  );
  if (
    !Number.isSafeInteger(total) ||
    total < 0 ||
    total > p.maxCredits ||
    !Number.isSafeInteger(p.credits) ||
    p.credits < 0 ||
    run.creditsByNode[p.nodeId] !== p.credits ||
    !run.graph.nodes.some(n => n.id === p.nodeId && n.type === "generate_video")
  )
    deny();
}
export async function createMcpVideoDraftPolicy(
  tx: DraftTransaction,
  run: CreativeWorkflowRun,
  nodeId: string,
  setup: VideoSetup
): Promise<McpVideoPolicy | null> {
  const queued = await receipt(tx, run, "mcp.execution.queued");
  if (!queued) return null;
  const p: McpVideoPolicy = {
    version: 1,
    state: "draft",
    identity: queued.identity as McpVideoPolicy["identity"],
    parentRunId: run.id,
    nodeId,
    approvalHash: String(queued.hash),
    setupHash: stableHash(setup),
    contextHash: stableHash(queued.context),
    credits: run.creditsByNode[nodeId],
    maxCredits: Number(queued.maxCredits),
  };
  await authorize(tx, p, run);
  return p;
}
async function parent(tx: DraftTransaction, job: VideoJob) {
  const p = job.mcpPolicy;
  if (!p || !["draft", "bound"].includes(p.state)) deny();
  const [run] = await tx
    .select()
    .from(creativeWorkflowRuns)
    .where(
      and(
        eq(creativeWorkflowRuns.id, p.parentRunId),
        eq(creativeWorkflowRuns.organizationId, job.organizationId)
      )
    )
    .limit(1);
  if (
    !run ||
    job.actorUserId !== run.actorUserId ||
    stableHash(job.setup) !== p.setupHash ||
    run.steps[p.nodeId]?.videoJobId !== job.id
  )
    deny();
  await authorize(tx, p, run);
  return run;
}
export function mcpVideoRateHash(rate: unknown) {
  const { quotedAtMs: _time, ...pricing } = (rate ?? {}) as Record<
    string,
    unknown
  >;
  return stableHash(pricing);
}
export async function bindMcpVideoPolicy(
  tx: DraftTransaction,
  job: VideoJob,
  input: {
    references: VideoReference[];
    requestBody: Record<string, unknown>;
    credits: number;
    rateSnapshot: unknown;
  }
): Promise<McpVideoPolicy | null> {
  if (!job.mcpPolicy) return null;
  const run = await parent(tx, job);
  if (
    input.references.some(
      ref =>
        !run.references.some(
          approved =>
            approved.key === ref.key && stableHash(approved) === stableHash(ref)
        )
    )
  )
    deny();
  if (input.credits !== job.mcpPolicy.credits) deny();
  const bound: McpVideoPolicy = {
    ...job.mcpPolicy,
    state: "bound",
    referencesHash: stableHash(input.references),
    requestHash: stableHash(input.requestBody),
    rateHash: mcpVideoRateHash(input.rateSnapshot),
  };
  if (
    job.mcpPolicy.state === "bound" &&
    stableHash(bound) !== stableHash(job.mcpPolicy)
  )
    deny();
  return bound;
}
export async function authorizeMcpVideoEnqueue(
  db: LibraryDatabase,
  job: VideoJob,
  userId: number
) {
  if (!job.mcpPolicy) return;
  if (userId !== job.actorUserId) deny();
  const run = await withOrganizationTransaction(db, job.organizationId, tx =>
    parent(tx, job)
  );
  const context = await guardMcpWorkflowStep(
    db,
    run,
    job.mcpPolicy.nodeId,
    false
  );
  if (!context || stableHash(context) !== job.mcpPolicy.contextHash) deny();
  return context;
}
export async function guardMcpVideoSubmission(
  db: LibraryDatabase,
  job: VideoJob
) {
  if (!job.mcpPolicy) return;
  await authorizeMcpVideoEnqueue(db, job, job.actorUserId);
  await withOrganizationTransaction(db, job.organizationId, async tx => {
    const [fresh] = await tx
      .select()
      .from(videoJobs)
      .where(
        and(
          eq(videoJobs.id, job.id),
          eq(videoJobs.organizationId, job.organizationId)
        )
      )
      .limit(1);
    if (
      !fresh ||
      fresh.leaseOwner !== job.leaseOwner ||
      fresh.attempts ||
      fresh.providerRequestId ||
      stableHash(fresh.mcpPolicy) !== stableHash(job.mcpPolicy)
    )
      deny();
    await parent(tx, fresh);
    const p = fresh.mcpPolicy!;
    const [usage] = await tx
      .select()
      .from(aiUsage)
      .where(
        and(
          eq(aiUsage.id, job.id),
          eq(aiUsage.organizationId, job.organizationId)
        )
      )
      .limit(1);
    if (
      p.state !== "bound" ||
      fresh.endpoint !== videoEndpoint(fresh.setup) ||
      !fresh.requestBody ||
      p.referencesHash !== stableHash(fresh.references) ||
      p.requestHash !== stableHash(fresh.requestBody) ||
      p.credits !== fresh.credits ||
      !usage?.rateSnapshot ||
      usage.credits !== p.credits ||
      usage.actorUserId !== job.actorUserId ||
      usage.status !== "pending" ||
      p.rateHash !== mcpVideoRateHash(usage.rateSnapshot)
    )
      deny();
  });
}
export async function authorizeMcpVideoEnqueueInTransaction(
  tx: DraftTransaction,
  job: VideoJob,
  userId: number
) {
  if (!job.mcpPolicy) return;
  if (userId !== job.actorUserId) deny();
  await parent(tx, job);
}
