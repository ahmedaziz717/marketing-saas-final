import { randomUUID } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { beforeAll, beforeEach, afterAll, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
const f = vi.hoisted(() => ({
  db: null as any,
  read: vi.fn(),
  mutate: vi.fn(),
  videoUpload: vi.fn(),
}));
vi.mock("./db", () => ({ getDb: async () => f.db }));
vi.mock("./lib/googleAdsApi", async original => ({
  ...(await original<any>()),
  googleAdsRows: (...args: unknown[]) => f.read(...args),
}));
vi.mock("./lib/googleAdsMutate", async original => ({
  ...(await original<any>()),
  mutateGoogleAds: (...args: unknown[]) => f.mutate(...args),
}));
vi.mock("./lib/googleVideoUploadApi", () => ({
  uploadGoogleVideo: (...args: unknown[]) => f.videoUpload(...args),
}));
vi.mock("./storage", async original => ({
  ...(await original<any>()),
  storageGetBase64: async () =>
    Buffer.from("synthetic-video").toString("base64"),
}));
import { googleLibraryVideo } from "./lib/googleVideoUploads";
import { readLibraryAsset } from "./lib/assetLibrary";
import {
  brandAssets,
  brandKits,
  users,
  organizations,
  organizationMemberships,
  activityEvents,
} from "../drizzle/schema";
import {
  channelConnections,
  googleCampaignDrafts,
} from "../drizzle/channelSchema";
import {
  googleCampaignCreateSchema,
  type GoogleChange,
} from "../shared/googleCampaigns";
import {
  compileGoogleChange,
  googleChangeAssets,
} from "./lib/googleCampaignOperations";
import {
  saveGoogleDraft,
  validateGoogleDraft,
  publishGoogleDraft,
  getGoogleDraft,
  googleCampaignInventory,
} from "./lib/googleCampaigns";
import { GoogleMutationError } from "./lib/googleAdsMutate";
import { encryptToken } from "./lib/secureToken";
let engine: PGlite, owner: number, creator: number, org: number, org2: number;
const connectionId = randomUUID();
const ad = {
  name: "Example ad",
  finalUrl: "https://shop.example/product",
  headlines: ["First headline", "Second headline", "Third headline"],
  descriptions: ["First description", "Second description"],
  assets: [],
  path1: "",
  path2: "",
};
const search = (): GoogleChange =>
  googleCampaignCreateSchema.parse({
    kind: "campaign_create",
    type: "SEARCH",
    name: "Search launch",
    dailyBudget: 10,
    bidding: { strategy: "MAXIMIZE_CONVERSIONS" },
    politicalAdvertising: "DOES_NOT_CONTAIN_EU_POLITICAL_ADVERTISING",
    locationIds: ["2840"],
    languageIds: ["1000"],
    keywords: [{ text: "example", match: "EXACT" }],
    ad,
  });
const snapshot = () => ({
  campaign: {
    id: "11",
    resourceName: "customers/2222222222/campaigns/11",
    name: "Existing",
    status: "ENABLED",
    advertisingChannelType: "SEARCH",
    campaignBudget: "customers/2222222222/campaignBudgets/12",
  },
  campaignBudget: {
    resourceName: "customers/2222222222/campaignBudgets/12",
    amountMicros: "10000000",
    period: "DAILY",
    explicitlyShared: false,
  },
});
beforeAll(async () => {
  vi.stubEnv("LIVE_AD_ACTIONS_ENABLED", "true");
  vi.stubEnv("GOOGLE_ADS_CLIENT_ID", "test-web");
  vi.stubEnv("GOOGLE_ADS_CLIENT_SECRET", "private-test");
  vi.stubEnv("APP_ORIGIN", "https://app.example.test");
  vi.stubEnv("INTEGRATION_TOKEN_ENCRYPTION_SECRET", "test-secret");
  engine = new PGlite();
  for (const file of readdirSync("drizzle/postgres")
    .filter(f => f.endsWith(".sql"))
    .sort())
    await engine.exec(readFileSync(`drizzle/postgres/${file}`, "utf8"));
  f.db = drizzle(engine);
  const us = await f.db
    .insert(users)
    .values([{ openId: "campaign-owner" }, { openId: "campaign-creator" }])
    .returning();
  [owner, creator] = us.map((u: any) => u.id);
  const os = await f.db
    .insert(organizations)
    .values(
      ["campaigns", "other"].map(name => ({
        name,
        slug: name,
        createdByUserId: owner,
        createdAtMs: 1,
      }))
    )
    .returning();
  [org, org2] = os.map((o: any) => o.id);
  await f.db.insert(organizationMemberships).values([
    {
      organizationId: org,
      userId: owner,
      role: "owner",
      status: "active",
      createdAtMs: 1,
    },
    {
      organizationId: org2,
      userId: owner,
      role: "owner",
      status: "active",
      createdAtMs: 1,
    },
    {
      organizationId: org,
      userId: creator,
      role: "creator",
      status: "active",
      createdAtMs: 1,
    },
  ]);
  await f.db.insert(channelConnections).values({
    id: connectionId,
    organizationId: org,
    channel: "google_ads",
    accountId: "2222222222",
    name: "Google test",
    status: "connected",
    details: {
      currency: "USD",
      timezone: "America/Chicago",
      capabilities: ["report"],
    },
    credentials: encryptToken(
      JSON.stringify({
        provider: "google_ads",
        clientId: "test-web",
        accessToken: "private-access",
        refreshToken: "private-refresh",
        expiresAtMs: Date.now() + 3600000,
        scope: "https://www.googleapis.com/auth/adwords",
      })
    ),
    connectedByUserId: owner,
    verifiedAtMs: 1,
    updatedAtMs: 1,
  });
});
afterAll(async () => {
  await engine.close();
  vi.unstubAllEnvs();
});
beforeEach(() => {
  f.read.mockReset().mockResolvedValue([snapshot()]);
  f.mutate
    .mockReset()
    .mockImplementation(async (_token, _id, ops, validate) => ({
      resources: validate
        ? []
        : ops.map(
            (_: unknown, i: number) =>
              `customers/2222222222/campaigns/${100 + i}`
          ),
      requestId: "test-request",
    }));
});
async function reviewed(change = search()) {
  const draft = await saveGoogleDraft(owner, {
    organizationId: org,
    connectionId,
    change,
  });
  return validateGoogleDraft(owner, {
    organizationId: org,
    id: draft.id,
    revision: draft.revision,
  });
}
const approval = (d: Awaited<ReturnType<typeof reviewed>>) => ({
  organizationId: org,
  id: d.id,
  revision: d.revision,
  reviewHash: d.reviewHash!,
  confirm: true as const,
});
it("compiles a complete Search launch with scoped temporary resources, explicit declaration and micros", () => {
  const operations = compileGoogleChange("2222222222", search(), []);
  expect(operations[0].campaignBudgetOperation.create).toMatchObject({
    amountMicros: "10000000",
    explicitlyShared: false,
  });
  expect(operations[1].campaignOperation.create).toMatchObject({
    status: "ENABLED",
    advertisingChannelType: "SEARCH",
    containsEuPoliticalAdvertising: "DOES_NOT_CONTAIN_EU_POLITICAL_ADVERTISING",
  });
  expect(
    operations.find(o => o.adGroupAdOperation)?.adGroupAdOperation.create
  ).toMatchObject({
    ad: {
      responsiveSearchAd: { headlines: ad.headlines.map(text => ({ text })) },
    },
  });
  expect(
    operations.some(o => o.campaignCriterionOperation?.create?.location)
  ).toBe(true);
});
it("places PMax branding at campaign level and unlinks only the selected group association", () => {
  const change = googleCampaignCreateSchema.parse({
    ...search(),
    type: "PERFORMANCE_MAX",
    ad: {
      ...ad,
      longHeadline: "A long headline",
      businessName: "Example",
      assets: ["MARKETING_IMAGE", "SQUARE_MARKETING_IMAGE", "LOGO"].map(
        field => ({ field, source: { kind: "existing", id: "42" } })
      ),
    },
  });
  const unsupportedBid = googleCampaignCreateSchema.safeParse({
    ...change,
    bidding: { strategy: "MANUAL_CPC", target: 1 },
  });
  expect(unsupportedBid.success).toBe(false);
  if (!unsupportedBid.success)
    expect(unsupportedBid.error.issues.map(issue => issue.message)).toContain(
      "Choose a bidding strategy supported by this campaign type."
    );
  const assets = googleChangeAssets(change).map((a, i) => ({
    field: a.field,
    resource: `customers/2222222222/assets/${i + 1}`,
    evidence: {},
  }));
  const operations = compileGoogleChange("2222222222", change, assets);
  expect(
    operations
      .filter(o => o.campaignAssetOperation)
      .map(o => o.campaignAssetOperation.create?.fieldType)
  ).toEqual(["LOGO", "BUSINESS_NAME"]);
  expect(operations.filter(o => o.assetGroupAssetOperation)).toHaveLength(8);
  const pmax = snapshot();
  pmax.campaign.advertisingChannelType = "PERFORMANCE_MAX";
  const unlink = compileGoogleChange(
    "2222222222",
    {
      kind: "asset_group_assets",
      campaignId: "11",
      assetGroupId: "22",
      add: [],
      remove: [{ assetId: "42", field: "HEADLINE" }],
    },
    [],
    pmax
  );
  expect(unlink).toEqual([
    {
      assetGroupAssetOperation: {
        remove: "customers/2222222222/assetGroupAssets/22~42~HEADLINE",
      },
    },
  ]);
  expect(JSON.stringify(unlink)).not.toContain('"assetOperation"');
});
it("saves and validates without delivery, then publishes exactly once and records approval", async () => {
  const draft = await reviewed();
  expect(f.mutate.mock.calls.every(c => c[3] === true)).toBe(true);
  const result = await publishGoogleDraft(owner, approval(draft));
  expect(result.state).toBe("published");
  await publishGoogleDraft(owner, approval(draft));
  expect(f.mutate.mock.calls.filter(c => c[3] === false)).toHaveLength(1);
  const events = await f.db
    .select()
    .from(activityEvents)
    .where(eq(activityEvents.entityId, draft.id));
  expect(events.map((e: any) => e.action)).toContain(
    "google_campaign.publish_approved"
  );
  expect(JSON.stringify(events)).not.toContain("private-access");
});
it("rejects foreign workspace drafts, foreign accounts and creator publishing", async () => {
  const draft = await reviewed();
  await expect(getGoogleDraft(f.db, org2, draft.id)).rejects.toMatchObject({
    code: "NOT_FOUND",
  });
  await expect(
    saveGoogleDraft(owner, {
      organizationId: org2,
      connectionId,
      change: search(),
    })
  ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  await expect(
    publishGoogleDraft(creator, approval(draft))
  ).rejects.toMatchObject({ code: "FORBIDDEN" });
  expect(f.mutate.mock.calls.filter(c => c[3] === false)).toHaveLength(0);
});
it("invalidates prior review on edits and checks remote changes again before publishing", async () => {
  const draft = await reviewed();
  await saveGoogleDraft(owner, {
    organizationId: org,
    connectionId,
    id: draft.id,
    revision: draft.revision,
    change: { ...search(), name: "Edited" } as GoogleChange,
  });
  await expect(
    publishGoogleDraft(owner, approval(draft))
  ).rejects.toMatchObject({ code: "CONFLICT" });
  const existing = await reviewed({
    kind: "campaign_update",
    campaignId: "11",
    name: "Renamed",
    status: "PAUSED",
    dailyBudget: 12,
  });
  const changed = snapshot();
  changed.campaignBudget.amountMicros = "25000000";
  f.read.mockResolvedValue([changed]);
  await expect(
    publishGoogleDraft(owner, approval(existing))
  ).rejects.toMatchObject({ code: "CONFLICT" });
  expect(f.mutate.mock.calls.filter(c => c[3] === false)).toHaveLength(0);
});
it("does not retry uncertain publishing and refuses editing or resubmitting that draft", async () => {
  const draft = await reviewed();
  f.mutate.mockImplementation(async (_t, _i, _o, validate) => {
    if (!validate)
      throw new GoogleMutationError("Google did not confirm.", true);
    return { resources: [] };
  });
  const result = await publishGoogleDraft(owner, approval(draft));
  expect(result.state).toBe("uncertain");
  await expect(
    publishGoogleDraft(owner, approval(draft))
  ).rejects.toMatchObject({ code: "CONFLICT" });
  await expect(
    saveGoogleDraft(owner, {
      organizationId: org,
      connectionId,
      id: draft.id,
      revision: draft.revision,
      change: search(),
    })
  ).rejects.toMatchObject({ code: "CONFLICT" });
  expect(f.mutate.mock.calls.filter(c => c[3] === false)).toHaveLength(1);
});
it("blocks altered shared budgets and parent mismatches before Google validation", async () => {
  const shared = snapshot();
  shared.campaignBudget.explicitlyShared = true;
  f.read.mockResolvedValue([shared]);
  await expect(
    reviewed({
      kind: "campaign_update",
      campaignId: "11",
      name: "Shared",
      status: "PAUSED",
      dailyBudget: 30,
    })
  ).rejects.toThrow(/shared budget/);
  f.read.mockImplementation(async (_t, _c, q) =>
    q.includes("FROM ad_group ") ? [] : [snapshot()]
  );
  await expect(
    reviewed({
      kind: "ad_create",
      campaignId: "11",
      adGroupId: "888",
      type: "SEARCH",
      ad,
    })
  ).rejects.toThrow(/Ad group not found/);
  expect(f.mutate).not.toHaveBeenCalled();
});
it("defaults campaign inventory to active and isolates the all-status option", async () => {
  await googleCampaignInventory(f.db, org, connectionId, false);
  expect(f.read.mock.calls[0][2]).toContain("campaign.status = 'ENABLED'");
  await googleCampaignInventory(f.db, org, connectionId, true);
  expect(f.read.mock.calls[1][2]).toContain("campaign.status != 'REMOVED'");
});

it("updates only the selected PMax group and gives new retail groups a product tree", () => {
  const pmax = {
    ...snapshot(),
    campaign: {
      ...snapshot().campaign,
      advertisingChannelType: "PERFORMANCE_MAX",
      shoppingSetting: { merchantId: "123" },
    },
  };
  const edit: GoogleChange = {
    kind: "asset_group_update",
    campaignId: "11",
    assetGroupId: "22",
    name: "Revised group",
    status: "PAUSED",
    finalUrl: "https://shop.example/updated",
  };
  expect(compileGoogleChange("2222222222", edit, [], pmax)).toEqual([
    {
      assetGroupOperation: {
        update: {
          resourceName: "customers/2222222222/assetGroups/22",
          name: "Revised group",
          status: "PAUSED",
          finalUrls: ["https://shop.example/updated"],
        },
        updateMask: "name,status,final_urls",
      },
    },
  ]);
  const create: GoogleChange = {
    kind: "asset_group_create",
    campaignId: "11",
    name: "Retail group",
    finalUrl: "https://shop.example",
    assets: [{ field: "HEADLINE", source: { kind: "existing", id: "33" } }],
  };
  const operations = compileGoogleChange(
    "2222222222",
    create,
    [
      {
        field: "HEADLINE",
        resource: "customers/2222222222/assets/33",
        evidence: {},
      },
    ],
    pmax
  );
  expect(operations).toContainEqual({
    assetGroupListingGroupFilterOperation: {
      create: {
        assetGroup: "customers/2222222222/assetGroups/-3",
        type: "UNIT_INCLUDED",
        listingSource: "SHOPPING",
      },
    },
  });
  expect(() =>
    compileGoogleChange("2222222222", search(), [
      {
        field: "LOGO",
        resource: "customers/2222222222/assets/33",
        evidence: {},
      },
    ])
  ).toThrow("not supported");
});

async function videoAsset() {
  let kit = (
    await f.db.select().from(brandKits).where(eq(brandKits.organizationId, org))
  )[0];
  if (!kit)
    kit = (
      await f.db
        .insert(brandKits)
        .values({
          organizationId: org,
          name: "Brand",
          colors: [],
          fonts: [],
          updatedByUserId: owner,
          updatedAtMs: 1,
        })
        .returning()
    )[0];
  const row = (
    await f.db
      .insert(brandAssets)
      .values({
        organizationId: org,
        brandKitId: kit.id,
        name: "Library clip",
        type: "other",
        storageKey: `org-${org}/clip-${randomUUID()}.mp4`,
        url: "https://example.com/clip.mp4",
        mimeType: "video/mp4",
        status: "approved",
        uploadedByUserId: owner,
        createdAtMs: 1,
        metadata: { library: { purpose: "finished" } },
      })
      .returning()
  )[0];
  const asset = await readLibraryAsset(f.db, org, `asset:${row.id}`);
  return {
    organizationId: org,
    connectionId,
    key: asset.key,
    revision: asset.revision,
    generated: false,
  };
}
it("uploads approved library videos once, resumes processing and never changes campaigns", async () => {
  const input = await videoAsset();
  f.videoUpload
    .mockReset()
    .mockResolvedValue("customers/2222222222/youTubeVideoUploads/77");
  expect(await googleLibraryVideo(owner, input)).toBeNull();
  expect(f.videoUpload).not.toHaveBeenCalled();
  expect(await googleLibraryVideo(owner, input, true)).toMatchObject({
    state: "PROCESSING",
  });
  f.read.mockResolvedValue([
    { youTubeVideoUpload: { state: "PROCESSED", videoId: "abcdefghijk" } },
  ]);
  expect(await googleLibraryVideo(owner, input, true)).toMatchObject({
    state: "PROCESSED",
    videoId: "abcdefghijk",
  });
  expect(f.videoUpload).toHaveBeenCalledTimes(1);
  expect(f.mutate).not.toHaveBeenCalled();
  await expect(googleLibraryVideo(creator, input, true)).rejects.toThrow();
  await expect(
    googleLibraryVideo(owner, { ...input, organizationId: org2 }, true)
  ).rejects.toThrow();
  await expect(
    googleLibraryVideo(owner, { ...input, revision: "stale" }, true)
  ).rejects.toThrow();
});
it("does not retry an uncertain video upload and retains its durable audit state", async () => {
  const input = await videoAsset();
  f.videoUpload
    .mockReset()
    .mockRejectedValue(new GoogleMutationError("Unconfirmed upload", true));
  expect(await googleLibraryVideo(owner, input, true)).toMatchObject({
    state: "UNCERTAIN",
  });
  expect(await googleLibraryVideo(owner, input, true)).toMatchObject({
    state: "UNCERTAIN",
  });
  expect(f.videoUpload).toHaveBeenCalledTimes(1);
});
it("blocks video transfers when live actions are disabled", async () => {
  const input = await videoAsset();
  vi.stubEnv("LIVE_AD_ACTIONS_ENABLED", "false");
  await expect(googleLibraryVideo(owner, input, true)).rejects.toThrow(
    /disabled/
  );
  vi.stubEnv("LIVE_AD_ACTIONS_ENABLED", "true");
});
