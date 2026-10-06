import { beforeAll, afterAll, it, expect, vi } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { readFileSync } from "node:fs";
import { eq } from "drizzle-orm";
import {
  users,
  organizations,
  organizationMemberships,
} from "../drizzle/schema";
import {
  aiModelSettings,
  providerRates,
  platformAudit,
} from "../drizzle/platformSchema";
const state = vi.hoisted(() => ({ db: null as any }));
vi.mock("./db", () => ({ getDb: async () => state.db }));
import { modelsRouter } from "./routers/models";
import { resolveModel } from "./lib/modelCatalog";
let engine: PGlite;
let admin: ReturnType<typeof modelsRouter.createCaller>;
let owner: ReturnType<typeof modelsRouter.createCaller>;
beforeAll(async () => {
  engine = new PGlite();
  for (const entry of JSON.parse(
    readFileSync("drizzle/postgres/meta/_journal.json", "utf8")
  ).entries)
    await engine.exec(
      readFileSync(`drizzle/postgres/${entry.tag}.sql`, "utf8")
    );
  state.db = drizzle(engine);
  await state.db.insert(users).values([
    { id: 1, openId: "admin", role: "admin" },
    { id: 2, openId: "owner", role: "user" },
  ]);
  await state.db.insert(organizations).values({
    id: 1,
    name: "Workspace",
    slug: "workspace",
    createdByUserId: 2,
    createdAtMs: 1,
  });
  await state.db.insert(organizationMemberships).values({
    organizationId: 1,
    userId: 2,
    role: "owner",
    status: "active",
    createdAtMs: 1,
  });
  admin = modelsRouter.createCaller({
    user: { id: 1, role: "admin" },
    req: {},
    res: {},
  } as any);
  owner = modelsRouter.createCaller({
    user: { id: 2, role: "user" },
    req: {},
    res: {},
  } as any);
  await admin.adminCatalog();
}, 30000);
afterAll(async () => engine?.close());

it("limits offering changes to platform admins and rejects unknown models", async () => {
  await expect(
    owner.setEnabled({ id: "openai:gpt-image-2", enabled: false })
  ).rejects.toMatchObject({ code: "FORBIDDEN" });
  await expect(
    admin.setEnabled({ id: "unknown", enabled: false })
  ).rejects.toMatchObject({ code: "BAD_REQUEST" });
});

it("exposes wholesale action estimates only to platform admins while keeping customer quotes consistent", async () => {
  await expect(owner.adminCatalog()).rejects.toMatchObject({
    code: "FORBIDDEN",
  });
  const adminModels = (await admin.adminCatalog()).models;
  const customerModels = await owner.catalog({ organizationId: 1 });
  const adminImage = adminModels.find(m => m.id === "openai:gpt-image-2")!;
  expect(adminImage.actionEstimate).toMatchObject({
    costMicros: 200000,
    credits: adminImage.estimatedCredits,
    basis: "Configured estimate",
  });
  for (const model of customerModels) {
    expect(model).not.toHaveProperty("actionEstimate");
    expect(model.estimatedCredits).toBe(
      adminModels.find(m => m.id === model.id)?.actionEstimate?.credits ?? null
    );
  }
});

it("hides disabled models, blocks saved selections, and preserves their route, pricing, and verification", async () => {
  const id = "openai:gpt-image-2.5-flare";
  const routeId = "higgsfield:marketing-studio/image/flare";
  await state.db.insert(aiModelSettings).values({
    id,
    enabled: 1,
    routeId,
    availability: "available",
    checkedAtMs: 123,
    updatedAtMs: 123,
  });
  const rates = await state.db.select().from(providerRates);
  await admin.setEnabled({ id, enabled: false });
  expect(
    (await owner.catalog({ organizationId: 1 })).some(m => m.id === id)
  ).toBe(false);
  expect(
    (await admin.adminCatalog()).models.find(m => m.id === id)
  ).toMatchObject({ enabled: false });
  await expect(resolveModel(state.db, id, "image")).rejects.toThrow(/disabled/);
  expect(
    (
      await state.db
        .select()
        .from(aiModelSettings)
        .where(eq(aiModelSettings.id, id))
    )[0]
  ).toMatchObject({
    enabled: 0,
    routeId,
    availability: "available",
    checkedAtMs: 123,
  });
  expect(await state.db.select().from(providerRates)).toEqual(rates);
  await admin.saveModel({
    id,
    routeId,
    markupPercent: 120,
    estimatedCostUsd: null,
    perRequestUsd: null,
    perSecondUsd: null,
  });
  expect(
    (await owner.catalog({ organizationId: 1 })).some(m => m.id === id)
  ).toBe(false);
  await admin.setEnabled({ id, enabled: true });
  expect(
    (await owner.catalog({ organizationId: 1 })).find(m => m.id === id)
  ).toMatchObject({ enabled: true, maker: "OpenAI", routeId });
  expect((await resolveModel(state.db, id, "image")).id).toBe(routeId);
  expect(
    (
      await state.db
        .select()
        .from(platformAudit)
        .where(eq(platformAudit.action, "ai.model.offering.updated"))
    ).length
  ).toBe(2);
});

it("supports an initial toggle for models without settings and keeps maker distinct from provider", async () => {
  const id = "higgsfield:bytedance/seedance-2.5/text-to-video";
  await admin.setEnabled({ id, enabled: false });
  await expect(resolveModel(state.db, id, "video")).rejects.toThrow(/disabled/);
  await admin.setEnabled({ id, enabled: true });
  expect(
    (await owner.catalog({ organizationId: 1 })).find(m => m.id === id)
  ).toMatchObject({
    enabled: true,
    maker: "ByteDance",
    provider: "higgsfield",
  });
});
