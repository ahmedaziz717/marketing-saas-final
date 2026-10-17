import { workflowMediaChoices } from "../lib/workflowMedia";
import { workflowImageReferences } from "../lib/creativeWorkflows";
import { readGenerationSource } from "../lib/creativeImages";
import {
  appFieldSchema,
  choiceSchema,
  fieldChoices,
  fieldValueProblem,
  isChoiceField,
} from "../../shared/workflowInputs";
import { marketingJson } from "../lib/marketingDrafts";
import { brandKits, products } from "../../drizzle/schema";
import { randomUUID } from "node:crypto";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { workflowRunOccupiesSlot } from "../../shared/workflowRunActivity";
import { z } from "zod";
import {
  creativeWorkflows,
  creativeWorkflowRuns,
  workflowAppVersions,
} from "../../drizzle/workflowSchema";
import {
  workflowGraphSchema,
  workflowGraphProblem,
  workflowFamilies,
  workflowRoles,
  workflowRunProblem,
  isGenerationNode,
} from "../../shared/creativeWorkflow";
import { getWorkflowApp, resolveWorkflowApps } from "../lib/workflowApps";
import { reviewWorkflowStepProcedure } from "./workflowReview";
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
  appVersionId: z.string().uuid().optional(),
  inputs: z
    .array(
      z.object({
        id: z.string().max(80),
        text: z.string().max(10000).optional(),
        value: z.string().max(10000).optional(),
        imageKey: z
          .string()
          .regex(/^(asset|creative|product_image):[1-9][0-9]*$/)
          .optional(),
      })
    )
    .max(40)
    .optional(),
  revision: z.number().int().positive(),
  target: z.string().max(80).optional(),
});
async function runnable(
  db: Awaited<ReturnType<typeof libraryDatabase>>,
  input: z.infer<typeof runInput>
) {
  const workflow = await getWorkflow(db, input.organizationId, input.id);
  const app = input.appVersionId
    ? await getWorkflowApp(db, input.organizationId, input.appVersionId)
    : null;
  if (app && app.workflowId !== workflow.id)
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Choose the matching workflow for this App.",
    });
  const graph = structuredClone(app?.graph ?? workflow.graph);
  for (const field of input.inputs ?? []) {
    const node = graph.nodes.find(n => n.id === field.id);
    if (!node || !["text", "image", "app_input"].includes(node.type))
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "Only declared App inputs can be changed.",
      });
    if (node.config.field) {
      if (!node.config.field.locked && field.value !== undefined)
        node.config.fieldValue = field.value;
      else if (
        !node.config.field.locked &&
        node.type === "image" &&
        field.imageKey
      )
        node.config.fieldValue = field.imageKey;
      continue;
    }
    if (node.type === "image" && field.imageKey)
      node.config.imageKey = field.imageKey;
    else if (
      ["text", "app_input"].includes(node.type) &&
      field.text !== undefined
    )
      node.config.text = field.text;
  }
  return {
    ...workflow,
    graph,
    revision: app ? input.revision : workflow.revision,
  };
}
export const workflowsRouter = router({
  mediaChoices: protectedProcedure
    .input(
      scope.extend({
        search: z.string().max(300).default(""),
        offset: z.number().int().min(0).default(0),
        selectedValue: z.string().max(10000).default(""),
        kind: z.enum(["asset", "product"]),
      })
    )
    .query(async ({ ctx, input }) => {
      const { membership } = await requireOrganizationRole(
        ctx.user.id,
        input.organizationId,
        [...workflowRoles]
      );
      return {
        ...(await workflowMediaChoices(
          await libraryDatabase(),
          input.organizationId,
          input
        )),
        role: membership.role,
      };
    }),
  assistInput: protectedProcedure
    .input(
      scope.extend({
        field: appFieldSchema,
        title: z.string().max(100),
        direction: z.string().max(3000),
        context: z.string().max(16000).default(""),
        count: z.number().int().min(1).max(20).default(5),
        mode: z.enum(["choices", "copy"]),
        productIds: z.array(z.number().int().positive()).max(40).default([]),
        imageKeys: z
          .array(
            z.string().regex(/^(asset|creative|product_image):[1-9][0-9]*$/)
          )
          .max(40)
          .default([]),
      })
    )
    .mutation(async ({ ctx, input }) => {
      await requireOrganizationRole(ctx.user.id, input.organizationId, [
        ...workflowRoles,
      ]);
      const db = await libraryDatabase();
      const [brand] = await db
        .select()
        .from(brandKits)
        .where(eq(brandKits.organizationId, input.organizationId))
        .limit(1);
      const catalog = input.productIds.length
        ? await db
            .select({
              name: products.name,
              description: products.description,
              specifications: products.specifications,
              serviceDetails: products.serviceDetails,
            })
            .from(products)
            .where(
              and(
                eq(products.organizationId, input.organizationId),
                inArray(products.id, input.productIds)
              )
            )
        : [];
      const references = await workflowImageReferences(
        db,
        input.organizationId,
        input.imageKeys.slice(0, 4)
      );
      const images = await Promise.all(
        references.map(async r => {
          const source = await readGenerationSource(r.storageKey);
          return `data:${source.mimeType};base64,${source.b64Json}`;
        })
      );
      const context = {
        catalog,
        field: input.title,
        kind: input.field.kind,
        direction: input.direction,
        instructions: input.field.aiInstructions,
        context: input.context,
        brand: brand
          ? {
              voice: brand.voice,
              business: brand.businessProfile,
              restrictions: brand.prohibitedContent,
            }
          : null,
      };
      return marketingJson(
        input.mode === "choices"
          ? `Generate exactly ${input.count} distinct creative choices. Return {options:[{id,label,direction}]}. Each direction must be useful generation instructions, not just a name. IDs must be distinct.`
          : `Write exactly ${input.count} distinct alternatives for the requested copy field. Return {options:[{id,label,direction}]}. Put the complete proposed copy in direction, with a short label. Preserve verified facts. Proposals are for review; do not claim performance improvements without evidence.`,
        context,
        z.object({
          options: z
            .array(choiceSchema)
            .length(input.count)
            .refine(
              o => new Set(o.map(x => x.id)).size === o.length,
              "Return unique choice IDs."
            ),
        }),
        images
      );
    }),
  reviewStep: reviewWorkflowStepProcedure,
  listApps: protectedProcedure
    .input(scope.extend({ family: z.enum(workflowFamilies).optional() }))
    .query(async ({ ctx, input }) => {
      await requireOrganizationRole(ctx.user.id, input.organizationId, [
        ...workflowRoles,
      ]);
      const rows = await (
        await libraryDatabase()
      )
        .select({ app: workflowAppVersions })
        .from(workflowAppVersions)
        .innerJoin(
          creativeWorkflows,
          and(
            eq(creativeWorkflows.id, workflowAppVersions.workflowId),
            eq(creativeWorkflows.organizationId, input.organizationId),
            eq(creativeWorkflows.archived, 0)
          )
        )
        .where(
          and(
            eq(workflowAppVersions.organizationId, input.organizationId),
            input.family
              ? eq(workflowAppVersions.family, input.family)
              : undefined
          )
        )
        .orderBy(desc(workflowAppVersions.createdAtMs))
        .limit(1000);
      return rows.map(r => r.app);
    }),
  getApp: protectedProcedure.input(reference).query(async ({ ctx, input }) => {
    await requireOrganizationRole(ctx.user.id, input.organizationId, [
      ...workflowRoles,
    ]);
    return getWorkflowApp(
      await libraryDatabase(),
      input.organizationId,
      input.id
    );
  }),
  publishApp: protectedProcedure
    .input(
      reference.extend({
        revision: z.number().int().positive(),
        name: z.string().trim().min(1).max(100).optional(),
        description: z.string().trim().max(600).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      await requireOrganizationRole(ctx.user.id, input.organizationId, [
        ...workflowRoles,
      ]);
      const db = await libraryDatabase();
      return withOrganizationTransaction(db, input.organizationId, async tx => {
        const workflow = await getWorkflow(tx, input.organizationId, input.id);
        if (workflow.revision !== input.revision)
          throw new TRPCError({
            code: "CONFLICT",
            message: "Save the latest workflow before publishing an App.",
          });
        if (!workflow.graph.nodes.some(n => n.type === "output"))
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Add an Output step to declare this App’s results.",
          });
        if (workflow.graph.nodes.some(n => n.type === "app_output"))
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "App result steps are managed by the workflow runner.",
          });
        for (const n of workflow.graph.nodes) {
          const f = n.config.field;
          if (!f) continue;
          let problem: string | null = null;
          if (
            n.type !== "app_input" &&
            !(n.type === "image" && f.kind === "asset")
          )
            problem = "Only App input steps can define form fields.";
          else if (!workflow.graph.edges.some(e => e.source === n.id))
            problem = "Connect this field to a workflow step.";
          else if (isChoiceField(f) && !fieldChoices(f).length)
            problem = "Include at least one choice.";
          else if (
            new Set(fieldChoices(f).map(o => o.id)).size !==
            fieldChoices(f).length
          )
            problem = "Choice identifiers must be unique.";
          else if (
            f.visibleWhen &&
            !workflow.graph.nodes.some(
              p =>
                p.id === f.visibleWhen!.fieldId &&
                p.id !== n.id &&
                p.config.field &&
                !p.config.field.visibleWhen
            )
          )
            problem = "Visibility must depend on an unconditional App field.";
          else if (f.locked || f.defaultValue)
            problem = fieldValueProblem(f, f.defaultValue);
          if (problem)
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: `${n.title}: ${problem}`,
            });
        }
        await resolveWorkflowApps(tx, input.organizationId, workflow.graph);
        const [latest] = await tx
          .select()
          .from(workflowAppVersions)
          .where(
            and(
              eq(workflowAppVersions.workflowId, input.id),
              eq(workflowAppVersions.organizationId, input.organizationId)
            )
          )
          .orderBy(desc(workflowAppVersions.version))
          .limit(1);
        const [app] = await tx
          .insert(workflowAppVersions)
          .values({
            id: randomUUID(),
            organizationId: input.organizationId,
            workflowId: workflow.id,
            version: (latest?.version ?? 0) + 1,
            workflowRevision: workflow.revision,
            family: workflow.family,
            name: input.name ?? latest?.name ?? workflow.name,
            description: input.description ?? latest?.description ?? "",
            graph: {
              ...workflow.graph,
              nodes: workflow.graph.nodes.map(n =>
                n.config.field
                  ? {
                      ...n,
                      config: {
                        ...n.config,
                        fieldValue: undefined,
                        field: {
                          ...n.config.field,
                          source:
                            n.config.field.source === "system"
                              ? ("curated" as const)
                              : n.config.field.source,
                          options: fieldChoices(n.config.field),
                        },
                      },
                    }
                  : n
              ),
            },
            actorUserId: ctx.user.id,
            createdAtMs: Date.now(),
          })
          .returning();
        await appendActivity(
          {
            organizationId: input.organizationId,
            actorUserId: ctx.user.id,
            action: "workflow.app_published",
            entityType: "workflow_app",
            entityId: app.id,
            payload: {
              workflowId: workflow.id,
              version: app.version,
              revision: workflow.revision,
            },
          },
          tx
        );
        return app;
      });
    }),
  list: protectedProcedure
    .input(
      scope.extend({
        family: z.enum(workflowFamilies).optional(),
        studio: z.literal("optimization").optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      await requireOrganizationRole(ctx.user.id, input.organizationId, [
        ...workflowRoles,
      ]);
      return (await libraryDatabase())
        .select({
          id: creativeWorkflows.id,
          family: creativeWorkflows.family,
          name: creativeWorkflows.name,
          revision: creativeWorkflows.revision,
          updatedAtMs: creativeWorkflows.updatedAtMs,
        })
        .from(creativeWorkflows)
        .where(
          and(
            eq(creativeWorkflows.organizationId, input.organizationId),
            eq(creativeWorkflows.archived, 0),
            input.studio
              ? sql`${creativeWorkflows.graph}->'optimizationStudio' IS NOT NULL`
              : undefined,
            input.family
              ? eq(creativeWorkflows.family, input.family)
              : undefined
          )
        )
        .orderBy(desc(creativeWorkflows.updatedAtMs))
        .limit(250);
    }),
  getRun: protectedProcedure
    .input(reference.extend({ workflowId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      await requireOrganizationRole(ctx.user.id, input.organizationId, [
        ...workflowRoles,
      ]);
      const [run] = await (
        await libraryDatabase()
      )
        .select()
        .from(creativeWorkflowRuns)
        .where(
          and(
            eq(creativeWorkflowRuns.id, input.id),
            eq(creativeWorkflowRuns.organizationId, input.organizationId),
            eq(creativeWorkflowRuns.workflowId, input.workflowId)
          )
        )
        .limit(1);
      if (!run)
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Run not found in this workspace and workflow.",
        });
      return publicWorkflowRun(run);
    }),
  get: protectedProcedure.input(reference).query(async ({ ctx, input }) => {
    await requireOrganizationRole(ctx.user.id, input.organizationId, [
      ...workflowRoles,
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
    const [published] = await db
      .select({
        id: workflowAppVersions.id,
        version: workflowAppVersions.version,
        name: workflowAppVersions.name,
        description: workflowAppVersions.description,
      })
      .from(workflowAppVersions)
      .where(
        and(
          eq(workflowAppVersions.organizationId, input.organizationId),
          eq(workflowAppVersions.workflowId, input.id)
        )
      )
      .orderBy(desc(workflowAppVersions.version))
      .limit(1);
    return {
      ...workflow,
      latestPublishedVersion: published?.version ?? null,
      latestPublishedApp: published ?? null,
      runs: runs.map(publicWorkflowRun),
    };
  }),
  save: protectedProcedure
    .input(
      scope.extend({
        id: z.string().uuid().optional(),
        revision: z.number().int().positive().optional(),
        name: z.string().trim().min(1).max(100),
        family: z.enum(workflowFamilies).optional(),
        graph: workflowGraphSchema,
      })
    )
    .mutation(async ({ ctx, input }) => {
      await requireOrganizationRole(ctx.user.id, input.organizationId, [
        ...workflowRoles,
      ]);
      if (input.graph.nodes.some(n => n.type === "app_output"))
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "App result steps are managed by the workflow runner.",
        });
      const problem = workflowGraphProblem(input.graph);
      if (problem)
        throw new TRPCError({ code: "BAD_REQUEST", message: problem });
      const db = await libraryDatabase();
      return withOrganizationTransaction(db, input.organizationId, async tx => {
        const now = Date.now();
        if (input.graph.optimizationStudio) {
          const family =
            input.family ??
            (input.id
              ? (await getWorkflow(tx, input.organizationId, input.id)).family
              : "create");
          if (family !== "optimize")
            throw new TRPCError({
              code: "BAD_REQUEST",
              message:
                "Optimization Studio plans belong to Optimize workflows.",
            });
          const sources = input.graph.optimizationStudio.experiments.flatMap(
            p => (p.source ? [p.source] : [])
          );
          if (sources.length) {
            const runs = input.id
              ? await tx
                  .select()
                  .from(creativeWorkflowRuns)
                  .where(
                    and(
                      eq(
                        creativeWorkflowRuns.organizationId,
                        input.organizationId
                      ),
                      eq(creativeWorkflowRuns.workflowId, input.id),
                      eq(creativeWorkflowRuns.status, "completed"),
                      inArray(
                        creativeWorkflowRuns.id,
                        Array.from(new Set(sources.map(s => s.runId)))
                      )
                    )
                  )
              : [];
            if (
              sources.some(
                source =>
                  !runs.some(
                    run =>
                      run.id === source.runId &&
                      Object.values(run.steps).some(step =>
                        step.outputs?.some(
                          v =>
                            v.type === "data" &&
                            v.data.schemaVersion === 1 &&
                            v.data.kind === source.kind
                        )
                      )
                  )
              )
            )
              throw new TRPCError({
                code: "BAD_REQUEST",
                message:
                  "Choose completed evidence from this optimization plan for each experiment.",
              });
          }
        }
        if (input.id) {
          const [saved] = await tx
            .update(creativeWorkflows)
            .set({
              ...(input.family ? { family: input.family } : {}),
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
            family: input.family ?? "create",
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
        ...workflowRoles,
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
      ...workflowRoles,
    ]);
    const db = await libraryDatabase(),
      workflow = await runnable(db, input);
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
    if (
      prepared.graph.nodes.some(
        n =>
          prepared.steps[n.id] &&
          ["deliver_publication", "meta_activate"].includes(n.type)
      )
    )
      await requireOrganizationRole(ctx.user.id, input.organizationId, [
        "owner",
        "admin",
        "publisher",
      ]);
    if (
      prepared.graph.nodes.some(
        n => prepared.steps[n.id] && isGenerationNode(n.type)
      )
    )
      await requireOrganizationRole(ctx.user.id, input.organizationId, [
        "owner",
        "admin",
        "creator",
      ]);
    return {
      credits: prepared.credits,
      nodeNames: Object.fromEntries(
        prepared.graph.nodes.map(n => [n.id, n.title])
      ),
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
        ...workflowRoles,
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
      const workflow = await runnable(db, input);
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
      if (
        prepared.graph.nodes.some(
          n =>
            prepared.steps[n.id] &&
            ["deliver_publication", "meta_activate"].includes(n.type)
        )
      )
        await requireOrganizationRole(ctx.user.id, input.organizationId, [
          "owner",
          "admin",
          "publisher",
        ]);
      if (
        prepared.graph.nodes.some(
          n => prepared.steps[n.id] && isGenerationNode(n.type)
        )
      )
        await requireOrganizationRole(ctx.user.id, input.organizationId, [
          "owner",
          "admin",
          "creator",
        ]);
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
        if (
          !current ||
          (!input.appVersionId && current.revision !== input.revision)
        )
          throw new TRPCError({
            code: "CONFLICT",
            message: "The workflow changed. Review a new estimate.",
          });
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
          throw new TRPCError({
            code: "TOO_MANY_REQUESTS",
            message:
              "Three workflows are processing in this workspace. Let one finish or stop an unneeded run from its workflow. Runs awaiting approval or a paused history import do not count toward this limit.",
          });
        const state = await creditState(tx, input.organizationId);
        if (
          prepared.credits > 0 &&
          (state.account?.aiPaused ||
            (state.account?.enforceCredits &&
              state.remaining < prepared.credits))
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
            appVersionId: input.appVersionId ?? null,
            graph: prepared.graph,
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
      ...workflowRoles,
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
