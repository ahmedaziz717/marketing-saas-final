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
  images: {} as Record<string, string>,
  graph: vi.fn(),
  llm: vi.fn(),
}));
vi.mock("./_core/llm", () => ({
  listLLMModels: async () => ({ data: [{ id: "gpt-5.4" }] }),
  invokeLLM: (...args: any[]) => state.llm(...args),
}));
vi.mock("./lib/models", async original => ({
  ...(await original<typeof import("./lib/models")>()),
  requireLatestGptTextModel: () => "gpt-5.4",
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
  storageGetBase64: async (key: string) => state.images[key] ?? state.image,
}));
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";
import {
  campaignBriefs,
  activityEvents,
  brandAssets,
  brandKits,
  organizationMemberships,
  organizations,
  users,
} from "../drizzle/schema";
import { channelConnections, publications } from "../drizzle/channelSchema";
import { defaultCreativeSetup } from "../shared/creativeBuilder";
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
  await db.insert(organizationMemberships).values(
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
      metadata: { width: 1080, height: 1080, library: { purpose: "finished" } },
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
      create: { width: 1080, height: 1080, channels: 4, background: "white" },
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
  state.images = {};
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
    it("moves a photo post's website link into its caption before saving and approval", async () => {
      const p = await creator.publishing.save(
        input({
          assetKey: `asset:${assetId}`,
          content: contentSchema.parse({
            title: "Photo and link",
            message: "Explore our collection.",
            link: "https://example.com/shop",
          }),
        })
      );
      expect(p.content.message).toBe(
        "Explore our collection.\n\nhttps://example.com/shop"
      );
      expect(p.content.link).toBe("");
      await owner.publishing.review({ ...version(p), decision: "approved" });
      const reviewed = await current(p.id);
      expect(reviewed.state).toBe("approved");
      expect(reviewed.content).toEqual(p.content);
      expect(state.graph).not.toHaveBeenCalled();
    });
    it("does not duplicate a caption link or drop text to make an oversized caption fit", async () => {
      const p = await creator.publishing.save(
        input({
          assetKey: `asset:${assetId}`,
          content: contentSchema.parse({
            title: "Existing link",
            message: "Explore https://example.com/shop",
            link: "https://example.com/shop",
          }),
        })
      );
      expect(p.content.message).toBe("Explore https://example.com/shop");
      expect(p.content.link).toBe("");
      await expect(
        creator.publishing.save(
          input({
            assetKey: `asset:${assetId}`,
            content: contentSchema.parse({
              title: "Long caption",
              message: "x".repeat(5000),
              link: "https://example.com/shop",
            }),
          })
        )
      ).rejects.toMatchObject({ code: "BAD_REQUEST" });
      expect(
        (await owner.publishing.list({ organizationId: org })).items
      ).toHaveLength(1);
      expect(state.graph).not.toHaveBeenCalled();
    });
    it("keeps one content record from a standalone Studio draft through delivery configuration", async () => {
      const { briefId } = await creator.briefs.create({
        organizationId: org,
        name: "Autumn launch",
        audience: "Directory members",
        creativeDirection: "Increase qualified subscriptions",
      });
      const draft = await creator.publishing.save(
        input({
          connectionId: null,
          content: contentSchema.parse({
            title: "Directory story",
            message: "Find your next class.",
            campaignPlanId: briefId,
          }),
        })
      );
      expect(draft.connectionId).toBeNull();
      expect(draft.state).toBe("draft");
      const reopened = await owner.publishing.get({
        organizationId: org,
        id: draft.id,
      });
      const configured = await creator.publishing.save(
        input({
          id: reopened.id,
          revision: reopened.revision,
          connectionId: pageId,
          content: reopened.content,
        })
      );
      expect(configured.id).toBe(draft.id);
      expect(configured.content.campaignPlanId).toBe(briefId);
      expect(configured.state).toBe("draft");
      expect(configured.approvedAtMs).toBeNull();
      expect(
        (await owner.publishing.list({ organizationId: org })).items
      ).toHaveLength(1);
      expect(state.graph).not.toHaveBeenCalled();
      await expect(
        creator.publishing.save(
          input({
            id: draft.id,
            revision: draft.revision,
            content: draft.content,
          })
        )
      ).rejects.toMatchObject({ code: "CONFLICT" });
      await expect(
        outsider.publishing.get({ organizationId: otherOrg, id: draft.id })
      ).rejects.toMatchObject({ code: "NOT_FOUND" });
    });
    it("excludes saved image setups from plans and rejects foreign plan associations", async () => {
      const { briefId } = await outsider.briefs.create({
        organizationId: otherOrg,
        name: "Foreign plan",
      });
      await expect(
        creator.publishing.save(
          input({
            content: contentSchema.parse({
              title: "Wrong workspace",
              campaignPlanId: briefId,
            }),
          })
        )
      ).rejects.toMatchObject({ code: "BAD_REQUEST" });
      await expect(
        creator.creativeBuilder.save({
          organizationId: org,
          setup: { ...defaultCreativeSetup(), campaignPlanId: briefId },
        })
      ).rejects.toMatchObject({ code: "BAD_REQUEST" });
      const [setup] = await state.db
        .insert(campaignBriefs)
        .values({
          organizationId: org,
          name: "Image setup",
          audience: "",
          offer: "",
          placements: [],
          formats: [],
          creativeDirection: "",
          assetIds: [],
          creativeSetup: { version: 1 },
          createdByUserId: ownerId,
          createdAtMs: Date.now(),
          updatedAtMs: Date.now(),
        })
        .returning();
      expect(
        (await creator.briefs.list({ organizationId: org })).some(
          p => p.id === setup.id
        )
      ).toBe(false);
      await expect(
        creator.publishing.save(
          input({
            content: contentSchema.parse({
              title: "Wrong type",
              campaignPlanId: setup.id,
            }),
          })
        )
      ).rejects.toMatchObject({ code: "BAD_REQUEST" });
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
    it("approves and schedules a future social post in one transaction, with both audit events and no early send", async () => {
      vi.stubEnv("LIVE_SOCIAL_ACTIONS_ENABLED", "true");
      const draft = await creator.publishing.save(
        input({ scheduledAtMs: Date.now() + 86400000 })
      );
      await creator.publishing.submit(version(draft));
      const pending = await current(draft.id);
      const request = {
        ...version(pending),
        decision: "approved" as const,
        delivery: { confirm: true as const, mode: "live" as const },
      };
      await expect(publisher.publishing.review(request)).resolves.toMatchObject(
        { success: true, liveEnabled: true }
      );
      const scheduled = await current(draft.id);
      expect(scheduled).toMatchObject({
        state: "scheduled",
        revision: pending.revision + 1,
        approvedByUserId: pubId,
        scheduledAtMs: draft.scheduledAtMs,
        result: { deliveryMode: "live" },
      });
      expect(scheduled.approvalHash).toBeTruthy();
      const events = await owner.publishing.history({
        organizationId: org,
        id: draft.id,
      });
      expect(
        events.filter(e => e.action === "publication.approved")
      ).toHaveLength(1);
      expect(
        events.filter(e => e.action === "publication.queued")
      ).toHaveLength(1);
      await expect(publisher.publishing.review(request)).rejects.toMatchObject({
        code: "CONFLICT",
      });
      await publicationTick(state.db);
      expect(state.graph).not.toHaveBeenCalled();
    });
    it("requires an explicit combined confirmation, then publishes an immediate post only once", async () => {
      vi.stubEnv("LIVE_SOCIAL_ACTIONS_ENABLED", "true");
      const draft = await creator.publishing.save(input());
      await expect(
        owner.publishing.review({
          ...version(draft),
          decision: "approved",
          delivery: { mode: "live" } as any,
        })
      ).rejects.toMatchObject({ code: "BAD_REQUEST" });
      expect((await current(draft.id)).state).toBe("draft");
      await owner.publishing.review({
        ...version(draft),
        decision: "approved",
        delivery: { confirm: true, mode: "live" },
      });
      expect(state.graph).not.toHaveBeenCalled();
      await executePublication(state.db, org, draft.id);
      await executePublication(state.db, org, draft.id);
      expect(state.graph).toHaveBeenCalledTimes(1);
      expect((await current(draft.id)).state).toBe("published");
    });
    it("keeps combined test approvals unsent and rejects changed delivery availability", async () => {
      const draft = await creator.publishing.save(input());
      await expect(
        owner.publishing.review({
          ...version(draft),
          decision: "approved",
          delivery: { confirm: true, mode: "live" },
        })
      ).rejects.toThrow("availability changed");
      expect((await current(draft.id)).approvalHash).toBeNull();
      await owner.publishing.review({
        ...version(draft),
        decision: "approved",
        delivery: { confirm: true, mode: "test" },
      });
      expect((await current(draft.id)).result?.deliveryMode).toBe("test");
      vi.stubEnv("LIVE_SOCIAL_ACTIONS_ENABLED", "true");
      await publicationTick(state.db);
      expect(state.graph).not.toHaveBeenCalled();
      const scheduled = await current(draft.id);
      await expect(
        owner.publishing.queue({
          ...version(scheduled),
          confirm: true,
          mode: "test",
        })
      ).rejects.toThrow("availability changed");
      expect((await current(draft.id)).result?.deliveryMode).toBe("test");
    });
    it("preserves permissions and leaves drafts unchanged when combined approval fails validation", async () => {
      const draft = await creator.publishing.save(input());
      const request = {
        ...version(draft),
        decision: "approved" as const,
        delivery: { confirm: true as const, mode: "test" as const },
      };
      await expect(creator.publishing.review(request)).rejects.toMatchObject({
        code: "FORBIDDEN",
      });
      await expect(reviewer.publishing.review(request)).rejects.toMatchObject({
        code: "FORBIDDEN",
      });
      await expect(outsider.publishing.review(request)).rejects.toMatchObject({
        code: "FORBIDDEN",
      });
      await expect(
        owner.publishing.review({
          ...request,
          decision: "rejected",
          note: "Changes needed",
        })
      ).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
      expect((await current(draft.id)).state).toBe("draft");
      const expired = await creator.publishing.save(
        input({ scheduledAtMs: Date.now() - 10000 })
      );
      await expect(
        owner.publishing.review({ ...request, ...version(expired) })
      ).rejects.toThrow("expired");
      expect(await current(expired.id)).toMatchObject({
        state: "draft",
        approvalHash: null,
        result: null,
      });
      const photo = await creator.publishing.save(
        input({ assetKey: `asset:${assetId}` })
      );
      await state.db
        .update(brandAssets)
        .set({ status: "rejected" })
        .where(eq(brandAssets.id, assetId));
      await expect(
        owner.publishing.review({ ...request, ...version(photo) })
      ).rejects.toThrow("approved finished");
      expect(await current(photo.id)).toMatchObject({
        state: "draft",
        approvalHash: null,
        result: null,
      });
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
    it("persists editable business profiles with workspace and role isolation", async () => {
      const profile = {
        model: "directory" as const,
        summary: "An education resource directory",
        audiences: "Parents; education providers",
        goals: "Listing claims and subscriptions",
        website: "https://example.test",
        primaryOffer: "Provider listing plans",
        timezone: "America/New_York",
        currency: "USD",
      };
      await expect(
        creator.brand.saveProfile({ organizationId: org, profile })
      ).rejects.toThrow();
      await expect(
        outsider.brand.saveProfile({ organizationId: org, profile })
      ).rejects.toThrow();
      await owner.brand.saveProfile({ organizationId: org, profile });
      expect(
        (await owner.brand.get({ organizationId: org }))?.businessProfile
      ).toEqual(profile);
      await owner.brand.saveProfile({
        organizationId: org,
        profile: { ...profile, goals: "Trial starts" },
      });
      expect(
        (await owner.brand.get({ organizationId: org }))?.businessProfile?.goals
      ).toBe("Trial starts");
    });
    it("drafts copy from scoped approved image bytes and rejects unapproved assets", async () => {
      const copyOptions = Array.from({ length: 5 }, (_, i) => ({
        message: `Explore our resource directory ${i + 1}`,
        headline: `Find resources ${i + 1}`,
        description: `Discover learning options ${i + 1}`,
      }));
      const reply = (options: unknown[]) => ({
        choices: [{ message: { content: JSON.stringify({ options }) } }],
      });
      state.llm.mockResolvedValue(reply(copyOptions));
      const result = await creator.channels.draftAssetCopy({
        organizationId: org,
        assetKeys: [`asset:${assetId}`],
      });
      expect(result.options).toHaveLength(5);
      expect(result.options[0].headline).toBe("Find resources 1");
      state.llm.mockResolvedValue(reply(copyOptions.slice(0, 3)));
      await creator.channels.draftAssetCopy({
        organizationId: org,
        channel: "facebook",
        assetKeys: [`asset:${assetId}`],
      });
      expect(
        JSON.stringify(state.llm.mock.calls.at(-1)?.[0].messages[0])
      ).toContain("organic Facebook post captions");
      const prompt = state.llm.mock.calls.at(-1)?.[0];
      expect(prompt.messages[1].content[1].image_url.url).toMatch(
        /^data:image\/jpeg;base64,/
      );
      await expect(
        outsider.channels.draftAssetCopy({
          organizationId: org,
          assetKeys: [`asset:${assetId}`],
        })
      ).rejects.toThrow();
      await state.db
        .update(brandAssets)
        .set({ status: "pending" })
        .where(eq(brandAssets.id, assetId));
      await expect(
        creator.channels.draftAssetCopy({
          organizationId: org,
          assetKeys: [`asset:${assetId}`],
        })
      ).rejects.toThrow("approved");
    });
    it("sends multiple reviewed text options on one paused ad and binds every option to approval", async () => {
      vi.stubEnv("LIVE_AD_ACTIONS_ENABLED", "true");
      const content = contentSchema.parse({
        title: "Text options",
        message: "Primary",
        headline: "Main headline",
        description: "Description",
        link: "https://example.test",
        adSetId: "777",
        textVariants: {
          messages: ["Alternative", "Third text", "Fourth text", "Fifth text"],
          headlines: [
            "Second headline",
            "Third headline",
            "Fourth headline",
            "Fifth headline",
          ],
          descriptions: [
            "Second description",
            "Third description",
            "Fourth description",
            "Fifth description",
          ],
        },
      });
      state.graph.mockImplementation(async (path: string) =>
        path === "777"
          ? { id: "777", account_id: "456", is_dynamic_creative: false }
          : path.endsWith("/adimages")
            ? { images: { image: { hash: "hash" } } }
            : path.endsWith("/adcreatives")
              ? { id: "888" }
              : { id: "999" }
      );
      const p = await queued({
        channel: "meta_ads",
        connectionId: adsId,
        assetKey: `asset:${assetId}`,
        content,
      });
      await publicationTick(state.db);
      expect((await current(p.id)).state).toBe("published");
      const write = state.graph.mock.calls.find(
        c => c[0] === "act_456/adcreatives"
      );
      const feed = JSON.parse(write?.[3].get("asset_feed_spec"));
      expect(feed.bodies).toEqual([
        { text: "Primary" },
        { text: "Alternative" },
        { text: "Third text" },
        { text: "Fourth text" },
        { text: "Fifth text" },
      ]);
      expect(feed.titles).toHaveLength(5);
      expect(feed.descriptions).toHaveLength(5);
      expect(
        state.graph.mock.calls
          .find(c => c[0] === "act_456/ads")?.[3]
          .get("status")
      ).toBe("PAUSED");
      const pending = await approved({
        channel: "meta_ads",
        connectionId: adsId,
        assetKey: `asset:${assetId}`,
        content,
      });
      await state.db
        .update(publications)
        .set({
          content: {
            ...content,
            textVariants: {
              ...content.textVariants!,
              messages: ["Changed after approval"],
            },
          },
        })
        .where(eq(publications.id, pending.id));
      await expect(
        owner.publishing.queue({ ...version(pending), confirm: true })
      ).rejects.toThrow();
    });
    it("delivers ordered carousel images paused and invalidates approval when any card changes", async () => {
      vi.stubEnv("LIVE_AD_ACTIONS_ENABLED", "true");
      const [base] = await state.db
        .select()
        .from(brandAssets)
        .where(eq(brandAssets.id, assetId));
      const { id: ignored, ...fields } = base;
      const [second] = await state.db
        .insert(brandAssets)
        .values({
          ...fields,
          name: "Second card",
          storageKey: "org-" + org + "/second.png",
        })
        .returning();
      const extra = {
        channel: "meta_ads",
        connectionId: adsId,
        assetKey: `asset:${assetId}`,
        content: contentSchema.parse({
          title: "Carousel",
          message: "Caption",
          headline: "Shop",
          link: "https://example.test",
          adSetId: "777",
          carouselAssetKeys: [`asset:${assetId}`, `asset:${second.id}`],
        }),
      };
      let uploads = 0;
      state.graph.mockImplementation(async (path: string) =>
        path === "777"
          ? { account_id: "456" }
          : path.endsWith("/adimages")
            ? { images: { image: { hash: `card-${++uploads}` } } }
            : { id: "999" }
      );
      const p = await queued(extra);
      await publicationTick(state.db);
      expect(
        (await current(p.id)).state,
        (await current(p.id)).error ?? ""
      ).toBe("published");
      const creative = state.graph.mock.calls.find(
        c => c[0] === "act_456/adcreatives"
      );
      const link = JSON.parse(creative![3].get("object_story_spec")).link_data;
      expect(link.child_attachments.map((a: any) => a.image_hash)).toEqual([
        "card-1",
        "card-2",
      ]);
      expect(link.multi_share_optimized).toBe(false);
      expect(
        state.graph.mock.calls
          .find(c => c[0] === "act_456/ads")![3]
          .get("status")
      ).toBe("PAUSED");
      const stale = await approved(extra);
      await state.db
        .update(brandAssets)
        .set({ name: "Changed second card" })
        .where(eq(brandAssets.id, second.id));
      await expect(
        owner.publishing.queue({ ...version(stale), confirm: true })
      ).rejects.toThrow();
    });
    it("creates one placement-customized ad with three correctly sized images and checks every approval", async () => {
      vi.stubEnv("LIVE_AD_ACTIONS_ENABLED", "true");
      const [base] = await state.db
        .select()
        .from(brandAssets)
        .where(eq(brandAssets.id, assetId));
      const { id: ignored, ...fields } = base;
      const keys: Record<string, string> = { square: `asset:${assetId}` };
      for (const [slot, height] of [
        ["portrait", 1350],
        ["story", 1920],
      ] as const) {
        const storageKey = `org-${org}/${slot}.png`;
        const [asset] = await state.db
          .insert(brandAssets)
          .values({
            ...fields,
            name: slot,
            storageKey,
            metadata: { ...base.metadata, width: 1080, height },
          })
          .returning();
        keys[slot] = `asset:${asset.id}`;
        state.images[storageKey] = (
          await sharp({
            create: { width: 1080, height, channels: 4, background: "white" },
          })
            .png()
            .toBuffer()
        ).toString("base64");
      }
      const extra = {
        channel: "meta_ads",
        connectionId: adsId,
        assetKey: keys.square,
        content: contentSchema.parse({
          title: "Placement ad",
          message: "Caption",
          headline: "Shop",
          link: "https://example.test",
          adSetId: "777",
          placementAssetKeys: keys,
        }),
      };
      let uploaded = 0;
      state.graph.mockImplementation(async (path: string) =>
        path === "777"
          ? { account_id: "456", is_dynamic_creative: false }
          : path.endsWith("/adimages")
            ? { images: { image: { hash: `placement-${++uploaded}` } } }
            : { id: "999" }
      );
      const p = await queued(extra);
      await publicationTick(state.db);
      expect(
        (await current(p.id)).state,
        (await current(p.id)).error ?? ""
      ).toBe("published");
      const write = state.graph.mock.calls.find(
        c => c[0] === "act_456/adcreatives"
      )![3];
      const feed = JSON.parse(write.get("asset_feed_spec"));
      expect(feed.ad_formats).toEqual(["SINGLE_IMAGE"]);
      expect(feed.images.map((i: any) => i.hash)).toEqual([
        "placement-1",
        "placement-2",
        "placement-3",
      ]);
      expect(feed.asset_customization_rules[0]).toMatchObject({
        image_label: { name: "evokeloop_story" },
        customization_spec: { instagram_positions: ["story", "reels"] },
      });
      expect(feed.asset_customization_rules[1].image_label.name).toBe(
        "evokeloop_portrait"
      );
      expect(feed.asset_customization_rules[2].customization_spec).toEqual({});
      expect(
        JSON.parse(write.get("object_story_spec")).link_data
      ).toBeUndefined();
      expect(
        state.graph.mock.calls.filter(c => c[0] === "act_456/ads")
      ).toHaveLength(1);
      const stale = await approved(extra);
      await state.db
        .update(brandAssets)
        .set({ name: "Changed vertical image" })
        .where(eq(brandAssets.id, Number(keys.story.split(":")[1])));
      await expect(
        owner.publishing.queue({ ...version(stale), confirm: true })
      ).rejects.toThrow();
      await expect(
        approved({
          ...extra,
          content: {
            ...extra.content,
            placementAssetKeys: { ...keys, story: keys.square },
          },
        })
      ).rejects.toThrow("9:16");
    });
    it("requires a matching, unused review for Meta management writes", async () => {
      vi.stubEnv("LIVE_AD_ACTIONS_ENABLED", "true");
      const [c] = await state.db
        .select()
        .from(channelConnections)
        .where(eq(channelConnections.id, adsId));
      await state.db
        .update(channelConnections)
        .set({ details: { ...c.details, permissions: ["ads_management"] } })
        .where(eq(channelConnections.id, adsId));
      const scope = { organizationId: org, connectionId: adsId };
      const change = {
        kind: "create_campaign" as const,
        name: "Paused test campaign",
        budgetMode: "campaign" as const,
        dailyBudget: 25,
      };
      await expect(
        creator.channels.reviewMetaChange({ ...scope, change })
      ).rejects.toThrow();
      const review = await owner.channels.reviewMetaChange({
        ...scope,
        change,
      });
      await expect(
        owner.channels.applyMetaChange({
          ...scope,
          change: { ...change, dailyBudget: 50 },
          ticket: review.ticket,
        })
      ).rejects.toThrow("does not belong");
      state.graph.mockResolvedValue({ id: "888" });
      await owner.channels.applyMetaChange({
        ...scope,
        change,
        ticket: review.ticket,
      });
      expect(state.graph.mock.calls.at(-1)?.[3].get("status")).toBe("PAUSED");
      const count = state.graph.mock.calls.length;
      await expect(
        owner.channels.applyMetaChange({
          ...scope,
          change,
          ticket: review.ticket,
        })
      ).rejects.toThrow("already been submitted");
      expect(state.graph).toHaveBeenCalledTimes(count);
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
