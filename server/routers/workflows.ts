import { randomUUID } from "node:crypto";
import { and, desc, eq, inArray } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import {
  creativeWorkflows,
  creativeWorkflowRuns,
} from "../../drizzle/workflowSchema";
import {
  workflowGraphSchema,
  workflowGraphProblem,
} from "../../shared/creativeWorkflow";
import { studioRoles } from "../../shared/assetWorkflow";
import { protectedProcedure, router } from "../_core/trpc";
import { requireOrganizationRole } from "../lib/access";
import { withOrganizationTransaction, appendActivity } from "../lib/activity";
import { creditState } from "../lib/aiMetering";
import {
  getWorkflow,
  libraryDatabase,
  prepareWorkflowRun,
  publicWorkflowRun,
} from "../lib/creativeWorkflows";
const scope = z.object({ organizationId: z.number().int().positive() });
const reference = scope.extend({ id: z.string().uuid() });
const runInput = reference.extend({
  revision: z.number().int().positive(),
  target: z.string().max(80).optional(),
});
export const workflowsRouter = router({
  list: protectedProcedure.input(scope).query(async ({ ctx, input }) => {
    await requireOrganizationRole(ctx.user.id, input.organizationId, [
      ...studioRoles,
    ]);
    return (await libraryDatabase())
      .select({
        id: creativeWorkflows.id,
        name: creativeWorkflows.name,
        revision: creativeWorkflows.revision,
        updatedAtMs: creativeWorkflows.updatedAtMs,
      })
      .from(creativeWorkflows)
      .where(
        and(
          eq(creativeWorkflows.organizationId, input.organizationId),
          eq(creativeWorkflows.archived, 0)
        )
      )
      .orderBy(desc(creativeWorkflows.updatedAtMs))
      .limit(250);
  }),
  get: protectedProcedure.input(reference).query(async ({ ctx, input }) => {
    await requireOrganizationRole(ctx.user.id, input.organizationId, [
      ...studioRoles,
    ]);
    const db = await libraryDatabase(),
      workflow = await getWorkflow(db, input.organizationId, input.id);
    const runs = await db
      .select()
      .from(creativeWorkflowRuns)
      .where(
        and(
          eq(creativeWorkflowRuns.organizationId, input.organizationId),
          eq(creativeWorkflowRuns.workflowId, input.id)
        )
      )
      .orderBy(desc(creativeWorkflowRuns.createdAtMs))
      .limit(20);
    return { ...workflow, runs: runs.map(publicWorkflowRun) };
  }),
  save: protectedProcedure
    .input(
      scope.extend({
        id: z.string().uuid().optional(),
        revision: z.number().int().positive().optional(),
        name: z.string().trim().min(1).max(100),
        graph: workflowGraphSchema,
      })
    )
    .mutation(async ({ ctx, input }) => {
      await requireOrganizationRole(ctx.user.id, input.organizationId, [
        ...studioRoles,
      ]);
      const problem = workflowGraphProblem(input.graph);
      if (problem)
        throw new TRPCError({ code: "BAD_REQUEST", message: problem });
      const db = await libraryDatabase();
      return withOrganizationTransaction(db, input.organizationId, async tx => {
        const now = Date.now();
        if (input.id) {
          const [saved] = await tx
            .update(creativeWorkflows)
            .set({
              name: input.name,
              graph: input.graph,
              revision: (input.revision ?? 0) + 1,
              updatedAtMs: now,
            })
            .where(
              and(
                eq(creativeWorkflows.id, input.id),
                eq(creativeWorkflows.organizationId, input.organizationId),
                eq(creativeWorkflows.revision, input.revision ?? 0),
                eq(creativeWorkflows.archived, 0)
              )
            )
            .returning();
          if (!saved)
            throw new TRPCError({
              code: "CONFLICT",
              message:
                "This workflow changed in another tab. Reopen it before saving.",
            });
          return saved;
        }
        const [saved] = await tx
          .insert(creativeWorkflows)
          .values({
            id: randomUUID(),
            organizationId: input.organizationId,
            actorUserId: ctx.user.id,
            name: input.name,
            graph: input.graph,
            createdAtMs: now,
            updatedAtMs: now,
          })
          .returning();
        return saved;
      });
    }),
  archive: protectedProcedure
    .input(reference)
    .mutation(async ({ ctx, input }) => {
      await requireOrganizationRole(ctx.user.id, input.organizationId, [
        ...studioRoles,
      ]);
      const db = await libraryDatabase();
      return withOrganizationTransaction(db, input.organizationId, async tx => {
        const active = await tx
          .select({ id: creativeWorkflowRuns.id })
          .from(creativeWorkflowRuns)
          .where(
            and(
              eq(creativeWorkflowRuns.workflowId, input.id),
              eq(creativeWorkflowRuns.organizationId, input.organizationId),
              inArray(creativeWorkflowRuns.status, ["queued", "running"])
            )
          );
        if (active.length)
          throw new TRPCError({
            code: "CONFLICT",
            message: "Stop the active run before archiving this workflow.",
          });
        await tx
          .update(creativeWorkflows)
          .set({ archived: 1, updatedAtMs: Date.now() })
          .where(
            and(
              eq(creativeWorkflows.id, input.id),
              eq(creativeWorkflows.organizationId, input.organizationId)
            )
          );
        return { ok: true };
      });
    }),
  quote: protectedProcedure.input(runInput).mutation(async ({ ctx, input }) => {
    await requireOrganizationRole(ctx.user.id, input.organizationId, [
      ...studioRoles,
    ]);
    const db = await libraryDatabase(),
      workflow = await getWorkflow(db, input.organizationId, input.id);
    if (workflow.revision !== input.revision)
      throw new TRPCError({
        code: "CONFLICT",
        message: "Save your latest changes before running.",
      });
    const prepared = await prepareWorkflowRun(
      db,
      input.organizationId,
      input.id,
      workflow.graph,
      input.target
    );
    return {
      credits: prepared.credits,
      creditsByNode: prepared.creditsByNode,
      reused: Object.values(prepared.steps).filter(s => s.status === "reused")
        .length,
    };
  }),
  run: protectedProcedure
    .input(
      runInput.extend({
        requestId: z.string().uuid(),
        quotedCredits: z.number().int().min(0),
      })
    )
    .mutation(async ({ ctx, input }) => {
      await requireOrganizationRole(ctx.user.id, input.organizationId, [
        ...studioRoles,
      ]);
      const db = await libraryDatabase();
      const [replay] = await db
        .select()
        .from(creativeWorkflowRuns)
        .where(
          and(
            eq(creativeWorkflowRuns.id, input.requestId),
            eq(creativeWorkflowRuns.organizationId, input.organizationId),
            eq(creativeWorkflowRuns.workflowId, input.id)
          )
        );
      if (replay) return publicWorkflowRun(replay);
      const workflow = await getWorkflow(db, input.organizationId, input.id);
      if (workflow.revision !== input.revision)
        throw new TRPCError({
          code: "CONFLICT",
          message: "The workflow changed. Review a new estimate.",
        });
      const prepared = await prepareWorkflowRun(
        db,
        input.organizationId,
        input.id,
        workflow.graph,
        input.target
      );
      if (prepared.credits !== input.quotedCredits)
        throw new TRPCError({
          code: "CONFLICT",
          message:
            "The credit estimate changed. Review it again before running.",
        });
      return withOrganizationTransaction(db, input.organizationId, async tx => {
        const [replay] = await tx
          .select()
          .from(creativeWorkflowRuns)
          .where(
            and(
              eq(creativeWorkflowRuns.id, input.requestId),
              eq(creativeWorkflowRuns.organizationId, input.organizationId),
              eq(creativeWorkflowRuns.workflowId, input.id)
            )
          );
        if (replay) return publicWorkflowRun(replay);
        const [current] = await tx
          .select()
          .from(creativeWorkflows)
          .where(
            and(
              eq(creativeWorkflows.id, input.id),
              eq(creativeWorkflows.organizationId, input.organizationId),
              eq(creativeWorkflows.archived, 0)
            )
          );
        if (current?.revision !== input.revision)
          throw new TRPCError({
            code: "CONFLICT",
            message: "The workflow changed. Review a new estimate.",
          });
        const active = await tx
          .select({ id: creativeWorkflowRuns.id })
          .from(creativeWorkflowRuns)
          .where(
            and(
              eq(creativeWorkflowRuns.organizationId, input.organizationId),
              inArray(creativeWorkflowRuns.status, ["queued", "running"])
            )
          );
        if (active.length >= 3)
          throw new TRPCError({
            code: "TOO_MANY_REQUESTS",
            message:
              "Three workflows are already running in this workspace. Wait for one to finish.",
          });
        const state = await creditState(tx, input.organizationId);
        if (
          state.account?.aiPaused ||
          (state.account?.enforceCredits && state.remaining < prepared.credits)
        )
          throw new TRPCError({
            code: "FORBIDDEN",
            message: state.account?.aiPaused
              ? "AI generation is paused for this workspace."
              : `This run needs ${prepared.credits} AI credits; ${Math.max(0, state.remaining)} remain.`,
          });
        const now = Date.now();
        const [run] = await tx
          .insert(creativeWorkflowRuns)
          .values({
            id: input.requestId,
            workflowId: workflow.id,
            organizationId: input.organizationId,
            actorUserId: ctx.user.id,
            graph: workflow.graph,
            steps: prepared.steps,
            references: prepared.references,
            creditsByNode: prepared.creditsByNode,
            createdAtMs: now,
            updatedAtMs: now,
          })
          .returning();
        await appendActivity(
          {
            organizationId: input.organizationId,
            actorUserId: ctx.user.id,
            action: "workflow.queued",
            entityType: "creative_workflow",
            entityId: workflow.id,
            payload: {
              runId: run.id,
              credits: prepared.credits,
              target: input.target ?? "all",
            },
          },
          tx
        );
        return publicWorkflowRun(run);
      });
    }),
  stop: protectedProcedure.input(reference).mutation(async ({ ctx, input }) => {
    await requireOrganizationRole(ctx.user.id, input.organizationId, [
      ...studioRoles,
    ]);
    await (
      await libraryDatabase()
    )
      .update(creativeWorkflowRuns)
      .set({ stopRequested: 1, updatedAtMs: Date.now() })
      .where(
        and(
          eq(creativeWorkflowRuns.id, input.id),
          eq(creativeWorkflowRuns.organizationId, input.organizationId),
          inArray(creativeWorkflowRuns.status, ["queued", "running"])
        )
      );
    return { ok: true };
  }),
});
