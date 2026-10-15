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
  report: vi.fn(),
  metaRead: vi.fn(),
  metaReview: vi.fn(),
  metaApply: vi.fn(),
  metaVerify: vi.fn(),
}));
vi.mock("./lib/higgsfield", async original => ({
  ...(await original<typeof import("./lib/higgsfield")>()),
  estimateHiggsfield: async () => ({
    costMicros: 400000,
    quotedAtMs: Date.now(),
  }),
}));
vi.mock("./storage", async original => ({
  ...(await original<typeof import("./storage")>()),
  storageClient: () => ({
    storage: {
      from: () => ({
        createSignedUrl: async (key: string) => ({
          data: { signedUrl: `https://storage.example.test/${key}` },
        }),
      }),
    },
  }),
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
    const { imageModelQuote } = await import("./lib/modelCatalog");
    const quote = await imageModelQuote(
      state.db,
      args[0].modelId,
      args[0].modelOptions,
      args[0].outputSize
    );
    return meteredCall(
      "openai",
      "gpt-image-2.5-sunburst",
      "image",
      async () => ({
        value: await state.image(...args),
        usage: { input_tokens: 100, output_tokens: 200 },
      }),
      { rateSnapshot: quote.rate }
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
vi.mock("./lib/channelReports", async importOriginal => ({
  ...(await importOriginal<typeof import("./lib/channelReports")>()),
  adsReport: (...args: any[]) => state.report(...args),
}));
vi.mock("./lib/metaManagement", async importOriginal => ({
  ...(await importOriginal<typeof import("./lib/metaManagement")>()),
  readMetaObject: (...args: any[]) => state.metaRead(...args),
  reviewMetaChange: (...args: any[]) => state.metaReview(...args),
  applyMetaChange: (...args: any[]) => state.metaApply(...args),
  verifyMetaReview: (...args: any[]) => state.metaVerify(...args),
}));
import { channelConnections, publications } from "../drizzle/channelSchema";
import { encryptToken } from "./lib/secureToken";
import { businessWorkflowTemplate } from "../shared/workflowPlatform";
import { workflowsRouter } from "./routers/workflows";
import {
  organizations,
  users,
  organizationMemberships,
  brandKits,
  brandAssets,
  products,
  productImages,
} from "../drizzle/schema";
import {
  creativeWorkflows,
  creativeWorkflowRuns,
} from "../drizzle/workflowSchema";
import { videoJobs, providerWorkers } from "../drizzle/videoSchema";
import {
  aiUsage,
  creditLedger,
  platformAccounts,
} from "../drizzle/platformSchema";
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
        status: "approved",
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
  await state.db.delete(publications);
  await state.db.delete(channelConnections);
  await state.db.delete(platformAccounts);
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
  expect(quote.credits).toBe(7); // 2 short-response credits + 5 for the selected Sunburst canvas.
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
    usage.find((u: any) => u.operation === "workflow.assistant").usage
      .reservedCredits
  ).toBe(2);
  expect(
    usage.map((u: any) => [u.organizationId, u.status, u.operation])
  ).toEqual([
    [org, "succeeded", "workflow.assistant"],
    [org, "succeeded", "workflow.generate_image"],
  ]);
  const ledger = await state.db.select().from(creditLedger);
  expect(ledger.reduce((n: number, r: any) => n + r.amount, 0)).toBe(
    -quote.credits
  );
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
  expect(usage[0].credits).toBe(80);
  expect(
    (await owner.get({ organizationId: org, id: saved.id })).runs[0].steps.video
      .videoJobId
  ).toBe(child[0].id);
});

function textGraph(text = "Published value"): WorkflowGraph {
  const input = newWorkflowNode("text", "input");
  input.config.text = text;
  return {
    nodes: [input, newWorkflowNode("output", "output")],
    edges: [
      { id: "text-output", source: "input", target: "output", port: "result" },
    ],
  };
}
async function connection(
  organizationId = org,
  channel: "facebook" | "meta_ads" = "meta_ads"
) {
  vi.stubEnv(
    "INTEGRATION_TOKEN_ENCRYPTION_SECRET",
    "workflow-encryption-secret-for-tests"
  );
  const [c] = await state.db
    .insert(channelConnections)
    .values({
      id: randomUUID(),
      organizationId,
      channel,
      accountId: "12345",
      name: "Test account",
      status: "connected",
      credentials: encryptToken("test-access-token"),
      details: {
        capabilities: ["read", "publish", "report"],
        timezone: "America/New_York",
        pageId: "98765",
      },
      connectedByUserId: ownerId,
      verifiedAtMs: Date.now(),
      updatedAtMs: Date.now(),
    })
    .returning();
  return c;
}
it("publishes immutable App versions in each family and isolates their inputs", async () => {
  const saved = await owner.save({
    organizationId: org,
    family: "measure",
    name: "Reusable report",
    graph: textGraph(),
  });
  expect(
    (await owner.get({ organizationId: org, id: saved.id }))
      .latestPublishedVersion
  ).toBeNull();
  const v1 = await owner.publishApp({
    organizationId: org,
    id: saved.id,
    revision: 1,
    description: "First release",
  });
  await owner.save({
    organizationId: org,
    id: saved.id,
    revision: 1,
    name: saved.name,
    graph: textGraph("New draft value"),
  });
  expect(
    (await owner.get({ organizationId: org, id: saved.id }))
      .latestPublishedVersion
  ).toBe(1);
  expect(
    (await owner.getApp({ organizationId: org, id: v1.id })).graph.nodes[0]
      .config.text
  ).toBe("Published value");
  const v2 = await owner.publishApp({
    organizationId: org,
    id: saved.id,
    revision: 2,
  });
  expect(v2.version).toBe(2);
  expect(
    (await owner.getApp({ organizationId: org, id: v1.id })).graph.nodes[0]
      .config.text
  ).toBe("Published value");
  expect(
    await owner.list({ organizationId: org, family: "measure" })
  ).toHaveLength(1);
  expect(
    await owner.list({ organizationId: org, family: "create" })
  ).toHaveLength(0);
  await expect(
    outsider.getApp({ organizationId: otherOrg, id: v1.id })
  ).rejects.toMatchObject({ code: "NOT_FOUND" });
  await expect(
    owner.quote({
      organizationId: org,
      id: saved.id,
      revision: 2,
      appVersionId: v1.id,
      inputs: [{ id: "output", text: "Override executable step" }],
    })
  ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  const input = {
    organizationId: org,
    id: saved.id,
    revision: 2,
    appVersionId: v1.id,
    inputs: [{ id: "input", text: "Declared input" }],
  };
  const estimate = await owner.quote(input);
  await owner.run({
    ...input,
    quotedCredits: estimate.credits,
    requestId: randomUUID(),
  });
  await finish();
  const run = (await owner.get({ organizationId: org, id: saved.id })).runs[0];
  expect(run.appVersionId).toBe(v1.id);
  expect(run.steps.output.outputs).toEqual([
    { type: "text", text: "Declared input" },
  ]);
  expect(
    (await owner.getApp({ organizationId: org, id: v1.id })).graph.nodes[0]
      .config.text
  ).toBe("Published value");
});
it("names Apps independently, retains metadata on republish and keeps previous versions immutable", async () => {
  const saved = await owner.save({
    organizationId: org,
    family: "optimize",
    name: "WF Test 1",
    graph: textGraph(),
  });
  const publish = { organizationId: org, id: saved.id, revision: 1 };
  const v1 = await owner.publishApp({
    ...publish,
    name: "  Copy Performance App  ",
    description: "Compare copy styles",
  });
  expect(v1.name).toBe("Copy Performance App");
  expect(await owner.get({ organizationId: org, id: saved.id })).toMatchObject({
    name: "WF Test 1",
    latestPublishedApp: {
      id: v1.id,
      version: 1,
      name: "Copy Performance App",
      description: "Compare copy styles",
    },
  });
  await owner.save({
    ...publish,
    name: "Renamed workflow draft",
    graph: textGraph("New draft value"),
  });
  const v2 = await owner.publishApp({ ...publish, revision: 2 });
  expect(v2).toMatchObject({
    version: 2,
    name: "Copy Performance App",
    description: "Compare copy styles",
  });
  const v3 = await owner.publishApp({
    ...publish,
    revision: 2,
    name: "Copy Explorer",
    description: "",
  });
  expect(v3).toMatchObject({
    version: 3,
    name: "Copy Explorer",
    description: "",
  });
  expect(await owner.getApp({ organizationId: org, id: v1.id })).toMatchObject({
    name: "Copy Performance App",
    description: "Compare copy styles",
    version: 1,
  });
  expect((await owner.get({ organizationId: org, id: saved.id })).name).toBe(
    "Renamed workflow draft"
  );
  expect(
    (await owner.listApps({ organizationId: org, family: "optimize" }))[0].id
  ).toBe(v3.id);
  for (const name of ["", "   ", "x".repeat(101)]) {
    await expect(
      owner.publishApp({ ...publish, revision: 2, name })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  }
  await expect(
    outsider.publishApp({
      ...publish,
      organizationId: otherOrg,
      revision: 2,
      name: "Foreign rename",
    })
  ).rejects.toMatchObject({ code: "NOT_FOUND" });
  expect((await owner.listApps({ organizationId: org })).length).toBe(3);
  expect((await owner.get({ organizationId: org, id: saved.id })).runs).toEqual(
    []
  );
  expect(await state.db.select().from(aiUsage)).toHaveLength(0);
});

it("composes pinned Apps across families and prevents foreign App execution", async () => {
  const inner = textGraph("Pinned content");
  inner.nodes[0].type = "app_input";
  const saved = await owner.save({
    organizationId: org,
    name: "Creative App",
    family: "create",
    graph: inner,
  });
  const app = await owner.publishApp({
    organizationId: org,
    id: saved.id,
    revision: 1,
  });
  const call = newWorkflowNode("app", "app");
  call.config.appVersionId = app.id;
  const graph = textGraph("Incoming brief");
  graph.nodes.splice(1, 0, call);
  graph.edges = [
    { id: "a", source: "input", target: "app", port: "context" },
    { id: "b", source: "app", target: "output", port: "result" },
  ];
  await owner.save({
    organizationId: org,
    id: saved.id,
    revision: 1,
    name: saved.name,
    graph: textGraph("Unpublished change"),
  });
  const outer = await queue(graph);
  await finish(20);
  const result = (await owner.get({ organizationId: org, id: outer.saved.id }))
    .runs[0];
  expect(result.status).toBe("completed");
  expect(result.steps.output.outputs).toEqual([
    { type: "text", text: "Incoming brief" },
    { type: "text", text: "Pinned content" },
  ]);
  const foreign = await outsider.save({
    organizationId: otherOrg,
    family: "activate",
    name: "Foreign",
    graph,
  });
  await expect(
    outsider.quote({ organizationId: otherOrg, id: foreign.id, revision: 1 })
  ).rejects.toMatchObject({ code: "NOT_FOUND" });
  const internal = textGraph();
  internal.nodes[0].type = "app_output";
  await expect(
    owner.save({
      organizationId: org,
      name: "Forged internal node",
      graph: internal,
    })
  ).rejects.toMatchObject({ code: "BAD_REQUEST" });
});
it("admits new work past three approval waits but still caps processing runs at three", async () => {
  const graph = textGraph();
  graph.nodes.splice(1, 0, newWorkflowNode("review", "review"));
  graph.edges = [
    { id: "a", source: "input", target: "review", port: "context" },
    { id: "b", source: "review", target: "output", port: "result" },
  ];
  const waitingIds: string[] = [];
  for (let i = 0; i < 3; i++) {
    const { run } = await queue(graph);
    waitingIds.push(run.id);
    await finish();
  }
  const fresh = await queue(textGraph("Read-only test"));
  expect(fresh.quote.credits).toBe(0);
  await finish(20);
  expect(
    (await owner.get({ organizationId: org, id: fresh.saved.id })).runs[0]
      .status
  ).toBe("completed");
  const waiting = (await state.db.select().from(creativeWorkflowRuns)).filter(
    (run: any) => waitingIds.includes(run.id)
  );
  expect(waiting).toHaveLength(3);
  for (const run of waiting) {
    expect(run.steps.review.waitingFor).toBe("approval");
    expect(run.steps.review.approvedByUserId).toBeUndefined();
    expect(run.steps.output.status).toBe("pending");
  }
  for (let i = 0; i < 3; i++) await queue(textGraph());
  await expect(queue(textGraph())).rejects.toMatchObject({
    code: "TOO_MANY_REQUESTS",
  });
  expect(state.llm).not.toHaveBeenCalled();
  expect(state.image).not.toHaveBeenCalled();
});
it("pauses at exact-input review, enforces reviewer access, and resumes after approval", async () => {
  const graph = textGraph();
  graph.nodes.splice(1, 0, newWorkflowNode("review", "review"));
  graph.edges = [
    { id: "a", source: "input", target: "review", port: "context" },
    { id: "b", source: "review", target: "output", port: "result" },
  ];
  const { saved, run } = await queue(graph);
  await finish();
  let result = (await owner.get({ organizationId: org, id: saved.id })).runs[0];
  expect(result.steps.review.status).toBe("waiting");
  expect(result.steps.review.waitingFor).toBe("approval");
  expect(result.steps.output.status).toBe("pending");
  await expect(
    reviewer.reviewStep({
      organizationId: org,
      id: run.id,
      nodeId: "review",
      approve: true,
    })
  ).rejects.toMatchObject({ code: "FORBIDDEN" });
  await expect(
    outsider.reviewStep({
      organizationId: otherOrg,
      id: run.id,
      nodeId: "review",
      approve: true,
    })
  ).rejects.toMatchObject({ code: "CONFLICT" });
  await owner.reviewStep({
    organizationId: org,
    id: run.id,
    nodeId: "review",
    approve: true,
  });
  await finish();
  result = (await owner.get({ organizationId: org, id: saved.id })).runs[0];
  expect(result.status).toBe("completed");
  expect(result.steps.review.approvedByUserId).toBe(ownerId);
  await expect(
    owner.reviewStep({
      organizationId: org,
      id: run.id,
      nodeId: "review",
      approve: true,
    })
  ).rejects.toMatchObject({ code: "CONFLICT" });
});
it("keeps waits durable and lets a stopped waiting run end without downstream calls", async () => {
  const graph = textGraph();
  const wait = newWorkflowNode("wait", "wait");
  wait.config.waitMinutes = 60;
  graph.nodes.splice(1, 0, wait);
  graph.edges = [
    { id: "a", source: "input", target: "wait", port: "context" },
    { id: "b", source: "wait", target: "output", port: "result" },
  ];
  const { saved, run } = await queue(graph);
  await finish();
  const first = (await owner.get({ organizationId: org, id: saved.id })).runs[0]
    .steps.wait.wakeAtMs;
  await finish();
  expect(
    (await owner.get({ organizationId: org, id: saved.id })).runs[0].steps.wait
      .wakeAtMs
  ).toBe(first);
  await owner.stop({ organizationId: org, id: run.id });
  await tick();
  expect(
    (await owner.get({ organizationId: org, id: saved.id })).runs[0].status
  ).toBe("stopped");
});
it("runs read-only reports with exhausted AI credits and rejects another workspace's connection", async () => {
  await state.db.insert(platformAccounts).values({
    organizationId: org,
    enforceCredits: 1,
    aiPaused: 1,
    updatedAtMs: Date.now(),
  });
  await state.db.insert(creditLedger).values({
    id: randomUUID(),
    organizationId: org,
    period: new Date().toISOString().slice(0, 7),
    amount: -10,
    reason: "Existing usage",
    createdAtMs: Date.now(),
  });
  const c = await connection();
  state.report.mockResolvedValue({
    summary: { spend: 40, impressions: 500, roas: null },
    campaigns: [],
    currency: "USD",
    timezone: "America/New_York",
    attribution: "account",
    truncated: false,
  });
  const report = newWorkflowNode("meta_report", "report");
  report.config.connectionId = c.id;
  report.config.datePreset = "yesterday";
  const graph = {
    nodes: [report, newWorkflowNode("output", "output")],
    edges: [{ id: "a", source: "report", target: "output", port: "result" }],
  };
  const { saved, quote } = await queue(graph);
  expect(quote.credits).toBe(0);
  await finish();
  const result = (await owner.get({ organizationId: org, id: saved.id }))
    .runs[0];
  expect(result.status).toBe("completed");
  expect((result.steps.output.outputs![0] as any).data.metrics.roas).toBeNull();
  expect(state.report).toHaveBeenCalledOnce();
  expect(state.llm).not.toHaveBeenCalled();
  const foreign = await connection(otherOrg);
  graph.nodes[0].config.connectionId = foreign.id;
  const denied = await owner.save({
    organizationId: org,
    name: "Wrong account",
    graph,
  });
  await expect(
    owner.quote({ organizationId: org, id: denied.id, revision: 1 })
  ).rejects.toMatchObject({ code: "NOT_FOUND" });
});
it("creates one Facebook draft and waits for publication approval without sending", async () => {
  const c = await connection(org, "facebook");
  const graph = businessWorkflowTemplate("facebook-delivery")!;
  graph.nodes.find(n => n.type === "facebook_post")!.config.connectionId = c.id;
  const { saved } = await queue(graph);
  await finish();
  await finish();
  const result = (await owner.get({ organizationId: org, id: saved.id }))
    .runs[0];
  expect(result.steps.post.status).toBe("completed");
  expect(result.steps.delivery.status).toBe("waiting");
  expect(result.steps.delivery.waitingFor).toBe("approval");
  const drafts = await state.db.select().from(publications);
  expect(drafts).toHaveLength(1);
  expect(drafts[0].state).toBe("needs_review");
  expect(drafts[0].externalId).toBeNull();
});
it("requires an explicit activation confirmation and cannot activate the same reviewed step twice", async () => {
  const c = await connection(),
    node = newWorkflowNode("meta_activate", "activate");
  node.config.connectionId = c.id;
  node.config.adId = "123456";
  state.metaRead.mockResolvedValue({
    id: "123456",
    name: "Paused test ad",
    status: "PAUSED",
  });
  state.metaReview.mockResolvedValue({
    before: { id: "123456", name: "Paused test ad", status: "PAUSED" },
    params: { status: "ACTIVE" },
    warnings: ["Existing budgets apply"],
    ticket: "signed-test-ticket",
  });
  state.metaVerify.mockReturnValue({ userId: ownerId });
  state.metaApply.mockResolvedValue({ id: "123456", success: true });
  const { saved, run } = await queue({
    nodes: [node, newWorkflowNode("output", "output")],
    edges: [{ id: "a", source: "activate", target: "output", port: "result" }],
  });
  await finish();
  expect(state.metaApply).not.toHaveBeenCalled();
  await expect(
    owner.reviewStep({
      organizationId: org,
      id: run.id,
      nodeId: "activate",
      approve: true,
    })
  ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  await owner.reviewStep({
    organizationId: org,
    id: run.id,
    nodeId: "activate",
    approve: true,
    confirmActivation: true,
  });
  await expect(
    owner.reviewStep({
      organizationId: org,
      id: run.id,
      nodeId: "activate",
      approve: true,
      confirmActivation: true,
    })
  ).rejects.toMatchObject({ code: "CONFLICT" });
  await finish();
  expect(state.metaApply).toHaveBeenCalledOnce();
  expect(
    (await owner.get({ organizationId: org, id: saved.id })).runs[0].status
  ).toBe("completed");
});

it("validates typed App choices, preserves locked defaults and snapshots system choices", async () => {
  const { appFieldSchema, systemInputChoices } = await import(
    "../shared/workflowInputs"
  );
  const graph = textGraph("");
  graph.nodes[0].type = "app_input";
  graph.nodes[0].title = "Theme";
  const theme = systemInputChoices("theme")[0];
  graph.nodes[0].config.field = appFieldSchema.parse({
    kind: "theme",
    required: true,
    defaultValue: theme.id,
    locked: true,
  });
  const saved = await owner.save({
    organizationId: org,
    name: "Typed form",
    graph,
  });
  const app = await owner.publishApp({
    organizationId: org,
    id: saved.id,
    revision: 1,
  });
  expect(app.graph.nodes[0].config.field?.source).toBe("curated");
  expect(app.graph.nodes[0].config.field?.options.length).toBeGreaterThan(10);
  const input = {
    organizationId: org,
    id: saved.id,
    revision: 1,
    appVersionId: app.id,
    inputs: [{ id: graph.nodes[0].id, value: "forged-option" }],
  };
  const quote = await owner.quote(input);
  await owner.run({
    ...input,
    requestId: randomUUID(),
    quotedCredits: quote.credits,
  });
  await finish();
  const run = (await owner.get({ organizationId: org, id: saved.id })).runs[0];
  expect(run.steps.output.outputs?.[0]).toEqual({
    type: "text",
    text: `Theme: ${theme.label}: ${theme.direction}`,
  });
  graph.nodes[0].config.field.locked = false;
  await owner.save({
    organizationId: org,
    id: saved.id,
    revision: 1,
    name: "Typed form",
    graph,
  });
  const v2 = await owner.publishApp({
    organizationId: org,
    id: saved.id,
    revision: 2,
  });
  await expect(
    owner.quote({ ...input, revision: 2, appVersionId: v2.id })
  ).rejects.toThrow(/available option/);
  expect(
    (await owner.getApp({ organizationId: org, id: app.id })).graph.nodes[0]
      .config.field?.locked
  ).toBe(true);
});

it("requires declared fields at run time but permits incomplete drafts", async () => {
  const { appFieldSchema } = await import("../shared/workflowInputs");
  const graph = textGraph("");
  graph.nodes[0].type = "app_input";
  graph.nodes[0].config.field = appFieldSchema.parse({
    kind: "headline",
    required: true,
  });
  const saved = await owner.save({
    organizationId: org,
    name: "Required form",
    graph,
  });
  await expect(
    owner.quote({ organizationId: org, id: saved.id, revision: 1 })
  ).rejects.toThrow(/required/);
  const app = await owner.publishApp({
    organizationId: org,
    id: saved.id,
    revision: 1,
  });
  await expect(
    owner.quote({
      organizationId: org,
      id: saved.id,
      revision: 1,
      appVersionId: app.id,
      inputs: [{ id: graph.nodes[0].id, value: "A new headline" }],
    })
  ).resolves.toMatchObject({ credits: 0 });
});

it("rejects foreign catalog inputs and validates conditional fields", async () => {
  const { appFieldSchema } = await import("../shared/workflowInputs");
  const graph = textGraph("");
  graph.nodes[0].type = "app_input";
  graph.nodes[0].config.field = appFieldSchema.parse({
    kind: "product",
    defaultValue: "999999999",
  });
  const saved = await owner.save({
    organizationId: org,
    name: "Catalog form",
    graph,
  });
  await expect(
    owner.quote({ organizationId: org, id: saved.id, revision: 1 })
  ).rejects.toThrow(/unavailable in this workspace/);
  graph.nodes[0].config.field = appFieldSchema.parse({
    kind: "headline",
    visibleWhen: { fieldId: "missing", equals: "yes" },
  });
  await owner.save({
    organizationId: org,
    id: saved.id,
    revision: 1,
    name: "Catalog form",
    graph,
  });
  await expect(
    owner.publishApp({ organizationId: org, id: saved.id, revision: 2 })
  ).rejects.toThrow(/Visibility/);
});

it("persists media controls in App versions and carries selected facts with an image through generation", async () => {
  const { appFieldSchema } = await import("../shared/workflowInputs");
  const { product, photo } = await mediaFixture();
  const graph = pipeline();
  graph.nodes[1].config.field = appFieldSchema.parse({
    kind: "asset",
    required: true,
    media: { allowUpload: true, price: "never", description: "never" },
  });
  const saved = await owner.save({
    organizationId: org,
    name: "Product image App",
    graph,
  });
  const app = await owner.publishApp({
    organizationId: org,
    id: saved.id,
    revision: 1,
  });
  expect(app.graph.nodes[1].config.field?.media?.allowUpload).toBe(true);
  const value = JSON.stringify({
    imageKey: `product_image:${photo.id}`,
    productId: product.id,
    featuredSpecKeys: ["Capacity"],
    includePrice: true,
    includeDescription: true,
    includeLink: false,
  });
  const input = {
    organizationId: org,
    id: saved.id,
    revision: 1,
    appVersionId: app.id,
    inputs: [{ id: "source", value }],
  };
  const quote = await owner.quote(input);
  await owner.run({
    ...input,
    requestId: randomUUID(),
    quotedCredits: quote.credits,
  });
  await finish();
  const result = (await owner.get({ organizationId: org, id: saved.id }))
    .runs[0];
  expect(result.status).toBe("completed");
  const image = result.steps.source.outputs?.find(v => v.type === "image");
  expect(image).toMatchObject({
    type: "image",
    key: `product_image:${photo.id}`,
  });
  const prompt = state.image.mock.calls[0][0].prompt;
  expect(prompt).toContain('"Capacity":"400 ml"');
  expect(prompt).toContain("Do not show a price");
  expect(prompt).not.toContain("29.00");
  expect(prompt).not.toContain("Steel");
  expect(prompt).not.toContain("A reusable travel mug");
  expect(state.image.mock.calls[0][0].originalImages.length).toBe(1);
  await expect(
    owner.quote({
      ...input,
      inputs: [
        { id: "source", value: value.replace('"Capacity"', '"Invented"') },
      ],
    })
  ).rejects.toThrow(/bullet/);
  await expect(
    owner.quote({
      ...input,
      inputs: [
        {
          id: "source",
          value: JSON.stringify({
            productId: product.id + 100,
            imageKey: `product_image:${photo.id}`,
          }),
        },
      ],
    })
  ).rejects.toThrow(/belonging/);
  const choices = await owner.mediaChoices({
    organizationId: org,
    kind: "asset",
    selectedValue: value,
  });
  expect(
    choices.products.some(
      p =>
        p.id === product.id &&
        p.images.some(i => i.key === `product_image:${photo.id}`)
    )
  ).toBe(true);
  expect(choices.assets.every(a => a.state === "approved")).toBe(true);
  await state.db
    .update(brandAssets)
    .set({ status: "pending" })
    .where(eq(brandAssets.id, assetId));
  await expect(
    owner.quote({
      ...input,
      inputs: [{ id: "source", value: `asset:${assetId}` }],
    })
  ).rejects.toThrow(/approved/);
  await state.db
    .update(brandAssets)
    .set({ status: "approved" })
    .where(eq(brandAssets.id, assetId));
  graph.nodes[1].config.field.media!.productImages = false;
  await owner.save({
    organizationId: org,
    id: saved.id,
    revision: 1,
    name: "Product image App",
    graph,
  });
  const v2 = await owner.publishApp({
    organizationId: org,
    id: saved.id,
    revision: 2,
  });
  await expect(
    owner.quote({ ...input, revision: 2, appVersionId: v2.id })
  ).rejects.toThrow(/allowed/);
  expect(
    (await owner.getApp({ organizationId: org, id: app.id })).graph.nodes[1]
      .config.field?.media?.productImages
  ).toBe(true);
});

it("product fields emit an owned image and selected priced content, and hidden images contribute nothing", async () => {
  const { appFieldSchema } = await import("../shared/workflowInputs");
  const { product, photo } = await mediaFixture();
  const graph = textGraph("");
  graph.nodes[0].type = "app_input";
  graph.nodes[0].config.field = appFieldSchema.parse({
    kind: "product",
    defaultValue: JSON.stringify({
      productId: product.id,
      imageKey: `product_image:${photo.id}`,
      featuredSpecKeys: ["Material"],
      includePrice: true,
    }),
    media: {},
  });
  await queue(graph);
  await finish();
  const run = (await state.db.select().from(creativeWorkflowRuns))[0];
  expect(run.steps.output.outputs).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        type: "image",
        key: `product_image:${photo.id}`,
      }),
      expect.objectContaining({
        type: "text",
        text: expect.stringContaining('"price":"29.00"'),
      }),
    ])
  );
  const hidden = newWorkflowNode("image", "hidden");
  hidden.config.field = appFieldSchema.parse({
    kind: "asset",
    required: true,
    visibleWhen: { fieldId: graph.nodes[0].id, equals: "unmatched" },
  });
  graph.nodes.push(hidden);
  graph.edges.push({
    id: "hidden-output",
    source: "hidden",
    target: "output",
    port: "result",
  });
  const second = await queue(graph);
  await finish();
  const detail = (await owner.get({ organizationId: org, id: second.saved.id }))
    .runs[0];
  expect(detail.status).toBe("completed");
  expect(detail.steps.hidden.outputs).toEqual([]);
});

async function mediaFixture() {
  const [product] = await state.db
    .insert(products)
    .values({
      organizationId: org,
      name: "Travel mug",
      dedupeKey: randomUUID(),
      productUrl: "https://store.example/mug",
      description: "A reusable travel mug.",
      price: "29.00",
      currency: "USD",
      specifications: { Capacity: "400 ml", Material: "Steel" },
      provenance: {},
      status: "approved",
      createdAtMs: Date.now(),
      updatedAtMs: Date.now(),
    })
    .returning();
  const [photo] = await state.db
    .insert(productImages)
    .values({
      organizationId: org,
      productId: product.id,
      sourceUrl: "https://store.example/mug.png",
      storageKey: `org-${org}/mug.png`,
      url: "https://store.example/mug.png",
      isPrimary: 1,
      createdAtMs: Date.now(),
    })
    .returning();
  return { product, photo };
}
