import { and, eq, inArray } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import {
  activityEvents,
  organizationMemberships,
  brandKits,
} from "../../drizzle/schema";
import {
  authoringOAuthGrants,
  creativeWorkflowRuns,
} from "../../drizzle/workflowSchema";
import {
  isGenerationNode,
  type WorkflowGraph,
} from "../../shared/creativeWorkflow";
import { workflowRunOccupiesSlot } from "../../shared/workflowRunActivity";
import { membershipAuthorization } from "./access";
import { appendActivity, withOrganizationTransaction } from "./activity";
import { aiScope, creditState } from "./aiMetering";
import { getDb } from "../db";
import {
  prepareWorkflowRun,
  type CreativeWorkflowRun,
} from "./creativeWorkflows";
import { resolveWorkflowApps } from "./workflowApps";
import { stableHash } from "./policy";
import { mcpScopeRoles } from "./mcpScopeRoles";
import { resolvedPrompts } from "./promptRegistry";
import type { ResolvedPrompt } from "../../shared/promptRegistry";
import { workflowRunOverridesSchema } from "../../shared/workflowRunInput";
import { resolveRunnableWorkflow } from "./workflowRunInput";

type DB = NonNullable<Awaited<ReturnType<typeof getDb>>>;
type Tx = Parameters<Parameters<DB["transaction"]>[0]>[0];
export type McpExecutionIdentity = {
  userId: number;
  organizationId: number;
  connectionId: string;
  resource: string;
};
const scope = z
  .object({ organizationId: z.number().int().positive() })
  .strict();
export const executionPrepareInput = scope
  .extend({
    id: z.string().uuid(),
    revision: z.number().int().positive(),
    appVersionId: z.string().uuid().optional(),
    inputs: workflowRunOverridesSchema.optional(),
    requestId: z.string().uuid(),
    maxCredits: z.number().int().min(0).max(10000),
  })
  .strict();
export const executionReferenceInput = scope
  .extend({ requestId: z.string().uuid() })
  .strict();
export const executionRunInput = executionReferenceInput
  .extend({ hash: z.string().regex(/^[a-f0-9]{64}$/) })
  .strict();
export const executionApprovalInput = executionRunInput
  .extend({ maxCredits: z.number().int().min(0).max(10000) })
  .strict();
const PREPARED = "mcp.execution.prepared",
  APPROVED = "mcp.execution.approved",
  QUEUED = "mcp.execution.queued",
  ATTEMPT = "mcp.execution.attempt";
const allowed = new Set([
  "text",
  "image",
  "combine",
  "output",
  "assistant",
  "optimize_copy",
  "generate_image",
  "generate_video",
  "app_input",
  "app_output",
]);
function fail(
  message: string,
  code: "FORBIDDEN" | "CONFLICT" | "BAD_REQUEST" | "NOT_FOUND" = "FORBIDDEN"
): never {
  throw new TRPCError({ code, message });
}
export function assertDraftOnlyExecutionGraph(graph: WorkflowGraph) {
  if (!graph.nodes.length || graph.nodes.some(n => !allowed.has(n.type)))
    fail(
      "This execution path supports content-only graphs. Publishing, business actions, schedules and unknown steps are unavailable.",
      "BAD_REQUEST"
    );
  if (
    graph.nodes.some(
      n => n.config.connectionId || n.config.field?.kind === "connection"
    )
  )
    fail(
      "External destinations are not permitted in a content-only run.",
      "BAD_REQUEST"
    );
  if (
    graph.nodes.some(
      n =>
        n.config.performanceRequest ||
        n.config.field?.kind === "performance_data" ||
        n.config.optimizer
    )
  )
    fail(
      "Dynamic performance/business configuration is not permitted in a content-only run.",
      "BAD_REQUEST"
    );
  if (
    graph.nodes.some(
      n =>
        n.config.sourceVideoKey ||
        n.config.scheduledAtMs ||
        n.config.trigger ||
        n.config.destinationUrl
    )
  )
    fail(
      "Video sources, destinations and schedule configuration are unavailable for content-only execution.",
      "BAD_REQUEST"
    );
  executionReviewConfig(graph);
  for (const video of graph.nodes.filter(n => n.type === "generate_video")) {
    const visited = new Set<string>();
    const pending = [video.id];
    while (pending.length) {
      const id = pending.pop()!;
      if (visited.has(id)) continue;
      visited.add(id);
      for (const edge of graph.edges.filter(e => e.target === id)) {
        const source = graph.nodes.find(n => n.id === edge.source);
        if (
          source &&
          ["generate_image", "generate_video"].includes(source.type)
        )
          fail(
            "Video inputs must use stored media. Finish upstream media generation, then prepare a new run with its actual reference.",
            "BAD_REQUEST"
          );
        pending.push(edge.source);
      }
    }
  }
}

function executionReviewConfig(graph: WorkflowGraph) {
  for (const node of graph.nodes) {
    for (const [key, value] of [
      node.config.modelOptions ?? {},
      ...Object.values(node.config.field?.modelSettings ?? {}),
    ].flatMap(options => Object.entries(options))) {
      if (
        /(?:secret|password|token|api.?key|authorization|webhook|callback|url)/i.test(
          key
        )
      )
        fail(
          "Credential, callback and URL model options are not permitted in MCP content execution.",
          "BAD_REQUEST"
        );
      if (typeof value === "string" && /https?:\/\//i.test(value))
        fail(
          "Use workspace image references instead of model-option URLs.",
          "BAD_REQUEST"
        );
    }
  }
  // Every execution-relevant content setting is shown intact. No provider
  // reference URLs/storage keys are copied from run.references into the review.
  const review = {
    nodes: graph.nodes.map(n => ({
      id: n.id,
      title: n.title,
      type: n.type,
      config: {
        text: n.config.text,
        modelId: n.config.modelId ?? null,
        modelOptions: n.config.modelOptions ?? null,
        imageKey: n.config.imageKey,
        field: n.config.field ?? null,
        fieldValue: n.config.fieldValue ?? null,
        inputType: n.config.inputType ?? null,
        outputType: n.config.outputType ?? null,
        inputMapping: n.config.inputMapping ?? null,
        ratio: n.config.ratio,
        duration: n.config.duration,
        resolution: n.config.resolution,
        useBrand: n.config.useBrand,
        direction: n.config.direction,
      },
    })),
    edges: graph.edges,
  };
  if (Buffer.byteLength(JSON.stringify(review), "utf8") > 128 * 1024)
    fail(
      "The execution configuration exceeds the complete review limit. Split this workflow before requesting approval.",
      "BAD_REQUEST"
    );
  return review;
}
async function database() {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  return db;
}
async function authorize(
  tx: Tx,
  identity: McpExecutionIdentity,
  organizationId: number
) {
  if (identity.organizationId !== organizationId)
    fail("Connection belongs to another workspace.");
  const [member] = await tx
    .select()
    .from(organizationMemberships)
    .where(
      and(
        eq(organizationMemberships.organizationId, organizationId),
        eq(organizationMemberships.userId, identity.userId)
      )
    )
    .for("share");
  if (
    !membershipAuthorization({
      membership: member,
      userId: identity.userId,
      organizationId,
      allowedRoles: ["owner", "admin", "creator"],
    }).allowed
  )
    fail("Active creator access is required.");
  const [grant] = await tx
    .select()
    .from(authoringOAuthGrants)
    .where(
      and(
        eq(authoringOAuthGrants.id, identity.connectionId),
        eq(authoringOAuthGrants.organizationId, organizationId),
        eq(authoringOAuthGrants.userId, identity.userId)
      )
    )
    .for("share");
  if (
    !grant ||
    grant.revokedAtMs ||
    grant.expiresAtMs <= Date.now() ||
    grant.resource !== identity.resource ||
    !["workflows:read", "workflows:execute"].every(s =>
      grant.scope.split(" ").includes(s)
    )
  )
    fail("Execution connection expired, was revoked, or lacks permission.");
  if (
    !membershipAuthorization({
      membership: member,
      userId: identity.userId,
      organizationId,
      allowedRoles: mcpScopeRoles(grant.scope),
    }).allowed
  )
    fail(
      "Membership no longer permits all permissions granted to this connection."
    );
  return grant;
}
async function authorizeVideoGraph(
  tx: Tx,
  identity: McpExecutionIdentity,
  graph: WorkflowGraph
) {
  const grant = await authorize(tx, identity, identity.organizationId);
  if (
    graph.nodes.some(n => n.type === "generate_video") &&
    !grant.scope.split(" ").includes("creatives:generate_video")
  )
    fail(
      "Video generation requires the separately consented creatives:generate_video permission."
    );
}
async function event(
  tx: Tx,
  identity: McpExecutionIdentity,
  requestId: string,
  action: string
) {
  return (
    await tx
      .select()
      .from(activityEvents)
      .where(
        and(
          eq(activityEvents.organizationId, identity.organizationId),
          eq(activityEvents.actorUserId, identity.userId),
          eq(activityEvents.correlationId, requestId),
          eq(activityEvents.action, action)
        )
      )
      .limit(1)
  )[0];
}
async function record(
  tx: Tx,
  identity: McpExecutionIdentity,
  requestId: string,
  action: string,
  payload: Record<string, unknown>
) {
  await appendActivity(
    {
      organizationId: identity.organizationId,
      actorUserId: identity.userId,
      correlationId: requestId,
      entityType: "mcp_execution",
      entityId: requestId,
      action,
      payload,
    },
    tx
  );
}
type Plan = {
  identity: McpExecutionIdentity;
  input: z.infer<typeof executionPrepareInput>;
  requestHash: string;
  sourceGraphHash: string;
  hash: string;
  expiresAt: number;
  prepared: Awaited<ReturnType<typeof prepareWorkflowRun>>;
  context: McpExecutionContext;
};
export type McpExecutionContext = {
  brand: typeof brandKits.$inferSelect | null;
  prompts: ResolvedPrompt[];
};
async function executionContext(
  tx: Tx,
  organizationId: number,
  graph: WorkflowGraph
): Promise<McpExecutionContext> {
  const ids = new Set<string>();
  for (const n of graph.nodes) {
    if (n.type === "assistant") ids.add("workflow.assistant");
    if (n.type === "optimize_copy") ids.add("workflow.optimizeCopy");
    if (n.type === "generate_image" || n.type === "generate_video") {
      ids.add(
        n.type === "generate_video" ? "video.direction" : "workflow.image"
      );
      if (n.config.useBrand) ids.add("brand.summary");
      if (n.config.direction)
        for (const id of [
          `creative.theme.${n.config.direction.theme}`,
          `creative.mood.${n.config.direction.mood}`,
          `creative.style.${n.config.direction.artStyle}`,
        ])
          ids.add(id);
    }
  }
  const [brand] = await tx
    .select()
    .from(brandKits)
    .where(eq(brandKits.organizationId, organizationId))
    .limit(1);
  return {
    brand: brand ?? null,
    prompts: (await resolvedPrompts(organizationId, tx)).filter(row =>
      ids.has(row.id)
    ),
  };
}
function publicPlan(plan: Plan) {
  const brand = plan.context.brand;
  const reviewConfig = {
    ...executionReviewConfig(plan.prepared.graph),
    brand: brand
      ? {
          name: brand.name,
          voice: brand.voice,
          businessProfile: brand.businessProfile,
          colors: brand.colors,
          requiredClaims: brand.requiredClaims,
          prohibitedContent: brand.prohibitedContent,
          status: brand.status,
          updatedAtMs: brand.updatedAtMs,
        }
      : null,
    prompts: plan.context.prompts.map(p => ({
      id: p.id,
      value: p.value,
      revision: p.revision,
      version: p.version,
    })),
  };
  if (Buffer.byteLength(JSON.stringify(reviewConfig), "utf8") > 128 * 1024)
    fail(
      "The complete brand and prompt review exceeds the review limit. Shorten the context before requesting approval.",
      "BAD_REQUEST"
    );
  return {
    requestId: plan.input.requestId,
    workflowId: plan.input.id,
    revision: plan.input.revision,
    hash: plan.hash,
    credits: plan.prepared.credits,
    maxCredits: plan.input.maxCredits,
    expiresAt: plan.expiresAt,
    reviewConfig,
    nodes: plan.prepared.graph.nodes.map(n => ({
      id: n.id,
      title: n.title,
      type: n.type,
    })),
    approvalRequired: true,
  };
}
function publicExecutionStatus(run: CreativeWorkflowRun) {
  let remainingText = 64000;
  const publicUrl = (value: string) => {
    try {
      const url = new URL(value);
      if (
        url.protocol !== "https:" ||
        url.username ||
        url.password ||
        url.search ||
        url.hash ||
        !url.hostname.includes(".") ||
        url.hostname.endsWith(".localhost") ||
        /^\d+\.\d+\.\d+\.\d+$/.test(url.hostname) ||
        url.hostname.includes(":")
      )
        return null;
      return url.href;
    } catch {
      return null;
    }
  };
  const nodes = run.graph.nodes.slice(0, 80);
  return {
    id: run.id,
    workflowId: run.workflowId,
    appVersionId: run.appVersionId,
    status: run.status,
    stopRequested: !!run.stopRequested,
    credits: Object.values(run.creditsByNode).reduce(
      (sum, value) => sum + value,
      0
    ),
    createdAtMs: run.createdAtMs,
    updatedAtMs: run.updatedAtMs,
    error:
      run.status === "failed"
        ? "This run could not complete. Review the run in EvokeLoop before trying again."
        : null,
    steps: nodes.map(node => {
      const step = run.steps[node.id];
      const raw =
        step && ["completed", "reused"].includes(step.status)
          ? (step.outputs ?? [])
          : [];
      const outputs = raw
        .slice(0, 8)
        .flatMap<Record<string, unknown>>(value => {
          if (value.type === "text") {
            const text = value.text.slice(0, Math.min(10000, remainingText));
            remainingText -= text.length;
            return [
              {
                type: "text",
                text,
                truncated: text.length < value.text.length,
              },
            ];
          }
          if (
            (value.type === "image" || value.type === "video") &&
            /^(asset|creative|product_image):[1-9][0-9]*$/.test(value.key)
          )
            return [
              {
                type: value.type,
                key: value.key,
                name: value.name.slice(0, 200),
                url: publicUrl(value.url),
              },
            ];
          return [];
        });
      return {
        id: node.id,
        status: step?.status ?? "pending",
        error:
          step?.status === "failed"
            ? "This step could not complete. Review it in EvokeLoop."
            : null,
        outputs,
        outputsTruncated: raw.length > 8,
      };
    }),
    stepsTruncated: run.graph.nodes.length > nodes.length,
  };
}
function planFrom(
  row: typeof activityEvents.$inferSelect | undefined,
  identity: McpExecutionIdentity
) {
  const plan = row?.payload?.plan as Plan | undefined;
  if (!plan || stableHash(plan.identity) !== stableHash(identity))
    fail("Run request unavailable for this connection.", "NOT_FOUND");
  return plan;
}
async function assertUnusedRunId(tx: Tx, requestId: string) {
  const [existing] = await tx
    .select({ id: creativeWorkflowRuns.id })
    .from(creativeWorkflowRuns)
    .where(eq(creativeWorkflowRuns.id, requestId))
    .limit(1);
  // IDs are globally unique. Do not reveal the colliding run's workspace,
  // actor, workflow or state, including for another tenant's UUID.
  if (existing)
    fail("Request ID is unavailable. Use a new request ID.", "CONFLICT");
}
async function queuedRun(tx: Tx, identity: McpExecutionIdentity, plan: Plan) {
  await authorizeVideoGraph(tx, identity, plan.prepared.graph);
  const receipt = await event(tx, identity, plan.input.requestId, QUEUED);
  if (!receipt) return undefined;
  const policy = receipt.payload;
  const result = policy?.result as { id?: string; status?: string } | undefined;
  if (
    !policy ||
    stableHash(policy.identity) !== stableHash(identity) ||
    policy.hash !== plan.hash ||
    receipt.entityId !== plan.input.requestId ||
    result?.id !== plan.input.requestId ||
    typeof result.status !== "string" ||
    policy.graphHash !== stableHash(plan.prepared.graph) ||
    policy.referencesHash !== stableHash(plan.prepared.references) ||
    policy.maxCredits !== plan.input.maxCredits ||
    stableHash(policy.context) !== stableHash(plan.context) ||
    stableHash(policy.creditsByNode) !== stableHash(plan.prepared.creditsByNode)
  )
    fail("Queued run unavailable for this connection.", "NOT_FOUND");
  const [run] = await tx
    .select()
    .from(creativeWorkflowRuns)
    .where(
      and(
        eq(creativeWorkflowRuns.id, plan.input.requestId),
        eq(creativeWorkflowRuns.organizationId, identity.organizationId),
        eq(creativeWorkflowRuns.actorUserId, identity.userId),
        eq(creativeWorkflowRuns.workflowId, plan.input.id)
      )
    )
    .limit(1);
  if (
    !run ||
    run.appVersionId !== (plan.input.appVersionId ?? null) ||
    policy.graphHash !== stableHash(run.graph) ||
    policy.referencesHash !== stableHash(run.references) ||
    stableHash(policy.creditsByNode) !== stableHash(run.creditsByNode)
  )
    fail("Queued run unavailable for this connection.", "NOT_FOUND");
  return { run, result: { id: result.id, status: result.status } };
}
async function currentGraph(
  db: DB | Tx,
  input: z.infer<typeof executionPrepareInput>,
  identity: McpExecutionIdentity
) {
  const workflow = await resolveRunnableWorkflow(db, input);
  if (workflow.sourceRevision !== input.revision)
    fail(
      "Workflow or pinned App revision changed. Prepare a new request.",
      "CONFLICT"
    );
  const graph = await resolveWorkflowApps(
    db,
    input.organizationId,
    workflow.graph
  );
  assertDraftOnlyExecutionGraph(graph);
  await authorizeVideoGraph(db as Tx, identity, graph);
  return graph;
}
export function mcpWorkflowExecution(identity: McpExecutionIdentity) {
  return {
    async prepare(raw: unknown) {
      const input = executionPrepareInput.parse(raw),
        db = await database(),
        requestHash = stableHash(input);
      const first = await withOrganizationTransaction(
        db,
        input.organizationId,
        async tx => {
          await authorize(tx, identity, input.organizationId);
          const old = await event(tx, identity, input.requestId, PREPARED);
          if (old) {
            const plan = planFrom(old, identity);
            if (plan.requestHash !== requestHash)
              fail("Request ID reused with different inputs.", "CONFLICT");
            if (!(await queuedRun(tx, identity, plan)))
              await assertUnusedRunId(tx, input.requestId);
            return { plan };
          }
          await assertUnusedRunId(tx, input.requestId);
          const graph = await currentGraph(tx, input, identity);
          return {
            graph,
            context: await executionContext(tx, input.organizationId, graph),
          };
        }
      );
      if (first.plan) return publicPlan(first.plan);
      // Preparation can read/prepare media. The FULL resolved graph was checked first.
      const prepared = await aiScope.run(
        {
          organizationId: input.organizationId,
          actorUserId: identity.userId,
          operation: "workflow.quote",
          resolvedPromptDefaults: Promise.resolve(first.context!.prompts),
        },
        () =>
          prepareWorkflowRun(db, input.organizationId, input.id, first.graph!)
      );
      assertDraftOnlyExecutionGraph(prepared.graph);
      if (prepared.credits > input.maxCredits)
        fail("Estimated credits exceed the requested maximum.", "BAD_REQUEST");
      return withOrganizationTransaction(db, input.organizationId, async tx => {
        await authorize(tx, identity, input.organizationId);
        const old = await event(tx, identity, input.requestId, PREPARED);
        if (old) {
          const plan = planFrom(old, identity);
          if (plan.requestHash !== requestHash)
            fail("Request ID reused.", "CONFLICT");
          if (!(await queuedRun(tx, identity, plan)))
            await assertUnusedRunId(tx, input.requestId);
          return publicPlan(plan);
        }
        await assertUnusedRunId(tx, input.requestId);
        if (
          stableHash(await currentGraph(tx, input, identity)) !==
          stableHash(first.graph)
        )
          fail("Workflow changed during preparation.", "CONFLICT");
        const context = await executionContext(
          tx,
          input.organizationId,
          prepared.graph
        );
        if (stableHash(context) !== stableHash(first.context))
          fail(
            "Brand or prompt defaults changed during preparation. Prepare a new request.",
            "CONFLICT"
          );
        const plan: Plan = {
          identity,
          input,
          requestHash,
          sourceGraphHash: stableHash(first.graph),
          prepared,
          context,
          expiresAt: Date.now() + 10 * 60_000,
          hash: stableHash({ identity, input, prepared, context }),
        };
        publicPlan(plan);
        await record(tx, identity, input.requestId, PREPARED, { plan });
        return publicPlan(plan);
      });
    },
    async review(raw: unknown) {
      const input = executionReferenceInput.parse(raw),
        db = await database();
      return withOrganizationTransaction(db, input.organizationId, async tx => {
        await authorize(tx, identity, input.organizationId);
        const plan = planFrom(
          await event(tx, identity, input.requestId, PREPARED),
          identity
        );
        await authorizeVideoGraph(tx, identity, plan.prepared.graph);
        return publicPlan(plan);
      });
    },
    async execute(raw: unknown) {
      const input = executionRunInput.parse(raw),
        db = await database();
      return withOrganizationTransaction(db, input.organizationId, async tx => {
        await authorize(tx, identity, input.organizationId);
        const plan = planFrom(
          await event(tx, identity, input.requestId, PREPARED),
          identity
        );
        if (plan.hash !== input.hash) fail("Run snapshot changed.", "CONFLICT");
        const completed = await queuedRun(tx, identity, plan);
        if (completed) return completed.result;
        await assertUnusedRunId(tx, input.requestId);
        const approval = await event(tx, identity, input.requestId, APPROVED);
        if (
          !approval ||
          approval.payload?.hash !== input.hash ||
          approval.payload?.maxCredits !== plan.input.maxCredits ||
          plan.expiresAt <= Date.now()
        )
          fail(
            "Open the run review and approve this exact credit budget before execution."
          );
        if (
          stableHash(await currentGraph(tx, plan.input, identity)) !==
          plan.sourceGraphHash
        )
          fail("Resolved workflow changed after approval.", "CONFLICT");
        assertDraftOnlyExecutionGraph(plan.prepared.graph);
        if (
          stableHash(
            await executionContext(
              tx,
              input.organizationId,
              plan.prepared.graph
            )
          ) !== stableHash(plan.context)
        )
          fail(
            "Brand or prompt defaults changed after approval. Prepare a new request.",
            "CONFLICT"
          );
        if (plan.prepared.credits > plan.input.maxCredits)
          fail("Credit cap exceeded.");
        const active = await tx
          .select({
            status: creativeWorkflowRuns.status,
            graph: creativeWorkflowRuns.graph,
            steps: creativeWorkflowRuns.steps,
          })
          .from(creativeWorkflowRuns)
          .where(
            and(
              eq(creativeWorkflowRuns.organizationId, input.organizationId),
              inArray(creativeWorkflowRuns.status, ["queued", "running"])
            )
          );
        if (active.filter(workflowRunOccupiesSlot).length >= 3)
          fail("Three workflows are already processing.", "CONFLICT");
        const credits = await creditState(tx, input.organizationId);
        if (
          credits.account?.aiPaused ||
          (credits.account?.enforceCredits &&
            credits.remaining < plan.prepared.credits)
        )
          fail("AI is paused or available credits are insufficient.");
        const now = Date.now();
        const [run] = await tx
          .insert(creativeWorkflowRuns)
          .values({
            id: input.requestId,
            organizationId: input.organizationId,
            workflowId: plan.input.id,
            actorUserId: identity.userId,
            appVersionId: plan.input.appVersionId ?? null,
            graph: plan.prepared.graph,
            steps: plan.prepared.steps,
            references: plan.prepared.references,
            creditsByNode: plan.prepared.creditsByNode,
            createdAtMs: now,
            updatedAtMs: now,
          })
          .returning();
        const result = { id: run.id, status: run.status };
        await record(tx, identity, input.requestId, QUEUED, {
          identity,
          hash: plan.hash,
          graphHash: stableHash(run.graph),
          referencesHash: stableHash(run.references),
          context: plan.context,
          creditsByNode: run.creditsByNode,
          maxCredits: plan.input.maxCredits,
          result,
        });
        return result;
      });
    },
    async status(raw: unknown) {
      const input = executionReferenceInput.parse(raw),
        db = await database();
      return withOrganizationTransaction(db, input.organizationId, async tx => {
        await authorize(tx, identity, input.organizationId);
        const plan = planFrom(
          await event(tx, identity, input.requestId, PREPARED),
          identity
        );
        const completed = await queuedRun(tx, identity, plan);
        return completed
          ? publicExecutionStatus(completed.run)
          : { id: input.requestId, status: "awaiting_approval" };
      });
    },
    async stop(raw: unknown) {
      const input = executionReferenceInput.parse(raw),
        db = await database();
      return withOrganizationTransaction(db, input.organizationId, async tx => {
        await authorize(tx, identity, input.organizationId);
        const plan = planFrom(
          await event(tx, identity, input.requestId, PREPARED),
          identity
        );
        if (!(await queuedRun(tx, identity, plan)))
          fail("Queued run unavailable for this connection.", "NOT_FOUND");
        if (
          await event(
            tx,
            identity,
            input.requestId,
            "mcp.execution.stop_requested"
          )
        )
          return { id: input.requestId, stopRequested: true };
        const [run] = await tx
          .update(creativeWorkflowRuns)
          .set({ stopRequested: 1, updatedAtMs: Date.now() })
          .where(
            and(
              eq(creativeWorkflowRuns.id, input.requestId),
              eq(creativeWorkflowRuns.organizationId, input.organizationId),
              eq(creativeWorkflowRuns.actorUserId, identity.userId),
              eq(creativeWorkflowRuns.workflowId, plan.input.id),
              eq(creativeWorkflowRuns.stopRequested, 0),
              inArray(creativeWorkflowRuns.status, ["queued", "running"])
            )
          )
          .returning({ id: creativeWorkflowRuns.id });
        if (
          run &&
          !(await event(
            tx,
            identity,
            input.requestId,
            "mcp.execution.stop_requested"
          ))
        )
          await record(
            tx,
            identity,
            input.requestId,
            "mcp.execution.stop_requested",
            {}
          );
        return { id: input.requestId, stopRequested: !!run };
      });
    },
  };
}

export async function reviewMcpWorkflowExecution(userId: number, raw: unknown) {
  const input = executionReferenceInput.parse(raw),
    db = await database();
  return withOrganizationTransaction(db, input.organizationId, async tx => {
    const [row] = await tx
      .select()
      .from(activityEvents)
      .where(
        and(
          eq(activityEvents.organizationId, input.organizationId),
          eq(activityEvents.actorUserId, userId),
          eq(activityEvents.correlationId, input.requestId),
          eq(activityEvents.action, PREPARED)
        )
      )
      .limit(1);
    const identity = (row?.payload?.plan as Plan | undefined)?.identity;
    if (!identity) fail("Run review unavailable.", "NOT_FOUND");
    await authorize(tx, identity, input.organizationId);
    const plan = planFrom(row, identity);
    await authorizeVideoGraph(tx, identity, plan.prepared.graph);
    return publicPlan(plan);
  });
}

/** Only call from a same-origin, CSRF-protected authenticated EvokeLoop review UI.
 * Never register this function as an MCP tool. */
export async function approveMcpWorkflowExecution(
  userId: number,
  raw: unknown
) {
  const input = executionApprovalInput.parse(raw),
    db = await database();
  return withOrganizationTransaction(db, input.organizationId, async tx => {
    const [row] = await tx
      .select()
      .from(activityEvents)
      .where(
        and(
          eq(activityEvents.organizationId, input.organizationId),
          eq(activityEvents.actorUserId, userId),
          eq(activityEvents.correlationId, input.requestId),
          eq(activityEvents.action, PREPARED)
        )
      )
      .limit(1);
    const identity = (row?.payload?.plan as Plan | undefined)?.identity;
    if (!identity) fail("Run review unavailable.", "NOT_FOUND");
    await authorize(tx, identity, input.organizationId);
    const plan = planFrom(row, identity);
    await authorizeVideoGraph(tx, identity, plan.prepared.graph);
    if (
      input.hash !== plan.hash ||
      input.maxCredits !== plan.input.maxCredits ||
      plan.expiresAt <= Date.now()
    )
      fail("Run review expired or budget changed.", "CONFLICT");
    const old = await event(tx, identity, input.requestId, APPROVED);
    if (!old)
      await record(tx, identity, input.requestId, APPROVED, {
        hash: plan.hash,
        maxCredits: input.maxCredits,
      });
    return { approved: true, requestId: input.requestId };
  });
}

/** Worker gate: existing non-MCP runs are unchanged. For MCP runs, recheck the
 * live connection and full immutable content graph; reserve each paid attempt
 * once before dispatch. An uncertain provider attempt is NEVER auto-retried. */
export async function guardMcpWorkflowStep(
  db: DB,
  run: CreativeWorkflowRun,
  nodeId?: string,
  beginPaid = false
) {
  return withOrganizationTransaction(db, run.organizationId, async tx => {
    const [row] = await tx
      .select()
      .from(activityEvents)
      .where(
        and(
          eq(activityEvents.organizationId, run.organizationId),
          eq(activityEvents.actorUserId, run.actorUserId),
          eq(activityEvents.correlationId, run.id),
          eq(activityEvents.action, QUEUED)
        )
      )
      .limit(1);
    if (!row) return;
    const policy = row.payload!;
    const identity = policy.identity as McpExecutionIdentity;
    await authorizeVideoGraph(tx, identity, run.graph);
    assertDraftOnlyExecutionGraph(run.graph);
    const context = policy.context as McpExecutionContext;
    if (
      !context ||
      stableHash(await executionContext(tx, run.organizationId, run.graph)) !==
        stableHash(context)
    )
      fail(
        "Brand or prompt defaults changed after approval. Prepare a new request.",
        "CONFLICT"
      );
    if (
      policy.graphHash !== stableHash(run.graph) ||
      policy.referencesHash !== stableHash(run.references) ||
      stableHash(policy.creditsByNode) !== stableHash(run.creditsByNode)
    )
      fail("Approved run snapshot changed.");
    const total = Object.values(run.creditsByNode).reduce(
      (sum, value) => sum + value,
      0
    );
    if (
      !Number.isSafeInteger(total) ||
      total < 0 ||
      total > Number(policy.maxCredits)
    )
      fail("Approved credit budget exceeded.");
    if (!beginPaid) return context;
    const node = run.graph.nodes.find(n => n.id === nodeId);
    if (!node || !isGenerationNode(node.type)) return context;
    const attempts = await tx
      .select()
      .from(activityEvents)
      .where(
        and(
          eq(activityEvents.organizationId, run.organizationId),
          eq(activityEvents.actorUserId, run.actorUserId),
          eq(activityEvents.correlationId, run.id),
          eq(activityEvents.action, ATTEMPT)
        )
      );
    if (attempts.some(a => a.payload?.nodeId === nodeId))
      fail(
        "A previous paid attempt has an uncertain outcome. Inspect it before authorizing a new run.",
        "CONFLICT"
      );
    const amount = run.creditsByNode[node.id];
    if (
      !Number.isSafeInteger(amount) ||
      amount < 0 ||
      attempts.reduce(
        (sum, a) => sum + Number(a.payload?.credits ?? 0),
        amount
      ) > Number(policy.maxCredits)
    )
      fail("Paid attempt exceeds approved budget.");
    await record(tx, identity, run.id, ATTEMPT, { nodeId, credits: amount });
    return context;
  });
}
