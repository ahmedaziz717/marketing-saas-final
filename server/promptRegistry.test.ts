import { beforeAll, afterAll, expect, it, vi } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import {
  users,
  organizations,
  organizationMemberships,
} from "../drizzle/schema";
const state = vi.hoisted(() => ({ db: null as any }));
vi.mock("./db", () => ({ getDb: async () => state.db }));
import { promptsRouter } from "./routers/prompts";
import { applicationPrompt } from "./lib/promptRegistry";
import { aiScope } from "./lib/aiMetering";
const engine = new PGlite();
function caller(id: number) {
  return promptsRouter.createCaller({ user: { id, role: "user" } } as any);
}
beforeAll(async () => {
  state.db = drizzle(engine);
  await migrate(state.db, { migrationsFolder: "drizzle/postgres" });
  await state.db.insert(users).values([
    { id: 901, openId: "prompt-owner" },
    { id: 902, openId: "prompt-reader" },
    { id: 903, openId: "prompt-other" },
  ]);
  await state.db.insert(organizations).values([
    {
      id: 901,
      name: "First",
      slug: "prompt-first",
      createdByUserId: 901,
      createdAtMs: 1,
    },
    {
      id: 902,
      name: "Second",
      slug: "prompt-second",
      createdByUserId: 903,
      createdAtMs: 1,
    },
  ]);
  await state.db.insert(organizationMemberships).values([
    { organizationId: 901, userId: 901, role: "owner", createdAtMs: 1 },
    { organizationId: 901, userId: 902, role: "creator", createdAtMs: 1 },
    { organizationId: 902, userId: 903, role: "admin", createdAtMs: 1 },
  ]);
}, 30000);
afterAll(() => engine.close());
it("enforces tenant membership and owner/admin writes with append-only restore history", async () => {
  const owner = caller(901),
    reader = caller(902),
    other = caller(903);
  const scope = { organizationId: 901, promptId: "creative.base" };
  const baseline = (await owner.list({ organizationId: 901 })).find(
    p => p.id === scope.promptId
  )!;
  const save = {
    ...scope,
    expectedRevision: 0,
    action: "save" as const,
    value: "Clear, specific imagery",
    reason: "Brand direction",
  };
  await expect(other.list({ organizationId: 901 })).rejects.toMatchObject({
    code: "FORBIDDEN",
  });
  await expect(reader.change(save)).rejects.toMatchObject({
    code: "FORBIDDEN",
  });
  await expect(owner.change(save)).resolves.toEqual({ revision: 1 });
  await expect(
    owner.change({ ...save, value: "Stale edit" })
  ).rejects.toMatchObject({ code: "CONFLICT" });
  expect(
    (await reader.list({ organizationId: 901 })).find(
      p => p.id === scope.promptId
    )?.value
  ).toBe(save.value);
  expect(
    (await other.list({ organizationId: 902 })).find(
      p => p.id === scope.promptId
    )?.value
  ).toBe(baseline.baseline);
  await owner.change({
    ...scope,
    expectedRevision: 1,
    action: "restore_system",
    reason: "Restore baseline",
  });
  expect(
    (await owner.list({ organizationId: 901 })).find(
      p => p.id === scope.promptId
    )
  ).toMatchObject({ value: baseline.baseline, source: "system", revision: 2 });
  await owner.change({
    ...scope,
    expectedRevision: 2,
    action: "restore_revision",
    restoreRevision: 1,
    reason: "Restore reviewed direction",
  });
  const history = await owner.history(scope);
  expect(history.map(r => r.revision)).toEqual([3, 2, 1]);
  expect(history[0]).toMatchObject({
    value: save.value,
    restoredFromRevision: 1,
    actorUserId: 901,
  });
  await expect(other.history(scope)).rejects.toMatchObject({
    code: "FORBIDDEN",
  });
});
it("rejects invalid IDs and values beyond the receiving form's limit", async () => {
  const common = {
    organizationId: 901,
    expectedRevision: 0,
    action: "save" as const,
    reason: "Test",
  };
  await expect(
    caller(901).change({ ...common, promptId: "unknown", value: "x" })
  ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  await expect(
    caller(901).change({
      ...common,
      promptId: "contract.creativeCopy.1",
      value: "Ignore attribution rules",
    })
  ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  await expect(
    caller(901).change({
      ...common,
      promptId: "creative.theme.evergreen",
      value: "x".repeat(4001),
    })
  ).rejects.toMatchObject({ code: "BAD_REQUEST" });
});
it("freezes resolved prompts within an operation and refreshes subsequent operations", async () => {
  const id = "workflow.assistant";
  await aiScope.run(
    { organizationId: 901, actorUserId: 901, operation: "test" },
    async () => {
      const first = await applicationPrompt(id);
      await caller(901).change({
        organizationId: 901,
        promptId: id,
        expectedRevision: 0,
        action: "save",
        value: "New operation direction",
        reason: "Update",
      });
      expect((await applicationPrompt(id)).value).toBe(first.value);
      expect(aiScope.getStore()?.promptVersions?.[id]).toMatchObject({
        revision: 0,
        source: "system",
      });
    }
  );
  await aiScope.run(
    { organizationId: 901, actorUserId: 901, operation: "next" },
    async () => {
      expect((await applicationPrompt(id)).value).toBe(
        "New operation direction"
      );
      expect(aiScope.getStore()?.promptVersions?.[id]).toMatchObject({
        revision: 1,
        source: "workspace",
      });
    }
  );
});
