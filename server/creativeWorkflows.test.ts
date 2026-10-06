import { randomUUID } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { eq } from "drizzle-orm";
import { beforeAll, beforeEach, afterAll, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({
  db: null as any,
  image: vi.fn(),
  llm: vi.fn(),
  read: vi.fn(),
}));
vi.mock("./db", () => ({
  getDb: async () => state.db,
  closeDb: async () => {},
}));
vi.mock("./lib/creativeImages", () => ({
  readGenerationSource: (...args: any[]) => state.read(...args),
}));
vi.mock("./lib/openaiSunburst", () => ({
  generateSunburstImage: async (...args: any[]) => {
    const { meteredCall } = await import("./lib/aiMetering");
    return meteredCall(
      "openai",
      "gpt-image-2.5-sunburst",
      "image",
      async () => ({
        value: await state.image(...args),
        usage: { input_tokens: 100, output_tokens: 200 },
      })
    );
  },
}));
vi.mock("./_core/llm", () => ({
  invokeLLM: async (...args: any[]) => {
    const { meteredCall } = await import("./lib/aiMetering");
    return meteredCall("openai", "gpt-5.5", "text", async () => ({
      value: await state.llm(...args),
      usage: { input_tokens: 50, output_tokens: 100 },
    }));
  },
  listLLMModels: async () => [],
}));
import { workflowsRouter } from "./routers/workflows";
import {
  organizations,
  users,
  organizationMemberships,
  brandKits,
  brandAssets,
} from "../drizzle/schema";
import {
  creativeWorkflows,
  creativeWorkflowRuns,
} from "../drizzle/workflowSchema";
import { videoJobs, providerWorkers } from "../drizzle/videoSchema";
import { aiUsage, creditLedger } from "../drizzle/platformSchema";
import { processNextWorkflowRun } from "./jobs/workflowWorker";
import {
  workflowGraphProblem,
  workflowGraphSchema,
  workflowTemplate,
  newWorkflowNode,
  type WorkflowGraph,
} from "../shared/creativeWorkflow";
import type { TrpcContext } from "./_core/context";
let engine: PGlite,
  org: number,
  otherOrg: number,
  ownerId: number,
  assetId: number,
  foreignId: number;
let owner: ReturnType<typeof workflowsRouter.createCaller>,
  outsider: typeof owner,
  reviewer: typeof owner;
beforeAll(async () => {
  engine = new PGlite();
  for (const file of readdirSync("drizzle/postgres")
    .filter(f => f.endsWith(".sql"))
    .sort())
    await engine.exec(readFileSync(`drizzle/postgres/${file}`, "utf8"));
  state.db = drizzle(engine);
  const db = state.db,
    now = Date.now();
  const people = await db
    .insert(users)
    .values(
      ["owner", "outsider", "reviewer"].map(name => ({
        openId: `workflow-${name}`,
        name,
      }))
    )
    .returning();
  ownerId = people[0].id;
  [owner, outsider, reviewer] = people.map((user: any) =>
    workflowsRouter.createCaller({ user, req: {}, res: {} } as TrpcContext)
  );
  const orgs = await db
    .insert(organizations)
    .values(
      ["workflow-main", "workflow-other"].map(slug => ({
        slug,
        name: slug,
        createdByUserId: ownerId,
        createdAtMs: now,
      }))
    )
    .returning();
  org = orgs[0].id;
  otherOrg = orgs[1].id;
  await db.insert(organizationMemberships).values(
    people.map((u: any, i: number) => ({
      userId: u.id,
      organizationId: i === 1 ? otherOrg : org,
      role: i === 2 ? "reviewer" : "owner",
      status: "active",
      createdAtMs: now,
    }))
  );
  for (const organizationId of [org, otherOrg]) {
    const [brand] = await db
      .insert(brandKits)
      .values({
        organizationId,
        name: "Test brand",
        colors: [],
        fonts: [],
        status: "active",
        updatedByUserId: ownerId,
        updatedAtMs: now,
      })
      .returning();
    const [asset] = await db
      .insert(brandAssets)
      .values({
        organizationId,
        brandKitId: brand.id,
        name: "Product photo",
        type: "reference",
        storageKey: `org-${organizationId}/photo.png`,
        url: "https://example.test/photo.png",
        mimeType: "image/png",
        status: "pending",
        uploadedByUserId: ownerId,
        createdAtMs: now,
      })
      .returning();
    if (organizationId === org) assetId = asset.id;
    else foreignId = asset.id;
  }
});
beforeEach(async () => {
  await state.db.delete(creativeWorkflowRuns);
  await state.db.delete(creativeWorkflows);
  await state.db.delete(creditLedger);
  await state.db.delete(aiUsage);
  await state.db.delete(videoJobs);
  vi.clearAllMocks();
  state.read.mockResolvedValue({ mimeType: "image/png", b64Json: "cGhvdG8=" });
  state.image.mockResolvedValue({
    storageKey: `org-${org}/result.png`,
    url: "https://example.test/result.png",
  });
  state.llm.mockResolvedValue({
    choices: [
      {
        message: {
          content:
            "A precise studio scene with soft light and a slow camera push-in.",
        },
      },
    ],
  });
});
afterAll(async () => {
  await engine.close();
  vi.unstubAllEnvs();
});
function pipeline(): WorkflowGraph {
  const text = newWorkflowNode("text", "brief");
  text.config.text = "Show this product in a warm studio.";
  const image = newWorkflowNode("image", "source");
  image.config.imageKey = `asset:${assetId}`;
  return {
    nodes: [
      text,
      image,
      newWorkflowNode("assistant", "writer"),
      newWorkflowNode("generate_image", "render"),
      newWorkflowNode("output", "output"),
    ],
    edges: [
      { id: "a", source: "brief", target: "writer", port: "text" },
      { id: "b", source: "source", target: "writer", port: "image" },
      { id: "c", source: "writer", target: "render", port: "text" },
      { id: "d", source: "source", target: "render", port: "image" },
      { id: "e", source: "render", target: "output", port: "result" },
    ],
  };
}
async function queue(graph: WorkflowGraph, target?: string) {
  const saved = await owner.save({
    organizationId: org,
    name: "Workflow test",
    graph,
  });
  const quote = await owner.quote({
    organizationId: org,
    id: saved.id,
    revision: saved.revision,
    target,
  });
  const input = {
    organizationId: org,
    id: saved.id,
    revision: saved.revision,
    target,
    requestId: randomUUID(),
    quotedCredits: quote.credits,
  };
  const run = await owner.run(input);
  return { saved, quote, run, input };
}
async function tick() {
  await state.db.update(creativeWorkflowRuns).set({ leaseUntilMs: 0 });
  await processNextWorkflowRun(state.db);
}
async function finish(limit = 12) {
  for (let i = 0; i < limit; i++) await tick();
}
it("rejects incompatible connections, loops, and unsafe identifiers", () => {
  const graph = pipeline();
  graph.edges.push({
    id: "bad",
    source: "render",
    target: "writer",
    port: "text",
  });
  expect(workflowGraphProblem(graph)).toMatch(/matching/);
  graph.edges.pop();
  graph.edges.push({
    id: "cycle",
    source: "render",
    target: "writer",
    port: "image",
  });
  expect(workflowGraphProblem(graph)).toMatch(/loop/);
  graph.nodes[0].id = "__proto__";
  expect(workflowGraphSchema.safeParse(graph).success).toBe(false);
  for (const id of ["photo-video", "image-edit", "idea-video", "variations"])
    expect(workflowGraphProblem(workflowTemplate(id))).toBeNull();
});
it("isolates workspaces and creator roles, including referenced assets", async () => {
  const saved = await owner.save({
    organizationId: org,
    name: "Private",
    graph: pipeline(),
  });
  await expect(
    outsider.get({ organizationId: otherOrg, id: saved.id })
  ).rejects.toMatchObject({ code: "NOT_FOUND" });
  await expect(outsider.list({ organizationId: org })).rejects.toMatchObject({
    code: "FORBIDDEN",
  });
  await expect(
    reviewer.save({ organizationId: org, name: "Forbidden", graph: pipeline() })
  ).rejects.toMatchObject({ code: "FORBIDDEN" });
  const graph = pipeline();
  graph.nodes[1].config.imageKey = `asset:${foreignId}`;
  const invalid = await owner.save({
    organizationId: org,
    name: "Wrong source",
    graph,
  });
  await expect(
    owner.quote({ organizationId: org, id: invalid.id, revision: 1 })
  ).rejects.toMatchObject({ code: "NOT_FOUND" });
  const r = await engine.query<{ relrowsecurity: boolean }>(
    "select relrowsecurity from pg_class where relname in ('creative_workflows','creative_workflow_runs')"
  );
  expect(r.rows.every(x => x.relrowsecurity)).toBe(true);
});
it("executes a metered image pipeline, retains draft outputs, and deduplicates a run", async () => {
  const { saved, run, input, quote } = await queue(pipeline());
  expect(quote.credits).toBe(15); // 10 text credits + 5 for the selected Sunburst canvas.
  expect((await owner.run(input)).id).toBe(run.id);
  await finish();
  const result = await owner.get({ organizationId: org, id: saved.id });
  expect(result.runs[0].status).toBe("completed");
  expect(state.llm).toHaveBeenCalledTimes(1);
  expect(state.image).toHaveBeenCalledTimes(1);
  expect(
    state.llm.mock.calls[0][0].messages[1].content.some(
      (c: any) => c.type === "image_url"
    )
  ).toBe(true);
  expect(state.image.mock.calls[0][0].originalImages).toHaveLength(1);
  const output = result.runs[0].steps.output.outputs![0];
  expect(output.type).toBe("image");
  const [asset] = await state.db
    .select()
    .from(brandAssets)
    .where(eq(brandAssets.id, Number((output as any).key.split(":")[1])));
  expect(asset.status).toBe("pending");
  expect(asset.metadata.generatedImage).toBe(true);
  const usage = await state.db.select().from(aiUsage);
  expect(
    usage.map((u: any) => [u.organizationId, u.status, u.operation])
  ).toEqual([
    [org, "succeeded", "workflow.assistant"],
    [org, "succeeded", "workflow.generate_image"],
  ]);
  const ledger = await state.db.select().from(creditLedger);
  expect(ledger.reduce((n: number, r: any) => n + r.amount, 0)).toBe(-41);
});
it("runs one node with unchanged upstream outputs, but rejects stale upstream results", async () => {
  const { saved } = await queue(pipeline());
  await finish();
  const quote = await owner.quote({
    organizationId: org,
    id: saved.id,
    revision: 1,
    target: "render",
  });
  expect(quote.credits).toBe(5);
  expect(quote.reused).toBe(1);
  await owner.run({
    organizationId: org,
    id: saved.id,
    revision: 1,
    target: "render",
    requestId: randomUUID(),
    quotedCredits: quote.credits,
  });
  await finish();
  expect(state.llm).toHaveBeenCalledTimes(1);
  expect(state.image).toHaveBeenCalledTimes(2);
  const graph = pipeline();
  graph.nodes[0].config.text = "An entirely different direction";
  await owner.save({
    organizationId: org,
    id: saved.id,
    revision: 1,
    name: saved.name,
    graph,
  });
  await expect(
    owner.quote({
      organizationId: org,
      id: saved.id,
      revision: 2,
      target: "render",
    })
  ).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
});
it("rejects reused prompts when the source image changes without a graph edit", async () => {
  const { saved } = await queue(pipeline());
  await finish();
  await state.db
    .update(brandAssets)
    .set({ name: "Updated source photo" })
    .where(eq(brandAssets.id, assetId));
  await expect(
    owner.quote({
      organizationId: org,
      id: saved.id,
      revision: 1,
      target: "render",
    })
  ).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
});
it("stops before new paid work and does not automatically retry an interrupted call", async () => {
  const { run, saved } = await queue(pipeline());
  await tick();
  await owner.stop({ organizationId: org, id: run.id });
  await finish();
  expect(
    (await owner.get({ organizationId: org, id: saved.id })).runs[0].status
  ).toBe("stopped");
  expect(state.llm).not.toHaveBeenCalled();
  const next = await queue(pipeline());
  const steps = { ...next.run.steps, writer: { status: "running" as const } };
  await state.db
    .update(creativeWorkflowRuns)
    .set({ steps, leaseUntilMs: 0 })
    .where(eq(creativeWorkflowRuns.id, next.run.id));
  await tick();
  const interrupted = (
    await owner.get({ organizationId: org, id: next.saved.id })
  ).runs[0];
  expect(interrupted.status).toBe("failed");
  expect(interrupted.error).toMatch(/not automatically repeated/);
  expect(state.llm).not.toHaveBeenCalled();
});
it("blocks downstream work on failure and guards edits with a revision", async () => {
  const { saved } = await queue(pipeline());
  state.llm.mockRejectedValue(new Error("Provider unavailable"));
  await finish();
  const result = (await owner.get({ organizationId: org, id: saved.id }))
    .runs[0];
  expect(result.status).toBe("failed");
  expect(result.steps.render.status).toBe("pending");
  expect(state.image).not.toHaveBeenCalled();
  await owner.save({
    organizationId: org,
    id: saved.id,
    revision: 1,
    name: "Changed",
    graph: pipeline(),
  });
  await expect(
    owner.save({
      organizationId: org,
      id: saved.id,
      revision: 1,
      name: "Stale",
      graph: pipeline(),
    })
  ).rejects.toMatchObject({ code: "CONFLICT" });
});
it("pins a durable video child job and reserves video credits only once", async () => {
  vi.stubEnv("HF_API_KEY", "workflow-test-key");
  vi.stubEnv("VIDEO_GENERATION_ENABLED", "true");
  await state.db
    .insert(providerWorkers)
    .values({ id: "higgsfield", ready: 1, heartbeatAtMs: Date.now() })
    .onConflictDoUpdate({
      target: providerWorkers.id,
      set: { ready: 1, heartbeatAtMs: Date.now() },
    });
  const video = newWorkflowNode("generate_video", "video");
  video.config.text = "A slow pan through a miniature garden.";
  video.config.resolution = "480p";
  const graph = { nodes: [video], edges: [] };
  const { saved } = await queue(graph);
  await tick();
  await tick();
  await tick();
  const child = await state.db.select().from(videoJobs);
  expect(child).toHaveLength(1);
  expect(child[0].status).toBe("queued");
  const usage = await state.db.select().from(aiUsage);
  expect(usage).toHaveLength(1);
  expect(usage[0].credits).toBe(116);
  expect(
    (await owner.get({ organizationId: org, id: saved.id })).runs[0].steps.video
      .videoJobId
  ).toBe(child[0].id);
});
