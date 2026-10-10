import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { eq } from "drizzle-orm";
import { beforeAll, afterAll, it, expect, vi } from "vitest";
const state = vi.hoisted(() => ({ db: null as any, graph: vi.fn() }));
vi.mock("./db", () => ({
  getDb: async () => state.db,
  closeDb: async () => {},
}));
vi.mock("./lib/channelGraph", async original => ({
  ...(await original<typeof import("./lib/channelGraph")>()),
  graphRequest: (...a: any[]) => state.graph(...a),
  graphCollection: (...a: any[]) => state.graph(...a),
}));
import {
  users,
  organizations,
  organizationMemberships,
} from "../drizzle/schema";
import { channelConnections } from "../drizzle/channelSchema";
import {
  optimizationRecords,
  optimizationSyncs,
  optimizationClassifications,
} from "../drizzle/optimizationSchema";
import { encryptToken } from "./lib/secureToken";
import { queueHistory, processHistoryPage } from "./lib/optimizationIngestion";
import {
  saveClassification,
  classifyHistoryBatch,
  analyzeHistory,
  evidenceCsv,
} from "./lib/optimizationAnalysis";
import { optimizationRouter } from "./routers/optimization";
import { ChannelGraphError } from "./lib/channelGraph";
let engine: PGlite, org: number, uid: number, other: number;
const cid = randomUUID();
beforeAll(async () => {
  vi.stubEnv(
    "INTEGRATION_TOKEN_ENCRYPTION_SECRET",
    "test-only-no-real-credential"
  );
  vi.stubEnv("OPTIMIZATION_INTELLIGENCE_ENABLED", "true");
  vi.stubEnv("OPTIMIZATION_WORKER_ENABLED", "true");
  engine = new PGlite();
  const journal = JSON.parse(
    readFileSync("drizzle/postgres/meta/_journal.json", "utf8")
  );
  for (const entry of journal.entries)
    await engine.exec(
      readFileSync(`drizzle/postgres/${entry.tag}.sql`, "utf8")
    );
  state.db = drizzle(engine);
  const [u] = await state.db
    .insert(users)
    .values({ openId: "opt-test", name: "Owner" })
    .returning();
  uid = u.id;
  const os = await state.db
    .insert(organizations)
    .values(
      ["main", "other"].map(name => ({
        name,
        slug: `opt-${name}`,
        createdByUserId: uid,
        createdAtMs: 1,
      }))
    )
    .returning();
  org = os[0].id;
  other = os[1].id;
  await state.db.insert(organizationMemberships).values({
    organizationId: org,
    userId: uid,
    role: "owner",
    status: "active",
    createdAtMs: 1,
  });
  vi.stubEnv("OPTIMIZATION_TENANT_IDS", `${org},${other}`);
  await state.db.insert(channelConnections).values({
    id: cid,
    organizationId: org,
    channel: "meta_ads",
    accountId: "123",
    name: "Fixture account",
    status: "connected",
    credentials: encryptToken("test-token"),
    details: {
      permissions: [],
      tasks: [],
      capabilities: ["read"],
      warnings: [],
      currency: "USD",
      timezone: "UTC",
    },
    connectedByUserId: uid,
    verifiedAtMs: 1,
    updatedAtMs: 1,
  });
}, 30000);
afterAll(async () => {
  vi.unstubAllEnvs();
  await engine?.close();
});
it("resumes paginated upserts atomically, preserves cursor on throttle, and rejects another tenant", async () => {
  const job = await queueHistory(state.db, org, uid, cid);
  await state.db
    .update(optimizationSyncs)
    .set({
      tasks: [{ kind: "ad", edge: "ads", fields: "id,name" }],
      nextAtMs: 0,
    })
    .where(eq(optimizationSyncs.id, job.id));
  state.graph.mockResolvedValueOnce({
    data: [{ id: "456", name: "First" }],
    paging: { next: "never-follow-this-url", cursors: { after: "cursor-one" } },
  });
  await processHistoryPage(state.db, job.id);
  let [saved] = await state.db.select().from(optimizationSyncs);
  expect(saved.checkpoint.after).toBe("cursor-one");
  expect(saved.checkpoint.rows).toBe(1);
  await state.db
    .update(optimizationSyncs)
    .set({ nextAtMs: 0 })
    .where(eq(optimizationSyncs.id, job.id));
  state.graph.mockImplementationOnce(async (...args: any[]) => {
    args[5](
      new Headers({
        "x-business-use-case-usage": JSON.stringify({
          account: [{ estimated_time_to_regain_access: 60 }],
        }),
      })
    );
    throw new ChannelGraphError("rate limit", true, 80004);
  });
  const beforeThrottle = Date.now();
  await processHistoryPage(state.db, job.id);
  [saved] = await state.db.select().from(optimizationSyncs);
  expect(saved.checkpoint.after).toBe("cursor-one");
  expect(saved.status).toBe("queued");
  expect(saved.attempts).toBe(1);
  expect(saved.nextAtMs).toBeGreaterThanOrEqual(beforeThrottle + 3600000);
  const callCount = state.graph.mock.calls.length;
  await processHistoryPage(state.db, job.id);
  expect(state.graph.mock.calls.length).toBe(callCount);
  await state.db
    .update(optimizationSyncs)
    .set({ nextAtMs: 0 })
    .where(eq(optimizationSyncs.id, job.id));
  state.graph.mockResolvedValueOnce({
    data: [
      { id: "456", name: "Updated" },
      { id: "789", name: "Second" },
    ],
  });
  await processHistoryPage(state.db, job.id);
  expect(state.graph.mock.calls.at(-1)?.[2].after).toBe("cursor-one");
  const records = await state.db.select().from(optimizationRecords);
  expect(records).toHaveLength(2);
  expect(records.find((r: any) => r.remoteId === "456").data.name).toBe(
    "Updated"
  );
  [saved] = await state.db.select().from(optimizationSyncs);
  expect(saved.status).toBe("completed");
  const caller = optimizationRouter.createCaller({
    user: { id: uid },
    req: {},
    res: {},
  } as any);
  await expect(
    caller.progress({ organizationId: other, connectionId: cid })
  ).rejects.toThrow(/access/);
  await expect(queueHistory(state.db, other, uid, cid)).rejects.toThrow(
    /access/
  );
});
it("creates immutable human revisions without cross-tenant object access", async () => {
  const a = {
    dimension: "theme" as const,
    labels: [
      {
        id: "custom",
        label: "User's own theme",
        confidence: 1,
        evidence: "Authored by owner",
      },
    ],
  };
  const first = await saveClassification(
    state.db,
    org,
    cid,
    "456",
    a,
    "human",
    uid
  );
  const replay = await saveClassification(
    state.db,
    org,
    cid,
    "456",
    a,
    "human",
    uid
  );
  expect(replay.id).toBe(first.id);
  const second = await saveClassification(
    state.db,
    org,
    cid,
    "456",
    { ...a, labels: [] },
    "human",
    uid
  );
  expect(second.revision).toBe(2);
  await expect(
    saveClassification(state.db, other, cid, "456", a, "human", uid)
  ).rejects.toThrow(/workspace/);
});

it("batches imported classifications idempotently without fabricating unknown observations or replacing human edits", async () => {
  await classifyHistoryBatch(state.db, org, cid);
  const first = await state.db.select().from(optimizationClassifications);
  expect(
    first.some((r: any) => r.source === "rule" && r.dimension === "channel")
  ).toBe(true);
  expect(
    first.filter(
      (r: any) => r.source === "rule" && r.assertion.labels.length === 0
    )
  ).toHaveLength(0);
  const humans = first.filter((r: any) => r.source === "human");
  await classifyHistoryBatch(state.db, org, cid);
  const second = await state.db.select().from(optimizationClassifications);
  expect(second).toHaveLength(first.length);
  expect(second.filter((r: any) => r.source === "human")).toEqual(humans);
});

it("resumes classification across a full batch and only returns report source-ad metadata", async () => {
  const [original] = await state.db.select().from(optimizationRecords);
  await state.db.insert(optimizationRecords).values(
    Array.from({ length: 101 }, (_, i) => ({
      ...original,
      id: randomUUID(),
      remoteId: String(900000 + i),
      data: { id: String(900000 + i), name: "Unrelated historical ad" },
    }))
  );
  const first = await classifyHistoryBatch(state.db, org, cid, "800000");
  expect(first.processed).toBe(100);
  expect(first.next).toBe("900099");
  const last = await classifyHistoryBatch(state.db, org, cid, first.next!);
  expect(last.processed).toBe(1);
  expect(last.next).toBeNull();
  await state.db.insert(optimizationRecords).values({
    ...original,
    id: randomUUID(),
    kind: "insight",
    remoteId: "900100",
    date: "2026-01-01",
    grain: "daily",
    data: {
      spend: "10",
      impressions: "100",
      clicks: "5",
      actions: [],
      action_values: [],
    },
  });
  const report = await analyzeHistory(state.db, org, cid, {
    range: { since: "2026-01-01", until: "2026-01-01" },
    grain: "daily",
    dimensions: [],
    filters: [],
    minimumConfidence: 0,
  });
  expect(report.sourceAds.map(a => a.id)).toEqual(["900100"]);
  expect(report.summary.spend).toBe(10);
  expect(report.summary.adCount).toBe(1);
  const csv = evidenceCsv(report);
  expect(csv).toContain('"2026-01-01","2026-01-01"');
  expect(csv).toContain('"sourceAdIds"');
  expect(csv).toContain('"900100"');
  expect(csv).not.toContain('"900099"');
  expect(csv).toContain("Observational associations are not causal effects");
});

it("pins nested workflow versions, rejects cycles and tenant crossing, and enforces mapped types", async () => {
  const { creativeWorkflows, workflowAppVersions } = await import(
    "../drizzle/workflowSchema"
  );
  const { newWorkflowNode } = await import("../shared/creativeWorkflow");
  const { resolveWorkflowApps } = await import("./lib/workflowApps");
  const { executeWorkflowBusinessStep } = await import(
    "./lib/workflowBusinessSteps"
  );
  const workflowId = randomUUID(),
    appId = randomUUID();
  const input = newWorkflowNode("app_input", "input"),
    out = newWorkflowNode("output", "output");
  input.config.inputType = "data";
  const graph = {
    nodes: [input, out],
    edges: [{ id: "edge", source: "input", target: "output", port: "result" }],
  };
  await state.db.insert(creativeWorkflows).values({
    id: workflowId,
    organizationId: org,
    actorUserId: uid,
    name: "Typed child",
    graph,
    createdAtMs: 1,
    updatedAtMs: 1,
  });
  await state.db.insert(workflowAppVersions).values({
    id: appId,
    workflowId,
    organizationId: org,
    actorUserId: uid,
    name: "Typed child",
    family: "optimize",
    graph,
    version: 1,
    workflowRevision: 1,
    createdAtMs: 1,
  });
  const source = newWorkflowNode("app_input", "source"),
    call = newWorkflowNode("run_workflow", "call");
  call.config.appVersionId = appId;
  call.config.inputMapping = [
    { sourceNodeId: "source", targetNodeId: "input", type: "data" },
  ];
  const parent = {
    nodes: [source, call],
    edges: [
      { id: "to-call", source: "source", target: "call", port: "context" },
    ],
  };
  const resolved = await resolveWorkflowApps(state.db, org, parent);
  expect(resolved.nodes.some(n => n.title.includes("v1"))).toBe(true);
  expect(
    resolved.nodes.find(n => n.id !== "source" && n.type === "app_input")
      ?.config.inputType
  ).toBe("data");
  const noise = newWorkflowNode("text", "noise");
  const mixed = await resolveWorkflowApps(state.db, org, {
    nodes: [...parent.nodes, noise],
    edges: [
      ...parent.edges,
      { id: "noise", source: "noise", target: "call", port: "context" },
    ],
  });
  const child = mixed.nodes.find(
    n => n.id !== "source" && n.type === "app_input"
  )!;
  expect(
    mixed.edges.filter(e => e.target === child.id).map(e => e.source)
  ).toEqual(["source"]);
  await expect(resolveWorkflowApps(state.db, other, parent)).rejects.toThrow(
    /workspace/
  );
  await expect(
    executeWorkflowBusinessStep(
      state.db,
      { organizationId: org, steps: { input: { status: "pending" } } } as any,
      input,
      [{ type: "text", text: "wrong" }]
    )
  ).rejects.toThrow(/declared type/);
  await state.db
    .update(workflowAppVersions)
    .set({
      graph: {
        nodes: [call, out],
        edges: [
          { id: "cycle", source: "call", target: "output", port: "result" },
        ],
      },
    })
    .where(eq(workflowAppVersions.id, appId));
  await expect(resolveWorkflowApps(state.db, org, parent)).rejects.toThrow(
    /recursively/
  );
});

it("deduplicates trigger events and pauses before every automated paid action", async () => {
  const {
    creativeWorkflows,
    creativeWorkflowRuns,
    workflowAppVersions,
    workflowTriggers,
    workflowTriggerReceipts,
  } = await import("../drizzle/workflowSchema");
  const { newWorkflowNode } = await import("../shared/creativeWorkflow");
  const { fireWorkflowTrigger } = await import("./lib/workflowTriggers");
  const { processNextWorkflowRun } = await import("./jobs/workflowWorker");
  const { workflowAutomationRouter } = await import(
    "./routers/workflowAutomation"
  );
  const workflowId = randomUUID(),
    appId = randomUUID(),
    triggerId = randomUUID();
  const writer = newWorkflowNode("assistant", "writer"),
    out = newWorkflowNode("output", "output");
  writer.config.text = "A paid generation must not start without approval.";
  const graph = {
    nodes: [writer, out],
    edges: [{ id: "edge", source: "writer", target: "output", port: "result" }],
  };
  await state.db.insert(creativeWorkflows).values({
    id: workflowId,
    organizationId: org,
    actorUserId: uid,
    name: "Automation safety",
    graph,
    createdAtMs: 1,
    updatedAtMs: 1,
  });
  await state.db.insert(workflowAppVersions).values({
    id: appId,
    workflowId,
    organizationId: org,
    actorUserId: uid,
    name: "Automation safety",
    family: "optimize",
    graph,
    version: 1,
    workflowRevision: 1,
    createdAtMs: 1,
  });
  await state.db.insert(workflowTriggers).values({
    id: triggerId,
    organizationId: org,
    actorUserId: uid,
    appVersionId: appId,
    enabled: 1,
    config: {
      kind: "event",
      weekday: 1,
      hour: 9,
      timezone: "UTC",
      event: "manual_event",
    },
    createdAtMs: 1,
    updatedAtMs: 1,
  });
  const id = await fireWorkflowTrigger(state.db, triggerId, "same-event");
  expect(id).toBeTruthy();
  expect(await fireWorkflowTrigger(state.db, triggerId, "same-event")).toBe(id);
  expect(await state.db.select().from(workflowTriggerReceipts)).toHaveLength(1);
  await state.db
    .update(workflowTriggers)
    .set({ enabled: 0 })
    .where(eq(workflowTriggers.id, triggerId));
  expect(
    await fireWorkflowTrigger(state.db, triggerId, "another-event")
  ).toBeNull();
  await processNextWorkflowRun(state.db);
  const [run] = await state.db
    .select()
    .from(creativeWorkflowRuns)
    .where(eq(creativeWorkflowRuns.id, id!));
  expect(run.steps.writer.status).toBe("waiting");
  expect(run.steps.writer.approvalRequiredCredits).toBe(true);
  expect(run.creditsByNode.writer).toBe(0);
  const outsider = workflowAutomationRouter.createCaller({
    user: { id: uid },
    req: {},
    res: {},
  } as any);
  await expect(
    outsider.quoteStep({ organizationId: other, runId: id!, nodeId: "writer" })
  ).rejects.toThrow(/access/);
});
it("runs the legacy Scheduling optimizer with explicit inputs through quote, run and worker without touching the paused import", async () => {
  const { workflowsRouter } = await import("./routers/workflows");
  const { optimizerTemplate } = await import("./lib/optimizationTemplates");
  const { processNextWorkflowRun } = await import("./jobs/workflowWorker");
  const { creativeWorkflowRuns } = await import("../drizzle/workflowSchema");
  const user = (
    await state.db.select().from(users).where(eq(users.id, uid))
  )[0];
  const caller = workflowsRouter.createCaller({
    user,
    req: {},
    res: {},
  } as any);
  const saved = await caller.save({
    organizationId: org,
    name: "Scheduling input fixture",
    family: "optimize",
    graph: optimizerTemplate("weekday_time"),
  });
  const detail = await caller.get({ organizationId: org, id: saved.id });
  expect(detail.graph.nodes[0].config.field?.kind).toBe("performance_data");
  await expect(
    caller.quote({
      organizationId: org,
      id: saved.id,
      revision: saved.revision,
    })
  ).rejects.toThrow(/connected Meta ad account/);
  const inputs = [
    {
      id: "evidence",
      value: JSON.stringify({
        connectionId: cid,
        range: { since: "2026-09-01", until: "2026-09-30" },
      }),
    },
  ];
  const q = await caller.quote({
    organizationId: org,
    id: saved.id,
    revision: saved.revision,
    inputs,
  });
  expect(q.credits).toBe(0);
  const before = await state.db.select().from(optimizationSyncs);
  state.graph.mockResolvedValue({ data: [], truncated: false });
  const run = await caller.run({
    organizationId: org,
    id: saved.id,
    revision: saved.revision,
    inputs,
    quotedCredits: 0,
    requestId: randomUUID(),
  });
  for (let i = 0; i < 4; i++) {
    await state.db
      .update(creativeWorkflowRuns)
      .set({ leaseUntilMs: 0 })
      .where(eq(creativeWorkflowRuns.id, run.id));
    await processNextWorkflowRun(state.db);
  }
  const finished = (
    await state.db
      .select()
      .from(creativeWorkflowRuns)
      .where(eq(creativeWorkflowRuns.id, run.id))
  )[0];
  expect(finished.status).toBe("completed");
  expect(finished.steps.engine.outputs[0].data).toMatchObject({
    decision: "insufficient_evidence",
    source: "live_meta_scheduling",
  });
  expect(finished.steps.evidence.outputs[0].data.range).toEqual({
    since: "2026-09-01",
    until: "2026-09-30",
  });
  expect(await state.db.select().from(optimizationSyncs)).toEqual(before);
  expect(
    (await caller.get({ organizationId: org, id: saved.id })).graph.nodes[0]
      .config.fieldValue
  ).toBeUndefined();
});
