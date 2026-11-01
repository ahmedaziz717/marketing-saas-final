import { randomUUID } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({ db: null as any, llm: vi.fn() }));
vi.mock("./db", () => ({ getDb: async () => state.db }));
vi.mock("./_core/llm", () => ({
  invokeLLM: state.llm,
  listLLMModels: vi.fn(),
}));
import {
  organizations,
  organizationMemberships,
  users,
  activityEvents,
} from "../drizzle/schema";
import {
  creativeWorkflows,
  workflowAppVersions,
} from "../drizzle/workflowSchema";
import { newWorkflowNode } from "../shared/creativeWorkflow";
import { saveMcpDraft } from "./lib/mcpDraftSave";
import { workflowAuthoring } from "./lib/workflowAuthoring";

let engine: PGlite, org: number, userId: number;
beforeAll(async () => {
  engine = new PGlite();
  for (const file of readdirSync("drizzle/postgres")
    .filter(f => f.endsWith(".sql"))
    .sort())
    await engine.exec(readFileSync(`drizzle/postgres/${file}`, "utf8"));
  state.db = drizzle(engine);
  const [user] = await state.db
    .insert(users)
    .values({ openId: "mcp-recovery" })
    .returning();
  userId = user.id;
  const [workspace] = await state.db
    .insert(organizations)
    .values({
      slug: "mcp-recovery",
      name: "Recovery",
      createdByUserId: userId,
      createdAtMs: Date.now(),
    })
    .returning();
  org = workspace.id;
  await state.db.insert(organizationMemberships).values({
    userId,
    organizationId: org,
    role: "owner",
    status: "active",
    createdAtMs: Date.now(),
  });
}, 30000);
afterAll(async () => {
  await engine?.close();
});

it("recovers the exact applied receipt after an App dependency is archived, while rechecking authority", async () => {
  const allow = vi.fn(async () => {});
  const source = newWorkflowNode("text", "source");
  const output = newWorkflowNode("output", "out");
  output.config.outputType = "text";
  const graph = {
    nodes: [source, output],
    edges: [{ id: "result", source: "source", target: "out", port: "result" }],
  };
  const appParent = randomUUID(),
    appId = randomUUID();
  await state.db.insert(creativeWorkflows).values({
    id: appParent,
    organizationId: org,
    actorUserId: userId,
    name: "Dependency",
    family: "create",
    graph,
    revision: 1,
    createdAtMs: Date.now(),
    updatedAtMs: Date.now(),
  });
  await state.db.insert(workflowAppVersions).values({
    id: appId,
    organizationId: org,
    workflowId: appParent,
    version: 1,
    workflowRevision: 1,
    family: "create",
    name: "Dependency",
    graph,
    actorUserId: userId,
    createdAtMs: Date.now(),
  });
  const call = newWorkflowNode("run_workflow", "call");
  call.config.appVersionId = appId;
  const input = {
    organizationId: org,
    requestId: randomUUID(),
    proposal: {
      summary: "Use dependency",
      changes: [{ op: "put_node" as const, node: call }],
    },
  };
  const saved = await saveMcpDraft(userId, allow, input);
  await state.db
    .update(creativeWorkflows)
    .set({ archived: 1 })
    .where(eq(creativeWorkflows.id, appParent));
  // Demonstrate the dependency really is unavailable to normal preview.
  await expect(
    workflowAuthoring(userId).preview({
      organizationId: org,
      proposalId: saved.proposalId,
    })
  ).rejects.toMatchObject({ code: "NOT_FOUND" });
  allow.mockClear();
  expect(await saveMcpDraft(userId, allow, input)).toEqual(saved);
  expect(allow).toHaveBeenCalledTimes(1);
  await expect(
    saveMcpDraft(userId, allow, {
      ...input,
      proposal: { ...input.proposal, summary: "Different request" },
    })
  ).rejects.toMatchObject({ code: "CONFLICT" });
  const revoked = vi.fn(async () => {
    throw new Error("Revoked connection");
  });
  await expect(saveMcpDraft(userId, revoked, input)).rejects.toThrow(
    "Revoked connection"
  );
  await state.db
    .update(organizationMemberships)
    .set({ status: "suspended" })
    .where(eq(organizationMemberships.organizationId, org));
  await expect(saveMcpDraft(userId, allow, input)).rejects.toMatchObject({
    code: "FORBIDDEN",
  });
  await state.db
    .update(organizationMemberships)
    .set({ status: "active" })
    .where(eq(organizationMemberships.organizationId, org));
  expect(
    (
      await state.db
        .select()
        .from(creativeWorkflows)
        .where(eq(creativeWorkflows.id, saved.id))
    )[0].revision
  ).toBe(1);
  expect(
    await state.db
      .select()
      .from(activityEvents)
      .where(eq(activityEvents.action, "authoring.applied"))
  ).toHaveLength(1);
  expect(state.llm).not.toHaveBeenCalled();
});
