import { randomBytes } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { brandKits, organizationInvites, organizationMemberships, organizations, users } from "../../drizzle/schema";
import { getDb } from "../db";
import { appendActivity } from "../lib/activity";
import { requireOrganizationRole } from "../lib/access";
import { protectedProcedure, router } from "../_core/trpc";

const roleSchema = z.enum(["admin", "creator", "reviewer", "publisher"]);

function slugify(value: string) {
  return value.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 140);
}

export const workspaceRouter = router({
  mine: protectedProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
    return db.select({ organization: organizations, membership: organizationMemberships })
      .from(organizationMemberships)
      .innerJoin(organizations, eq(organizations.id, organizationMemberships.organizationId))
      .where(and(eq(organizationMemberships.userId, ctx.user.id), eq(organizationMemberships.status, "active")));
  }),

  create: protectedProcedure.input(z.object({ name: z.string().min(2).max(160) })).mutation(async ({ ctx, input }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
    const now = Date.now();
    const base = slugify(input.name) || "workspace";
    const slug = `${base}-${randomBytes(3).toString("hex")}`;
    const result = await db.transaction(async tx => {
      const inserted = await tx.insert(organizations).values({ name: input.name.trim(), slug, createdByUserId: ctx.user.id, createdAtMs: now });
      const organizationId = Number(inserted[0].insertId);
      await tx.insert(organizationMemberships).values({ organizationId, userId: ctx.user.id, role: "owner", status: "active", createdAtMs: now });
      await tx.insert(brandKits).values({ organizationId, name: `${input.name.trim()} Brand`, colors: ["#15141A", "#F4F1EA"], fonts: ["Manrope"], status: "draft", updatedByUserId: ctx.user.id, updatedAtMs: now });
      return { organizationId, slug };
    });
    await appendActivity({ organizationId: result.organizationId, actorUserId: ctx.user.id, action: "workspace.created", entityType: "organization", entityId: result.organizationId, payload: { name: input.name.trim() } });
    return result;
  }),

  current: protectedProcedure.input(z.object({ organizationId: z.number().int().positive() })).query(async ({ ctx, input }) => {
    return requireOrganizationRole(ctx.user.id, input.organizationId);
  }),

  members: protectedProcedure.input(z.object({ organizationId: z.number().int().positive() })).query(async ({ ctx, input }) => {
    await requireOrganizationRole(ctx.user.id, input.organizationId);
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    return db.select({ membership: organizationMemberships, user: { id: users.id, name: users.name, email: users.email } })
      .from(organizationMemberships)
      .innerJoin(users, eq(users.id, organizationMemberships.userId))
      .where(eq(organizationMemberships.organizationId, input.organizationId));
  }),

  createInvite: protectedProcedure.input(z.object({ organizationId: z.number().int().positive(), email: z.string().email(), role: roleSchema, origin: z.string().url() })).mutation(async ({ ctx, input }) => {
    await requireOrganizationRole(ctx.user.id, input.organizationId, ["owner", "admin"]);
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    const token = randomBytes(32).toString("hex");
    const now = Date.now();
    await db.insert(organizationInvites).values({ organizationId: input.organizationId, email: input.email.toLowerCase(), role: input.role, token, status: "pending", invitedByUserId: ctx.user.id, expiresAtMs: now + 7 * 24 * 60 * 60 * 1000, createdAtMs: now });
    await appendActivity({ organizationId: input.organizationId, actorUserId: ctx.user.id, action: "member.invited", entityType: "invite", entityId: token.slice(0, 12), payload: { email: input.email.toLowerCase(), role: input.role } });
    return { inviteUrl: `${input.origin}/invite/${token}` };
  }),

  acceptInvite: protectedProcedure.input(z.object({ token: z.string().min(32) })).mutation(async ({ ctx, input }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    const invite = (await db.select().from(organizationInvites).where(eq(organizationInvites.token, input.token)).limit(1))[0];
    if (!invite || invite.status !== "pending" || invite.expiresAtMs < Date.now()) throw new TRPCError({ code: "BAD_REQUEST", message: "This invitation is invalid or expired" });
    if (ctx.user.email && ctx.user.email.toLowerCase() !== invite.email.toLowerCase()) throw new TRPCError({ code: "FORBIDDEN", message: "Sign in with the invited email address" });
    await db.transaction(async tx => {
      await tx.insert(organizationMemberships).values({ organizationId: invite.organizationId, userId: ctx.user.id, role: invite.role, status: "active", createdAtMs: Date.now() }).onDuplicateKeyUpdate({ set: { role: invite.role, status: "active" } });
      await tx.update(organizationInvites).set({ status: "accepted" }).where(eq(organizationInvites.id, invite.id));
    });
    await appendActivity({ organizationId: invite.organizationId, actorUserId: ctx.user.id, action: "member.joined", entityType: "membership", entityId: ctx.user.id, payload: { role: invite.role } });
    return { organizationId: invite.organizationId };
  }),
});

