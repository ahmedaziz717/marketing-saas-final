import { beforeAll, afterAll, it, expect, vi } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import {
  users,
  organizations,
  organizationMemberships,
} from "../drizzle/schema";
import {
  aiUsage,
  platformAccounts,
  creditLedger,
} from "../drizzle/platformSchema";
import {
  estimateCostMicros,
  type ProviderRate,
  utcCreditMonth,
} from "../shared/platformAdmin";
const state = vi.hoisted(() => ({ db: null as any }));
vi.mock("./db", () => ({ getDb: async () => state.db }));
import { platformAdminRouter } from "./routers/platformAdmin";
import { aiScope, meteredCall, creditState } from "./lib/aiMetering";
let engine: PGlite, admin: any, owner: any, outsider: any;
beforeAll(async () => {
  engine = new PGlite();
  for (const e of JSON.parse(
    readFileSync("drizzle/postgres/meta/_journal.json", "utf8")
  ).entries)
    await engine.exec(readFileSync(`drizzle/postgres/${e.tag}.sql`, "utf8"));
  state.db = drizzle(engine);
  for (const [id, role, email] of [
    [1, "admin", "admin@test.com"],
    [2, "user", "owner@test.com"],
    [3, "user", "other@test.com"],
  ] as const)
    await state.db
      .insert(users)
      .values({ id, openId: `test-${id}`, role, email });
  const ctx = (id: number, role: string, email: string) =>
    ({ user: { id, role, email }, req: {}, res: {} }) as any;
  admin = platformAdminRouter.createCaller(ctx(1, "admin", "admin@test.com"));
  owner = platformAdminRouter.createCaller(ctx(2, "user", "owner@test.com"));
  outsider = platformAdminRouter.createCaller(ctx(3, "user", "other@test.com"));
}, 30000);
afterAll(async () => engine?.close());
it("restricts the platform API to platform administrators, not workspace owners", async () => {
  await expect(owner.config()).rejects.toMatchObject({ code: "FORBIDDEN" });
  await expect(
    owner.openaiCosts({ range: { since: "2026-09-01", until: "2026-09-30" } })
  ).rejects.toMatchObject({ code: "FORBIDDEN" });
  await expect(
    owner.syncOpenaiCosts({
      range: { since: "2026-09-01", until: "2026-09-30" },
    })
  ).rejects.toMatchObject({ code: "FORBIDDEN" });
  await expect(
    owner.createAccount({
      name: "Nope",
      ownerEmail: "owner@test.com",
      tierId: "trial",
    })
  ).rejects.toMatchObject({ code: "FORBIDDEN" });
  expect((await admin.config()).tiers.length).toBe(4);
});
it("creates scoped owners and email-bound single-use account invitations", async () => {
  const known = await admin.createAccount({
    name: "Known",
    ownerEmail: "owner@test.com",
    tierId: "trial",
  });
  expect(known.invitePath).toBeNull();
  expect(
    (await owner.customerCredits({ organizationId: known.organizationId }))
      .allowance
  ).toBe(100);
  await expect(
    outsider.customerCredits({ organizationId: known.organizationId })
  ).rejects.toMatchObject({ code: "FORBIDDEN" });
  const pending = await admin.createAccount({
      name: "Pending",
      ownerEmail: "later@test.com",
      tierId: "trial",
    }),
    token = pending.invitePath.split("/").pop();
  await expect(owner.acceptAccount({ token })).rejects.toMatchObject({
    code: "FORBIDDEN",
  });
  await state.db
    .insert(users)
    .values({ id: 4, openId: "later", email: "later@test.com", role: "user" });
  const later = platformAdminRouter.createCaller({
    user: { id: 4, role: "user", email: "later@test.com" },
    req: {},
    res: {},
  } as any);
  await later.acceptAccount({ token });
  await expect(later.acceptAccount({ token })).rejects.toMatchObject({
    code: "BAD_REQUEST",
  });
});
it("reserves credits, blocks overspend, refunds failures, retains usage and snapshots rates", async () => {
  const { organizationId } = await admin.createAccount({
    name: "Metered",
    ownerEmail: "owner@test.com",
    tierId: "trial",
  });
  await admin.saveTier({
    id: "tiny",
    name: "Tiny",
    monthlyCredits: 1,
    monthlyPriceUsd: 10,
    reason: "test allowance",
  });
  await admin.saveAccount({
    organizationId,
    tierId: "tiny",
    enforceCredits: true,
    aiPaused: false,
    notes: "",
    reason: "testing",
  });
  const rate = {
    provider: "test",
    model: "model",
    kind: "text",
    credits: 1,
    inputPerMillion: 2,
    cachedInputPerMillion: 1,
    outputPerMillion: 8,
    perRequestUsd: null,
    note: "test rates",
  } as ProviderRate;
  await admin.saveRate(rate);
  const scope = { organizationId, actorUserId: 2, operation: "test" };
  const run = (f: any) =>
    aiScope.run(scope, () => meteredCall("test", "model", "text", f));
  const provider = vi.fn(async () => ({
    value: "ok",
    usage: {
      prompt_tokens: 100,
      completion_tokens: 20,
      prompt_tokens_details: { cached_tokens: 10 },
    },
  }));
  expect(await run(provider)).toBe("ok");
  expect((await creditState(state.db, organizationId)).remaining).toBe(0);
  await expect(run(provider)).rejects.toThrow("Insufficient AI credits");
  expect(provider).toHaveBeenCalledTimes(1);
  const requestId = randomUUID();
  await admin.adjustCredits({
    organizationId,
    period: utcCreditMonth(),
    amount: 2,
    reason: "test grant",
    requestId,
  });
  await admin.adjustCredits({
    organizationId,
    period: utcCreditMonth(),
    amount: 2,
    reason: "test grant",
    requestId,
  });
  expect((await creditState(state.db, organizationId)).remaining).toBe(2);
  await expect(
    run(async () => {
      throw new Error("provider down");
    })
  ).rejects.toThrow("provider down");
  expect((await creditState(state.db, organizationId)).remaining).toBe(2);
  const [usage] = await state.db
    .select()
    .from(aiUsage)
    .where(eq(aiUsage.status, "succeeded"));
  expect(usage.costMicros).toBe(350);
  expect(usage.rateSnapshot.inputPerMillion).toBe(2);
  await admin.saveRate({ ...rate, inputPerMillion: 5 });
  expect(
    (await state.db.select().from(aiUsage).where(eq(aiUsage.id, usage.id)))[0]
      .costMicros
  ).toBe(350);
  await admin.saveAccount({
    organizationId,
    tierId: "tiny",
    enforceCredits: true,
    aiPaused: true,
    notes: "",
    reason: "pause test",
  });
  await expect(run(provider)).rejects.toThrow("paused");
  expect(
    (await creditState(state.db, organizationId, "2027-01")).remaining
  ).toBe(1);
});
it("preserves unknown costs rather than reporting a zero estimate", () => {
  const rate = {
    provider: "x",
    model: "y",
    kind: "image",
    credits: 10,
    inputPerMillion: null,
    cachedInputPerMillion: null,
    outputPerMillion: null,
    perRequestUsd: null,
    note: "",
  } as ProviderRate;
  expect(estimateCostMicros(rate, 100, 200)).toBeNull();
  expect(estimateCostMicros({ ...rate, perRequestUsd: 0.12 }, null, null)).toBe(
    120000
  );
});
it("prices the configured text model including cached tokens and long context", async () => {
  const config = await admin.config();
  const rate = config.rates.find((r: any) => r.model === "gpt-5.5").config;
  expect(estimateCostMicros(rate, 1000, 100, 200)).toBe(7100);
  expect(estimateCostMicros(rate, 272000, 100, 0)).toBe(1363000);
  expect(estimateCostMicros(rate, 272001, 100, 0)).toBe(2724510);
});
it("holds the last credit while a provider request is still running", async () => {
  const { organizationId } = await admin.createAccount({
    name: "Pending credit",
    ownerEmail: "owner@test.com",
    tierId: "tiny",
  });
  let finish!: () => void;
  let started!: () => void;
  const began = new Promise<void>(resolve => {
    started = resolve;
  });
  const pending = new Promise<void>(resolve => {
    finish = resolve;
  });
  const run = (call: any) =>
    aiScope.run(
      { organizationId, actorUserId: 2, operation: "test.pending" },
      () => meteredCall("pending-provider", "model", "text", call)
    );
  const first = run(async () => {
    started();
    await pending;
    return { value: "ok" };
  });
  await began;
  const second = vi.fn(async () => ({ value: "should not run" }));
  try {
    await expect(run(second)).rejects.toThrow("Insufficient AI credits");
    expect(second).not.toHaveBeenCalled();
  } finally {
    finish();
    await first;
  }
});
it("records idempotent manual costs/revenue and includes adjustments in account reports", async () => {
  const requestId = randomUUID();
  const input = {
    requestId,
    organizationId: 1,
    kind: "revenue",
    amountUsd: 50,
    date: "2026-09-30",
    description: "manual payment",
  };
  await admin.addFinancial(input);
  await admin.addFinancial(input);
  await admin.addFinancial({
    ...input,
    requestId: randomUUID(),
    amountUsd: -5,
    description: "payment correction",
  });
  const report = await admin.report({
    range: { since: "2026-09-01", until: "2026-09-30" },
    organizationId: 1,
  });
  expect(report.financial[0].amountMicros).toBe(45000000);
  const accounts = await admin.accounts({ search: "Known" });
  expect(JSON.stringify(accounts)).not.toContain("inviteHash");
});
