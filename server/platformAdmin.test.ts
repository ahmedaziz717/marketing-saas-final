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
  platformAudit,
} from "../drizzle/platformSchema";
import {
  estimateCostMicros,
  estimateImageCostMicros,
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
    estimatedCostMicros: 350,
  } as ProviderRate;
  await admin.saveRate(rate);
  const scope = { organizationId, actorUserId: 2, operation: "workflow.assistant" };
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
it("prices image usage automatically within the requesting account and snapshots the verified rates", async () => {
  const { organizationId } = await admin.createAccount({
    name: "Image cost account",
    ownerEmail: "owner@test.com",
    tierId: "trial",
  });
  const usage = {
    _evokeloop_api: "images",
    input_tokens: 2932,
    input_tokens_details: { text_tokens: 1283, image_tokens: 1649 },
    output_tokens: 628,
    output_tokens_details: { text_tokens: 0, image_tokens: 628 },
  };
  await aiScope.run(
    { organizationId, actorUserId: 2, operation: "image-test" },
    () =>
      meteredCall("openai", "gpt-image-2.5-sunburst", "image", async () => ({
        value: "image",
        usage,
      }))
  );
  const [saved] = await state.db
    .select()
    .from(aiUsage)
    .where(eq(aiUsage.organizationId, organizationId));
  expect(saved.costMicros).toBe(38447);
  expect(saved.rateSnapshot.imageInputPerMillion).toBe(8);
  expect(saved.rateSnapshot.sourceUrl).toContain("gpt-image-2.5-sunburst");
  expect((await creditState(state.db, organizationId)).remaining).toBe(92);
});
it("backfills valid historical usage without repricing existing costs or changing credits, and audits once", async () => {
  const { organizationId } = await admin.createAccount({
    name: "Historical costs",
    ownerEmail: "owner@test.com",
    tierId: "trial",
  });
  const ids = [randomUUID(), randomUUID(), randomUUID(), randomUUID()];
  const usage = {
    input_tokens: 2932,
    input_tokens_details: { text_tokens: 1283, image_tokens: 1649 },
    output_tokens: 628,
    output_tokens_details: { text_tokens: 0, image_tokens: 628 },
  };
  for (let i = 0; i < ids.length; i++)
    await state.db.insert(aiUsage).values({
      id: ids[i],
      organizationId,
      actorUserId: 2,
      operation: "legacy-image",
      provider: "openai",
      model: "gpt-image-2.5-sunburst",
      kind: "image",
      status: "succeeded",
      credits: 10,
      period: "2026-09",
      createdAtMs: Date.parse("2026-09-29T23:00:00Z"),
      usage:
        i === 2
          ? { ...usage, input_tokens: 5 }
          : i === 3
            ? {
                ...usage,
                input_tokens_details: { text_tokens: "bad", image_tokens: 1 },
              }
            : usage,
      costMicros: i === 1 ? 123 : null,
      rateSnapshot: {
        provider: "openai",
        model: "gpt-image-2.5-sunburst",
        kind: "image",
        credits: 10,
        inputPerMillion: null,
        outputPerMillion: null,
        cachedInputPerMillion: null,
        perRequestUsd: null,
        note: "old unpriced",
      },
    });
  const migration = readFileSync(
    "drizzle/postgres/0008_verified_image_token_rates.sql",
    "utf8"
  );
  await engine.exec(migration);
  await engine.exec(migration);
  const rows = await state.db
    .select()
    .from(aiUsage)
    .where(eq(aiUsage.organizationId, organizationId));
  const first = rows.find((r: any) => r.id === ids[0]);
  expect(first.costMicros).toBe(38447);
  expect(
    first.usage._evokeloop_pricing_backfill.previousRateSnapshot.note
  ).toBe("old unpriced");
  expect(first.costMicros).toBe(
    estimateImageCostMicros(first.rateSnapshot, first.usage)
  );
  expect(rows.find((r: any) => r.id === ids[1]).costMicros).toBe(123);
  expect(rows.find((r: any) => r.id === ids[2]).costMicros).toBeNull();
  expect(rows.find((r: any) => r.id === ids[3]).costMicros).toBeNull();
  expect(
    (
      await state.db
        .select()
        .from(platformAudit)
        .where(eq(platformAudit.action, "usage.cost_backfilled"))
    ).filter((r: any) => r.organizationId === organizationId)
  ).toHaveLength(1);
  expect((await creditState(state.db, organizationId)).remaining).toBe(100);
});
it("holds the last credit while a provider request is still running", async () => {
  const { organizationId } = await admin.createAccount({
    name: "Pending credit",
    ownerEmail: "owner@test.com",
    tierId: "tiny",
  });
  await admin.saveRate({
    provider: "pending-provider",
    model: "model",
    kind: "text",
    credits: 1,
    inputPerMillion: null,
    outputPerMillion: null,
    cachedInputPerMillion: null,
    perRequestUsd: null,
    estimatedCostMicros: 5000,
    note: "Unknown actual cost stays reserved",
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
it("paginates and filters large account directories without exposing invitation secrets", async () => {
  const inserted = await state.db
    .insert(organizations)
    .values(
      Array.from({ length: 61 }, (_, i) => ({
        name: `Scale fixture ${String(i).padStart(3, "0")}`,
        slug: `scale-fixture-${i}`,
        createdByUserId: 1,
        createdAtMs: Date.now(),
      }))
    )
    .returning();
  await state.db
    .insert(platformAccounts)
    .values(
      inserted.map((row: any, i: number) => ({
        organizationId: row.id,
        tierId: "trial",
        aiPaused: i % 2,
        enforceCredits: 1,
        ownerEmail: `scale-${i}@test.com`,
        notes: "",
        updatedAtMs: Date.now(),
      }))
    );
  const first = await admin.accounts({ search: "Scale fixture" });
  expect(first.total).toBe(61);
  expect(first.items).toHaveLength(50);
  const next = await admin.accounts({
    search: "Scale fixture",
    after: first.next,
  });
  expect(next.items).toHaveLength(11);
  expect(next.total).toBe(61);
  expect(next.next).toBeUndefined();
  expect(
    new Set([...first.items, ...next.items].map((r: any) => r.organization.id))
      .size
  ).toBe(61);
  const paused = await admin.accounts({
    search: "Scale fixture",
    status: "paused",
    tierId: "trial",
  });
  expect(paused.total).toBe(30);
  expect(paused.items.every((r: any) => r.account.aiPaused === 1)).toBe(true);
  expect(JSON.stringify(first)).not.toContain("inviteHash");
});

it("keeps the accepted markup on an in-flight request and applies new pricing only to later requests", async () => {
  const { modelsRouter } = await import("./routers/models");
  const modelAdmin = modelsRouter.createCaller({
    user: { id: 1, role: "admin", email: "admin@test.com" },
    req: {},
    res: {},
  } as any);
  const modelOwner = modelsRouter.createCaller({
    user: { id: 2, role: "user", email: "owner@test.com" },
    req: {},
    res: {},
  } as any);
  await expect(
    modelOwner.savePolicy({ markupPercent: 100, creditValueMicros: 10000 })
  ).rejects.toMatchObject({ code: "FORBIDDEN" });
  const { organizationId } = await admin.createAccount({
    name: "Price snapshot",
    ownerEmail: "owner@test.com",
    tierId: "trial",
  });
  await admin.saveRate({
    provider: "fixed-cost-test",
    model: "image",
    kind: "image",
    credits: 1,
    inputPerMillion: null,
    outputPerMillion: null,
    cachedInputPerMillion: null,
    perRequestUsd: 0.2,
    note: "Fixed published test cost",
  });
  let release!: () => void, started!: () => void;
  const began = new Promise<void>(resolve => {
    started = resolve;
  });
  const pending = new Promise<void>(resolve => {
    release = resolve;
  });
  const run = (call: any) =>
    aiScope.run(
      { organizationId, actorUserId: 2, operation: "pricing.snapshot" },
      () => meteredCall("fixed-cost-test", "image", "image", call)
    );
  const first = run(async () => {
    started();
    await pending;
    return { value: "first" };
  });
  await began;
  try {
    expect((await creditState(state.db, organizationId)).remaining).toBe(60);
    await modelAdmin.savePolicy({
      markupPercent: 200,
      creditValueMicros: 10000,
    });
    release();
    await first;
    await run(async () => ({ value: "second" }));
    const rows = await state.db
      .select()
      .from(aiUsage)
      .where(eq(aiUsage.organizationId, organizationId));
    expect(
      rows.map((r: any) => r.credits).sort((a: number, b: number) => a - b)
    ).toEqual([40, 60]);
    expect(
      rows
        .map((r: any) => r.rateSnapshot.markupPercent)
        .sort((a: number, b: number) => a - b)
    ).toEqual([100, 200]);
    expect(rows.every((r: any) => r.costMicros === 200000)).toBe(true);
    expect((await creditState(state.db, organizationId)).remaining).toBe(0);
  } finally {
    release();
    await first;
    await modelAdmin.savePolicy({
      markupPercent: 100,
      creditValueMicros: 10000,
    });
  }
});
