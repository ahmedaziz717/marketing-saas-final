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
} from "../drizzle/optimizationSchema";
import { encryptToken } from "./lib/secureToken";
import { queueHistory, processHistoryPage } from "./lib/optimizationIngestion";
import { saveClassification } from "./lib/optimizationAnalysis";
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
  await state.db
    .insert(organizationMemberships)
    .values({
      organizationId: org,
      userId: uid,
      role: "owner",
      status: "active",
      createdAtMs: 1,
    });
  vi.stubEnv("OPTIMIZATION_TENANT_IDS", `${org},${other}`);
  await state.db
    .insert(channelConnections)
    .values({
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
  state.graph.mockRejectedValueOnce(
    new ChannelGraphError("rate limit", true, 80004)
  );
  await processHistoryPage(state.db, job.id);
  [saved] = await state.db.select().from(optimizationSyncs);
  expect(saved.checkpoint.after).toBe("cursor-one");
  expect(saved.status).toBe("queued");
  expect(saved.attempts).toBe(1);
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
