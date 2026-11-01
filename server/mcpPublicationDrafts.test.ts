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
  activityEvents,
} from "../drizzle/schema";
import { publications } from "../drizzle/channelSchema";
import { saveMcpPublicationDraft } from "./lib/mcpPublicationDrafts";
import { savePublicationDraft } from "./routers/channels";

const engine = new PGlite();
const guard = vi.fn(async () => {});
const fetchSpy = vi.fn(() => {
  throw new Error("No network in local draft save");
});
beforeAll(async () => {
  state.db = drizzle(engine);
  await migrate(state.db, { migrationsFolder: "drizzle/postgres" });
  await state.db.insert(users).values([
    { id: 1, openId: "publication-owner" },
    { id: 2, openId: "publication-other" },
  ]);
  await state.db.insert(organizations).values(
    [1, 2].map(id => ({
      id,
      name: `Org ${id}`,
      slug: `mcp-publication-${id}`,
      createdByUserId: 1,
      createdAtMs: 1,
    }))
  );
  await state.db.insert(organizationMemberships).values({
    organizationId: 1,
    userId: 1,
    role: "owner",
    status: "active",
    createdAtMs: 1,
  });
  vi.stubGlobal("fetch", fetchSpy);
});
afterAll(async () => {
  vi.unstubAllGlobals();
  await engine.close();
});
const input = () => ({
  organizationId: 1,
  requestId: randomUUID(),
  id: randomUUID(),
  revision: 0,
  channel: "facebook" as const,
  connectionId: null,
  assetKey: null,
  content: { title: "Draft", message: "Review this copy" },
  scheduledAtMs: null,
  timezone: "UTC",
});

it("saves a local draft once and replays the exact receipt even after later edits", async () => {
  const first = input();
  const created = await saveMcpPublicationDraft(1, guard, first);
  expect(created).toMatchObject({ id: first.id, revision: 1, state: "draft" });
  expect(Object.keys(created).sort()).toEqual([
    "id",
    "revision",
    "state",
    "updatedAtMs",
  ]);
  const edit = {
    ...first,
    requestId: randomUUID(),
    revision: 1,
    content: { title: "New title" },
  };
  expect(await saveMcpPublicationDraft(1, guard, edit)).toMatchObject({
    revision: 2,
    state: "draft",
  });
  expect(await saveMcpPublicationDraft(1, guard, first)).toEqual(created);
  const [row] = await state.db
    .select()
    .from(publications)
    .where(eq(publications.id, first.id));
  expect(row).toMatchObject({
    state: "draft",
    revision: 2,
    scheduledAtMs: null,
    approvalHash: null,
  });
  expect(row.content.title).toBe("New title");
  expect(fetchSpy).not.toHaveBeenCalled();
});

it("rejects reused IDs with different payload, stale revisions and nonlocal scheduling fields", async () => {
  const first = input();
  await saveMcpPublicationDraft(1, guard, first);
  await expect(
    saveMcpPublicationDraft(1, guard, {
      ...first,
      content: { title: "Changed" },
    })
  ).rejects.toMatchObject({ code: "CONFLICT" });
  await expect(
    saveMcpPublicationDraft(1, guard, { ...first, requestId: randomUUID() })
  ).rejects.toMatchObject({ code: "CONFLICT" });
  await expect(
    saveMcpPublicationDraft(1, guard, {
      ...input(),
      scheduledAtMs: Date.now() + 10000,
    })
  ).rejects.toThrow();
  await expect(
    saveMcpPublicationDraft(1, guard, { ...input(), state: "approved" })
  ).rejects.toThrow();
  await expect(
    saveMcpPublicationDraft(1, guard, {
      ...input(),
      content: { title: "Draft", activate: true },
    })
  ).rejects.toThrow();
});

it("checks membership and grant on both save and receipt replay, keeping failures atomic", async () => {
  const first = input();
  const created = await saveMcpPublicationDraft(1, guard, first);
  const denied = async () => {
    throw new Error("revoked");
  };
  await expect(saveMcpPublicationDraft(1, denied, first)).rejects.toThrow(
    "revoked"
  );
  const second = input();
  await expect(saveMcpPublicationDraft(1, denied, second)).rejects.toThrow(
    "revoked"
  );
  expect(
    await state.db
      .select()
      .from(publications)
      .where(eq(publications.id, second.id))
  ).toHaveLength(0);
  await expect(saveMcpPublicationDraft(2, guard, first)).rejects.toMatchObject({
    code: "FORBIDDEN",
  });
  await expect(
    saveMcpPublicationDraft(1, guard, { ...input(), organizationId: 2 })
  ).rejects.toMatchObject({ code: "FORBIDDEN" });
  await state.db
    .update(organizationMemberships)
    .set({ status: "suspended" })
    .where(eq(organizationMemberships.userId, 1));
  await expect(saveMcpPublicationDraft(1, guard, first)).rejects.toMatchObject({
    code: "FORBIDDEN",
  });
  await state.db
    .update(organizationMemberships)
    .set({ status: "active" })
    .where(eq(organizationMemberships.userId, 1));
  expect(await saveMcpPublicationDraft(1, guard, first)).toEqual(created);
});

it("reuses one receipt for simultaneous identical requests and preserves ordinary save behavior", async () => {
  const first = input();
  const [a, b] = await Promise.all([
    saveMcpPublicationDraft(1, guard, first),
    saveMcpPublicationDraft(1, guard, first),
  ]);
  expect(a).toEqual(b);
  expect(
    await state.db
      .select()
      .from(activityEvents)
      .where(eq(activityEvents.correlationId, first.requestId))
  ).toHaveLength(1);
  const { requestId: _, ...ordinary } = input();
  const scheduledAtMs = Date.now() + 100000;
  const saved = await savePublicationDraft(1, {
    ...ordinary,
    content: {
      ...ordinary.content,
      link: "",
      headline: "",
      description: "",
      callToAction: "LEARN_MORE",
      campaignLabel: "",
      adSetId: "",
    },
    scheduledAtMs,
  });
  expect(saved).toMatchObject({ state: "draft", scheduledAtMs });
  expect(fetchSpy).not.toHaveBeenCalled();
});

it("rejects foreign publication IDs and missing asset references before saving or recording a receipt", async () => {
  const foreign = randomUUID();
  await state.db
    .insert(publications)
    .values({
      id: foreign,
      organizationId: 2,
      channel: "facebook",
      content: { title: "Private" },
      timezone: "UTC",
      createdByUserId: 1,
      createdAtMs: 1,
      updatedAtMs: 1,
    });
  const crossTenant = { ...input(), id: foreign, revision: 1 };
  await expect(
    saveMcpPublicationDraft(1, guard, crossTenant)
  ).rejects.toMatchObject({ code: "NOT_FOUND" });
  const missingAsset = { ...input(), assetKey: "asset:999999" };
  await expect(
    saveMcpPublicationDraft(1, guard, missingAsset)
  ).rejects.toThrow();
  expect(
    await state.db
      .select()
      .from(publications)
      .where(eq(publications.id, missingAsset.id))
  ).toHaveLength(0);
  expect(
    await state.db
      .select()
      .from(activityEvents)
      .where(eq(activityEvents.correlationId, missingAsset.requestId))
  ).toHaveLength(0);
  expect(fetchSpy).not.toHaveBeenCalled();
});
