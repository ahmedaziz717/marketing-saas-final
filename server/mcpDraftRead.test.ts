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
  campaignBriefs,
} from "../drizzle/schema";
import {
  channelConnections,
  googleCampaignDrafts,
  publications,
} from "../drizzle/channelSchema";
import { videoJobs } from "../drizzle/videoSchema";
import { defaultCreativeSetup } from "../shared/creativeBuilder";
import { defaultVideoSetup } from "../shared/videoCreation";
import { mcpDraftRead } from "./lib/mcpDraftRead";
const engine = new PGlite();
const id = (value: number) =>
  `00000000-0000-4000-8000-${String(value).padStart(12, "0")}`;
const guard = vi.fn(async () => {}),
  service = mcpDraftRead(1, guard);
beforeAll(async () => {
  state.db = drizzle(engine);
  await migrate(state.db, { migrationsFolder: "drizzle/postgres" });
  await state.db.insert(users).values({ id: 1, openId: "draft-read-owner" });
  await state.db.insert(organizations).values(
    [1, 2].map(n => ({
      id: n,
      name: `Org ${n}`,
      slug: `draft-read-${n}`,
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
  await state.db.insert(campaignBriefs).values(
    Array.from({ length: 24 }, (_, i) => ({
      id: i + 1,
      organizationId: i === 22 ? 2 : 1,
      name: `Creative ${i + 1}`,
      audience: "",
      offer: "",
      placements: [],
      formats: [],
      creativeDirection: "",
      assetIds: [],
      productIds: [],
      creativeSetup: {
        ...defaultCreativeSetup(),
        secret: "not-a-schema-field",
      },
      status: i === 23 ? "approved" : "draft",
      createdByUserId: 1,
      createdAtMs: 1,
      updatedAtMs: 123,
    }))
  );
  await state.db.insert(channelConnections).values(
    [1, 2, 3].map(n => ({
      id: id(n),
      organizationId: n === 2 ? 2 : 1,
      channel: n === 3 ? "facebook" : "google_ads",
      accountId: String(n),
      name: `Account ${n}`,
      status: n === 3 ? "disconnected" : "connected",
      credentials: { ciphertext: "secret", iv: "secret", tag: "secret" },
      details: { privateToken: "secret" },
      connectedByUserId: 1,
      verifiedAtMs: 1,
      updatedAtMs: 1,
    }))
  );
  for (const n of [1, 2, 3]) {
    const organizationId = n === 2 ? 2 : 1;
    await state.db.insert(videoJobs).values({
      id: id(n),
      organizationId,
      actorUserId: 1,
      setup: { ...defaultVideoSetup, secret: "not-a-schema-field" },
      revision: 7,
      status: n === 3 ? "completed" : "draft",
      providerStatusUrl: "https://provider.test/secret",
      requestBody: { token: "secret" },
      error: "secret",
      createdAtMs: 1,
      updatedAtMs: 123,
    });
    await state.db.insert(googleCampaignDrafts).values({
      id: id(n),
      organizationId,
      connectionId: id(n === 2 ? 2 : 1),
      change: {
        kind: "campaign_update",
        campaignId: "123",
        name: "Working campaign",
        status: "PAUSED",
        dailyBudget: 10,
        secret: "not-a-schema-field",
      },
      revision: 7,
      state: n === 3 ? "published" : "draft",
      result: { resources: ["secret"] },
      error: "secret",
      createdByUserId: 1,
      createdAtMs: 1,
      updatedAtMs: 123,
    });
    await state.db.insert(publications).values({
      id: id(n),
      organizationId,
      channel: "facebook",
      connectionId: null,
      content: {
        title: "Working post",
        message: "Draft copy",
        secret: "not-a-schema-field",
      },
      revision: 7,
      state: n === 3 ? "scheduled" : "draft",
      timezone: "UTC",
      result: { token: "secret" },
      error: "secret",
      createdByUserId: 1,
      createdAtMs: 1,
      updatedAtMs: 123,
    });
  }
}, 30000);
afterAll(async () => {
  await engine.close();
});

it("pages creative setup drafts with current revision payload and excludes other workspaces/review states", async () => {
  const first = await service.creative({ organizationId: 1 });
  expect(first.items).toHaveLength(20);
  expect(first.nextAfterId).toBe(20);
  expect(first.items[0]).toMatchObject({
    briefId: 1,
    updatedAtMs: 123,
    status: "draft",
    needsRepair: false,
  });
  expect(first.items[0].setup).toHaveProperty("theme");
  const second = await service.creative({
    organizationId: 1,
    afterId: first.nextAfterId,
  });
  expect(second.items.map(r => r.briefId)).toEqual([21, 22]);
  expect(second.nextAfterId).toBeNull();
  expect((await service.creative({ organizationId: 1, id: 23 })).items).toEqual(
    []
  );
});

it("returns typed draft content and never returns provider payloads or unknown persisted fields", async () => {
  const results = await Promise.all([
    service.video({ organizationId: 1 }),
    service.google({ organizationId: 1 }),
    service.publication({ organizationId: 1 }),
  ]);
  for (const result of results) {
    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toMatchObject({
      id: id(1),
      revision: 7,
      updatedAtMs: 123,
      needsRepair: false,
    });
    expect(JSON.stringify(result)).not.toContain("secret");
    expect(JSON.stringify(result)).not.toContain("not-a-schema-field");
    expect(JSON.stringify(result)).not.toContain("providerStatusUrl");
  }
  expect(results[0].items[0]).toHaveProperty("setup");
  expect(results[1].items[0]).toHaveProperty("change");
  expect(results[1].items[0]).toHaveProperty("connectionId", id(1));
  expect(results[2].items[0]).toHaveProperty("content");
  expect(
    (await service.google({ organizationId: 1, id: id(2) })).items
  ).toEqual([]);
});

it("exposes only local connected account identifiers and labels", async () => {
  expect(await service.accounts({ organizationId: 1 })).toEqual({
    items: [
      {
        id: id(1),
        name: "Account 1",
        channel: "google_ads",
        status: "connected",
      },
    ],
    nextAfterId: null,
  });
  expect(
    (await service.accounts({ organizationId: 1, channel: "facebook" })).items
  ).toEqual([]);
});

it("checks current role, membership and connection on all read families", async () => {
  await expect(service.creative({ organizationId: 2 })).rejects.toMatchObject({
    code: "FORBIDDEN",
  });
  const denied = mcpDraftRead(1, async () => {
    throw new Error("Connection revoked");
  });
  for (const method of [
    denied.creative,
    denied.video,
    denied.google,
    denied.publication,
    denied.accounts,
  ])
    await expect(method({ organizationId: 1 })).rejects.toThrow(
      "Connection revoked"
    );
  for (const changes of [
    { status: "suspended" },
    { status: "active", role: "reviewer" },
  ]) {
    await state.db
      .update(organizationMemberships)
      .set(changes)
      .where(eq(organizationMemberships.userId, 1));
    try {
      guard.mockClear();
      await expect(service.video({ organizationId: 1 })).rejects.toMatchObject({
        code: "FORBIDDEN",
      });
      expect(guard).not.toHaveBeenCalled();
    } finally {
      await state.db
        .update(organizationMemberships)
        .set({ status: "active", role: "owner" })
        .where(eq(organizationMemberships.userId, 1));
    }
  }
});

it("rejects unbounded or ambiguous cursor requests and performs no network calls", async () => {
  for (const value of [
    { organizationId: 1, limit: 21 },
    { organizationId: 1, afterId: -1 },
    { organizationId: 1, id: 1, afterId: 1 },
    { organizationId: 1, table: "users" },
  ])
    await expect(service.creative(value)).rejects.toThrow();
  await expect(
    service.video({ organizationId: 1, afterId: "bad-uuid" })
  ).rejects.toThrow();
  await expect(
    service.accounts({ organizationId: 1, channel: "arbitrary" })
  ).rejects.toThrow();
  const fetch = vi
    .spyOn(globalThis, "fetch")
    .mockRejectedValue(new Error("No network"));
  try {
    guard.mockClear();
    for (const method of [
      service.creative,
      service.video,
      service.google,
      service.publication,
      service.accounts,
    ])
      await method({ organizationId: 1 });
    expect(guard).toHaveBeenCalledTimes(5);
    expect(fetch).not.toHaveBeenCalled();
  } finally {
    fetch.mockRestore();
  }
});

it("flags malformed legacy content without returning arbitrary persisted fields", async () => {
  await state.db
    .update(videoJobs)
    .set({ setup: { secret: "private legacy payload" } })
    .where(eq(videoJobs.id, id(1)));
  try {
    const result = await service.video({ organizationId: 1, id: id(1) });
    expect(result.items[0]).toMatchObject({
      setup: null,
      needsRepair: true,
      revision: 7,
    });
    expect(JSON.stringify(result)).not.toContain("private legacy payload");
  } finally {
    await state.db
      .update(videoJobs)
      .set({ setup: defaultVideoSetup })
      .where(eq(videoJobs.id, id(1)));
  }
});

it("paginates UUID drafts in stable order within the same twenty-row limit", async () => {
  await state.db
    .insert(videoJobs)
    .values(
      Array.from({ length: 21 }, (_, i) => ({
        id: id(100 + i),
        organizationId: 1,
        actorUserId: 1,
        setup: defaultVideoSetup,
        status: "draft",
        createdAtMs: 1,
        updatedAtMs: 123,
      }))
    );
  const first = await service.video({ organizationId: 1 });
  const next = await service.video({
    organizationId: 1,
    afterId: first.nextAfterId,
  });
  expect(first.items).toHaveLength(20);
  expect(next.items).toHaveLength(2);
  expect(next.nextAfterId).toBeNull();
  expect(new Set([...first.items, ...next.items].map(row => row.id)).size).toBe(
    22
  );
});
