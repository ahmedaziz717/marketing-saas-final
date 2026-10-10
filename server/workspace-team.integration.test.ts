import { beforeAll, afterAll, describe, it, expect } from "vitest";
import { eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import {
  users,
  organizations,
  organizationMemberships,
  organizationInvites,
  activityEvents,
} from "../drizzle/schema";
import { getDb } from "./db";
import { workspaceRouter } from "./routers/workspace";
import type { TrpcContext } from "./_core/context";

const suffix = randomUUID().slice(0, 12);
const origin = "https://example.test";
let db: NonNullable<Awaited<ReturnType<typeof getDb>>>;
let org: number;
let foreignOrg: number;
const people: Record<string, typeof users.$inferSelect> = {};
const memberships: Record<string, number> = {};
const caller = (name: string) =>
  workspaceRouter.createCaller({
    user: people[name],
    req: {} as TrpcContext["req"],
    res: {} as TrpcContext["res"],
  });
const token = (url: string) => url.split("/").at(-1)!;
beforeAll(async () => {
  db = (await getDb())!;
  if (!db) throw new Error("Use an isolated integration database");
  for (const name of ["owner", "admin", "creator", "guest", "outsider"])
    people[name] = (
      await db
        .insert(users)
        .values({
          openId: `${suffix}-${name}`,
          email: `${suffix}-${name}@example.test`,
        })
        .returning()
    )[0];
  org = (
    await db
      .insert(organizations)
      .values({
        name: "Team test",
        slug: `team-${suffix}`,
        createdByUserId: people.owner.id,
        createdAtMs: Date.now(),
      })
      .returning()
  )[0].id;
  foreignOrg = (
    await db
      .insert(organizations)
      .values({
        name: "Other test",
        slug: `other-${suffix}`,
        createdByUserId: people.outsider.id,
        createdAtMs: Date.now(),
      })
      .returning()
  )[0].id;
  for (const name of ["owner", "admin", "creator"] as const)
    memberships[name] = (
      await db
        .insert(organizationMemberships)
        .values({
          organizationId: org,
          userId: people[name].id,
          role: name,
          status: "active",
          createdAtMs: Date.now(),
        })
        .returning()
    )[0].id;
  memberships.outsider = (
    await db
      .insert(organizationMemberships)
      .values({
        organizationId: foreignOrg,
        userId: people.outsider.id,
        role: "owner",
        status: "active",
        createdAtMs: Date.now(),
      })
      .returning()
  )[0].id;
});
afterAll(async () => {
  if (!db) return;
  for (const id of [org, foreignOrg].filter(Boolean)) {
    await db
      .delete(activityEvents)
      .where(eq(activityEvents.organizationId, id));
    await db
      .delete(organizationInvites)
      .where(eq(organizationInvites.organizationId, id));
    await db
      .delete(organizationMemberships)
      .where(eq(organizationMemberships.organizationId, id));
    await db.delete(organizations).where(eq(organizations.id, id));
  }
  for (const person of Object.values(people))
    await db.delete(users).where(eq(users.id, person.id));
});
describe.sequential("workspace team authorization and invitations", () => {
  it("protects owners, self membership, administrator elevation, and other tenants", async () => {
    await expect(
      caller("owner").updateMember({
        organizationId: org,
        memberId: memberships.owner,
        remove: true,
      })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(
      caller("admin").updateMember({
        organizationId: org,
        memberId: memberships.creator,
        role: "admin",
      })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(
      caller("creator").invites({ organizationId: org })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(
      caller("outsider").updateMember({
        organizationId: org,
        memberId: memberships.creator,
        remove: true,
      })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(
      caller("owner").updateMember({
        organizationId: org,
        memberId: memberships.outsider,
        remove: true,
      })
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
  it("rotates invitation links, binds email, hides tokens in lists, and blocks revoked invitations", async () => {
    const args = {
      organizationId: org,
      email: people.guest.email!,
      role: "creator" as const,
      origin,
    };
    const first = await caller("owner").createInvite(args);
    const second = await caller("owner").createInvite(args);
    expect(first.inviteUrl).not.toBe(second.inviteUrl);
    await expect(
      caller("guest").acceptInvite({ token: token(first.inviteUrl) })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(
      caller("outsider").acceptInvite({ token: token(second.inviteUrl) })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    const list = await caller("owner").invites({ organizationId: org });
    expect(list).toHaveLength(1);
    expect(list[0]).not.toHaveProperty("token");
    await expect(
      caller("outsider").manageInvite({
        organizationId: foreignOrg,
        inviteId: list[0].id,
        action: "copy",
        origin,
      })
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    await caller("owner").manageInvite({
      organizationId: org,
      inviteId: list[0].id,
      action: "revoke",
      origin,
    });
    await expect(
      caller("guest").acceptInvite({ token: token(second.inviteUrl) })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });
  it("rejects expired invitations and accepts valid invitations only once", async () => {
    const args = {
      organizationId: org,
      email: people.guest.email!,
      role: "reviewer" as const,
      origin,
    };
    const expired = await caller("owner").createInvite(args);
    await db
      .update(organizationInvites)
      .set({ expiresAtMs: Date.now() - 1 })
      .where(eq(organizationInvites.token, token(expired.inviteUrl)));
    await expect(
      caller("guest").acceptInvite({ token: token(expired.inviteUrl) })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    const fresh = await caller("owner").createInvite(args);
    await caller("guest").acceptInvite({ token: token(fresh.inviteUrl) });
    await expect(
      caller("guest").acceptInvite({ token: token(fresh.inviteUrl) })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(
      (await caller("guest").current({ organizationId: org })).membership.role
    ).toBe("reviewer");
  });
  it("removes access without deleting history and allows owner-authorized role changes", async () => {
    await caller("owner").updateMember({
      organizationId: org,
      memberId: memberships.creator,
      role: "publisher",
    });
    expect(
      (await caller("creator").current({ organizationId: org })).membership.role
    ).toBe("publisher");
    await caller("admin").updateMember({
      organizationId: org,
      memberId: memberships.creator,
      remove: true,
    });
    await expect(
      caller("creator").current({ organizationId: org })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(
      (await caller("owner").members({ organizationId: org })).some(
        x => x.user.id === people.creator.id
      )
    ).toBe(false);
    expect(
      (
        await db
          .select()
          .from(activityEvents)
          .where(eq(activityEvents.organizationId, org))
      ).some(e => e.action === "member.removed")
    ).toBe(true);
  });
});
