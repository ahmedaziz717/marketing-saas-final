import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import {
  workflowTriggers,
  creativeWorkflowRuns,
} from "../../drizzle/workflowSchema";
import { protectedProcedure, router } from "../_core/trpc";
import { requireOrganizationRole } from "../lib/access";
import { requireOptimization } from "../lib/optimizationFlags";
import { libraryDatabase } from "../lib/assetLibrary";
import { getWorkflowApp, resolveWorkflowApps } from "../lib/workflowApps";
import { workflowInputs, workflowNodeCredits } from "../lib/creativeWorkflows";
import { isGenerationNode } from "../../shared/creativeWorkflow";
import {
  nextWeeklyTrigger,
  triggerGraphProblem,
} from "../../shared/workflowTriggers";
import { withOrganizationTransaction, appendActivity } from "../lib/activity";
import { fireWorkflowTrigger } from "../lib/workflowTriggers";
const scope = z.object({ organizationId: z.number().int().positive() });
const appScope = scope.extend({ appVersionId: z.string().uuid() });
const stepScope = scope.extend({
  runId: z.string().uuid(),
  nodeId: z.string().max(80),
});
export const workflowAutomationRouter = router({
  get: protectedProcedure.input(appScope).query(async ({ ctx, input }) => {
    await requireOrganizationRole(ctx.user.id, input.organizationId);
    requireOptimization(input.organizationId);
    const [r] = await (
      await libraryDatabase()
    )
      .select()
      .from(workflowTriggers)
      .where(
        and(
          eq(workflowTriggers.organizationId, input.organizationId),
          eq(workflowTriggers.appVersionId, input.appVersionId)
        )
      );
    return r ?? null;
  }),
  configure: protectedProcedure
    .input(appScope.extend({ enabled: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      await requireOrganizationRole(ctx.user.id, input.organizationId, [
        "owner",
        "admin",
      ]);
      requireOptimization(input.organizationId);
      const db = await libraryDatabase(),
        app = await getWorkflowApp(
          db,
          input.organizationId,
          input.appVersionId
        );
      const starts = app.graph.nodes.filter(n => n.type === "start_trigger");
      if (
        starts.length !== 1 ||
        !starts[0].config.trigger ||
        !["scheduled", "event"].includes(starts[0].config.trigger.kind)
      )
        throw new TRPCError({
          code: "BAD_REQUEST",
          message:
            "Publish a workflow with exactly one scheduled or event Start trigger first.",
        });
      const config = starts[0].config.trigger,
        now = Date.now();
      if (input.enabled) {
        const problem = triggerGraphProblem(
          config,
          await resolveWorkflowApps(db, input.organizationId, app.graph)
        );
        if (problem)
          throw new TRPCError({ code: "BAD_REQUEST", message: problem });
      }
      return withOrganizationTransaction(db, input.organizationId, async tx => {
        const values = {
          enabled: input.enabled ? 1 : 0,
          config,
          actorUserId: ctx.user.id,
          nextAtMs:
            config.kind === "scheduled" ? nextWeeklyTrigger(config, now) : now,
          error: null,
          updatedAtMs: now,
        };
        const [r] = await tx
          .insert(workflowTriggers)
          .values({
            id: randomUUID(),
            organizationId: input.organizationId,
            appVersionId: app.id,
            ...values,
            createdAtMs: now,
            lastEventAtMs: now,
          })
          .onConflictDoUpdate({
            target: [
              workflowTriggers.organizationId,
              workflowTriggers.appVersionId,
            ],
            set: values,
          })
          .returning();
        await appendActivity(
          {
            organizationId: input.organizationId,
            actorUserId: ctx.user.id,
            action: "workflow.trigger_configured",
            entityType: "workflow_trigger",
            entityId: r.id,
            payload: { enabled: input.enabled, version: app.version, config },
          },
          tx
        );
        return r;
      });
    }),
  event: protectedProcedure
    .input(
      scope.extend({
        triggerId: z.string().uuid(),
        eventKey: z.string().min(1).max(150),
      })
    )
    .mutation(async ({ ctx, input }) => {
      await requireOrganizationRole(ctx.user.id, input.organizationId, [
        "owner",
        "admin",
      ]);
      requireOptimization(input.organizationId);
      const db = await libraryDatabase();
      const [t] = await db
        .select()
        .from(workflowTriggers)
        .where(
          and(
            eq(workflowTriggers.id, input.triggerId),
            eq(workflowTriggers.organizationId, input.organizationId)
          )
        );
      if (!t || t.config.kind !== "event" || t.config.event !== "manual_event")
        throw new TRPCError({ code: "NOT_FOUND" });
      return {
        runId: await fireWorkflowTrigger(db, t.id, `manual:${input.eventKey}`),
      };
    }),
  quoteStep: protectedProcedure
    .input(stepScope)
    .mutation(async ({ ctx, input }) => {
      await requireOrganizationRole(ctx.user.id, input.organizationId, [
        "owner",
        "admin",
        "creator",
      ]);
      requireOptimization(input.organizationId);
      const db = await libraryDatabase();
      const [run] = await db
        .select()
        .from(creativeWorkflowRuns)
        .where(
          and(
            eq(creativeWorkflowRuns.id, input.runId),
            eq(creativeWorkflowRuns.organizationId, input.organizationId)
          )
        );
      const node = run?.graph.nodes.find(n => n.id === input.nodeId),
        step = run?.steps[input.nodeId];
      if (
        !run?.triggerId ||
        !node ||
        !step?.approvalRequiredCredits ||
        step.status !== "waiting" ||
        !isGenerationNode(node.type) ||
        run.stopRequested
      )
        throw new TRPCError({
          code: "CONFLICT",
          message: "This step is not waiting for generation approval.",
        });
      return {
        credits: await workflowNodeCredits(
          db,
          node,
          input.organizationId,
          workflowInputs(run.graph, run.steps, node)
        ),
        nodeName: node.title,
      };
    }),
  approveStep: protectedProcedure
    .input(stepScope.extend({ quotedCredits: z.number().int().min(0) }))
    .mutation(async ({ ctx, input }) => {
      await requireOrganizationRole(ctx.user.id, input.organizationId, [
        "owner",
        "admin",
        "creator",
      ]);
      requireOptimization(input.organizationId);
      const db = await libraryDatabase();
      const [run] = await db
        .select()
        .from(creativeWorkflowRuns)
        .where(
          and(
            eq(creativeWorkflowRuns.id, input.runId),
            eq(creativeWorkflowRuns.organizationId, input.organizationId)
          )
        );
      const node = run?.graph.nodes.find(n => n.id === input.nodeId);
      if (!run?.triggerId || !node || !isGenerationNode(node.type))
        throw new TRPCError({ code: "NOT_FOUND" });
      const credits = await workflowNodeCredits(
        db,
        node,
        input.organizationId,
        workflowInputs(run.graph, run.steps, node)
      );
      if (credits !== input.quotedCredits)
        throw new TRPCError({
          code: "CONFLICT",
          message: "The quote changed. Review it again.",
        });
      return withOrganizationTransaction(db, input.organizationId, async tx => {
        const [current] = await tx
          .select()
          .from(creativeWorkflowRuns)
          .where(
            and(
              eq(creativeWorkflowRuns.id, input.runId),
              eq(creativeWorkflowRuns.organizationId, input.organizationId)
            )
          )
          .for("update");
        const step = current?.steps[input.nodeId];
        if (
          !current ||
          !step?.approvalRequiredCredits ||
          step.status !== "waiting" ||
          current.stopRequested ||
          (current.leaseOwner && current.leaseUntilMs > Date.now())
        )
          throw new TRPCError({
            code: "CONFLICT",
            message: "The runner is updating this step. Refresh and try again.",
          });
        current.steps[input.nodeId] = {
          ...step,
          status: "pending",
          approvedCredits: credits,
          approvalRequiredCredits: false,
          approvedByUserId: ctx.user.id,
          approvedAtMs: Date.now(),
        };
        await tx
          .update(creativeWorkflowRuns)
          .set({
            steps: current.steps,
            creditsByNode: {
              ...current.creditsByNode,
              [input.nodeId]: credits,
            },
            leaseUntilMs: 0,
            updatedAtMs: Date.now(),
          })
          .where(eq(creativeWorkflowRuns.id, current.id));
        await appendActivity(
          {
            organizationId: input.organizationId,
            actorUserId: ctx.user.id,
            action: "workflow.generation_approved",
            entityType: "workflow_run",
            entityId: run.id,
            payload: { nodeId: input.nodeId, credits },
          },
          tx
        );
        return { ok: true };
      });
    }),
});
