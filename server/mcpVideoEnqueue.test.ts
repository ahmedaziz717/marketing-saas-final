import { randomUUID } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { eq } from "drizzle-orm";
import { beforeAll, beforeEach, afterAll, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({
  db: null as any,
  authorize: vi.fn(),
  bind: vi.fn(),
  quote: vi.fn(),
  resolve: vi.fn(),
}));
vi.mock("./db", () => ({ getDb: async () => state.db }));
vi.mock("./lib/mcpVideoPolicy", () => ({
  authorizeMcpVideoEnqueue: state.authorize,
  authorizeMcpVideoEnqueueInTransaction: state.authorize,
  bindMcpVideoPolicy: state.bind,
}));
vi.mock("./lib/videoPricing", () => ({ quotedVideoRequest: state.quote }));
vi.mock("./lib/videoJobs", async original => ({
  ...(await original<typeof import("./lib/videoJobs")>()),
  videoReadiness: async () => ({ ready: true }),
  resolveVideoReferences: state.resolve,
  validateVideoReferences: async () => {},
}));
vi.mock("./lib/aiMetering", async original => ({
  ...(await original<typeof import("./lib/aiMetering")>()),
  creditState: async () => ({
    account: { enforceCredits: true },
    remaining: 1000,
  }),
}));
import {
  users,
  organizations,
  organizationMemberships,
  brandKits,
} from "../drizzle/schema";
import { videoJobs } from "../drizzle/videoSchema";
import { aiUsage, creditLedger } from "../drizzle/platformSchema";
import { defaultVideoSetup } from "../shared/videoCreation";
import { enqueueVideoGeneration, saveVideoSetup } from "./routers/video";
import { aiScope } from "./lib/aiMetering";
const engine = new PGlite();
const marker = { version: 1, state: "draft" } as any;
beforeAll(async () => {
  state.db = drizzle(engine);
  await migrate(state.db, { migrationsFolder: "drizzle/postgres" });
  await state.db.insert(users).values({ id: 1, openId: "enqueue-owner" });
  await state.db.insert(organizations).values({
    id: 1,
    name: "Enqueue",
    slug: "enqueue",
    createdByUserId: 1,
    createdAtMs: 1,
  });
  await state.db.insert(organizationMemberships).values({
    organizationId: 1,
    userId: 1,
    role: "owner",
    status: "active",
    createdAtMs: 1,
  });
  await state.db
    .insert(brandKits)
    .values({
      organizationId: 1,
      name: "Enqueue Brand",
      updatedByUserId: 1,
      colors: [],
      fonts: [],
      updatedAtMs: 1,
    });
  vi.stubGlobal(
    "fetch",
    vi.fn(() => {
      throw new Error("Network forbidden");
    })
  );
});
afterAll(async () => {
  vi.unstubAllGlobals();
  await engine.close();
});
beforeEach(async () => {
  await state.db.delete(videoJobs);
  await state.db.delete(creditLedger);
  await state.db.delete(aiUsage);
  state.authorize.mockReset().mockResolvedValue(undefined);
  state.bind.mockReset().mockResolvedValue({ ...marker, state: "bound" });
  state.resolve.mockReset().mockResolvedValue([]);
  state.quote.mockReset().mockResolvedValue({
    request: { prompt: "Reviewed product" },
    rate: { credits: 10 },
    quote: { credits: 10 },
  });
});
async function draft(marked = true) {
  const id = randomUUID();
  await state.db.insert(videoJobs).values({
    id,
    organizationId: 1,
    actorUserId: 1,
    setup: { ...defaultVideoSetup, categoryHandling: "neutral" },
    mcpPolicy: marked ? marker : null,
    createdAtMs: 1,
    updatedAtMs: 1,
  });
  return { organizationId: 1, id, revision: 1, quotedCredits: 10 };
}
it("rejects revoked marked requests before any media preparation or reservation", async () => {
  const input = await draft();
  state.authorize.mockRejectedValue(new Error("Revoked"));
  await expect(enqueueVideoGeneration(1, input)).rejects.toThrow("Revoked");
  expect(state.resolve).not.toHaveBeenCalled();
  expect(state.quote).not.toHaveBeenCalled();
  expect(await state.db.select().from(creditLedger)).toHaveLength(0);
});
it("binds approval atomically with one reservation under concurrent enqueue and replay", async () => {
  const input = await draft();
  const [a, b] = await Promise.all([
    enqueueVideoGeneration(1, input),
    enqueueVideoGeneration(1, input),
  ]);
  expect(a.id).toBe(b.id);
  expect(a.status).toBe("queued");
  expect(await state.db.select().from(creditLedger)).toHaveLength(1);
  expect(await state.db.select().from(aiUsage)).toHaveLength(1);
  expect(state.bind).toHaveBeenCalledTimes(1);
  const [job] = await state.db
    .select()
    .from(videoJobs)
    .where(eq(videoJobs.id, input.id));
  expect(job.mcpPolicy.state).toBe("bound");
  state.authorize.mockRejectedValue(new Error("Revoked"));
  await expect(enqueueVideoGeneration(1, input)).rejects.toThrow("Revoked");
});
it("rolls back when policy changes before reservation and rejects changed price", async () => {
  const input = await draft();
  state.bind.mockRejectedValueOnce(new Error("References changed"));
  await expect(enqueueVideoGeneration(1, input)).rejects.toThrow(
    "References changed"
  );
  expect(await state.db.select().from(creditLedger)).toHaveLength(0);
  await expect(
    enqueueVideoGeneration(1, { ...input, quotedCredits: 9 })
  ).rejects.toThrow("credit price changed");
  expect(await state.db.select().from(aiUsage)).toHaveLength(0);
});
it("uses frozen prompt context and prevents editing a marked draft through ordinary save", async () => {
  const input = await draft();
  const prompts = [{ id: "video.direction", value: "Approved direction" }];
  state.authorize.mockResolvedValue({ brand: null, prompts });
  state.quote.mockImplementation(async () => {
    expect(await aiScope.getStore()?.resolvedPromptDefaults).toEqual(prompts);
    return {
      request: { prompt: "Approved direction" },
      rate: { credits: 10 },
      quote: { credits: 10 },
    };
  });
  await expect(
    saveVideoSetup(1, {
      organizationId: 1,
      id: input.id,
      revision: 1,
      setup: { ...defaultVideoSetup, title: "Changed" },
    })
  ).rejects.toThrow("bound to an approved workflow");
  await enqueueVideoGeneration(1, input);
});
it("keeps ordinary UI video reservations on the same engine without MCP binding", async () => {
  const input = await draft(false);
  expect((await enqueueVideoGeneration(1, input)).status).toBe("queued");
  expect(state.bind).not.toHaveBeenCalled();
  expect(await state.db.select().from(creditLedger)).toHaveLength(1);
});
