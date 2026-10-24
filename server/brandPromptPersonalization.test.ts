import { beforeAll, afterAll, expect, it, vi } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { eq } from "drizzle-orm";
import {
  users,
  organizations,
  brandKits,
  promptRevisions,
} from "../drizzle/schema";
import { PROMPT_REGISTRY } from "../shared/promptRegistry";
const state = vi.hoisted(() => ({
  db: null as any,
  fail: false,
  cache: new Map<string, string>(),
  calls: 0,
}));
vi.mock("./db", () => ({ getDb: async () => state.db }));
vi.mock("./storage", () => ({
  assetBucket: () => "test",
  storageClient: () => ({
    storage: {
      from: () => ({
        download: async (key: string) =>
          state.cache.has(key)
            ? { data: new Blob([state.cache.get(key)!]) }
            : { error: { statusCode: "404" } },
        upload: async (key: string, value: Buffer) => {
          state.cache.set(key, value.toString());
          return {};
        },
      }),
    },
  }),
}));
vi.mock("./_core/llm", () => ({
  invokeLLM: async () => {
    state.calls++;
    if (state.fail) throw new Error("provider unavailable");
    return {
      choices: [
        {
          finish_reason: "stop",
          message: {
            content: JSON.stringify({
              general:
                "Use a clear, practical voice for the selected brand audience.",
              copy: "Write specific benefits without unsupported guarantees or claims.",
              visual:
                "Use restrained brand colors and preserve the selected theme.",
            }),
          },
        },
      ],
    };
  },
}));
import { personalizeBrandPrompts } from "./lib/brandPromptDefaults";
const engine = new PGlite();
beforeAll(async () => {
  state.db = drizzle(engine);
  await migrate(state.db, { migrationsFolder: "drizzle/postgres" });
  await state.db
    .insert(users)
    .values({ id: 990, openId: "personalization-test" });
  for (const id of [990, 991]) {
    await state.db
      .insert(organizations)
      .values({
        id,
        name: `Workspace ${id}`,
        slug: `personalize-${id}`,
        createdByUserId: 990,
        createdAtMs: 1,
      });
    await state.db
      .insert(brandKits)
      .values({
        organizationId: id,
        name: `Brand ${id}`,
        voice: "Practical and clear for business owners",
        colors: [],
        fonts: [],
        status: "active",
        updatedByUserId: 990,
        updatedAtMs: 1,
      });
  }
}, 30000);
afterAll(() => engine.close());
it("atomically personalizes only eligible defaults, caches unchanged kits and preserves manual revisions and other tenants", async () => {
  const base = PROMPT_REGISTRY.find(p => p.id === "creative.base")!;
  await state.db
    .insert(promptRevisions)
    .values({
      organizationId: 990,
      promptId: base.id,
      revision: 1,
      value: "My intentional direction",
      baselineVersion: base.version,
      baselineValue: base.baseline,
      action: "save",
      actorUserId: 990,
      reason: "Manual",
      createdAtMs: 1,
    });
  const result = await personalizeBrandPrompts(990, 990);
  expect(result.updated).toBeGreaterThan(0);
  expect(result.preserved).toBe(1);
  const rows = await state.db
    .select()
    .from(promptRevisions)
    .where(eq(promptRevisions.organizationId, 990));
  expect(rows.find((r: any) => r.promptId === base.id)?.value).toBe(
    "My intentional direction"
  );
  for (const row of rows.filter((r: any) => r.action === "personalize_brand")) {
    const definition = PROMPT_REGISTRY.find(p => p.id === row.promptId)!;
    expect(row.value.startsWith(definition.baseline)).toBe(true);
    expect(row.reason).toContain("source ");
  }
  expect(
    await state.db
      .select()
      .from(promptRevisions)
      .where(eq(promptRevisions.organizationId, 991))
  ).toHaveLength(0);
  expect((await personalizeBrandPrompts(990, 990)).updated).toBe(0);
  expect(state.calls).toBe(1);
});
it("leaves every active revision untouched when changed-kit preparation fails", async () => {
  const before = await state.db.select().from(promptRevisions);
  await state.db
    .update(brandKits)
    .set({ voice: "A changed source guide", updatedAtMs: 2 })
    .where(eq(brandKits.organizationId, 990));
  state.fail = true;
  await expect(personalizeBrandPrompts(990, 990)).rejects.toThrow(
    "provider unavailable"
  );
  expect(await state.db.select().from(promptRevisions)).toEqual(before);
});
