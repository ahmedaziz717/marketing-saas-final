import { and, desc, eq, sql } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { websiteProfile, websiteRequests } from "../../drizzle/websiteSchema";
import {
  REQUEST_STATES,
  websiteProfileSchema,
} from "../../shared/publicWebsite";
import { adminProcedure, router } from "../_core/trpc";
import { libraryDatabase } from "../lib/assetLibrary";
import { readWebsiteProfile } from "../lib/publicWebsite";
import { websiteEmailConfigured } from "../lib/websiteNotifications";
export const publicWebsiteAdminRouter = router({
  profile: adminProcedure.query(() => readWebsiteProfile()),
  saveProfile: adminProcedure
    .input(
      z.object({
        profile: websiteProfileSchema,
        revision: z.number().int().min(0),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const p = input.profile;
      if (
        p.disclosuresApproved &&
        (!p.operatorName || !p.supportEmail || !p.privacyEmail)
      )
        throw new TRPCError({
          code: "BAD_REQUEST",
          message:
            "Confirm the legal operator, support and privacy email before approving the public disclosures.",
        });
      const db = await libraryDatabase();
      return db.transaction(async tx => {
        await tx.execute(sql`select pg_advisory_xact_lock(73911922)`);
        const row = (
          await tx
            .select()
            .from(websiteProfile)
            .where(eq(websiteProfile.id, "public"))
            .limit(1)
        )[0];
        if ((row?.revision ?? 0) !== input.revision)
          throw new TRPCError({
            code: "CONFLICT",
            message: "Website settings changed. Reload before saving.",
          });
        const values = {
          profile: p,
          updatedBy: ctx.user.id,
          updatedAtMs: Date.now(),
          revision: (row?.revision ?? 0) + 1,
        };
        if (row)
          await tx
            .update(websiteProfile)
            .set(values)
            .where(eq(websiteProfile.id, "public"));
        else
          await tx.insert(websiteProfile).values({ id: "public", ...values });
        return { success: true };
      });
    }),
  requests: adminProcedure
    .input(
      z
        .object({
          before: z
            .object({ createdAtMs: z.number().int().positive(), id: z.uuid() })
            .optional(),
        })
        .optional()
    )
    .query(async ({ input }) => {
      const db = await libraryDatabase();
      // Never return receipt hashes. Only platform administrators can access this inbox.
      const rows = await db
        .select({
          id: websiteRequests.id,
          name: websiteRequests.name,
          email: websiteRequests.email,
          topic: websiteRequests.topic,
          workspace: websiteRequests.workspace,
          message: websiteRequests.message,
          emailState: websiteRequests.emailState,
          emailAttempts: websiteRequests.emailAttempts,
          emailSentAtMs: websiteRequests.emailSentAtMs,
          emailLastError: websiteRequests.emailLastError,
          state: websiteRequests.state,
          resolutionNote: websiteRequests.resolutionNote,
          createdAtMs: websiteRequests.createdAtMs,
          updatedAtMs: websiteRequests.updatedAtMs,
        })
        .from(websiteRequests)
        .where(
          input?.before
            ? sql`(${websiteRequests.createdAtMs}, ${websiteRequests.id}) < (${input.before.createdAtMs}, ${input.before.id}::uuid)`
            : undefined
        )
        .orderBy(desc(websiteRequests.createdAtMs), desc(websiteRequests.id))
        .limit(101);
      const items = rows.slice(0, 100);
      const last = items.at(-1);
      return {
        items,
        deliveryConfigured: websiteEmailConfigured(),
        nextBefore:
          rows.length > 100 && last
            ? { createdAtMs: last.createdAtMs, id: last.id }
            : null,
      };
    }),
  updateRequest: adminProcedure
    .input(
      z.object({
        id: z.uuid(),
        updatedAtMs: z.number().int(),
        state: z.enum(REQUEST_STATES),
        note: z.string().trim().min(5).max(2000),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const db = await libraryDatabase();
      const updated = await db
        .update(websiteRequests)
        .set({
          state: input.state,
          resolutionNote: input.note,
          updatedBy: ctx.user.id,
          updatedAtMs: Math.max(Date.now(), input.updatedAtMs + 1),
        })
        .where(
          and(
            eq(websiteRequests.id, input.id),
            eq(websiteRequests.updatedAtMs, input.updatedAtMs)
          )
        )
        .returning({ id: websiteRequests.id });
      if (!updated.length)
        throw new TRPCError({
          code: "CONFLICT",
          message: "Request changed or no longer exists. Refresh the inbox.",
        });
      return { success: true, dataDeleted: false };
    }),
});
