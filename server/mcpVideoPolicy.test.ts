import { randomUUID } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { eq } from "drizzle-orm";
import { beforeAll, afterAll, it, expect, vi } from "vitest";
const provider = vi.hoisted(() => ({
  submit: vi.fn(),
  poll: vi.fn(),
  rate: vi.fn(),
}));
vi.mock("./lib/higgsfield", async original => ({
  ...(await original<typeof import("./lib/higgsfield")>()),
  higgsfieldConfigured: () => true,
  submitHiggsfield: provider.submit,
  pollHiggsfield: provider.poll,
}));
vi.mock("./lib/providerQuote", () => ({ providerRequestRate: provider.rate }));
vi.mock("./lib/videoPricing", () => ({ videoQuote: () => ({ credits: 5 }) }));
vi.mock("./lib/access", async original => ({
  ...(await original<typeof import("./lib/access")>()),
  requireOrganizationRole: async () => ({ role: "owner" }),
}));
vi.mock("./lib/aiMetering", async original => ({
  ...(await original<typeof import("./lib/aiMetering")>()),
  creditState: async () => ({ account: { aiPaused: false } }),
}));
vi.mock("./lib/videoJobs", async original => ({
  ...(await original<typeof import("./lib/videoJobs")>()),
  validateVideoPeople: async () => {},
  validateVideoReferences: async () => {},
}));
const context = vi.hoisted(() => ({ brand: null, prompts: [] }));
vi.mock("./lib/mcpWorkflowExecution", () => ({
  guardMcpWorkflowStep: async () => context,
}));
import {
  organizations,
  users,
  organizationMemberships,
  activityEvents,
} from "../drizzle/schema";
import {
  creativeWorkflows,
  creativeWorkflowRuns,
  authoringOAuthGrants,
} from "../drizzle/workflowSchema";
import { videoJobs } from "../drizzle/videoSchema";
import { aiUsage } from "../drizzle/platformSchema";
import { defaultVideoSetup, videoEndpoint } from "../shared/videoCreation";
import { stableHash } from "./lib/policy";
import {
  createMcpVideoDraftPolicy,
  bindMcpVideoPolicy,
  guardMcpVideoSubmission,
  authorizeMcpVideoEnqueue,
  mcpVideoRateHash,
} from "./lib/mcpVideoPolicy";
import { processNextVideoJob } from "./jobs/videoWorker";
const engine = new PGlite();
let db: any;
beforeAll(async () => {
  db = drizzle(engine);
  await migrate(db, { migrationsFolder: "drizzle/postgres" });
  await db.insert(users).values({ id: 1, openId: "policy-owner" });
  await db.insert(organizations).values({
    id: 1,
    name: "Policy",
    slug: "policy",
    createdByUserId: 1,
    createdAtMs: 1,
  });
  await db.insert(organizationMemberships).values({
    organizationId: 1,
    userId: 1,
    role: "owner",
    status: "active",
    createdAtMs: 1,
  });
});
afterAll(async () => engine.close());
async function fixture() {
  const runId = randomUUID(),
    jobId = randomUUID(),
    workflowId = randomUUID(),
    grantId = randomUUID();
  const identity = {
    userId: 1,
    organizationId: 1,
    connectionId: grantId,
    resource: "https://example.test/mcp",
  };
  await db.insert(authoringOAuthGrants).values({
    ...identity,
    id: grantId,
    clientId: "client",
    scope: "workflows:read workflows:execute creatives:generate_video",
    tokenHash: stableHash(grantId),
    createdAtMs: 1,
    expiresAtMs: Date.now() + 100000,
  });
  const graph = {
    version: 1,
    nodes: [
      { id: "v", type: "generate_video", config: {}, position: { x: 0, y: 0 } },
    ],
    edges: [],
  };
  await db.insert(creativeWorkflows).values({
    id: workflowId,
    organizationId: 1,
    actorUserId: 1,
    name: "Video",
    graph,
    createdAtMs: 1,
    updatedAtMs: 1,
  });
  const [run] = await db
    .insert(creativeWorkflowRuns)
    .values({
      id: runId,
      workflowId,
      organizationId: 1,
      actorUserId: 1,
      graph,
      steps: { v: { status: "waiting", videoJobId: jobId } },
      references: [],
      creditsByNode: { v: 5 },
      status: "running",
      createdAtMs: 1,
      updatedAtMs: 1,
    })
    .returning();
  const hash = stableHash(runId);
  for (const [action, payload] of [
    [
      "mcp.execution.queued",
      {
        identity,
        hash,
        maxCredits: 5,
        graphHash: stableHash(graph),
        referencesHash: stableHash([]),
        creditsByNode: { v: 5 },
        context,
      },
    ],
    ["mcp.execution.approved", { hash, maxCredits: 5 }],
  ])
    await db.insert(activityEvents).values({
      organizationId: 1,
      actorUserId: 1,
      correlationId: runId,
      action,
      entityType: "mcp_execution",
      entityId: runId,
      payload,
      eventHash: stableHash({ action, runId }),
      createdAtMs: 1,
    });
  const setup = structuredClone(defaultVideoSetup);
  const marker = await db.transaction((tx: any) =>
    createMcpVideoDraftPolicy(tx, run, "v", setup)
  );
  let [job] = await db
    .insert(videoJobs)
    .values({
      id: jobId,
      organizationId: 1,
      actorUserId: 1,
      setup,
      mcpPolicy: marker,
      createdAtMs: 1,
      updatedAtMs: 1,
    })
    .returning();
  const rate = { quotedAtMs: 1, estimatedCostMicros: 100 };
  const requestBody = {
    prompt: "approved",
    image_urls: ["https://example.test/image"],
  };
  const bound = await db.transaction((tx: any) =>
    bindMcpVideoPolicy(tx, job, {
      references: [],
      requestBody,
      credits: 5,
      rateSnapshot: rate,
    })
  );
  [job] = await db
    .update(videoJobs)
    .set({
      mcpPolicy: bound,
      status: "submitting",
      requestBody,
      endpoint: videoEndpoint(setup),
      credits: 5,
      leaseOwner: "lease",
    })
    .where(eq(videoJobs.id, jobId))
    .returning();
  await db.insert(aiUsage).values({
    id: jobId,
    organizationId: 1,
    actorUserId: 1,
    operation: "video",
    provider: "higgsfield",
    model: "test",
    kind: "video",
    status: "pending",
    rateSnapshot: rate,
    credits: 5,
    period: "2026-10",
    createdAtMs: 1,
  });
  return { job, run, grantId };
}
it("binds a reviewed child and permits the first submission only", async () => {
  const { job } = await fixture();
  await expect(guardMcpVideoSubmission(db, job)).resolves.toBeUndefined();
  await db
    .update(videoJobs)
    .set({ attempts: 1 })
    .where(eq(videoJobs.id, job.id));
  await expect(guardMcpVideoSubmission(db, job)).rejects.toThrow();
});
it.each([
  "revoked",
  "expired",
  "scope",
  "resource",
  "membership",
  "stop",
  "setup",
  "body",
  "references",
  "rate",
  "credits",
  "link",
])("rejects %s changes before provider dispatch", async kind => {
  const { job, run, grantId } = await fixture();
  if (kind === "revoked")
    await db
      .update(authoringOAuthGrants)
      .set({ revokedAtMs: 1 })
      .where(eq(authoringOAuthGrants.id, grantId));
  if (kind === "expired")
    await db
      .update(authoringOAuthGrants)
      .set({ expiresAtMs: 1 })
      .where(eq(authoringOAuthGrants.id, grantId));
  if (kind === "scope")
    await db
      .update(authoringOAuthGrants)
      .set({ scope: "workflows:read workflows:execute" })
      .where(eq(authoringOAuthGrants.id, grantId));
  if (kind === "resource")
    await db
      .update(authoringOAuthGrants)
      .set({ resource: "https://wrong.test" })
      .where(eq(authoringOAuthGrants.id, grantId));
  if (kind === "membership")
    await db
      .update(organizationMemberships)
      .set({ status: "suspended" })
      .where(eq(organizationMemberships.userId, 1));
  if (kind === "stop")
    await db
      .update(creativeWorkflowRuns)
      .set({ stopRequested: 1 })
      .where(eq(creativeWorkflowRuns.id, run.id));
  if (kind === "link")
    await db
      .update(creativeWorkflowRuns)
      .set({ steps: { v: { status: "waiting", videoJobId: randomUUID() } } })
      .where(eq(creativeWorkflowRuns.id, run.id));
  if (kind === "setup")
    await db
      .update(videoJobs)
      .set({ setup: { ...job.setup, theme: "changed" } })
      .where(eq(videoJobs.id, job.id));
  if (kind === "body")
    await db
      .update(videoJobs)
      .set({ requestBody: { prompt: "changed" } })
      .where(eq(videoJobs.id, job.id));
  if (kind === "references")
    await db
      .update(videoJobs)
      .set({ references: [{ key: "other" }] })
      .where(eq(videoJobs.id, job.id));
  if (kind === "credits")
    await db
      .update(videoJobs)
      .set({ credits: 6 })
      .where(eq(videoJobs.id, job.id));
  if (kind === "rate")
    await db
      .update(aiUsage)
      .set({ rateSnapshot: { estimatedCostMicros: 200 } })
      .where(eq(aiUsage.id, job.id));
  try {
    await expect(guardMcpVideoSubmission(db, job)).rejects.toThrow();
  } finally {
    if (kind === "membership")
      await db
        .update(organizationMemberships)
        .set({ status: "active" })
        .where(eq(organizationMemberships.userId, 1));
  }
});
it("rejects wrong actor before preparation and keeps legacy jobs unchanged", async () => {
  const { job } = await fixture();
  await expect(authorizeMcpVideoEnqueue(db, job, 2)).rejects.toThrow();
  await expect(
    authorizeMcpVideoEnqueue(db, { ...job, mcpPolicy: null }, 1)
  ).resolves.toBeUndefined();
});
it("quote timestamps are not pricing changes but amounts are", () => {
  expect(mcpVideoRateHash({ quotedAtMs: 1, cost: 5 })).toBe(
    mcpVideoRateHash({ quotedAtMs: 2, cost: 5 })
  );
  expect(mcpVideoRateHash({ cost: 6 })).not.toBe(mcpVideoRateHash({ cost: 5 }));
});

it("ambiguous acceptance stays reserved after revocation; known IDs poll without resubmission", async () => {
  await db.update(videoJobs).set({ status: "attention" });
  const { job, grantId } = await fixture();
  await db
    .update(authoringOAuthGrants)
    .set({ revokedAtMs: 1 })
    .where(eq(authoringOAuthGrants.id, grantId));
  await db
    .update(videoJobs)
    .set({ attempts: 1 })
    .where(eq(videoJobs.id, job.id));
  await processNextVideoJob(db);
  let [saved] = await db
    .select()
    .from(videoJobs)
    .where(eq(videoJobs.id, job.id));
  expect(saved.status).toBe("attention");
  expect(saved.credits).toBe(5);
  expect(provider.submit).not.toHaveBeenCalled();
  const [usage] = await db.select().from(aiUsage).where(eq(aiUsage.id, job.id));
  expect(usage.status).toBe("pending");
  provider.poll.mockResolvedValue({
    status: "in_progress",
    request_id: "known",
  });
  await db
    .update(videoJobs)
    .set({
      status: "submitting",
      providerRequestId: "known",
      providerStatusUrl: "https://platform.higgsfield.ai/requests/known/status",
      nextPollAtMs: 0,
    })
    .where(eq(videoJobs.id, job.id));
  await processNextVideoJob(db);
  expect(provider.poll).toHaveBeenCalledOnce();
  expect(provider.submit).not.toHaveBeenCalled();
});
it("rejects cross-workspace and changed approval bindings", async () => {
  const { job, run } = await fixture();
  await expect(
    authorizeMcpVideoEnqueue(db, { ...job, organizationId: 2 }, 1)
  ).rejects.toThrow();
  await db
    .update(activityEvents)
    .set({ payload: { hash: "different", maxCredits: 5 } })
    .where(eq(activityEvents.correlationId, run.id));
  await expect(guardMcpVideoSubmission(db, job)).rejects.toThrow();
});

it("rechecks live pricing after queued transition before first paid call", async () => {
  await db.update(videoJobs).set({ status: "attention" });
  const { job } = await fixture();
  await db
    .update(videoJobs)
    .set({ status: "queued" })
    .where(eq(videoJobs.id, job.id));
  provider.rate.mockResolvedValue({ quotedAtMs: 2, estimatedCostMicros: 100 });
  await processNextVideoJob(db);
  const [submitting] = await db
    .select()
    .from(videoJobs)
    .where(eq(videoJobs.id, job.id));
  expect(submitting.status).toBe("submitting");
  provider.rate.mockResolvedValue({ quotedAtMs: 3, estimatedCostMicros: 101 });
  await processNextVideoJob(db);
  const [failed] = await db
    .select()
    .from(videoJobs)
    .where(eq(videoJobs.id, job.id));
  expect(failed.status).toBe("failed");
  expect(provider.submit).not.toHaveBeenCalled();
});
it.each(["fingerprint", "catalogFingerprint", "productFacts"])(
  "refuses freshly resolved %s changes against parent approval before binding",
  async field => {
    const { job, run } = await fixture();
    const approved = {
      key: "product-image:1",
      storageKey: "original.png",
      fingerprint: "original",
      name: "Product",
      mimeType: "image/png",
      catalogFingerprint: "facts-v1",
      productFacts: { name: "Original" },
    };
    const refs = [approved];
    await db
      .update(creativeWorkflowRuns)
      .set({ references: refs })
      .where(eq(creativeWorkflowRuns.id, run.id));
    const [event] = await db
      .select()
      .from(activityEvents)
      .where(eq(activityEvents.correlationId, run.id));
    await db
      .update(activityEvents)
      .set({ payload: { ...event.payload, referencesHash: stableHash(refs) } })
      .where(eq(activityEvents.id, event.id));
    await expect(
      db.transaction((tx: any) =>
        bindMcpVideoPolicy(
          tx,
          { ...job, mcpPolicy: { ...job.mcpPolicy, state: "draft" } },
          {
            references: refs,
            requestBody: job.requestBody,
            credits: 5,
            rateSnapshot: { quotedAtMs: 1, estimatedCostMicros: 100 },
          }
        )
      )
    ).resolves.toMatchObject({ state: "bound" });
    const changed = {
      ...approved,
      [field]: field === "productFacts" ? { name: "Changed" } : "changed",
    };
    await expect(
      db.transaction((tx: any) =>
        bindMcpVideoPolicy(
          tx,
          { ...job, mcpPolicy: { ...job.mcpPolicy, state: "draft" } },
          {
            references: [changed],
            requestBody: job.requestBody,
            credits: 5,
            rateSnapshot: { quotedAtMs: 1, estimatedCostMicros: 100 },
          }
        )
      )
    ).rejects.toThrow();
  }
);
