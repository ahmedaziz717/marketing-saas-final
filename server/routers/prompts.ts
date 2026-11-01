import { z } from "zod";
import { and, desc, eq } from "drizzle-orm";
import { protectedProcedure, router } from "../_core/trpc";
import { requireOrganizationRole } from "../lib/access";
import { resolvedPrompts, changePrompt } from "../lib/promptRegistry";
import { promptRevisions } from "../../drizzle/schema";
import { getDb } from "../db";
const scope = z.object({ organizationId: z.number().int().positive() });
export const promptsRouter = router({
  list: protectedProcedure.input(scope).query(async ({ ctx, input }) => {
    await requireOrganizationRole(ctx.user.id, input.organizationId);
    return resolvedPrompts(input.organizationId);
  }),
  history: protectedProcedure
    .input(scope.extend({ promptId: z.string().max(180) }))
    .query(async ({ ctx, input }) => {
      await requireOrganizationRole(ctx.user.id, input.organizationId);
      return (await getDb())!
        .select()
        .from(promptRevisions)
        .where(
          and(
            eq(promptRevisions.organizationId, input.organizationId),
            eq(promptRevisions.promptId, input.promptId)
          )
        )
        .orderBy(desc(promptRevisions.revision))
        .limit(100);
    }),
  change: protectedProcedure
    .input(
      scope.extend({
        promptId: z.string().max(180),
        expectedRevision: z.number().int().nonnegative(),
        action: z.enum(["save", "restore_system", "restore_revision", "restore_original", "restore_brand_initial"]),
        value: z.string().max(12000).optional(),
        restoreRevision: z.number().int().positive().optional(),
        reason: z.string().trim().min(1).max(500),
      })
    )
    .mutation(async ({ ctx, input }) => {
      await requireOrganizationRole(ctx.user.id, input.organizationId, [
        "owner",
        "admin",
      ]);
      return changePrompt({ ...input, actorUserId: ctx.user.id });
    }),
});
