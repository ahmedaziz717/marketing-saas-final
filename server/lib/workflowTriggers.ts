import { randomUUID } from "node:crypto";
import { and, eq, inArray, lte, desc, gte } from "drizzle-orm";
import {
  creativeWorkflowRuns,
  workflowTriggers,
  workflowTriggerReceipts,
} from "../../drizzle/workflowSchema";
import { optimizationSyncs } from "../../drizzle/optimizationSchema";
import { publications } from "../../drizzle/channelSchema";
import {
  workflowOrder,
  workflowGraphProblem,
  type WorkflowSteps,
} from "../../shared/creativeWorkflow";
import {
  nextWeeklyTrigger,
  triggerGraphProblem,
} from "../../shared/workflowTriggers";
import { requireOrganizationRole } from "./access";
import {
  getWorkflowApp,
  resolveWorkflowApps,
  validateWorkflowConnections,
} from "./workflowApps";
import { resolveWorkflowInputs } from "./workflowInputs";
import { workflowImageReferences } from "./creativeWorkflows";
import { withOrganizationTransaction } from "./activity";
import { stableHash } from "./policy";
import { optimizationEnabled } from "./optimizationFlags";
import type { LibraryDatabase } from "./assetLibrary";

export async function fireWorkflowTrigger(
  db: LibraryDatabase,
  triggerId: string,
  eventKey: string,
  now = Date.now()
) {
  const [trigger] = await db
    .select()
    .from(workflowTriggers)
    .where(eq(workflowTriggers.id, triggerId));
  if (!trigger?.enabled || !optimizationEnabled(trigger.organizationId))
    return null;
  await requireOrganizationRole(trigger.actorUserId, trigger.organizationId, [
    "owner",
    "admin",
    "creator",
    "publisher",
  ]);
  const app = await getWorkflowApp(
    db,
    trigger.organizationId,
    trigger.appVersionId
  );
  let graph = await resolveWorkflowApps(db, trigger.organizationId, app.graph);
  graph = await resolveWorkflowInputs(db, trigger.organizationId, graph);
  const problem =
    workflowGraphProblem(graph) ?? triggerGraphProblem(trigger.config, graph);
  if (problem) throw new Error(problem);
  await validateWorkflowConnections(db, trigger.organizationId, graph);
  const references = await workflowImageReferences(
    db,
    trigger.organizationId,
    graph.nodes
      .filter(n => n.type === "image" && n.config.imageKey)
      .map(n => n.config.imageKey!)
  );
  const receiptId = stableHash({ triggerId, eventKey });
  return withOrganizationTransaction(db, trigger.organizationId, async tx => {
    const [current] = await tx
      .select()
      .from(workflowTriggers)
      .where(
        and(
          eq(workflowTriggers.id, trigger.id),
          eq(workflowTriggers.enabled, 1)
        )
      )
      .for("update");
    if (!current) return null;
    const [prior] = await tx
      .select()
      .from(workflowTriggerReceipts)
      .where(eq(workflowTriggerReceipts.id, receiptId));
    if (prior) return prior.runId;
    const running = await tx
      .select({ id: creativeWorkflowRuns.id })
      .from(creativeWorkflowRuns)
      .where(
        and(
          eq(creativeWorkflowRuns.organizationId, trigger.organizationId),
          inArray(creativeWorkflowRuns.status, ["queued", "running"])
        )
      );
    if (running.length >= 3) return null;
    const steps: WorkflowSteps = {};
    for (const id of workflowOrder(graph)) steps[id] = { status: "pending" };
    const runId = randomUUID();
    await tx.insert(creativeWorkflowRuns).values({
      id: runId,
      workflowId: app.workflowId,
      appVersionId: app.id,
      triggerId: trigger.id,
      organizationId: trigger.organizationId,
      actorUserId: trigger.actorUserId,
      graph,
      steps,
      references,
      creditsByNode: Object.fromEntries(graph.nodes.map(n => [n.id, 0])),
      createdAtMs: now,
      updatedAtMs: now,
    });
    await tx.insert(workflowTriggerReceipts).values({
      id: receiptId,
      organizationId: trigger.organizationId,
      triggerId: trigger.id,
      runId,
      eventKey,
      createdAtMs: now,
    });
    await tx
      .update(workflowTriggers)
      .set({
        error: null,
        updatedAtMs: now,
        ...(trigger.config.kind === "scheduled"
          ? { nextAtMs: nextWeeklyTrigger(trigger.config, now) }
          : {}),
      })
      .where(eq(workflowTriggers.id, trigger.id));
    return runId;
  });
}
export async function processWorkflowTriggers(db: LibraryDatabase) {
  if (process.env.OPTIMIZATION_WORKER_ENABLED !== "true") return;
  const now = Date.now();
  const triggers = await db
    .select()
    .from(workflowTriggers)
    .where(
      and(eq(workflowTriggers.enabled, 1), lte(workflowTriggers.nextAtMs, now))
    )
    .orderBy(workflowTriggers.nextAtMs)
    .limit(100);
  for (const trigger of triggers) {
    if (!optimizationEnabled(trigger.organizationId)) continue;
    try {
      if (trigger.config.kind === "scheduled")
        await fireWorkflowTrigger(
          db,
          trigger.id,
          `schedule:${trigger.nextAtMs}`,
          now
        );
      if (trigger.config.kind === "event") {
        let events: { key: string; at: number }[] = [];
        if (trigger.config.event === "history_synced") {
          const jobs = await db
            .select()
            .from(optimizationSyncs)
            .where(
              and(
                eq(optimizationSyncs.organizationId, trigger.organizationId),
                eq(optimizationSyncs.status, "completed"),
                gte(optimizationSyncs.updatedAtMs, trigger.createdAtMs)
              )
            );
          events = jobs.map(j => ({
            key: `history:${j.id}:${j.updatedAtMs}`,
            at: j.updatedAtMs,
          }));
        } else if (trigger.config.event === "publication_delivered") {
          const items = await db
            .select()
            .from(publications)
            .where(
              and(
                eq(publications.organizationId, trigger.organizationId),
                eq(publications.state, "published"),
                gte(
                  publications.updatedAtMs,
                  Math.max(trigger.createdAtMs, trigger.lastEventAtMs)
                )
              )
            )
            .orderBy(publications.updatedAtMs)
            .limit(100);
          events = items.map(p => ({
            key: `publication:${p.id}:${p.updatedAtMs}`,
            at: p.updatedAtMs,
          }));
        }
        for (const event of events) {
          const run = await fireWorkflowTrigger(db, trigger.id, event.key, now);
          if (!run) break;
          await db
            .update(workflowTriggers)
            .set({ lastEventAtMs: event.at })
            .where(eq(workflowTriggers.id, trigger.id));
        }
      }
      // Avoid a busy event loop; nextAt is a polling checkpoint, not a second schedule.
      if (trigger.config.kind !== "scheduled")
        await db
          .update(workflowTriggers)
          .set({ nextAtMs: now + 60000 })
          .where(eq(workflowTriggers.id, trigger.id));
    } catch (error) {
      await db
        .update(workflowTriggers)
        .set({
          enabled: 0,
          error:
            error instanceof Error
              ? error.message.slice(0, 500)
              : "Trigger needs attention.",
          updatedAtMs: now,
        })
        .where(eq(workflowTriggers.id, trigger.id));
    }
  }
}
