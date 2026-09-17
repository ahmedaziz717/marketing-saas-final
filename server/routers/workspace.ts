import { randomBytes } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import {
  brandKits,
  organizationInvites,
  organizationMemberships,
  organizations,
  users,
} from "../../drizzle/schema";
import { getDb } from "../db";
import { appendActivity } from "../lib/activity";
import { requireOrganizationRole } from "../lib/access";
import { protectedProcedure, router } from "../_core/trpc";

const teamInput = z.object({ organizationId: z.number().int().positive() });
type TeamTransaction = Parameters<
  Parameters<NonNullable<Awaited<ReturnType<typeof getDb>>>["transaction"]>[0]
>[0];
async function teamManager(
  tx: TeamTransaction,
  userId: number,
  organizationId: number
) {
  const actor = (
    await tx
      .select()
      .from(organizationMemberships)
      .where(
        and(
          eq(organizationMemberships.userId, userId),
          eq(organizationMemberships.organizationId, organizationId),
          eq(organizationMemberships.status, "active")
        )
      )
  )[0];
  if (!actor || !["owner", "admin"].includes(actor.role))
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Your workspace role does not permit team management",
    });
  return actor;
}
function inviteOrigin(origin: string) {
  const expected = process.env.APP_ORIGIN || process.env.RENDER_EXTERNAL_URL;
  const value = new URL(expected || origin);
  if (process.env.NODE_ENV === "production" && !expected)
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message: "Invitation URL is not configured",
    });
  return value.origin;
}
export function assertTeamChange(
  actorRole: string,
  targetRole: string,
  self = false
) {
  if (
    self ||
    targetRole === "owner" ||
    (actorRole !== "owner" && (actorRole !== "admin" || targetRole === "admin"))
  ) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message:
        "You cannot change this member. Owners and your own membership are protected.",
    });
  }
}
const roleSchema = z.enum(["admin", "creator", "reviewer", "publisher"]);

function slugify(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 140);
}

export const workspaceRouter = router({
  mine: protectedProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db)
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "Database unavailable",
      });
    return db
      .select({
        organization: organizations,
        membership: organizationMemberships,
      })
      .from(organizationMemberships)
      .innerJoin(
        organizations,
        eq(organizations.id, organizationMemberships.organizationId)
      )
      .where(
        and(
          eq(organizationMemberships.userId, ctx.user.id),
          eq(organizationMemberships.status, "active")
        )
      );
  }),

  create: protectedProcedure
    .input(z.object({ name: z.string().min(2).max(160) }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db)
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Database unavailable",
        });
      const now = Date.now();
      const base = slugify(input.name) || "workspace";
      const slug = `${base}-${randomBytes(3).toString("hex")}`;
      const result = await db.transaction(async tx => {
        const inserted = await tx
          .insert(organizations)
          .values({
            name: input.name.trim(),
            slug,
            createdByUserId: ctx.user.id,
            createdAtMs: now,
          })
          .returning({ insertId: organizations.id });
        const organizationId = Number(inserted[0].insertId);
        await tx
          .insert(organizationMemberships)
          .values({
            organizationId,
            userId: ctx.user.id,
            role: "owner",
            status: "active",
            createdAtMs: now,
          })
          .returning({ insertId: organizationMemberships.id });
        await tx
          .insert(brandKits)
          .values({
            organizationId,
            name: `${input.name.trim()} Brand`,
            colors: ["#15141A", "#F4F1EA"],
            fonts: ["Manrope"],
            status: "draft",
            updatedByUserId: ctx.user.id,
            updatedAtMs: now,
          })
          .returning({ insertId: brandKits.id });
        return { organizationId, slug };
      });
      await appendActivity({
        organizationId: result.organizationId,
        actorUserId: ctx.user.id,
        action: "workspace.created",
        entityType: "organization",
        entityId: result.organizationId,
        payload: { name: input.name.trim() },
      });
      return result;
    }),

  current: protectedProcedure
    .input(z.object({ organizationId: z.number().int().positive() }))
    .query(async ({ ctx, input }) => {
      return requireOrganizationRole(ctx.user.id, input.organizationId);
    }),

  members: protectedProcedure
    .input(z.object({ organizationId: z.number().int().positive() }))
    .query(async ({ ctx, input }) => {
      await requireOrganizationRole(ctx.user.id, input.organizationId);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      return db
        .select({
          membership: organizationMemberships,
          user: { id: users.id, name: users.name, email: users.email },
        })
        .from(organizationMemberships)
        .innerJoin(users, eq(users.id, organizationMemberships.userId))
        .where(
          and(
            eq(organizationMemberships.organizationId, input.organizationId),
            eq(organizationMemberships.status, "active")
          )
        );
    }),

  invites: protectedProcedure.input(teamInput).query(async ({ ctx, input }) => {
    await requireOrganizationRole(ctx.user.id, input.organizationId, [
      "owner",
      "admin",
    ]);
    const db = (await getDb())!;
    return db
      .select({
        id: organizationInvites.id,
        email: organizationInvites.email,
        role: organizationInvites.role,
        status: organizationInvites.status,
        expiresAtMs: organizationInvites.expiresAtMs,
        createdAtMs: organizationInvites.createdAtMs,
      })
      .from(organizationInvites)
      .where(
        and(
          eq(organizationInvites.organizationId, input.organizationId),
          eq(organizationInvites.status, "pending")
        )
      );
  }),
  updateMember: protectedProcedure
    .input(
      teamInput.extend({
        memberId: z.number().int().positive(),
        role: roleSchema.optional(),
        remove: z.boolean().default(false),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const db = (await getDb())!;
      await db.transaction(async tx => {
        await tx
          .select()
          .from(organizations)
          .where(eq(organizations.id, input.organizationId))
          .for("update");
        const actor = await teamManager(tx, ctx.user.id, input.organizationId);
        const target = (
          await tx
            .select()
            .from(organizationMemberships)
            .where(
              and(
                eq(organizationMemberships.id, input.memberId),
                eq(
                  organizationMemberships.organizationId,
                  input.organizationId
                ),
                eq(organizationMemberships.status, "active")
              )
            )
        )[0];
        if (!target) throw new TRPCError({ code: "NOT_FOUND" });
        assertTeamChange(
          actor.role,
          target.role,
          target.userId === ctx.user.id
        );
        if (input.role === "admin" && actor.role !== "owner")
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "Only owners can appoint administrators",
          });
        if (!input.remove && !input.role)
          throw new TRPCError({ code: "BAD_REQUEST" });
        await tx
          .update(organizationMemberships)
          .set(input.remove ? { status: "suspended" } : { role: input.role })
          .where(eq(organizationMemberships.id, target.id));
        if (input.remove) {
          const user = (
            await tx.select().from(users).where(eq(users.id, target.userId))
          )[0];
          if (user?.email)
            await tx
              .update(organizationInvites)
              .set({ status: "revoked" })
              .where(
                and(
                  eq(organizationInvites.organizationId, input.organizationId),
                  eq(organizationInvites.email, user.email.toLowerCase()),
                  eq(organizationInvites.status, "pending")
                )
              );
        }
      });
      await appendActivity({
        organizationId: input.organizationId,
        actorUserId: ctx.user.id,
        action: input.remove ? "member.removed" : "member.role_changed",
        entityType: "membership",
        entityId: input.memberId,
        payload: { role: input.role },
      });
      return { success: true };
    }),
  createInvite: protectedProcedure
    .input(
      teamInput.extend({
        email: z.string().trim().email(),
        role: roleSchema,
        origin: z.string().url(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const origin = inviteOrigin(input.origin);
      const db = (await getDb())!;
      const token = randomBytes(32).toString("hex");
      const now = Date.now();
      const email = input.email.toLowerCase();
      const id = await db.transaction(async tx => {
        await tx
          .select()
          .from(organizations)
          .where(eq(organizations.id, input.organizationId))
          .for("update");
        const actor = await teamManager(tx, ctx.user.id, input.organizationId);
        if (input.role === "admin" && actor.role !== "owner")
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "Only owners can invite administrators",
          });
        const existing = await tx
          .select()
          .from(organizationMemberships)
          .innerJoin(users, eq(users.id, organizationMemberships.userId))
          .where(
            and(
              eq(organizationMemberships.organizationId, input.organizationId),
              eq(users.email, email),
              eq(organizationMemberships.status, "active")
            )
          );
        if (existing.length)
          throw new TRPCError({
            code: "CONFLICT",
            message: "This person is already a member",
          });
        const pending = await tx
          .select()
          .from(organizationInvites)
          .where(
            and(
              eq(organizationInvites.organizationId, input.organizationId),
              eq(organizationInvites.email, email),
              eq(organizationInvites.status, "pending")
            )
          );
        if (actor.role !== "owner" && pending.some(x => x.role === "admin"))
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "Only owners can renew administrator invitations",
          });
        await tx
          .update(organizationInvites)
          .set({ status: "revoked" })
          .where(
            and(
              eq(organizationInvites.organizationId, input.organizationId),
              eq(organizationInvites.email, email),
              eq(organizationInvites.status, "pending")
            )
          );
        return (
          await tx
            .insert(organizationInvites)
            .values({
              organizationId: input.organizationId,
              email,
              role: input.role,
              token,
              status: "pending",
              invitedByUserId: ctx.user.id,
              expiresAtMs: now + 7 * 24 * 60 * 60 * 1000,
              createdAtMs: now,
            })
            .returning({ id: organizationInvites.id })
        )[0].id;
      });
      await appendActivity({
        organizationId: input.organizationId,
        actorUserId: ctx.user.id,
        action: "member.invited",
        entityType: "invite",
        entityId: id,
        payload: { email, role: input.role },
      });
      return { inviteUrl: `${origin}/invite/${token}` };
    }),
  manageInvite: protectedProcedure
    .input(
      teamInput.extend({
        inviteId: z.number().int().positive(),
        action: z.enum(["copy", "revoke"]),
        origin: z.string().url(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const db = (await getDb())!;
      const result = await db.transaction(async tx => {
        await tx
          .select()
          .from(organizations)
          .where(eq(organizations.id, input.organizationId))
          .for("update");
        const actor = await teamManager(tx, ctx.user.id, input.organizationId);
        const invite = (
          await tx
            .select()
            .from(organizationInvites)
            .where(
              and(
                eq(organizationInvites.id, input.inviteId),
                eq(organizationInvites.organizationId, input.organizationId),
                eq(organizationInvites.status, "pending")
              )
            )
        )[0];
        if (!invite) throw new TRPCError({ code: "NOT_FOUND" });
        if (invite.role === "admin" && actor.role !== "owner")
          throw new TRPCError({ code: "FORBIDDEN" });
        if (input.action === "revoke") {
          await tx
            .update(organizationInvites)
            .set({ status: "revoked" })
            .where(eq(organizationInvites.id, invite.id));
          return { inviteUrl: null };
        }
        if (invite.expiresAtMs <= Date.now())
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Invitation expired. Renew it first.",
          });
        return {
          inviteUrl: `${inviteOrigin(input.origin)}/invite/${invite.token}`,
        };
      });
      await appendActivity({
        organizationId: input.organizationId,
        actorUserId: ctx.user.id,
        action:
          input.action === "revoke" ? "invite.revoked" : "invite.link_accessed",
        entityType: "invite",
        entityId: input.inviteId,
      });
      return result;
    }),
  acceptInvite: protectedProcedure
    .input(z.object({ token: z.string().length(64) }))
    .mutation(async ({ ctx, input }) => {
      const db = (await getDb())!;
      const invite = (
        await db
          .select()
          .from(organizationInvites)
          .where(eq(organizationInvites.token, input.token))
          .limit(1)
      )[0];
      if (!invite)
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "This invitation is invalid or expired",
        });
      await db.transaction(async tx => {
        await tx
          .select()
          .from(organizations)
          .where(eq(organizations.id, invite.organizationId))
          .for("update");
        const current = (
          await tx
            .select()
            .from(organizationInvites)
            .where(eq(organizationInvites.id, invite.id))
        )[0];
        if (current.status !== "pending" || current.expiresAtMs <= Date.now())
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "This invitation is invalid or expired",
          });
        if (
          !ctx.user.email ||
          ctx.user.email.toLowerCase() !== current.email.toLowerCase()
        )
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "Sign in with the invited email address",
          });
        const existing = (
          await tx
            .select()
            .from(organizationMemberships)
            .where(
              and(
                eq(
                  organizationMemberships.organizationId,
                  invite.organizationId
                ),
                eq(organizationMemberships.userId, ctx.user.id)
              )
            )
        )[0];
        if (!existing)
          await tx.insert(organizationMemberships).values({
            organizationId: invite.organizationId,
            userId: ctx.user.id,
            role: current.role,
            status: "active",
            createdAtMs: Date.now(),
          });
        else if (existing.status !== "active" && existing.role !== "owner")
          await tx
            .update(organizationMemberships)
            .set({ role: current.role, status: "active" })
            .where(eq(organizationMemberships.id, existing.id));
        await tx
          .update(organizationInvites)
          .set({ status: "accepted" })
          .where(eq(organizationInvites.id, invite.id));
      });
      await appendActivity({
        organizationId: invite.organizationId,
        actorUserId: ctx.user.id,
        action: "member.joined",
        entityType: "membership",
        entityId: ctx.user.id,
      });
      return { organizationId: invite.organizationId };
    }),
});
