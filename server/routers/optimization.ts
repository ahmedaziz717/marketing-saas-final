import { installOptimizationTemplates } from "../lib/optimizationTemplates";
import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { protectedProcedure, router } from "../_core/trpc";
import { requireOrganizationRole } from "../lib/access";
import {
  optimizationEnabled,
  requireOptimization,
} from "../lib/optimizationFlags";
import { libraryDatabase } from "../lib/assetLibrary";
import { queueHistory } from "../lib/optimizationIngestion";
import {
  analyzeHistory,
  classifyHistoryBatch,
  saveClassification,
  evidenceCsv,
} from "../lib/optimizationAnalysis";
import { optimizationSyncs } from "../../drizzle/optimizationSchema";
import {
  analysisQuerySchema,
  assertionSchema,
} from "../../shared/optimization";
const scope = z.object({ organizationId: z.number().int().positive() });
const account = scope.extend({ connectionId: z.string().uuid() });
async function authorize(
  userId: number,
  organizationId: number,
  write = false
) {
  await requireOrganizationRole(
    userId,
    organizationId,
    write ? ["owner", "admin", "creator", "publisher"] : undefined
  );
  requireOptimization(organizationId);
}
export const optimizationRouter = router({
  installTemplates: protectedProcedure
    .input(account.extend({ includeClx: z.boolean().default(false) }))
    .mutation(async ({ ctx, input }) => {
      await authorize(ctx.user.id, input.organizationId, true);
      return installOptimizationTemplates(
        await libraryDatabase(),
        input.organizationId,
        ctx.user.id,
        input.connectionId,
        input.includeClx
      );
    }),
  availability: protectedProcedure
    .input(scope)
    .query(async ({ ctx, input }) => {
      await requireOrganizationRole(ctx.user.id, input.organizationId);
      return { enabled: optimizationEnabled(input.organizationId) };
    }),
  sync: protectedProcedure
    .input(account.extend({ incremental: z.boolean().default(false) }))
    .mutation(async ({ ctx, input }) => {
      await authorize(ctx.user.id, input.organizationId, true);
      return queueHistory(
        await libraryDatabase(),
        input.organizationId,
        ctx.user.id,
        input.connectionId,
        input.incremental
      );
    }),
  progress: protectedProcedure.input(account).query(async ({ ctx, input }) => {
    await authorize(ctx.user.id, input.organizationId);
    const [r] = await (
      await libraryDatabase()
    )
      .select()
      .from(optimizationSyncs)
      .where(
        and(
          eq(optimizationSyncs.organizationId, input.organizationId),
          eq(optimizationSyncs.connectionId, input.connectionId)
        )
      );
    if (!r) return null;
    return {
      id: r.id,
      status: r.status,
      range: { since: r.since, until: r.until },
      pages: r.checkpoint.pages,
      rows: r.checkpoint.rows,
      completedTasks: r.checkpoint.completedTasks,
      totalTasks: r.tasks.length,
      warnings: r.checkpoint.warnings,
      error: r.error,
      updatedAtMs: r.updatedAtMs,
      nextAtMs: r.nextAtMs,
    };
  }),
  resume: protectedProcedure.input(account).mutation(async ({ ctx, input }) => {
    await authorize(ctx.user.id, input.organizationId, true);
    await (
      await libraryDatabase()
    )
      .update(optimizationSyncs)
      .set({
        status: "queued",
        error: null,
        attempts: 0,
        nextAtMs: 0,
        updatedAtMs: Date.now(),
      })
      .where(
        and(
          eq(optimizationSyncs.organizationId, input.organizationId),
          eq(optimizationSyncs.connectionId, input.connectionId),
          eq(optimizationSyncs.status, "failed")
        )
      );
    return { ok: true };
  }),
  classify: protectedProcedure
    .input(account.extend({ after: z.string().max(100).default("") }))
    .mutation(async ({ ctx, input }) => {
      await authorize(ctx.user.id, input.organizationId, true);
      return classifyHistoryBatch(
        await libraryDatabase(),
        input.organizationId,
        input.connectionId,
        input.after
      );
    }),
  override: protectedProcedure
    .input(
      account.extend({
        adId: z.string().regex(/^\d+$/),
        assertion: assertionSchema,
      })
    )
    .mutation(async ({ ctx, input }) => {
      await authorize(ctx.user.id, input.organizationId, true);
      return saveClassification(
        await libraryDatabase(),
        input.organizationId,
        input.connectionId,
        input.adId,
        input.assertion,
        "human",
        ctx.user.id
      );
    }),
  analyze: protectedProcedure
    .input(account.extend({ query: analysisQuerySchema }))
    .query(async ({ ctx, input }) => {
      await authorize(ctx.user.id, input.organizationId);
      return analyzeHistory(
        await libraryDatabase(),
        input.organizationId,
        input.connectionId,
        input.query
      );
    }),
  export: protectedProcedure
    .input(account.extend({ query: analysisQuerySchema }))
    .mutation(async ({ ctx, input }) => {
      await authorize(ctx.user.id, input.organizationId);
      const report = await analyzeHistory(
        await libraryDatabase(),
        input.organizationId,
        input.connectionId,
        input.query
      );
      return {
        filename: `meta-evidence-${input.query.range.since}-${input.query.range.until}.csv`,
        csv: evidenceCsv(report),
      };
    }),
});
