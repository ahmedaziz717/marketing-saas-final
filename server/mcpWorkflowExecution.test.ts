import { randomUUID } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({
  db: null as any,
  prepare: vi.fn(),
  model: vi.fn(),
  cost: 5,
}));
vi.mock("./db", () => ({ getDb: async () => state.db }));
vi.mock("./lib/creativeWorkflows", async original => ({
  ...(await original<typeof import("./lib/creativeWorkflows")>()),
  prepareWorkflowRun: state.prepare,
  workflowNodeCredits: vi.fn(async () => state.cost),
}));
vi.mock("./_core/llm", () => ({
  invokeLLM: state.model,
  listLLMModels: vi.fn(),
}));
vi.mock("./lib/openaiSunburst", () => ({ generateSunburstImage: state.model }));
vi.mock("./lib/videoPricing", () => ({
  quotedVideoRequest: vi.fn(async () => ({
    request: { prompt: "Reviewed video" },
    rate: { credits: 5 },
    quote: { credits: 5 },
  })),
}));
vi.mock("./lib/videoJobs", async original => ({
  ...(await original<typeof import("./lib/videoJobs")>()),
  videoReadiness: async () => ({ ready: true }),
  resolveVideoReferences: async () => [],
}));
import { videoJobs } from "../drizzle/videoSchema";
import { aiUsage, creditLedger } from "../drizzle/platformSchema";
import { defaultVideoSetup } from "../shared/videoCreation";
import {
  activityEvents,
  users,
  organizations,
  organizationMemberships,
  brandKits,
} from "../drizzle/schema";
import {
  authoringOAuthGrants,
  creativeWorkflows,
  creativeWorkflowRuns,
  workflowAppVersions,
} from "../drizzle/workflowSchema";
import { newWorkflowNode } from "../shared/creativeWorkflow";
import {
  mcpWorkflowExecution,
  approveMcpWorkflowExecution,
  reviewMcpWorkflowExecution,
  guardMcpWorkflowStep,
  type McpExecutionIdentity,
} from "./lib/mcpWorkflowExecution";
import { processNextWorkflowRun } from "./jobs/workflowWorker";
import { changePrompt } from "./lib/promptRegistry";
let engine: PGlite,
  identity: McpExecutionIdentity,
  otherUser: number,
  otherOrg: number;
beforeAll(async () => {
  engine = new PGlite();
  for (const f of readdirSync("drizzle/postgres")
    .filter(f => f.endsWith(".sql"))
    .sort())
    await engine.exec(readFileSync(`drizzle/postgres/${f}`, "utf8"));
  state.db = drizzle(engine);
  const people = await state.db
    .insert(users)
    .values([{ openId: "execution-owner" }, { openId: "execution-other" }])
    .returning();
  const orgs = await state.db
    .insert(organizations)
    .values(
      ["execution-org", "execution-other"].map(name => ({
        name,
        slug: name,
        createdByUserId: people[0].id,
        createdAtMs: Date.now(),
      }))
    )
    .returning();
  otherUser = people[1].id;
  otherOrg = orgs[1].id;
  identity = {
    userId: people[0].id,
    organizationId: orgs[0].id,
    connectionId: randomUUID(),
    resource: "https://app.example/mcp/authoring",
  };
  await state.db.insert(organizationMemberships).values({
    userId: identity.userId,
    organizationId: identity.organizationId,
    role: "owner",
    status: "active",
    createdAtMs: Date.now(),
  });
  await state.db.insert(authoringOAuthGrants).values({
    id: identity.connectionId,
    userId: identity.userId,
    organizationId: identity.organizationId,
    clientId: "client",
    resource: identity.resource,
    scope: "workflows:read workflows:execute",
    tokenHash: "1".repeat(64),
    createdAtMs: Date.now(),
    expiresAtMs: Date.now() + 1800000,
  });
  state.prepare.mockImplementation(async (_db, _org, _id, graph) => ({
    graph,
    steps: Object.fromEntries(
      graph.nodes.map((n: any) => [n.id, { status: "pending" }])
    ),
    creditsByNode: Object.fromEntries(
      graph.nodes.map((n: any) => [
        n.id,
        ["assistant", "generate_video"].includes(n.type) ? 5 : 0,
      ])
    ),
    references: [],
    credits: graph.nodes.some((n: any) =>
      ["assistant", "generate_video"].includes(n.type)
    )
      ? 5
      : 0,
  }));
});
afterAll(async () => {
  await engine?.close();
});
it("binds runtime inputs to the reviewed request without changing the saved workflow", async () => {
  const raw = await input("text");
  const service = mcpWorkflowExecution(identity);
  const request = {
    ...raw,
    inputs: [{ id: "step", text: "Selected product brief" }],
  };
  const plan = await service.prepare(request);
  expect(plan.reviewConfig.nodes[0].config.text).toBe("Selected product brief");
  const [stored] = await state.db
    .select()
    .from(creativeWorkflows)
    .where(eq(creativeWorkflows.id, raw.id));
  expect(stored.graph.nodes[0].config.text).not.toBe("Selected product brief");
  expect(await service.prepare(request)).toEqual(plan);
  await expect(
    service.prepare({ ...request, inputs: [{ id: "step", text: "Changed" }] })
  ).rejects.toMatchObject({ code: "CONFLICT" });
});
it("requires a distinct video grant before preparation and at later approval", async () => {
  const raw = await input("generate_video");
  const service = mcpWorkflowExecution(identity);
  const before = state.prepare.mock.calls.length;
  await expect(service.prepare(raw)).rejects.toThrow(
    "creatives:generate_video"
  );
  expect(state.prepare.mock.calls.length).toBe(before);
  await state.db
    .update(authoringOAuthGrants)
    .set({ scope: "workflows:read workflows:execute creatives:generate_video" })
    .where(eq(authoringOAuthGrants.id, identity.connectionId));
  try {
    const plan = await service.prepare(raw);
    expect(plan.reviewConfig.nodes[0].type).toBe("generate_video");
    await state.db
      .update(authoringOAuthGrants)
      .set({ scope: "workflows:read workflows:execute" })
      .where(eq(authoringOAuthGrants.id, identity.connectionId));
    await expect(
      approveMcpWorkflowExecution(identity.userId, {
        organizationId: raw.organizationId,
        requestId: raw.requestId,
        hash: plan.hash,
        maxCredits: plan.maxCredits,
      })
    ).rejects.toThrow("creatives:generate_video");
    await expect(service.prepare(raw)).rejects.toThrow(
      "creatives:generate_video"
    );
  } finally {
    await state.db
      .update(authoringOAuthGrants)
      .set({ scope: "workflows:read workflows:execute" })
      .where(eq(authoringOAuthGrants.id, identity.connectionId));
  }
});
it("rejects generated upstream media before preparing a video run", async () => {
  const raw = await input("generate_video");
  const video = newWorkflowNode("generate_video", "step");
  const image = newWorkflowNode("generate_image", "generated");
  await state.db
    .update(creativeWorkflows)
    .set({
      graph: {
        nodes: [image, video],
        edges: [
          {
            id: "generated-video",
            source: image.id,
            target: video.id,
            port: "image",
          },
        ],
      },
    })
    .where(eq(creativeWorkflows.id, raw.id));
  const before = state.prepare.mock.calls.length;
  await expect(mcpWorkflowExecution(identity).prepare(raw)).rejects.toThrow(
    "stored media"
  );
  expect(state.prepare.mock.calls.length).toBe(before);
});
it("runs an approved video parent through a bound child and reserves only once", async () => {
  const [kit] = await state.db
    .insert(brandKits)
    .values({
      organizationId: identity.organizationId,
      name: "Video fixture",
      colors: [],
      fonts: [],
      updatedByUserId: identity.userId,
      updatedAtMs: 1,
    })
    .returning();
  const raw = await input("generate_video");
  const node = newWorkflowNode("generate_video", "step");
  node.config.modelId = defaultVideoSetup.modelId;
  node.config.text = "A truthful product video";
  await state.db
    .update(creativeWorkflows)
    .set({ graph: { nodes: [node], edges: [] } })
    .where(eq(creativeWorkflows.id, raw.id));
  await state.db
    .update(authoringOAuthGrants)
    .set({ scope: "workflows:read workflows:execute creatives:generate_video" })
    .where(eq(authoringOAuthGrants.id, identity.connectionId));
  const service = mcpWorkflowExecution(identity);
  try {
    const plan = await service.prepare(raw);
    await approveMcpWorkflowExecution(identity.userId, {
      organizationId: raw.organizationId,
      requestId: raw.requestId,
      hash: plan.hash,
      maxCredits: plan.maxCredits,
    });
    await service.execute({
      organizationId: raw.organizationId,
      requestId: raw.requestId,
      hash: plan.hash,
    });
    await processNextWorkflowRun(state.db);
    const [run] = await state.db
      .select()
      .from(creativeWorkflowRuns)
      .where(eq(creativeWorkflowRuns.id, raw.requestId));
    const childId = run.steps.step.videoJobId;
    expect(childId).toBeTruthy();
    const [draft] = await state.db
      .select()
      .from(videoJobs)
      .where(eq(videoJobs.id, childId));
    expect(draft.mcpPolicy).toMatchObject({
      state: "draft",
      parentRunId: raw.requestId,
      credits: 5,
    });
    await state.db
      .update(creativeWorkflowRuns)
      .set({ leaseUntilMs: 0 })
      .where(eq(creativeWorkflowRuns.id, raw.requestId));
    await processNextWorkflowRun(state.db);
    await state.db
      .update(creativeWorkflowRuns)
      .set({ leaseUntilMs: 0 })
      .where(eq(creativeWorkflowRuns.id, raw.requestId));
    await processNextWorkflowRun(state.db);
    const [child] = await state.db
      .select()
      .from(videoJobs)
      .where(eq(videoJobs.id, childId));
    expect(child.status).toBe("queued");
    expect(child.mcpPolicy.state).toBe("bound");
    expect(
      await state.db.select().from(aiUsage).where(eq(aiUsage.id, childId))
    ).toHaveLength(1);
    expect(
      await state.db
        .select()
        .from(creditLedger)
        .where(eq(creditLedger.id, childId))
    ).toHaveLength(1);
    expect(state.model).not.toHaveBeenCalled();
    await service.stop({
      organizationId: raw.organizationId,
      requestId: raw.requestId,
    });
  } finally {
    // The mocked video child never completes. Retire this fixture's parent so
    // its short retry lease cannot make later worker tests claim the wrong run.
    await state.db
      .update(creativeWorkflowRuns)
      .set({ status: "stopped", leaseOwner: null, leaseUntilMs: 0 })
      .where(eq(creativeWorkflowRuns.id, raw.requestId));
    await state.db.delete(brandKits).where(eq(brandKits.id, kit.id));
    await state.db
      .update(authoringOAuthGrants)
      .set({ scope: "workflows:read workflows:execute" })
      .where(eq(authoringOAuthGrants.id, identity.connectionId));
  }
});
async function input(type = "assistant") {
  const id = randomUUID(),
    node = newWorkflowNode(type as any, "step");
  await state.db.insert(creativeWorkflows).values({
    id,
    organizationId: identity.organizationId,
    actorUserId: identity.userId,
    name: "Content only",
    family: "create",
    graph: { nodes: [node], edges: [] },
    revision: 1,
    createdAtMs: Date.now(),
    updatedAtMs: Date.now(),
  });
  return {
    organizationId: identity.organizationId,
    id,
    revision: 1,
    requestId: randomUUID(),
    maxCredits: 5,
  };
}
async function queued() {
  const raw = await input(),
    service = mcpWorkflowExecution(identity),
    plan = await service.prepare(raw);
  await approveMcpWorkflowExecution(identity.userId, {
    organizationId: raw.organizationId,
    requestId: raw.requestId,
    hash: plan.hash,
    maxCredits: plan.maxCredits,
  });
  await service.execute({
    organizationId: raw.organizationId,
    requestId: raw.requestId,
    hash: plan.hash,
  });
  return {
    raw,
    plan,
    service,
    run: (
      await state.db
        .select()
        .from(creativeWorkflowRuns)
        .where(eq(creativeWorkflowRuns.id, raw.requestId))
    )[0],
  };
}
it("requires exact human approval, binds idempotent request, actor, workspace and cap", async () => {
  const raw = await input(),
    service = mcpWorkflowExecution(identity),
    plan = await service.prepare(raw);
  expect(await service.prepare(raw)).toEqual(plan);
  await expect(
    service.prepare({ ...raw, maxCredits: 10 })
  ).rejects.toMatchObject({ code: "CONFLICT" });
  await expect(
    service.execute({
      organizationId: raw.organizationId,
      requestId: raw.requestId,
      hash: plan.hash,
    })
  ).rejects.toMatchObject({ code: "FORBIDDEN" });
  await expect(
    approveMcpWorkflowExecution(otherUser, {
      organizationId: raw.organizationId,
      requestId: raw.requestId,
      hash: plan.hash,
      maxCredits: 5,
    })
  ).rejects.toMatchObject({ code: "NOT_FOUND" });
  await expect(
    approveMcpWorkflowExecution(identity.userId, {
      organizationId: raw.organizationId,
      requestId: raw.requestId,
      hash: plan.hash,
      maxCredits: 6,
    })
  ).rejects.toMatchObject({ code: "CONFLICT" });
  await expect(
    service.prepare({ ...raw, organizationId: otherOrg })
  ).rejects.toMatchObject({ code: "FORBIDDEN" });
  expect(
    await reviewMcpWorkflowExecution(identity.userId, {
      organizationId: raw.organizationId,
      requestId: raw.requestId,
    })
  ).toEqual(plan);
  await approveMcpWorkflowExecution(identity.userId, {
    organizationId: raw.organizationId,
    requestId: raw.requestId,
    hash: plan.hash,
    maxCredits: 5,
  });
  const runInput = {
    organizationId: raw.organizationId,
    requestId: raw.requestId,
    hash: plan.hash,
  };
  const [a, b] = await Promise.all([
    service.execute(runInput),
    service.execute(runInput),
  ]);
  expect(a).toEqual(b);
  expect(
    await state.db
      .select()
      .from(creativeWorkflowRuns)
      .where(eq(creativeWorkflowRuns.id, raw.requestId))
  ).toHaveLength(1);
  await state.db
    .update(creativeWorkflowRuns)
    .set({ status: "completed" })
    .where(eq(creativeWorkflowRuns.id, raw.requestId));
  expect(state.model).not.toHaveBeenCalled();
});
it("rejects direct and nested publishing before preparation and enforces maximum quote", async () => {
  const service = mcpWorkflowExecution(identity),
    bad = await input("deliver_publication"),
    count = state.prepare.mock.calls.length;
  await expect(service.prepare(bad)).rejects.toMatchObject({
    code: "BAD_REQUEST",
  });
  expect(state.prepare.mock.calls.length).toBe(count);
  const appId = randomUUID();
  const [badWorkflow] = await state.db
    .select()
    .from(creativeWorkflows)
    .where(eq(creativeWorkflows.id, bad.id));
  await state.db.insert(workflowAppVersions).values({
    id: appId,
    workflowId: bad.id,
    organizationId: identity.organizationId,
    actorUserId: identity.userId,
    name: "Nested unsafe",
    description: "",
    graph: badWorkflow.graph,
    version: 1,
    workflowRevision: 1,
    family: "create",
    createdAtMs: Date.now(),
  });
  const nested = await input("run_workflow");
  const call = newWorkflowNode("run_workflow", "step");
  call.config.appVersionId = appId;
  await state.db
    .update(creativeWorkflows)
    .set({ graph: { nodes: [call], edges: [] } })
    .where(eq(creativeWorkflows.id, nested.id));
  await expect(service.prepare(nested)).rejects.toThrow();
  expect(state.prepare.mock.calls.length).toBe(count);
  await expect(
    service.prepare({ ...(await input()), maxCredits: 4 })
  ).rejects.toMatchObject({ code: "BAD_REQUEST" });
});
it("worker policy checks immutable quote, revoked grants and one paid attempt per node", async () => {
  const { run } = await queued();
  await expect(
    guardMcpWorkflowStep(
      state.db,
      { ...run, creditsByNode: { step: 6 } },
      "step",
      true
    )
  ).rejects.toMatchObject({ code: "FORBIDDEN" });
  await guardMcpWorkflowStep(state.db, run, "step", true);
  await expect(
    guardMcpWorkflowStep(state.db, run, "step", true)
  ).rejects.toMatchObject({ code: "CONFLICT" });
  await state.db
    .update(authoringOAuthGrants)
    .set({ revokedAtMs: Date.now() })
    .where(eq(authoringOAuthGrants.id, identity.connectionId));
  await expect(guardMcpWorkflowStep(state.db, run)).rejects.toMatchObject({
    code: "FORBIDDEN",
  });
  await state.db
    .update(authoringOAuthGrants)
    .set({ revokedAtMs: null })
    .where(eq(authoringOAuthGrants.id, identity.connectionId));
  await state.db
    .update(creativeWorkflowRuns)
    .set({ status: "completed" })
    .where(eq(creativeWorkflowRuns.id, run.id));
});
it("actual worker refuses revoked MCP run without any provider call", async () => {
  const { run } = await queued();
  await state.db
    .update(authoringOAuthGrants)
    .set({ revokedAtMs: Date.now() })
    .where(eq(authoringOAuthGrants.id, identity.connectionId));
  await processNextWorkflowRun(state.db);
  const [result] = await state.db
    .select()
    .from(creativeWorkflowRuns)
    .where(eq(creativeWorkflowRuns.id, run.id));
  expect(result.status).toBe("failed");
  expect(state.model).not.toHaveBeenCalled();
  await state.db
    .update(authoringOAuthGrants)
    .set({ revokedAtMs: null })
    .where(eq(authoringOAuthGrants.id, identity.connectionId));
});
it("blocks dynamic performance configuration before any preparation", async () => {
  const raw = await input("app_input"),
    node = newWorkflowNode("app_input", "step");
  node.config.field = { kind: "performance_data", required: true } as any;
  await state.db
    .update(creativeWorkflows)
    .set({ graph: { nodes: [node], edges: [] } })
    .where(eq(creativeWorkflows.id, raw.id));
  const count = state.prepare.mock.calls.length;
  await expect(
    mcpWorkflowExecution(identity).prepare(raw)
  ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  expect(state.prepare.mock.calls.length).toBe(count);
});
it("actual worker rejects price drift before reserving a paid attempt or calling a model", async () => {
  const { run } = await queued();
  state.cost = 6;
  await processNextWorkflowRun(state.db);
  const [result] = await state.db
    .select()
    .from(creativeWorkflowRuns)
    .where(eq(creativeWorkflowRuns.id, run.id));
  expect(result.status).toBe("failed");
  expect(result.error).toContain("Credit pricing changed");
  expect(
    await state.db
      .select()
      .from(activityEvents)
      .where(
        and(
          eq(activityEvents.correlationId, run.id),
          eq(activityEvents.action, "mcp.execution.attempt")
        )
      )
  ).toHaveLength(0);
  expect(state.model).not.toHaveBeenCalled();
  state.cost = 5;
});
it("denies expired review and post-review resolved graph changes", async () => {
  const raw = await input(),
    service = mcpWorkflowExecution(identity),
    plan = await service.prepare(raw);
  const review = {
    organizationId: raw.organizationId,
    requestId: raw.requestId,
    hash: plan.hash,
    maxCredits: 5,
  };
  const realNow = Date.now;
  const clock = vi
    .spyOn(Date, "now")
    .mockImplementation(() => realNow() + 11 * 60_000);
  await expect(
    approveMcpWorkflowExecution(identity.userId, review)
  ).rejects.toMatchObject({ code: "CONFLICT" });
  clock.mockRestore();
  await approveMcpWorkflowExecution(identity.userId, review);
  const node = newWorkflowNode("assistant", "step");
  node.config.text = "Changed without revision";
  await state.db
    .update(creativeWorkflows)
    .set({ graph: { nodes: [node], edges: [] } })
    .where(eq(creativeWorkflows.id, raw.id));
  await expect(
    service.execute({
      organizationId: raw.organizationId,
      requestId: raw.requestId,
      hash: plan.hash,
    })
  ).rejects.toMatchObject({ code: "CONFLICT" });
});
it("stops an owned queued run without provider work or deleting the run", async () => {
  const { run, service } = await queued();
  expect(
    await service.stop({
      organizationId: identity.organizationId,
      requestId: run.id,
    })
  ).toMatchObject({ stopRequested: true });
  await service.stop({
    organizationId: identity.organizationId,
    requestId: run.id,
  });
  await processNextWorkflowRun(state.db);
  const result = await service.status({
    organizationId: identity.organizationId,
    requestId: run.id,
  });
  expect(result.status).toBe("stopped");
  expect(state.model).not.toHaveBeenCalled();
  expect(
    await state.db
      .select()
      .from(activityEvents)
      .where(
        and(
          eq(activityEvents.correlationId, run.id),
          eq(activityEvents.action, "mcp.execution.stop_requested")
        )
      )
  ).toHaveLength(1);
});
it("uses the pinned App workflow revision independently of later draft edits", async () => {
  const raw = await input("text"),
    appVersionId = randomUUID();
  const [workflow] = await state.db
    .select()
    .from(creativeWorkflows)
    .where(eq(creativeWorkflows.id, raw.id));
  await state.db.insert(workflowAppVersions).values({
    id: appVersionId,
    organizationId: identity.organizationId,
    workflowId: raw.id,
    version: 1,
    workflowRevision: 1,
    family: "create",
    name: "Pinned",
    description: "",
    graph: workflow.graph,
    actorUserId: identity.userId,
    createdAtMs: Date.now(),
  });
  await state.db
    .update(creativeWorkflows)
    .set({ revision: 2 })
    .where(eq(creativeWorkflows.id, raw.id));
  expect(
    await mcpWorkflowExecution(identity).prepare({ ...raw, appVersionId })
  ).toMatchObject({ revision: 1, credits: 0 });
  await expect(
    mcpWorkflowExecution(identity).prepare({
      ...raw,
      requestId: randomUUID(),
      appVersionId,
      revision: 2,
    })
  ).rejects.toMatchObject({ code: "CONFLICT" });
});
it("denies mixed-scope grant after role loss even without another OAuth verification", async () => {
  await state.db
    .update(authoringOAuthGrants)
    .set({ scope: "workflows:read workflows:execute brand:configure" })
    .where(eq(authoringOAuthGrants.id, identity.connectionId));
  const { run, raw } = await queued();
  await state.db
    .update(organizationMemberships)
    .set({ role: "creator" })
    .where(
      and(
        eq(organizationMemberships.userId, identity.userId),
        eq(organizationMemberships.organizationId, identity.organizationId)
      )
    );
  await expect(
    guardMcpWorkflowStep(state.db, run, "step", true)
  ).rejects.toMatchObject({ code: "FORBIDDEN" });
  await expect(
    reviewMcpWorkflowExecution(identity.userId, {
      organizationId: raw.organizationId,
      requestId: raw.requestId,
    })
  ).rejects.toMatchObject({ code: "FORBIDDEN" });
  await processNextWorkflowRun(state.db);
  expect(
    (
      await state.db
        .select()
        .from(creativeWorkflowRuns)
        .where(eq(creativeWorkflowRuns.id, run.id))
    )[0].status
  ).toBe("failed");
  expect(state.model).not.toHaveBeenCalled();
  await state.db
    .update(organizationMemberships)
    .set({ role: "owner" })
    .where(
      and(
        eq(organizationMemberships.userId, identity.userId),
        eq(organizationMemberships.organizationId, identity.organizationId)
      )
    );
  await state.db
    .update(authoringOAuthGrants)
    .set({ scope: "workflows:read workflows:execute" })
    .where(eq(authoringOAuthGrants.id, identity.connectionId));
});
it("shows complete paid prompts, model settings, inputs and edges and rejects oversized reviews", async () => {
  const raw = await input(),
    node = newWorkflowNode("assistant", "step");
  node.config.text = "Specific paid prompt";
  node.config.modelId = "configured-text-model";
  node.config.imageKey = "product_image:123";
  node.config.fieldValue = "Selected facts";
  await state.db
    .update(creativeWorkflows)
    .set({ graph: { nodes: [node], edges: [] } })
    .where(eq(creativeWorkflows.id, raw.id));
  const plan = await mcpWorkflowExecution(identity).prepare(raw);
  expect(plan.reviewConfig.nodes[0].config).toMatchObject({
    text: "Specific paid prompt",
    modelId: "configured-text-model",
    imageKey: "product_image:123",
    fieldValue: "Selected facts",
  });
  expect(plan.reviewConfig.edges).toEqual([]);
  const nodes = Array.from({ length: 20 }, (_, index) => ({
    ...newWorkflowNode("text", `large_${index}`),
    config: {
      ...newWorkflowNode("text", `large_${index}`).config,
      text: "x".repeat(10000),
    },
  }));
  await state.db
    .update(creativeWorkflows)
    .set({ graph: { nodes, edges: [] } })
    .where(eq(creativeWorkflows.id, raw.id));
  const calls = state.prepare.mock.calls.length;
  await expect(
    mcpWorkflowExecution(identity).prepare({ ...raw, requestId: randomUUID() })
  ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  expect(state.prepare.mock.calls.length).toBe(calls);
});
it("rejects credential and callback model options before preparation", async () => {
  const raw = await input("generate_image"),
    node = newWorkflowNode("generate_image", "step");
  node.config.modelOptions = {
    webhook_url: "https://external.example/publish?token=secret",
  };
  await state.db
    .update(creativeWorkflows)
    .set({ graph: { nodes: [node], edges: [] } })
    .where(eq(creativeWorkflows.id, raw.id));
  const before = state.prepare.mock.calls.length;
  await expect(
    mcpWorkflowExecution(identity).prepare(raw)
  ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  expect(state.prepare.mock.calls.length).toBe(before);
});
it("returns bounded result DTOs without provider errors, signed URLs or storage keys", async () => {
  const { run, service } = await queued();
  const secret = "PROVIDER_SECRET_SENTINEL";
  await state.db
    .update(creativeWorkflowRuns)
    .set({
      status: "failed",
      error: `Provider payload ${secret}`,
      steps: {
        step: {
          status: "completed",
          error: `Authorization ${secret}`,
          waitingReason: secret,
          outputs: [
            { type: "text", text: "Usable generated copy" },
            {
              type: "image",
              key: "asset:17",
              name: "Image",
              url: `https://cdn.example/image.png?token=${secret}`,
              fingerprint: secret,
            },
            {
              type: "image",
              key: `org-1/private/${secret}`,
              name: "Private",
              url: "https://cdn.example/private.png",
              fingerprint: secret,
            },
          ],
        },
      },
    })
    .where(eq(creativeWorkflowRuns.id, run.id));
  const status = await service.status({
    organizationId: identity.organizationId,
    requestId: run.id,
  });
  expect(JSON.stringify(status)).not.toContain(secret);
  expect(JSON.stringify(status)).toContain("Usable generated copy");
  expect(JSON.stringify(status)).toContain('"key":"asset:17"');
  expect(JSON.stringify(status)).toContain('"url":null');
  expect(status).not.toHaveProperty("graph");
});
it("cannot read or stop an unrelated same-user business run through a prepared UUID collision", async () => {
  const raw = await input("text"),
    service = mcpWorkflowExecution(identity),
    plan = await service.prepare(raw);
  const business = await input("deliver_publication");
  const [workflow] = await state.db
    .select()
    .from(creativeWorkflows)
    .where(eq(creativeWorkflows.id, business.id));
  const unrelated = {
    id: raw.requestId,
    organizationId: identity.organizationId,
    actorUserId: identity.userId,
    workflowId: business.id,
    graph: workflow.graph,
    steps: { step: { status: "running", error: "UNRELATED_BUSINESS_SECRET" } },
    references: [],
    creditsByNode: { step: 0 },
    status: "running",
    createdAtMs: Date.now(),
    updatedAtMs: Date.now(),
  };
  await state.db.insert(creativeWorkflowRuns).values(unrelated);
  const ref = {
    organizationId: identity.organizationId,
    requestId: raw.requestId,
  };
  expect(await service.status(ref)).toEqual({
    id: raw.requestId,
    status: "awaiting_approval",
  });
  await expect(service.stop(ref)).rejects.toMatchObject({ code: "NOT_FOUND" });
  await approveMcpWorkflowExecution(identity.userId, {
    ...ref,
    hash: plan.hash,
    maxCredits: plan.maxCredits,
  });
  await expect(
    service.execute({ ...ref, hash: plan.hash })
  ).rejects.toMatchObject({ code: "CONFLICT" });
  const [unchanged] = await state.db
    .select()
    .from(creativeWorkflowRuns)
    .where(eq(creativeWorkflowRuns.id, raw.requestId));
  expect(unchanged).toMatchObject({
    stopRequested: 0,
    status: "running",
    workflowId: business.id,
    updatedAtMs: unrelated.updatedAtMs,
  });
  expect(
    await state.db
      .select()
      .from(activityEvents)
      .where(
        and(
          eq(activityEvents.correlationId, raw.requestId),
          eq(activityEvents.action, "mcp.execution.stop_requested")
        )
      )
  ).toHaveLength(0);
  const colliding = await input("text");
  await state.db
    .insert(creativeWorkflowRuns)
    .values({ ...unrelated, id: colliding.requestId });
  const calls = state.prepare.mock.calls.length;
  await expect(service.prepare(colliding)).rejects.toMatchObject({
    code: "CONFLICT",
    message: "Request ID is unavailable. Use a new request ID.",
  });
  expect(state.prepare.mock.calls.length).toBe(calls);
  await state.db
    .update(creativeWorkflowRuns)
    .set({ status: "completed" })
    .where(eq(creativeWorkflowRuns.workflowId, business.id));
});
it("refuses status, stop and execution replay when queued run identity no longer matches its receipt", async () => {
  const { raw, run, service, plan } = await queued(),
    other = await input("text");
  await state.db
    .update(creativeWorkflowRuns)
    .set({ workflowId: other.id })
    .where(eq(creativeWorkflowRuns.id, run.id));
  const ref = {
    organizationId: identity.organizationId,
    requestId: raw.requestId,
  };
  await expect(service.status(ref)).rejects.toMatchObject({
    code: "NOT_FOUND",
  });
  await expect(service.stop(ref)).rejects.toMatchObject({ code: "NOT_FOUND" });
  await expect(
    service.execute({ ...ref, hash: plan.hash })
  ).rejects.toMatchObject({ code: "NOT_FOUND" });
  const [unchanged] = await state.db
    .select()
    .from(creativeWorkflowRuns)
    .where(eq(creativeWorkflowRuns.id, run.id));
  expect(unchanged.stopRequested).toBe(0);
  await state.db
    .update(creativeWorkflowRuns)
    .set({ status: "completed" })
    .where(eq(creativeWorkflowRuns.id, run.id));
});
it("binds active Brand Kit and effective prompt values to review and rechecks before dispatch", async () => {
  await state.db.insert(brandKits).values({
    organizationId: identity.organizationId,
    name: "Reviewed brand",
    voice: "Original voice",
    colors: ["#ffffff"],
    fonts: [],
    status: "active",
    updatedByUserId: identity.userId,
    updatedAtMs: Date.now(),
  });
  const raw = await input(),
    service = mcpWorkflowExecution(identity),
    plan = await service.prepare(raw);
  expect(plan.reviewConfig.brand?.voice).toBe("Original voice");
  expect(
    plan.reviewConfig.prompts.some(
      p => p.id === "workflow.assistant" && !!p.value
    )
  ).toBe(true);
  await approveMcpWorkflowExecution(identity.userId, {
    organizationId: raw.organizationId,
    requestId: raw.requestId,
    hash: plan.hash,
    maxCredits: plan.maxCredits,
  });
  await state.db
    .update(brandKits)
    .set({ voice: "Changed voice" })
    .where(eq(brandKits.organizationId, identity.organizationId));
  await expect(
    service.execute({
      organizationId: raw.organizationId,
      requestId: raw.requestId,
      hash: plan.hash,
    })
  ).rejects.toMatchObject({ code: "CONFLICT" });
  const { run } = await queued();
  const frozen = await guardMcpWorkflowStep(state.db, run);
  expect(frozen?.brand?.voice).toBe("Changed voice");
  await changePrompt({
    organizationId: identity.organizationId,
    actorUserId: identity.userId,
    promptId: "workflow.assistant",
    expectedRevision: 0,
    action: "save",
    value: "A materially different task prompt",
    reason: "Test post-approval prompt change",
  });
  await processNextWorkflowRun(state.db);
  expect(
    (
      await state.db
        .select()
        .from(creativeWorkflowRuns)
        .where(eq(creativeWorkflowRuns.id, run.id))
    )[0].status
  ).toBe("failed");
  expect(state.model).not.toHaveBeenCalled();
});
