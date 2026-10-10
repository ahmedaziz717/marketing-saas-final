import { afterAll, beforeAll, expect, it, vi } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { eq } from "drizzle-orm";
import {
  activityEvents,
  organizations,
  organizationMemberships,
  users,
} from "../drizzle/schema";
import { verifyActivityChain } from "./lib/activity";
import type { TrpcContext } from "./_core/context";

const state = vi.hoisted(() => ({ db: null as any }));
vi.mock("./db", () => ({ getDb: async () => state.db }));
import { workspaceRouter } from "./routers/workspace";

let engine: PGlite;
let org: number, otherOrg: number;
const people: Record<string, typeof users.$inferSelect> = {};
const caller = (role: string) =>
  workspaceRouter.createCaller({
    user: people[role] ?? null,
    req: {},
    res: {},
  } as TrpcContext);
beforeAll(async () => {
  engine = new PGlite();
  for (const file of readdirSync("drizzle/postgres")
    .filter(file => file.endsWith(".sql"))
    .sort())
    await engine.exec(readFileSync(`drizzle/postgres/${file}`, "utf8"));
  state.db = drizzle(engine);
  for (const role of [
    "owner",
    "admin",
    "creator",
    "reviewer",
    "publisher",
    "revoked",
    "outsider",
  ])
    [people[role]] = await state.db
      .insert(users)
      .values({ openId: `settings-${role}` })
      .returning();
  const rows = await state.db
    .insert(organizations)
    .values(
      ["workspace", "other"].map(slug => ({
        name: slug,
        slug,
        createdByUserId: people.owner.id,
        createdAtMs: 1,
      }))
    )
    .returning();
  [org, otherOrg] = rows.map((row: any) => row.id);
  await state.db.insert(organizationMemberships).values(
    Object.entries(people).map(([role, user]) => ({
      organizationId: role === "outsider" ? otherOrg : org,
      userId: user.id,
      role: role === "outsider" || role === "revoked" ? "owner" : role,
      status: role === "revoked" ? "suspended" : "active",
      createdAtMs: 1,
    }))
  );
}, 30000);
afterAll(async () => {
  await engine?.close();
});

it("saves a trimmed workspace name, preserves identity, and records the change for owners and admins", async () => {
  const renamed = await caller("owner").rename({
    organizationId: org,
    name: "  New company  ",
  });
  expect(renamed).toMatchObject({
    id: org,
    name: "New company",
    slug: "workspace",
  });
  expect(
    (await caller("owner").mine()).find(row => row.organization.id === org)
      ?.organization.name
  ).toBe("New company");
  await caller("admin").rename({
    organizationId: org,
    name: "Updated company",
  });
  const events = await state.db
    .select()
    .from(activityEvents)
    .where(eq(activityEvents.organizationId, org));
  expect(events).toHaveLength(2);
  expect(events[1]).toMatchObject({
    action: "workspace.renamed",
    actorUserId: people.admin.id,
    payload: { previousName: "New company", name: "Updated company" },
  });
  expect(verifyActivityChain(events)).toBe(true);
  const [foreign] = await state.db
    .select()
    .from(organizations)
    .where(eq(organizations.id, otherOrg));
  expect(foreign.name).toBe("other");
});

it("rejects non-managers, removed memberships, and access to another workspace", async () => {
  for (const role of [
    "creator",
    "reviewer",
    "publisher",
    "revoked",
    "outsider",
  ])
    await expect(
      caller(role).rename({ organizationId: org, name: "Unauthorized" })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  await expect(
    caller("owner").rename({ organizationId: otherOrg, name: "Unauthorized" })
  ).rejects.toMatchObject({ code: "FORBIDDEN" });
  await expect(
    caller("guest").rename({ organizationId: org, name: "Unauthorized" })
  ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  const [saved] = await state.db
    .select()
    .from(organizations)
    .where(eq(organizations.id, org));
  expect(saved.name).toBe("Updated company");
});

it("rejects empty and oversized names and does not add an audit event for an unchanged name", async () => {
  for (const name of ["  ", " a ", "x".repeat(161)])
    await expect(
      caller("owner").rename({ organizationId: org, name })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  await caller("owner").rename({
    organizationId: org,
    name: "Updated company",
  });
  expect(
    await state.db
      .select()
      .from(activityEvents)
      .where(eq(activityEvents.organizationId, org))
  ).toHaveLength(2);
});
