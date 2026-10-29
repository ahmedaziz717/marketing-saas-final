import { randomUUID } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { and, eq } from "drizzle-orm";
import { beforeAll, afterAll, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({
  db: null as any,
  model: vi.fn(),
  google: vi.fn(),
  storage: vi.fn(),
}));
vi.mock("./db", () => ({ getDb: async () => state.db }));
vi.mock("./_core/llm", () => ({
  invokeLLM: state.model,
  listLLMModels: state.model,
}));
vi.mock("./lib/openaiSunburst", () => ({ generateSunburstImage: state.model }));
vi.mock("./lib/googleAdsApi", async original => ({
  ...(await original<any>()),
  googleAdsRows: state.google,
}));
vi.mock("./lib/googleAdsMutate", async original => ({
  ...(await original<any>()),
  mutateGoogleAds: state.google,
}));
vi.mock("./storage", async original => ({
  ...(await original<any>()),
  storagePut: state.storage,
  storageGetBase64: state.storage,
}));
import {
  users,
  organizations,
  organizationMemberships,
  products,
  productImages,
  brandKits,
  campaignBriefs,
  activityEvents,
} from "../drizzle/schema";
import {
  channelConnections,
  googleCampaignDrafts,
} from "../drizzle/channelSchema";
import { defaultCreativeSetup } from "../shared/creativeBuilder";
import { mcpCreativeDraft } from "./lib/mcpCreativeDraft";
import { mcpCampaignDraft } from "./lib/mcpCampaignDraft";
import { withMcpDraftReceipt } from "./lib/mcpDraftReceipt";
import { withOrganizationTransaction } from "./lib/activity";
import { stableHash } from "./lib/policy";
const engine = new PGlite();
const connectionId = randomUUID(),
  foreignConnectionId = randomUUID();
const authorize = vi.fn(async () => {});
const saveCreative = mcpCreativeDraft(1, authorize),
  saveCampaign = mcpCampaignDraft(1, authorize);
const setup = (name = "Product draft") => ({
  ...defaultCreativeSetup(),
  name,
  products: [
    { productId: 1, imageId: 1, featuredSpecKeys: [], includePrice: false },
  ],
  categoryHandling: "neutral" as const,
});
const campaign = (name = "Draft ad group") => ({
  kind: "asset_group_update" as const,
  campaignId: "123",
  assetGroupId: "456",
  name,
  finalUrl: "https://shop.example.test/product",
  status: "PAUSED" as const,
});
const creativeRequest = () => ({
  organizationId: 1,
  requestId: randomUUID(),
  setup: setup(),
});
const campaignRequest = () => ({
  organizationId: 1,
  requestId: randomUUID(),
  connectionId,
  change: campaign(),
});
beforeAll(async () => {
  state.db = drizzle(engine);
  await migrate(state.db, { migrationsFolder: "drizzle/postgres" });
  await state.db.insert(users).values([
    { id: 1, openId: "mcp-save-owner" },
    { id: 2, openId: "mcp-save-creator" },
  ]);
  await state.db.insert(organizations).values(
    [1, 2].map(id => ({
      id,
      name: `Org ${id}`,
      slug: `mcp-save-${id}`,
      createdByUserId: 1,
      createdAtMs: 1,
    }))
  );
  await state.db.insert(organizationMemberships).values(
    [1, 2].map(userId => ({
      organizationId: 1,
      userId,
      role: userId === 1 ? "owner" : "creator",
      status: "active",
      createdAtMs: 1,
    }))
  );
  await state.db.insert(brandKits).values(
    [1, 2].map(id => ({
      organizationId: id,
      name: `Brand ${id}`,
      colors: ["#123456"],
      fonts: ["Inter"],
      status: "active",
      updatedByUserId: 1,
      updatedAtMs: 1,
    }))
  );
  await state.db.insert(products).values(
    [1, 2].map(id => ({
      id,
      organizationId: id,
      name: `Product ${id}`,
      dedupeKey: `save-${id}`,
      specifications: {},
      provenance: {},
      productUrl: "https://shop.example.test/item",
      status: "approved",
      createdAtMs: 1,
      updatedAtMs: 1,
    }))
  );
  await state.db.insert(productImages).values(
    [1, 2].map(id => ({
      id,
      organizationId: id,
      productId: id,
      sourceUrl: "https://images.example.test/original.png",
      storageKey: `org-${id}/image.png`,
      url: `https://images.example.test/${id}.png`,
      isPrimary: 1,
      createdAtMs: 1,
    }))
  );
  await state.db.insert(channelConnections).values(
    [connectionId, foreignConnectionId].map((id, index) => ({
      id,
      organizationId: index + 1,
      channel: "google_ads",
      accountId: "1234567890",
      name: "Existing Google account",
      status: "connected",
      details: { currency: "USD", timezone: "UTC", capabilities: [] },
      connectedByUserId: 1,
      verifiedAtMs: 1,
      updatedAtMs: 1,
    }))
  );
}, 30000);
afterAll(async () => {
  await engine.close();
});

it("atomically deduplicates concurrent creative draft requests and binds request content", async () => {
  const input = creativeRequest();
  const [first, retry] = await Promise.all([
    saveCreative(input),
    saveCreative(input),
  ]);
  expect(retry).toEqual(first);
  const rows = await state.db
    .select()
    .from(campaignBriefs)
    .where(eq(campaignBriefs.id, first.briefId));
  expect(rows).toHaveLength(1);
  expect(rows[0]).toMatchObject({
    status: "draft",
    approvedByUserId: null,
    approvedAtMs: null,
  });
  const receipts = await state.db
    .select()
    .from(activityEvents)
    .where(
      and(
        eq(activityEvents.correlationId, input.requestId),
        eq(activityEvents.action, "mcp.draft_saved")
      )
    );
  expect(receipts).toHaveLength(1);
  expect(receipts[0].payload.result).toEqual(first);
  await expect(
    saveCreative({ ...input, setup: setup("Changed input") })
  ).rejects.toMatchObject({ code: "CONFLICT" });
});

it("preserves CAS and returns the original receipt after an uncertain response", async () => {
  const created = await saveCreative(creativeRequest());
  const input = {
    ...creativeRequest(),
    briefId: created.briefId,
    expectedUpdatedAtMs: created.updatedAtMs,
    setup: setup("Saved update"),
  };
  const updated = await saveCreative(input);
  await state.db
    .update(campaignBriefs)
    .set({ name: "Later user edit", updatedAtMs: updated.updatedAtMs + 1 })
    .where(eq(campaignBriefs.id, created.briefId));
  expect(await saveCreative(input)).toEqual(updated);
  await expect(
    saveCreative({ ...input, requestId: randomUUID() })
  ).rejects.toMatchObject({ code: "CONFLICT" });
  expect(
    (
      await state.db
        .select()
        .from(campaignBriefs)
        .where(eq(campaignBriefs.id, created.briefId))
    )[0].name
  ).toBe("Later user edit");
});

it("rejects cross-tenant source images and draft references without creating receipts", async () => {
  const input = {
    ...creativeRequest(),
    setup: {
      ...setup(),
      products: [
        { productId: 2, imageId: 2, featuredSpecKeys: [], includePrice: false },
      ],
    },
  };
  await expect(saveCreative(input)).rejects.toThrow();
  await expect(
    saveCampaign({ ...campaignRequest(), connectionId: foreignConnectionId })
  ).rejects.toThrow();
  expect(
    await state.db
      .select()
      .from(activityEvents)
      .where(eq(activityEvents.correlationId, input.requestId))
  ).toHaveLength(0);
});

it("deduplicates campaign create/update requests with bounded public receipts and retains draft state", async () => {
  const input = campaignRequest();
  const [first, retry] = await Promise.all([
    saveCampaign(input),
    saveCampaign(input),
  ]);
  expect(retry).toEqual(first);
  expect(Object.keys(first).sort()).toEqual([
    "id",
    "revision",
    "state",
    "updatedAtMs",
  ]);
  expect(first.state).toBe("draft");
  const update = {
    ...input,
    requestId: randomUUID(),
    id: first.id,
    revision: first.revision,
    change: campaign("New draft title"),
  };
  const saved = await saveCampaign(update);
  expect(saved.revision).toBe(first.revision + 1);
  expect(await saveCampaign(update)).toEqual(saved);
  await expect(
    saveCampaign({ ...update, requestId: randomUUID() })
  ).rejects.toMatchObject({ code: "CONFLICT" });
  await expect(
    saveCampaign({ ...input, change: campaign("different") })
  ).rejects.toMatchObject({ code: "CONFLICT" });
  expect(
    (
      await state.db
        .select()
        .from(googleCampaignDrafts)
        .where(eq(googleCampaignDrafts.id, first.id))
    )[0]
  ).toMatchObject({ state: "draft", reviewHash: null, validatedAtMs: null });
});

it("binds request identity to actor and operation, not just UUID", async () => {
  const input = creativeRequest();
  const first = await saveCreative(input);
  const otherActor = await mcpCreativeDraft(2, authorize)(input);
  expect(otherActor.briefId).not.toBe(first.briefId);
  const otherTool = await saveCampaign({
    ...campaignRequest(),
    requestId: input.requestId,
  });
  expect(otherTool.state).toBe("draft");
});

it("rechecks connection and membership before replaying completed saves", async () => {
  const input = creativeRequest();
  await saveCreative(input);
  const deny = vi.fn(async () => {
    throw new Error("Connection revoked");
  });
  await expect(mcpCreativeDraft(1, deny)(input)).rejects.toThrow(
    "Connection revoked"
  );
  await state.db
    .update(organizationMemberships)
    .set({ status: "suspended" })
    .where(eq(organizationMemberships.userId, 1));
  try {
    await expect(saveCreative(input)).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    await expect(saveCampaign(campaignRequest())).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  } finally {
    await state.db
      .update(organizationMemberships)
      .set({ status: "active" })
      .where(eq(organizationMemberships.userId, 1));
  }
});

it("rolls back domain writes together with an invalid receipt and permits a safe retry", async () => {
  const requestId = randomUUID();
  const options = {
    actorUserId: 1,
    organizationId: 1,
    requestId,
    tool: "test_draft",
    payloadHash: stableHash({ example: true }),
    authorize,
  };
  await expect(
    withOrganizationTransaction(state.db, 1, tx =>
      withMcpDraftReceipt(tx, options, async () => {
        await tx
          .update(brandKits)
          .set({ name: "Must roll back" })
          .where(eq(brandKits.organizationId, 1));
        return { excessive: "x".repeat(4097) };
      })
    )
  ).rejects.toThrow("bounded result");
  expect(
    (
      await state.db
        .select()
        .from(brandKits)
        .where(eq(brandKits.organizationId, 1))
    )[0].name
  ).toBe("Brand 1");
  expect(
    await withOrganizationTransaction(state.db, 1, tx =>
      withMcpDraftReceipt(tx, options, async () => ({ ok: true }))
    )
  ).toEqual({ ok: true });
});

it("rejects unsupported top-level actions and never calls paid/storage/Google providers", async () => {
  await expect(
    saveCreative({ ...creativeRequest(), generate: true })
  ).rejects.toThrow();
  await expect(
    saveCampaign({ ...campaignRequest(), publish: true })
  ).rejects.toThrow();
  await expect(
    saveCampaign({
      ...campaignRequest(),
      change: {
        kind: "asset_group_assets",
        campaignId: "123",
        assetGroupId: "456",
        add: [],
        remove: [{ assetId: "789", field: "HEADLINE" }],
      },
    })
  ).rejects.toThrow("removals");
  await expect(
    saveCampaign({
      ...campaignRequest(),
      change: {
        kind: "asset_group_assets",
        campaignId: "123",
        assetGroupId: "456",
        remove: [],
        add: [
          {
            field: "MARKETING_IMAGE",
            source: { kind: "library", key: "asset:999999" },
          },
        ],
      },
    })
  ).rejects.toMatchObject({ code: "NOT_FOUND" });
  expect(state.model).not.toHaveBeenCalled();
  expect(state.google).not.toHaveBeenCalled();
  expect(state.storage).not.toHaveBeenCalled();
});

it("advances the creative CAS timestamp even when two saves share a clock tick", async () => {
  const clock = vi.spyOn(Date, "now").mockReturnValue(5000);
  try {
    const first = await saveCreative(creativeRequest());
    const next = {
      ...creativeRequest(),
      briefId: first.briefId,
      expectedUpdatedAtMs: first.updatedAtMs,
      setup: setup("Next tick"),
    };
    const second = await saveCreative(next);
    expect(second.updatedAtMs).toBe(first.updatedAtMs + 1);
    await expect(
      saveCreative({ ...next, requestId: randomUUID() })
    ).rejects.toMatchObject({ code: "CONFLICT" });
  } finally {
    clock.mockRestore();
  }
});
