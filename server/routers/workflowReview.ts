import { and, eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { creativeWorkflowRuns } from "../../drizzle/workflowSchema";
import { metaChangeSchema } from "../../shared/metaManagement";
import { protectedProcedure } from "../_core/trpc";
import { requireOrganizationRole } from "../lib/access";
import { libraryDatabase } from "../lib/assetLibrary";
import { appendActivity, withOrganizationTransaction } from "../lib/activity";
import {
  workflowInputs,
  validateWorkflowValues,
} from "../lib/creativeWorkflows";
import { getConnection } from "../lib/channelConnections";
import {
  applyMetaChange,
  reviewMetaChange,
  verifyMetaReview,
} from "../lib/metaManagement";
import { stableHash } from "../lib/policy";

export const reviewWorkflowStepProcedure = protectedProcedure
  .input(
    z.object({
      organizationId: z.number().int().positive(),
      id: z.string().uuid(),
      nodeId: z.string().max(80),
      approve: z.boolean(),
      confirmActivation: z.boolean().optional(),
      refresh: z.boolean().optional(),
    })
  )
  .mutation(async ({ ctx, input }) => {
    await requireOrganizationRole(ctx.user.id, input.organizationId, [
      "owner",
      "admin",
      "publisher",
    ]);
    const db = await libraryDatabase();
    const claim = await withOrganizationTransaction(
      db,
      input.organizationId,
      async tx => {
        const [run] = await tx
          .select()
          .from(creativeWorkflowRuns)
          .where(
            and(
              eq(creativeWorkflowRuns.id, input.id),
              eq(creativeWorkflowRuns.organizationId, input.organizationId)
            )
          )
          .for("update");
        const step = run?.steps[input.nodeId],
          node = run?.graph.nodes.find(n => n.id === input.nodeId);
        if (
          !run ||
          !node ||
          !step ||
          step.status !== "waiting" ||
          run.stopRequested ||
          !["queued", "running"].includes(run.status) ||
          !["review", "meta_activate"].includes(node.type)
        )
          throw new TRPCError({
            code: "CONFLICT",
            message: "This step is no longer awaiting review.",
          });
        if (run.leaseOwner && run.leaseUntilMs > Date.now())
          throw new TRPCError({
            code: "CONFLICT",
            message: "The runner is updating this step. Try again in a moment.",
          });
        if (!input.approve && !input.refresh) {
          step.status = "failed";
          step.error = "The reviewer rejected this step.";
          await tx
            .update(creativeWorkflowRuns)
            .set({
              steps: run.steps,
              status: "failed",
              error: step.error,
              updatedAtMs: Date.now(),
            })
            .where(eq(creativeWorkflowRuns.id, run.id));
        } else if (node.type === "review") {
          const values = workflowInputs(run.graph, run.steps, node);
          await validateWorkflowValues(db, input.organizationId, values);
          if (stableHash(values) !== step.reviewHash)
            throw new TRPCError({
              code: "CONFLICT",
              message: "The inputs changed. Review the updated step.",
            });
          step.approvedByUserId = ctx.user.id;
          step.approvedAtMs = Date.now();
          await tx
            .update(creativeWorkflowRuns)
            .set({ steps: run.steps, leaseUntilMs: 0, updatedAtMs: Date.now() })
            .where(eq(creativeWorkflowRuns.id, run.id));
        } else {
          if (!step.reviewData)
            throw new TRPCError({
              code: "CONFLICT",
              message: "Refresh the activation review.",
            });
          const c = await getConnection(
              tx,
              input.organizationId,
              node.config.connectionId!,
              "meta_ads"
            ),
            change = metaChangeSchema.parse(step.reviewData.change);
          const prior = step.reviewData;
          // A different reviewer needs their own signed, visible review before acting.
          if (
            input.refresh ||
            verifyMetaReview(prior.ticket).userId !== ctx.user.id
          ) {
            const review = await reviewMetaChange(c, ctx.user.id, change);
            step.reviewData = {
              before: review.before,
              params: review.params,
              warnings: review.warnings,
              ticket: review.ticket,
              change,
            };
            await tx
              .update(creativeWorkflowRuns)
              .set({ steps: run.steps, updatedAtMs: Date.now() })
              .where(eq(creativeWorkflowRuns.id, run.id));
            return { ok: true, refreshed: true };
          }
          if (!input.confirmActivation)
            throw new TRPCError({
              code: "BAD_REQUEST",
              message:
                "Confirm activation after reviewing the existing ad and its spending implications.",
            });
          const token = randomUUID();
          step.status = "running";
          step.approvedByUserId = ctx.user.id;
          step.approvedAtMs = Date.now();
          await tx
            .update(creativeWorkflowRuns)
            .set({
              steps: run.steps,
              leaseOwner: token,
              leaseUntilMs: Date.now() + 600000,
              updatedAtMs: Date.now(),
            })
            .where(eq(creativeWorkflowRuns.id, run.id));
          return {
            activation: { connection: c, change, ticket: prior.ticket, token },
          };
        }
        await appendActivity(
          {
            organizationId: input.organizationId,
            actorUserId: ctx.user.id,
            action: input.approve
              ? "workflow.step_approved"
              : "workflow.step_rejected",
            entityType: "workflow_run",
            entityId: run.id,
            payload: { nodeId: node.id, reviewHash: step.reviewHash },
          },
          tx
        );
        return { ok: true, refreshed: false };
      }
    );
    if (!("activation" in claim) || !claim.activation)
      return { ok: true, refreshed: claim.refreshed ?? false };
    const activation = claim.activation;
    try {
      // Commit the workflow claim before invoking the existing one-time signed-review
      // service. Never hold the organization lock across its independent transaction.
      const result = await applyMetaChange(
        db,
        activation.connection,
        ctx.user.id,
        activation.ticket,
        activation.change
      );
      await withOrganizationTransaction(db, input.organizationId, async tx => {
        const [run] = await tx
          .select()
          .from(creativeWorkflowRuns)
          .where(
            and(
              eq(creativeWorkflowRuns.id, input.id),
              eq(creativeWorkflowRuns.organizationId, input.organizationId),
              eq(creativeWorkflowRuns.leaseOwner, activation.token)
            )
          )
          .for("update");
        if (!run)
          throw new Error(
            "Activation completed; refresh Meta to reconcile the workflow result."
          );
        const step = run.steps[input.nodeId];
        step.status = "completed";
        step.finishedAtMs = Date.now();
        step.outputs = [
          {
            type: "data",
            name: "Meta ad activated",
            data: {
              ...result,
              status: "ACTIVE",
              accountId: activation.connection.accountId,
            },
          },
        ];
        await tx
          .update(creativeWorkflowRuns)
          .set({
            steps: run.steps,
            leaseOwner: null,
            leaseUntilMs: 0,
            updatedAtMs: Date.now(),
          })
          .where(eq(creativeWorkflowRuns.id, run.id));
        await appendActivity(
          {
            organizationId: input.organizationId,
            actorUserId: ctx.user.id,
            action: "workflow.step_approved",
            entityType: "workflow_run",
            entityId: run.id,
            payload: { nodeId: input.nodeId },
          },
          tx
        );
      });
      return { ok: true, refreshed: false };
    } catch (error) {
      await withOrganizationTransaction(db, input.organizationId, async tx => {
        const [run] = await tx
          .select()
          .from(creativeWorkflowRuns)
          .where(
            and(
              eq(creativeWorkflowRuns.id, input.id),
              eq(creativeWorkflowRuns.organizationId, input.organizationId),
              eq(creativeWorkflowRuns.leaseOwner, activation.token)
            )
          )
          .for("update");
        if (!run) return;
        run.steps[input.nodeId].status = "failed";
        run.steps[input.nodeId].error =
          "Activation needs reconciliation. Check the ad in Meta before starting another run.";
        await tx
          .update(creativeWorkflowRuns)
          .set({
            steps: run.steps,
            status: "failed",
            error: run.steps[input.nodeId].error,
            leaseOwner: null,
            leaseUntilMs: 0,
            updatedAtMs: Date.now(),
          })
          .where(eq(creativeWorkflowRuns.id, run.id));
      });
      throw new TRPCError({
        code: "PRECONDITION_FAILED",
        message:
          error instanceof Error
            ? error.message
            : "Check Meta before retrying activation.",
      });
    }
  });
