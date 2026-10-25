import { randomUUID } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { eq } from "drizzle-orm";
import { beforeAll, afterAll, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({ db: null as any }));
vi.mock("./db", () => ({ getDb: async () => state.db }));
import {
  users,
  organizations,
  organizationMemberships,
  products,
  promptRevisions,
} from "../drizzle/schema";
import {
  readMcpPromptDefaults,
  readMcpCategorySettings,
  saveMcpPromptDefault,
  saveMcpCategorySettings,
  saveMcpCategoryOverride,
} from "./lib/mcpConfiguration";
const engine = new PGlite();
const guard = vi.fn(async () => {});
const category = randomUUID();
beforeAll(async () => {
  state.db = drizzle(engine);
  await migrate(state.db, { migrationsFolder: "drizzle/postgres" });
  await state.db.insert(users).values([
    { id: 1, openId: "mcp-config-owner" },
    { id: 2, openId: "mcp-config-creator" },
  ]);
  await state.db.insert(organizations).values(
    [1, 2].map(id => ({
      id,
      name: `Config ${id}`,
      slug: `mcp-config-${id}`,
      createdByUserId: 1,
      createdAtMs: 1,
    }))
  );
  await state.db.insert(organizationMemberships).values([
    {
      organizationId: 1,
      userId: 1,
      role: "owner",
      status: "active",
      createdAtMs: 1,
    },
    {
      organizationId: 1,
      userId: 2,
      role: "creator",
      status: "active",
      createdAtMs: 1,
    },
  ]);
  await state.db.insert(products).values(
    [1, 2].map(id => ({
      id,
      organizationId: id,
      name: `Product ${id}`,
      productUrl: `https://products.example/${id}`,
      dedupeKey: `mcp-config-${id}`,
      specifications: {},
      provenance: { name: "user:1" },
      createdAtMs: 1,
      updatedAtMs: 1,
    }))
  );
});
afterAll(() => engine.close());
it("saves prompt defaults atomically with replay, CAS and no protected prompt bypass", async () => {
  const input = {
    organizationId: 1,
    requestId: randomUUID(),
    promptId: "creative.base",
    expectedRevision: 0,
    value: "Use supplied facts only.",
    reason: "Explicit shared default edit",
  };
  const first = await saveMcpPromptDefault(1, guard, input);
  expect(first).toEqual({ promptId: "creative.base", revision: 1 });
  expect(await saveMcpPromptDefault(1, guard, input)).toEqual(first);
  expect(await state.db.select().from(promptRevisions)).toHaveLength(1);
  await expect(
    saveMcpPromptDefault(1, guard, { ...input, value: "Changed" })
  ).rejects.toMatchObject({ code: "CONFLICT" });
  await expect(
    saveMcpPromptDefault(1, guard, { ...input, requestId: randomUUID() })
  ).rejects.toMatchObject({ code: "CONFLICT" });
  await expect(
    saveMcpPromptDefault(1, guard, { ...input, promptId: "unknown" })
  ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  const rows = await readMcpPromptDefaults(1, guard, {
    organizationId: 1,
    promptIds: ["creative.base"],
  });
  expect(rows.prompts[0]).toMatchObject({
    id: "creative.base",
    revision: 1,
    value: input.value,
  });
  const discovery = await readMcpPromptDefaults(1, guard, {
    organizationId: 1,
    limit: 2,
  });
  expect(discovery.prompts).toHaveLength(2);
  expect(discovery.prompts[0]).not.toHaveProperty("value");
  expect(discovery.nextOffset).toBe(2);
});
it("requires live grant and admin role even for a completed receipt", async () => {
  const input = {
    organizationId: 1,
    requestId: randomUUID(),
    promptId: "creative.base",
    expectedRevision: 1,
    value: "Second",
    reason: "Explicit",
  };
  await expect(saveMcpPromptDefault(2, guard, input)).rejects.toMatchObject({
    code: "FORBIDDEN",
  });
  const saved = await saveMcpPromptDefault(1, guard, input);
  await expect(
    saveMcpPromptDefault(
      1,
      async () => {
        throw new Error("revoked");
      },
      input
    )
  ).rejects.toThrow("revoked");
  expect(saved).toMatchObject({ revision: 2 });
  await expect(
    readMcpPromptDefaults(1, guard, {
      organizationId: 2,
      promptIds: ["creative.base"],
    })
  ).rejects.toMatchObject({ code: "FORBIDDEN" });
});
it("adds category settings with durable replay and rejects deletion or cross-tenant source IDs", async () => {
  const input = {
    organizationId: 1,
    requestId: randomUUID(),
    revision: 0,
    confirm: true,
    settings: {
      categories: [{ id: category, name: "Consumer" }],
      mappings: [
        { sourceId: null, sourceCategory: "C1", categoryId: category },
      ],
    },
  };
  const saved = await saveMcpCategorySettings(1, guard, input);
  expect(await saveMcpCategorySettings(1, guard, input)).toEqual(saved);
  expect(saved).toMatchObject({ revision: 1 });
  await expect(
    saveMcpCategorySettings(1, guard, {
      ...input,
      requestId: randomUUID(),
      revision: 1,
      settings: { categories: [], mappings: [] },
    })
  ).rejects.toMatchObject({ code: "FORBIDDEN" });
  await expect(
    saveMcpCategorySettings(1, guard, {
      ...input,
      requestId: randomUUID(),
      revision: 1,
      settings: {
        ...input.settings,
        mappings: [
          ...input.settings.mappings,
          { sourceId: 900, sourceCategory: "X", categoryId: category },
        ],
      },
    })
  ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  expect(
    (await readMcpCategorySettings(1, guard, { organizationId: 1 })).revision
  ).toBe(1);
});
it("assigns a category without deleting manual facts, preserves replay and rejects clearing or stale edits", async () => {
  const input = {
    organizationId: 1,
    requestId: randomUUID(),
    productId: 1,
    updatedAtMs: 1,
    categoryRevision: 1,
    categoryId: category,
  };
  const saved = await saveMcpCategoryOverride(1, guard, input);
  expect(await saveMcpCategoryOverride(1, guard, input)).toEqual(saved);
  const [row] = await state.db
    .select()
    .from(products)
    .where(eq(products.id, 1));
  expect(row.provenance.name).toBe("user:1");
  expect(row.provenance["marketing.categoryId"]).toBe(category);
  await expect(
    saveMcpCategoryOverride(1, guard, { ...input, requestId: randomUUID() })
  ).rejects.toMatchObject({ code: "CONFLICT" });
  await expect(
    saveMcpCategoryOverride(1, guard, {
      ...input,
      requestId: randomUUID(),
      productId: 2,
    })
  ).rejects.toMatchObject({ code: "NOT_FOUND" });
  await expect(
    saveMcpCategoryOverride(1, guard, { ...input, categoryId: null })
  ).rejects.toThrow();
});
it("rejects unknown action fields, creator shared configuration, and removed membership", async () => {
  await expect(
    saveMcpCategorySettings(2, guard, {
      organizationId: 1,
      requestId: randomUUID(),
      revision: 1,
      confirm: true,
      settings: { categories: [], mappings: [] },
    })
  ).rejects.toMatchObject({ code: "FORBIDDEN" });
  await expect(
    saveMcpPromptDefault(1, guard, {
      organizationId: 1,
      requestId: randomUUID(),
      promptId: "creative.base",
      expectedRevision: 2,
      value: "No activation",
      reason: "Test",
      activate: true,
    })
  ).rejects.toThrow();
  await state.db
    .update(organizationMemberships)
    .set({ status: "suspended" })
    .where(eq(organizationMemberships.userId, 1));
  await expect(
    readMcpCategorySettings(1, guard, { organizationId: 1 })
  ).rejects.toMatchObject({ code: "FORBIDDEN" });
});
