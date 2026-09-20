import { randomUUID } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { and, eq } from "drizzle-orm";
import sharp from "sharp";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
const state = vi.hoisted(() => ({
  db: null as any,
  image: "",
  graph: vi.fn(),
}));
vi.mock("./db", () => ({
  getDb: async () => state.db,
  closeDb: async () => {},
}));
vi.mock("./lib/channelGraph", async original => ({
  ...(await original<typeof import("./lib/channelGraph")>()),
  graphRequest: (...args: any[]) => state.graph(...args),
  graphPost: (path: string, token: string, fields: Record<string, string>) =>
    state.graph(path, token, {}, new URLSearchParams(fields)),
}));
vi.mock("./storage", async original => ({
  ...(await original<typeof import("./storage")>()),
  storageGetBase64: async () => state.image,
}));
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";
import {
  activityEvents,
  brandAssets,
  brandKits,
  organizationMemberships,
  organizations,
  users,
} from "../drizzle/schema";
import { channelConnections, publications } from "../drizzle/channelSchema";
import { contentSchema } from "../shared/channels";
import { encryptToken } from "./lib/secureToken";
import { executePublication, publicationTick } from "./lib/publications";
import { verifyActivityChain } from "./lib/activity";
let engine: PGlite,
  org = 0,
  otherOrg = 0,
  ownerId = 0,
  pubId = 0,
  assetId = 0,
  pageId = randomUUID(),
  adsId = randomUUID(),
  foreignId = randomUUID();
let owner: ReturnType<typeof appRouter.createCaller>,
  creator: typeof owner,
  publisher: typeof owner,
  reviewer: typeof owner,
  outsider: typeof owner;
beforeAll(async () => {
  vi.stubEnv(
    "INTEGRATION_TOKEN_ENCRYPTION_SECRET",
    "isolated-channel-test-secret-not-a-real-credential"
  );
  engine = new PGlite();
  for (const file of readdirSync("drizzle/postgres")
    .filter(f => f.endsWith(".sql"))
    .sort())
    await engine.exec(readFileSync("drizzle/postgres/" + file, "utf8"));
  state.db = drizzle(engine);
  const db = state.db,
    now = Date.now();
  const people = await db
    .insert(users)
    .values(
      ["owner", "creator", "publisher", "reviewer", "outsider"].map(name => ({
        openId: "channel-test-" + name,
        name,
        email: name + "@example.test",
      }))
    )
    .returning();
  ownerId = people[0].id;
  pubId = people[2].id;
  [owner, creator, publisher, reviewer, outsider] = people.map((user: any) =>
    appRouter.createCaller({ user, req: {}, res: {} } as TrpcContext)
  );
  const orgs = await db
    .insert(organizations)
    .values(
      ["main", "other"].map(name => ({
        name,
        slug: "channel-test-" + name,
        createdByUserId: ownerId,
        createdAtMs: now,
      }))
    )
    .returning();
  org = orgs[0].id;
  otherOrg = orgs[1].id;
  await db
    .insert(organizationMemberships)
    .values(
      people.map((person: any, i: number) => ({
        userId: person.id,
        organizationId: i === 4 ? otherOrg : org,
        role: i === 4 ? "owner" : person.name,
        status: "active",
        createdAtMs: now,
      }))
    );
  const [kit] = await db
    .insert(brandKits)
    .values({
      organizationId: org,
      name: "Test brand",
      colors: [],
      fonts: [],
      status: "active",
      updatedByUserId: ownerId,
      updatedAtMs: now,
    })
    .returning();
  const [asset] = await db
    .insert(brandAssets)
    .values({
      organizationId: org,
      brandKitId: kit.id,
      name: "Approved image",
      type: "other",
      storageKey: "org-" + org + "/image.png",
      url: "/media/image.png",
      mimeType: "image/png",
      status: "approved",
      metadata: { library: { purpose: "finished" } },
      uploadedByUserId: ownerId,
      createdAtMs: now,
    })
    .returning();
  assetId = asset.id;
  await db.insert(channelConnections).values([
    {
      id: pageId,
      organizationId: org,
      channel: "facebook",
      accountId: "123",
      name: "Test Page",
      status: "connected",
      credentials: encryptToken("fake-page-token"),
      details: {
        permissions: [],
        tasks: [],
        capabilities: ["read", "publish", "insights"],
        warnings: [],
      },
      connectedByUserId: ownerId,
      verifiedAtMs: now,
      updatedAtMs: now,
    },
    {
      id: adsId,
      organizationId: org,
      channel: "meta_ads",
      accountId: "456",
      name: "Test ads",
      status: "connected",
      credentials: encryptToken("fake-ad-token"),
      details: {
        permissions: [],
        tasks: [],
        capabilities: ["read", "publish", "insights"],
        warnings: [],
        pageId: "123",
        currency: "USD",
      },
      connectedByUserId: ownerId,
      verifiedAtMs: now,
      updatedAtMs: now,
    },
    {
      id: foreignId,
      organizationId: otherOrg,
      channel: "facebook",
      accountId: "999",
      name: "Foreign Page",
      status: "connected",
      credentials: encryptToken("fake-foreign-token"),
      details: {
        permissions: [],
        tasks: [],
        capabilities: ["read", "publish"],
        warnings: [],
      },
      connectedByUserId: people[4].id,
      verifiedAtMs: now,
      updatedAtMs: now,
    },
  ]);
  state.image = (
    await sharp({
      create: { width: 8, height: 8, channels: 4, background: "white" },
    })
      .png()
      .toBuffer()
  ).toString("base64");
}, 30000);
afterAll(async () => {
  await engine?.close();
  vi.unstubAllEnvs();
});
beforeEach(async () => {
  vi.stubEnv("LIVE_SOCIAL_ACTIONS_ENABLED", "false");
  vi.stubEnv("LIVE_AD_ACTIONS_ENABLED", "false");
  await state.db.delete(publications);
  state.graph.mockReset();
  state.graph.mockResolvedValue({ id: "123_789" });
  await state.db
    .update(brandAssets)
    .set({ name: "Approved image", status: "approved" })
    .where(eq(brandAssets.id, assetId));
  await state.db
    .update(channelConnections)
    .set({
      status: "connected",
      credentials: encryptToken("fake-page-token"),
      version: 1,
    })
    .where(eq(channelConnections.id, pageId));
  await state.db
    .update(organizationMemberships)
    .set({ status: "active" })
    .where(eq(organizationMemberships.userId, pubId));
});
const input = (extra: Record<string, any> = {}) => ({
  organizationId: org,
  id: randomUUID(),
  revision: 0,
  channel: "facebook" as const,
  connectionId: pageId,
  assetKey: null,
  content: contentSchema.parse({
    title: "Weekly post",
    message: "A reviewed caption",
  }),
  scheduledAtMs: null,
  timezone: "UTC",
  ...extra,
});
const current = async (id: string) =>
  (await owner.publishing.list({ organizationId: org })).items.find(
    p => p.id === id
  )!;
const version = (p: { id: string; revision: number }) => ({
  organizationId: org,
  id: p.id,
  revision: p.revision,
});
async function approved(extra: Record<string, any> = {}, approver = owner) {
  const item = await creator.publishing.save(input(extra));
  await approver.publishing.review({ ...version(item), decision: "approved" });
  return current(item.id);
}
async function queued(extra: Record<string, any> = {}, approver = owner) {
  const item = await approved(extra, approver);
  await approver.publishing.queue({ ...version(item), confirm: true });
  return current(item.id);
}
describe.sequential(
  "shared publication workflow with real isolated PostgreSQL",
  () => {
    it("adds private RLS-protected tables without exposing credentials", async () => {
      const result = await engine.query<{
        relname: string;
        relrowsecurity: boolean;
      }>(
        "select relname, relrowsecurity from pg_class where relnamespace='app_private'::regnamespace and relname in ('publications','channel_plans','channel_connections','channel_oauth_sessions')"
      );
      expect(result.rows).toHaveLength(4);
      expect(result.rows.every(r => r.relrowsecurity)).toBe(true);
      await engine.exec(
        "CREATE ROLE frame_untrusted; GRANT USAGE ON SCHEMA app_private TO frame_untrusted; GRANT SELECT ON app_private.channel_connections TO frame_untrusted; SET ROLE frame_untrusted"
      );
      try {
        expect(
          (await engine.query("select * from app_private.channel_connections"))
            .rows
        ).toHaveLength(0);
      } finally {
        await engine.exec("RESET ROLE");
      }
      const c = await owner.channels.connections({ organizationId: org });
      expect(JSON.stringify(c)).not.toContain("fake-page-token");
      expect(c.items[0]).not.toHaveProperty("credentials");
    });
    it("persists drafts without provider calls and rejects outsider access", async () => {
      const p = await creator.publishing.save(input());
      expect(p.state).toBe("draft");
      expect(state.graph).not.toHaveBeenCalled();
      await expect(
        outsider.publishing.list({ organizationId: org })
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
      await expect(
        creator.publishing.save(input({ connectionId: foreignId }))
      ).rejects.toMatchObject({ code: "NOT_FOUND" });
    });
    it("denies creator approval, queueing, and connection management on the server", async () => {
      const p = await creator.publishing.save(input());
      await expect(
        creator.publishing.review({ ...version(p), decision: "approved" })
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
      await expect(
        creator.publishing.queue({ ...version(p), confirm: true })
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
      await expect(
        creator.channels.disconnect({
          organizationId: org,
          id: pageId,
          confirm: true,
        })
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
      await expect(
        reviewer.publishing.review({ ...version(p), decision: "approved" })
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
    });
    it("requires approved finished assets and rejects a foreign asset", async () => {
      await state.db
        .update(brandAssets)
        .set({ status: "pending" })
        .where(eq(brandAssets.id, assetId));
      await expect(
        creator.publishing.save(input({ assetKey: `asset:${assetId}` }))
      ).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
      await expect(
        creator.publishing.save(input({ assetKey: "asset:999999" }))
      ).rejects.toMatchObject({ code: "NOT_FOUND" });
    });
    it("uses one submitted record and rejects stale updates", async () => {
      const p = await creator.publishing.save(input());
      await creator.publishing.submit(version(p));
      expect((await current(p.id)).state).toBe("needs_review");
      await expect(
        owner.publishing.review({ ...version(p), decision: "approved" })
      ).rejects.toMatchObject({ code: "CONFLICT" });
      await owner.publishing.review({
        ...version(await current(p.id)),
        decision: "approved",
      });
      expect(
        (await owner.publishing.list({ organizationId: org })).items
      ).toHaveLength(1);
    });
    it("keeps test schedules unsent even after the environment becomes live", async () => {
      const p = await queued();
      expect(p.result?.deliveryMode).toBe("test");
      vi.stubEnv("LIVE_SOCIAL_ACTIONS_ENABLED", "true");
      await publicationTick(state.db);
      expect(state.graph).not.toHaveBeenCalled();
      expect((await current(p.id)).state).toBe("scheduled");
    });
    it("publishes an explicitly live queued text post exactly once", async () => {
      vi.stubEnv("LIVE_SOCIAL_ACTIONS_ENABLED", "true");
      const p = await queued();
      await executePublication(state.db, org, p.id);
      await executePublication(state.db, org, p.id);
      expect(state.graph).toHaveBeenCalledTimes(1);
      expect((await current(p.id)).externalId).toBe("123_789");
      expect((await current(p.id)).state).toBe("published");
    });
    it("does not deliver future posts early", async () => {
      vi.stubEnv("LIVE_SOCIAL_ACTIONS_ENABLED", "true");
      const p = await queued({ scheduledAtMs: Date.now() + 7 * 86400000 });
      await publicationTick(state.db);
      expect(state.graph).not.toHaveBeenCalled();
      expect((await current(p.id)).state).toBe("scheduled");
    });
    it("clears approval and queueing when content or timing is edited", async () => {
      const p = await queued();
      const edited = await creator.publishing.save({
        ...input(),
        id: p.id,
        revision: p.revision,
        content: contentSchema.parse({
          title: "Updated",
          message: "New caption",
        }),
      });
      expect(edited.state).toBe("draft");
      expect(edited.approvalHash).toBeNull();
      await expect(
        owner.publishing.queue({ ...version(edited), confirm: true })
      ).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
    });
    it("rejects queueing past times and invalidates excessively late jobs", async () => {
      const draft = await creator.publishing.save(
        input({ scheduledAtMs: Date.now() - 10000 })
      );
      await expect(
        owner.publishing.review({ ...version(draft), decision: "approved" })
      ).rejects.toMatchObject({ code: "BAD_REQUEST" });
      vi.stubEnv("LIVE_SOCIAL_ACTIONS_ENABLED", "true");
      const p = await queued();
      await state.db
        .update(publications)
        .set({ scheduledAtMs: Date.now() - 7200000 })
        .where(eq(publications.id, p.id));
      await publicationTick(state.db);
      expect((await current(p.id)).state).toBe("changes_requested");
      expect(state.graph).not.toHaveBeenCalled();
    });
    it("rechecks asset approval and publisher membership at dispatch", async () => {
      vi.stubEnv("LIVE_SOCIAL_ACTIONS_ENABLED", "true");
      const p = await queued({ assetKey: `asset:${assetId}` });
      await state.db
        .update(brandAssets)
        .set({ status: "rejected" })
        .where(eq(brandAssets.id, assetId));
      await publicationTick(state.db);
      expect((await current(p.id)).state).toBe("changes_requested");
      expect(state.graph).not.toHaveBeenCalled();
      const second = await queued({}, publisher);
      await state.db
        .update(organizationMemberships)
        .set({ status: "suspended" })
        .where(eq(organizationMemberships.userId, pubId));
      await publicationTick(state.db);
      expect((await current(second.id)).state).toBe("changes_requested");
      expect(state.graph).not.toHaveBeenCalled();
    });
    it("blocks automatic retries after uncertain delivery and permits verified reconciliation", async () => {
      vi.stubEnv("LIVE_SOCIAL_ACTIONS_ENABLED", "true");
      const p = await queued();
      state.graph.mockRejectedValueOnce(
        new Error("network failure after write")
      );
      await publicationTick(state.db);
      const result = await current(p.id);
      expect(result.state).toBe("delivery_unknown");
      await publicationTick(state.db);
      expect(state.graph).toHaveBeenCalledTimes(1);
      await expect(
        owner.publishing.retry({ ...version(result), confirm: true })
      ).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
      state.graph.mockResolvedValue({ id: "123_789", from: { id: "123" } });
      await owner.publishing.reconcile({
        ...version(result),
        externalId: "123_789",
        confirm: true,
      });
      expect((await current(p.id)).state).toBe("published");
    });
    it("recovers interrupted claims as unknown without replaying a write", async () => {
      const p = await approved();
      await state.db
        .update(publications)
        .set({
          state: "publishing",
          claimId: randomUUID(),
          leaseUntilMs: Date.now() - 1000,
        })
        .where(eq(publications.id, p.id));
      await publicationTick(state.db);
      expect((await current(p.id)).state).toBe("delivery_unknown");
      expect(state.graph).not.toHaveBeenCalled();
    });
    it("creates Meta ads paused and rejects foreign ad sets", async () => {
      vi.stubEnv("LIVE_AD_ACTIONS_ENABLED", "true");
      const extra = {
        channel: "meta_ads",
        connectionId: adsId,
        assetKey: `asset:${assetId}`,
        content: contentSchema.parse({
          title: "Ad",
          message: "Primary",
          headline: "Headline",
          link: "https://example.test",
          adSetId: "777",
        }),
      };
      state.graph.mockImplementation(
        async (
          path: string,
          _token: string,
          _params: any,
          body: URLSearchParams
        ) =>
          path === "777"
            ? { id: "777", account_id: "456" }
            : path.endsWith("/adimages")
              ? { images: { image: { hash: "image-hash" } } }
              : path.endsWith("/adcreatives")
                ? { id: "888" }
                : { id: "999" }
      );
      const p = await queued(extra);
      await publicationTick(state.db);
      expect((await current(p.id)).state).toBe("published");
      const final = state.graph.mock.calls.find(c => c[0] === "act_456/ads");
      expect(final?.[3].get("status")).toBe("PAUSED");
      state.graph.mockReset().mockResolvedValue({ account_id: "other" });
      const bad = await queued(extra);
      await publicationTick(state.db);
      expect((await current(bad.id)).state).toBe("failed");
      expect(state.graph).toHaveBeenCalledTimes(1);
    });
    it("disconnect cancels queued authorization without deleting remote posts", async () => {
      const p = await queued();
      await owner.channels.disconnect({
        organizationId: org,
        id: pageId,
        confirm: true,
      });
      expect((await current(p.id)).state).toBe("changes_requested");
      expect(state.graph).not.toHaveBeenCalled();
      const c = (
        await owner.channels.connections({ organizationId: org })
      ).items.find(c => c.id === pageId);
      expect(c?.status).toBe("disconnected");
    });
    it("persists a two-post default and future planning without sending content", async () => {
      const p = await owner.channels.plan({
        organizationId: org,
        channel: "facebook",
        timezone: "America/New_York",
      });
      expect(p.postsPerWeek).toBe(2);
      await owner.channels.savePlan({
        organizationId: org,
        channel: "facebook",
        timezone: "America/New_York",
        postsPerWeek: 3,
        slots: [{ day: 1, time: "10:00" }],
      });
      expect(
        (
          await owner.channels.plan({
            organizationId: org,
            channel: "facebook",
            timezone: "UTC",
          })
        ).postsPerWeek
      ).toBe(3);
      expect(state.graph).not.toHaveBeenCalled();
    });
    it("retains an intact audit chain across all workflow changes", async () => {
      expect(
        verifyActivityChain(
          await state.db
            .select()
            .from(activityEvents)
            .where(eq(activityEvents.organizationId, org))
        )
      ).toBe(true);
    });
  }
);
