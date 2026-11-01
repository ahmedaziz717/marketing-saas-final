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
import { resolveModel, imageBatchQuote } from "./lib/modelCatalog";
import { estimatedActionCredits } from "../shared/aiCredits";
import {
  creativeImageOutputs,
  defaultCreativeSetup,
} from "../shared/creativeBuilder";
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

it("quotes mixed-size customer batches from the same per-action rates saved for generation", async () => {
  const [row] = await state.db
    .select()
    .from(providerRates)
    .where(eq(providerRates.model, "gpt-image-2.5-sunburst"));
  await state.db
    .update(providerRates)
    .set({ config: { ...row.config, pricingVerifiedAt: Date.now() } })
    .where(eq(providerRates.id, row.id));
  const setup = {
    ...defaultCreativeSetup(),
    promotionMode: "platform" as const,
  };
  const outputs = creativeImageOutputs(setup);
  const input = {
    organizationId: 1,
    modelId: "openai:gpt-image-2.5-sunburst",
    options: { quality: "medium" },
    outputs,
  };
  const customer = await owner.imageQuote(input);
  const generation = await imageBatchQuote(
    state.db,
    input.modelId,
    input.options,
    outputs
  );
  expect(customer.credits).toBe(
    generation.quotes.reduce(
      (sum, q) => sum + estimatedActionCredits(q.rate),
      0
    )
  );
  expect(
    new Set(generation.quotes.map(q => q.rate.estimatedCostMicros)).size
  ).toBeGreaterThan(1);
  expect(customer).not.toHaveProperty("rate");
  expect(customer).not.toHaveProperty("costMicros");
  const higher = await owner.imageQuote({
    ...input,
    options: { quality: "high" },
  });
  expect(higher.credits).toBeGreaterThan(customer.credits);
  const baseline = await owner.imageQuote({
    organizationId: 1,
    modelId: input.modelId,
  });
  const catalog = await owner.catalog({ organizationId: 1 });
  expect(baseline.credits).toBe(
    catalog.find(m => m.id === input.modelId)?.estimatedCredits
  );
});

it("limits offering changes to platform admins and rejects unknown models", async () => {
  await expect(
    owner.setEnabled({ id: "openai:gpt-image-2", enabled: false })
  ).rejects.toMatchObject({ code: "FORBIDDEN" });
  await expect(
    admin.setEnabled({ id: "unknown", enabled: false })
  ).rejects.toMatchObject({ code: "BAD_REQUEST" });
});

it("limits comparison estimates to platform admins and keeps comparison changes independent of customer quotes", async () => {
  await expect(owner.adminCatalog()).rejects.toMatchObject({
    code: "FORBIDDEN",
  });
  const adminModels = (await admin.adminCatalog()).models;
  const customerModels = await owner.catalog({ organizationId: 1 });
  const adminImage = adminModels.find(m => m.id === "openai:gpt-image-2")!;
  expect(adminImage.actionEstimate).toMatchObject({
    costMicros: 57680,
    credits: 12,
    basis: "Token-based comparison",
  });
  expect(adminImage.estimatedCredits).toBe(12);
  const high = (
    await admin.adminCatalog({
      imageEstimate: {
        quality: "high",
        size: "1024x1024",
        textInputTokens: 1000,
        imageInputTokens: 1000,
      },
    })
  ).models.find(m => m.id === "openai:gpt-image-2")!;
  expect(high.actionEstimate?.costMicros).toBeGreaterThan(
    adminImage.actionEstimate!.costMicros!
  );
  expect(high.estimatedCredits).toBe(12);
  for (const model of customerModels) {
    expect(model).not.toHaveProperty("actionEstimate");
    expect(model.estimatedCredits).toBe(
      adminModels.find(m => m.id === model.id)?.estimatedCredits ?? null
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
