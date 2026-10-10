import { randomUUID } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { eq } from "drizzle-orm";
import {
  beforeAll,
  beforeEach,
  afterAll,
  describe,
  expect,
  it,
  vi,
} from "vitest";
const state = vi.hoisted(() => ({
  db: null as any,
  submit: vi.fn(),
  estimate: vi.fn(),
  poll: vi.fn(),
  cancel: vi.fn(),
  download: vi.fn(),
  signed: vi.fn(),
  upload: vi.fn(),
  storedVideo: "",
  llm: vi.fn(),
  image: vi.fn(),
}));
vi.mock("./_core/llm", async original => ({
  ...(await original<typeof import("./_core/llm")>()),
  listLLMModels: async () => ({ data: [{ id: "gpt-5.5" }] }),
  invokeLLM: (...args: any[]) => state.llm(...args),
}));
vi.mock("./lib/creativeImages", async original => ({
  ...(await original<typeof import("./lib/creativeImages")>()),
  readGenerationSource: (...args: any[]) => state.image(...args),
}));
vi.mock("./db", () => ({
  getDb: async () => state.db,
  closeDb: async () => {},
}));
vi.mock("./lib/higgsfield", async original => ({
  ...(await original<typeof import("./lib/higgsfield")>()),
  submitHiggsfield: (...args: any[]) => state.submit(...args),
  estimateHiggsfield: (...args: any[]) => state.estimate(...args),
  pollHiggsfield: (...args: any[]) => state.poll(...args),
  cancelHiggsfield: (...args: any[]) => state.cancel(...args),
  downloadVideo: (...args: any[]) => state.download(...args),
}));
vi.mock("./storage", async original => ({
  ...(await original<typeof import("./storage")>()),
  storageClient: () => ({
    storage: {
      from: () => ({ createSignedUrl: state.signed, upload: state.upload }),
    },
  }),
  storageGetBase64: async () => state.storedVideo,
}));
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";
import {
  organizations,
  organizationMemberships,
  users,
  brandAssets,
  brandKits,
  products,
  productImages,
} from "../drizzle/schema";
import { videoJobs, providerWorkers } from "../drizzle/videoSchema";
import {
  aiUsage,
  creditLedger,
  platformAccounts,
  platformTiers,
} from "../drizzle/platformSchema";
import {
  defaultVideoSetup,
  videoRequestBody,
  videoSetupProblem,
  videoSetupSchema,
  videoPrompt,
  type VideoSetup,
} from "../shared/videoCreation";
import {
  processNextVideoJob,
  videoWorkerHeartbeat,
  refreshFailedVideoDiagnostic,
} from "./jobs/videoWorker";
import {
  HiggsfieldError,
  HiggsfieldQuoteUnavailableError,
  requestUrl,
} from "./lib/higgsfield";
import { generationModel } from "../shared/modelCatalog";
import { mp4Info } from "./lib/videoMedia";
import { defaultVideoRates, videoQuote } from "./lib/videoPricing";
import { aiScope } from "./lib/aiMetering";
import {
  resolveVideoReferences,
  validateVideoReferences,
  publicVideoJob,
} from "./lib/videoJobs";
let engine: PGlite,
  org: number,
  otherOrg: number,
  ownerId: number,
  imageId: number,
  videoId: number,
  foreignId: number;
let productId: number, catalogImageId: number, foreignCatalogImageId: number;
let owner: ReturnType<typeof appRouter.createCaller>,
  outsider: typeof owner,
  reviewer: typeof owner;
const setup = (): VideoSetup => ({
  ...defaultVideoSetup,
  title: "Product orbit",
  prompt: "Orbit around Image 1",
  imageKeys: [`asset:${imageId}`],
});
function sampleMp4(seconds = 5) {
  const box = (name: string, body: Buffer) => {
    const out = Buffer.alloc(body.length + 8);
    out.writeUInt32BE(out.length);
    out.write(name, 4);
    body.copy(out, 8);
    return out;
  };
  const timing = Buffer.alloc(100);
  timing.writeUInt32BE(1000, 12);
  timing.writeUInt32BE(seconds * 1000, 16);
  const track = Buffer.alloc(84);
  track.writeUInt32BE(1280 * 65536, 76);
  track.writeUInt32BE(720 * 65536, 80);
  return Buffer.concat([
    box("ftyp", Buffer.from("isom0000isom")),
    box(
      "moov",
      Buffer.concat([box("mvhd", timing), box("trak", box("tkhd", track))])
    ),
  ]);
}
beforeAll(async () => {
  vi.stubEnv("HF_API_KEY", "isolated-test-credential");
  vi.stubEnv("VIDEO_GENERATION_ENABLED", "true");
  engine = new PGlite();
  for (const file of readdirSync("drizzle/postgres")
    .filter(file => file.endsWith(".sql"))
    .sort())
    await engine.exec(readFileSync(`drizzle/postgres/${file}`, "utf8"));
  state.db = drizzle(engine);
  const db = state.db,
    now = Date.now();
  const people = await db
    .insert(users)
    .values(
      ["owner", "outsider", "reviewer"].map(name => ({
        openId: `video-${name}`,
        name,
      }))
    )
    .returning();
  ownerId = people[0].id;
  [owner, outsider, reviewer] = people.map((user: any) =>
    appRouter.createCaller({ user, req: {}, res: {} } as TrpcContext)
  );
  const orgs = await db
    .insert(organizations)
    .values(
      ["video-main", "video-other"].map(slug => ({
        slug,
        name: slug,
        createdByUserId: ownerId,
        createdAtMs: now,
      }))
    )
    .returning();
  org = orgs[0].id;
  otherOrg = orgs[1].id;
  await db.insert(organizationMemberships).values(
    people.map((user: any, i: number) => ({
      userId: user.id,
      organizationId: i === 1 ? otherOrg : org,
      role: i === 2 ? "reviewer" : "owner",
      status: "active",
      createdAtMs: now,
    }))
  );
  for (const organizationId of [org, otherOrg]) {
    const [product] = await db
      .insert(products)
      .values({
        organizationId,
        name: "Studio lamp",
        sku: "LAMP-01",
        dedupeKey: "video-lamp",
        productUrl: "https://example.test/lamp",
        description: "A brass lamp.",
        specifications: {},
        provenance: {},
        status: "approved",
        createdAtMs: now,
        updatedAtMs: now,
      })
      .returning();
    const [catalogImage] = await db
      .insert(productImages)
      .values({
        organizationId,
        productId: product.id,
        sourceUrl: "https://example.test/lamp.png",
        storageKey: `org-${organizationId}/product.png`,
        url: "/media/product.png",
        isPrimary: 1,
        createdAtMs: now,
      })
      .returning();
    if (organizationId === org) {
      productId = product.id;
      catalogImageId = catalogImage.id;
    } else foreignCatalogImageId = catalogImage.id;
    const [kit] = await db
      .insert(brandKits)
      .values({
        organizationId,
        name: "Video brand",
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
        organizationId,
        brandKitId: kit.id,
        name: "Reference image",
        type: "product",
        storageKey: `org-${organizationId}/reference.png`,
        url: "/media/reference.png",
        mimeType: "image/png",
        status: "approved",
        uploadedByUserId: ownerId,
        createdAtMs: now,
      })
      .returning();
    if (organizationId === org) {
      imageId = asset.id;
      const [video] = await db
        .insert(brandAssets)
        .values({
          organizationId,
          brandKitId: kit.id,
          name: "Source clip",
          type: "reference",
          storageKey: `org-${organizationId}/reference.mp4`,
          url: "/media/reference.mp4",
          mimeType: "video/mp4",
          status: "approved",
          metadata: { durationSeconds: 5, width: 1280, height: 720 },
          uploadedByUserId: ownerId,
          createdAtMs: now,
        })
        .returning();
      videoId = video.id;
    } else foreignId = asset.id;
  }
  await db.insert(platformTiers).values({
    id: "video-test",
    name: "Test",
    monthlyCredits: 10000,
    monthlyPriceMicros: 0,
    updatedAtMs: now,
  });
  await db.insert(platformAccounts).values({
    organizationId: org,
    tierId: "video-test",
    enforceCredits: 1,
    updatedAtMs: now,
  });
});
beforeEach(async () => {
  state.llm.mockReset();
  state.image.mockReset();
  state.image.mockImplementation(async (key: string) => ({
    b64Json: Buffer.from(key).toString("base64"),
    mimeType: "image/png",
  }));
  await state.db
    .update(products)
    .set({ status: "approved" })
    .where(eq(products.id, productId));
  state.estimate.mockReset();
  state.estimate.mockImplementation(async (endpoint: string) => ({
    costMicros: endpoint.endsWith("video-edit") ? 2775000 : 2311200,
    quotedAtMs: Date.now(),
  }));
  state.submit.mockReset();
  state.poll.mockReset();
  state.cancel.mockReset();
  state.download.mockReset();
  state.upload.mockReset();
  state.signed.mockReset();
  state.signed.mockImplementation(async (key: string) => ({
    data: {
      signedUrl: `https://storage.example.test/${key}?token=frozen-signature`,
    },
    error: null,
  }));
  state.upload.mockResolvedValue({ error: null });
  state.download.mockResolvedValue(sampleMp4());
  state.storedVideo = sampleMp4().toString("base64");
  await state.db.delete(videoJobs);
  await state.db.delete(aiUsage);
  await state.db.delete(creditLedger);
  await state.db.update(platformAccounts).set({ aiPaused: 0 });
  await state.db.update(platformTiers).set({ monthlyCredits: 10000 });
  await videoWorkerHeartbeat(state.db);
});
afterAll(async () => {
  await engine.close();
  vi.unstubAllEnvs();
});
async function queued(settings = setup()) {
  const draft = await owner.video.save({
    organizationId: org,
    setup: settings,
  });
  const quote = await owner.video.quote({
    organizationId: org,
    setup: settings,
  });
  return owner.video.generate({
    organizationId: org,
    id: draft.id,
    revision: draft.revision,
    quotedCredits: quote.credits,
  });
}
async function tick() {
  await state.db.update(videoJobs).set({ nextPollAtMs: 0 });
  return processNextVideoJob(state.db);
}
const providerId = randomUUID();
const accepted = {
  request_id: providerId,
  status: "queued",
  status_url: `https://api.higgsfield.ai/requests/${providerId}/status`,
  cancel_url: `https://api.higgsfield.ai/requests/${providerId}/cancel`,
};

describe("durable video generation", () => {
  it("locks a descriptive token estimate through submission and measured-cost reconciliation", async () => {
    const model = generationModel(
      "higgsfield:bytedance/seedance-2.5/reference-to-video"
    )!;
    state.estimate.mockRejectedValue(
      new HiggsfieldQuoteUnavailableError(model.pricingNote)
    );
    const job = await queued({
      ...setup(),
      modelId: model.id,
      resolution: "480p",
      aspectRatio: "1:1",
      duration: 5,
    });
    expect(job.credits).toBe(206);
    await tick();
    state.submit.mockResolvedValue({
      ...accepted,
      status: "completed",
      video: { url: "https://cdn.example.test/clip.mp4" },
    });
    await tick();
    await tick();
    const [usage] = await state.db.select().from(aiUsage);
    expect(usage.credits).toBe(206);
    expect(usage.costMicros).toBeGreaterThan(1027200);
    expect(usage.usage.costBasis).toBe("published_rate_estimate");
    expect(
      (await state.db.select().from(creditLedger)).map((r: any) => r.amount)
    ).toEqual([-206]);
    expect(state.submit).toHaveBeenCalledTimes(1);
  });
  it("combines approved catalog and asset images in order, and rejects foreign or withdrawn catalog references", async () => {
    const settings = {
      ...setup(),
      imageKeys: [`product_image:${catalogImageId}`, `asset:${imageId}`],
    };
    const images = await owner.video.catalogImages({
      organizationId: org,
      search: "lamp-01",
    });
    expect(images.items.map(item => item.key)).toEqual([
      `product_image:${catalogImageId}`,
    ]);
    expect(
      (
        await owner.video.catalogImages({
          organizationId: org,
          selectedOnly: true,
          selectedKeys: [`product_image:${foreignCatalogImageId}`],
        })
      ).items
    ).toEqual([]);
    const refs = await resolveVideoReferences(state.db, org, settings);
    expect(refs.map(ref => ref.key)).toEqual(settings.imageKeys);
    const job = await queued(settings);
    state.submit.mockResolvedValue({ id: "mixed-reference-request" });
    await tick();
    await tick();
    const payload = state.submit.mock.calls[0][1];
    expect(JSON.stringify(payload)).toContain(`org-${org}/product.png`);
    expect(JSON.stringify(payload).indexOf("product.png")).toBeLessThan(
      JSON.stringify(payload).indexOf("reference.png")
    );
    await expect(
      owner.video.quote({
        organizationId: org,
        setup: {
          ...setup(),
          imageKeys: [`product_image:${foreignCatalogImageId}`],
        },
      })
    ).rejects.toThrow(/unavailable/);
    await state.db
      .update(products)
      .set({ status: "pending" })
      .where(eq(products.id, productId));
    await expect(
      validateVideoReferences(state.db, {
        organizationId: org,
        references: refs,
      })
    ).rejects.toThrow(/unavailable/);
    expect(
      (await owner.video.catalogImages({ organizationId: org })).items
    ).toEqual([]);
    expect(job.credits).toBeGreaterThan(0);
  });

  it("drafts a metered-scope prompt from actual ordered images and protects workspace boundaries", async () => {
    let scope: unknown;
    state.llm.mockImplementation(async () => {
      scope = aiScope.getStore();
      return {
        choices: [
          {
            message: {
              content: JSON.stringify({
                prompt:
                  "Orbit around the brass lamp in Image 1, then ease into a close-up of its finish.",
              }),
            },
          },
        ],
      };
    });
    const settings = {
      ...setup(),
      prompt: "",
      mode: "edit" as const,
      sourceVideoKey: null,
      imageKeys: [`product_image:${catalogImageId}`, `asset:${imageId}`],
    };
    const result = await owner.video.draftPrompt({
      organizationId: org,
      setup: settings,
    });
    expect(result.prompt).toContain("Image 1");
    expect(scope).toMatchObject({
      organizationId: org,
      actorUserId: ownerId,
      operation: "video.draftPrompt",
    });
    const parts = state.llm.mock.calls[0][0].messages[1].content;
    expect(
      parts
        .filter((part: any) => part.type === "image_url")
        .map((part: any) => part.image_url.url)
    ).toEqual([
      `data:image/png;base64,${Buffer.from(`org-${org}/product.png`).toString("base64")}`,
      `data:image/png;base64,${Buffer.from(`org-${org}/reference.png`).toString("base64")}`,
    ]);
    expect(parts[0].text).toContain("Creative theme");
    expect(parts[1].text).toContain("A brass lamp.");
    state.llm.mockClear();
    await expect(
      owner.video.draftPrompt({
        organizationId: org,
        setup: {
          ...settings,
          imageKeys: [`product_image:${foreignCatalogImageId}`],
        },
      })
    ).rejects.toThrow(/unavailable/);
    await expect(
      reviewer.video.draftPrompt({ organizationId: org, setup: settings })
    ).rejects.toThrow();
    expect(state.llm).not.toHaveBeenCalled();
    expect(await state.db.select().from(videoJobs)).toHaveLength(0);
  });

  it("applies video direction to the provider prompt and preserves old saved prompts", () => {
    const settings = {
      ...setup(),
      direction: {
        ...defaultVideoSetup.direction!,
        theme: "holiday" as const,
        mood: "warm" as const,
        artStyle: "cinematic" as const,
        setting: "lifestyle" as const,
        placement: "left" as const,
        extraDirection: "Snow outside the window",
      },
    };
    const request = videoRequestBody(settings, ["image"]);
    expect(request.prompt).toContain("Holiday");
    expect(request.prompt).toContain("Cinematic");
    expect(request.prompt).toContain("without people");
    expect(request.prompt).toContain("toward the left");
    expect(request.prompt).toContain("Snow outside the window");
    expect(videoPrompt({ ...settings, direction: undefined })).toBe(
      settings.prompt
    );
    expect(
      publicVideoJob({ setup: { ...settings, direction: undefined } } as any)
        .setup.direction
    ).toBeNull();
    expect(
      videoSetupSchema.safeParse({
        ...settings,
        sourceVideoKey: `product_image:${catalogImageId}`,
      }).success
    ).toBe(false);
  });
  it("keeps Creator selections, quotes generation and sends portrait references after product images", async () => {
    const settings = {
      ...setup(),
      category: "ugc" as const,
      title: "Creator demonstration",
      people: [
        { kind: "library" as const, id: "female-black-0" },
        { kind: "library" as const, id: "boys-child-a-0" },
      ],
      aspectRatio: "9:16" as const,
      duration: 15,
    };
    const draft = await owner.video.save({
      organizationId: org,
      setup: settings,
    });
    expect(
      (await owner.video.get({ organizationId: org, id: draft.id })).setup
    ).toEqual(settings);
    const updated = await owner.video.save({
      organizationId: org,
      id: draft.id,
      revision: draft.revision,
      setup: { ...settings, people: settings.people.slice(0, 1) },
    });
    expect((await owner.video.list({ organizationId: org }))[0]).toMatchObject({
      revision: 2,
      setup: { category: "ugc", people: [settings.people[0]] },
    });
    expect(await state.db.select().from(aiUsage)).toHaveLength(0);
    const quote = await owner.video.quote({
      organizationId: org,
      setup: updated.setup,
    });
    await owner.video.generate({
      organizationId: org,
      id: draft.id,
      revision: updated.revision,
      quotedCredits: quote.credits,
    });
    await tick();
    const [job] = await state.db
      .select()
      .from(videoJobs)
      .where(eq(videoJobs.id, draft.id));
    expect(job.requestBody.image_urls).toHaveLength(2);
    expect(job.requestBody.prompt).toContain("LAST 1 reference images");
    expect(job.references[1].key).toBe("person_library:female-black-0");
    expect(state.upload).toHaveBeenCalled();
    state.submit.mockResolvedValue(accepted);
    await tick();
    expect(state.submit).toHaveBeenCalledTimes(1);
    expect(
      (await owner.video.get({ organizationId: org, id: draft.id })).status
    ).toBe("generating");
    expect(await state.db.select().from(aiUsage)).toHaveLength(1);
  });
  it("validates UGC model identities, approvals and tenant ownership", async () => {
    const settings = { ...setup(), category: "ugc" as const };
    for (const people of [
      [{ kind: "library", id: "unknown-model" }],
      Array.from({ length: 5 }, (_, i) => ({
        kind: "library",
        id: `female-black-${i}`,
      })),
      [
        { kind: "library", id: "female-black-0" },
        { kind: "library", id: "female-black-0" },
      ],
      [{ kind: "asset", assetId: imageId }],
      [{ kind: "asset", assetId: foreignId }],
    ])
      await expect(
        owner.video.save({
          organizationId: org,
          setup: { ...settings, people: people as VideoSetup["people"] },
        })
      ).rejects.toThrow();
    const [kit] = await state.db
      .select()
      .from(brandKits)
      .where(eq(brandKits.organizationId, org));
    const [portrait] = await state.db
      .insert(brandAssets)
      .values({
        organizationId: org,
        brandKitId: kit.id,
        name: "Saved presenter",
        type: "reference",
        mimeType: "image/png",
        storageKey: "portrait.png",
        url: "/portrait.png",
        status: "pending",
        metadata: { kind: "lifestyle_person", libraryId: "female-black-0" },
        uploadedByUserId: ownerId,
        createdAtMs: Date.now(),
      })
      .returning();
    const selected = {
      ...settings,
      people: [{ kind: "asset" as const, assetId: portrait.id }],
    };
    await expect(
      owner.video.save({ organizationId: org, setup: selected })
    ).rejects.toThrow("approved model");
    await state.db
      .update(brandAssets)
      .set({ status: "approved" })
      .where(eq(brandAssets.id, portrait.id));
    expect(
      (await owner.video.save({ organizationId: org, setup: selected })).setup
        .people
    ).toEqual(selected.people);
    await expect(
      owner.video.save({
        organizationId: org,
        setup: {
          ...settings,
          people: [
            ...selected.people,
            { kind: "library", id: "female-black-0" },
          ],
        },
      })
    ).rejects.toThrow("same person");
    await expect(
      outsider.video.save({ organizationId: otherOrg, setup: selected })
    ).rejects.toThrow("approved model");
  });
  it("keeps older product drafts compatible and blocks UGC from the product worker", async () => {
    const { category, people, ...legacy } = setup();
    const draft = await owner.video.save({
      organizationId: org,
      setup: legacy,
    });
    await state.db
      .update(videoJobs)
      .set({ setup: legacy })
      .where(eq(videoJobs.id, draft.id));
    expect(
      (await owner.video.get({ organizationId: org, id: draft.id })).setup
    ).toMatchObject({ category: "product", people: [] });
    expect(
      videoSetupSchema.safeParse({
        ...setup(),
        people: [{ kind: "library", id: "female-black-0" }],
      }).success
    ).toBe(false);
  });
  it("saves incomplete drafts without billing and enforces workspace/role boundaries", async () => {
    const draft = await owner.video.save({
      organizationId: org,
      setup: { ...setup(), prompt: "" },
    });
    expect(draft.status).toBe("draft");
    expect(await state.db.select().from(aiUsage)).toHaveLength(0);
    await expect(
      outsider.video.get({ organizationId: org, id: draft.id })
    ).rejects.toThrow("access");
    await expect(
      reviewer.video.save({ organizationId: org, setup: setup() })
    ).rejects.toThrow("role");
    await expect(
      owner.video.quote({
        organizationId: org,
        setup: { ...setup(), imageKeys: [`asset:${foreignId}`] },
      })
    ).rejects.toThrow("workspace");
  });
  it("reserves credits exactly once for duplicate generate clicks and rejects changed quotes", async () => {
    const draft = await owner.video.save({
      organizationId: org,
      setup: setup(),
    });
    await expect(
      owner.video.generate({
        organizationId: org,
        id: draft.id,
        revision: 1,
        quotedCredits: 1,
      })
    ).rejects.toThrow("price changed");
    const quote = await owner.video.quote({
      organizationId: org,
      setup: setup(),
    });
    for (let i = 0; i < 2; i++)
      await owner.video.generate({
        organizationId: org,
        id: draft.id,
        revision: 1,
        quotedCredits: quote.credits,
      });
    expect(await state.db.select().from(aiUsage)).toHaveLength(1);
    const ledger = await state.db.select().from(creditLedger);
    expect(ledger).toHaveLength(1);
    expect(ledger[0].amount).toBe(-463);
    expect(
      JSON.stringify(
        await owner.video.get({ organizationId: org, id: draft.id })
      )
    ).not.toContain("storageKey");
  });
  it("blocks spending without worker readiness, sufficient credits or with paused AI", async () => {
    await state.db.update(providerWorkers).set({ ready: 0 });
    await expect(queued()).rejects.toThrow("administrator setup");
    await videoWorkerHeartbeat(state.db);
    await state.db.update(platformTiers).set({ monthlyCredits: 1 });
    await expect(queued()).rejects.toThrow("463 AI credits");
    await state.db.update(platformAccounts).set({ aiPaused: 1 });
    await expect(queued()).rejects.toThrow("paused");
    expect(await state.db.select().from(aiUsage)).toHaveLength(0);
  });
  it("replays the exact signed payload and idempotency key after ambiguous acceptance, then stores one reviewable clip", async () => {
    const job = await queued();
    await tick();
    state.submit
      .mockRejectedValueOnce(new HiggsfieldError(0, true, "Timeout"))
      .mockResolvedValueOnce({
        ...accepted,
        status_url: accepted.status_url.replace(
          "api.higgsfield.ai",
          "different-host.example"
        ),
        cancel_url: accepted.cancel_url.replace(
          "api.higgsfield.ai",
          "different-host.example"
        ),
      });
    await tick();
    await tick();
    expect(state.signed).toHaveBeenCalledTimes(2);
    expect(state.submit).toHaveBeenCalledTimes(2);
    expect(state.submit.mock.calls[0]).toEqual(state.submit.mock.calls[1]);
    expect(state.submit.mock.calls[0][2]).toBe(job.id);
    state.poll.mockResolvedValue({
      ...accepted,
      status: "completed",
      video: { url: "https://cdn.example.test/result.mp4" },
    });
    await tick();
    await tick();
    expect(state.poll).toHaveBeenCalledWith(providerId, accepted.status_url);
    const result = await owner.video.get({ organizationId: org, id: job.id });
    expect(result.status).toBe("completed");
    expect(result.assetKey).toMatch(/^asset:/);
    const stored = (
      await owner.assetLibrary.studioList({ organizationId: org })
    ).find(asset => asset.key === result.assetKey)!;
    expect(stored).toMatchObject({
      state: "draft",
      origin: "generated",
      mediaType: "video",
      durationSeconds: 5,
      width: 1280,
      height: 720,
    });
    const [usage] = await state.db.select().from(aiUsage);
    expect(usage).toMatchObject({
      status: "succeeded",
      credits: 463,
      costMicros: 2311200,
    });
    expect(usage.usage.costBasis).toBe("provider_account_estimate");
    expect(usage.outputTokens).toBeNull();
    expect(await tick()).toBe(false);
    expect(state.upload).toHaveBeenCalledTimes(1);
    const privateRow = (await state.db.select().from(videoJobs))[0];
    expect(privateRow.requestBody).toBeNull();
    expect(privateRow.outputUrl).toBeNull();
  });
  it("keeps the account quote when delivered dimensions would previously increase the price", async () => {
    state.estimate.mockResolvedValue({
      costMicros: 870000,
      quotedAtMs: Date.now(),
    });
    const job = await queued({
      ...setup(),
      resolution: "480p",
      aspectRatio: "1:1",
    });
    expect(job.credits).toBe(174);
    await tick();
    state.submit.mockResolvedValue({
      ...accepted,
      status: "completed",
      video: { url: "https://cdn.example.test/large.mp4" },
    });
    await tick();
    await tick();
    const [usage] = await state.db.select().from(aiUsage);
    expect(usage.credits).toBe(174);
    expect(usage.costMicros).toBe(870000);
    expect(usage.usage.outputWidth).toBe(1280);
    const ledger = await state.db.select().from(creditLedger);
    expect(ledger.map((r: any) => r.amount)).toEqual([-174]);
    const [submittedEndpoint, submittedBody] = state.submit.mock.calls[0];
    expect(state.estimate).toHaveBeenLastCalledWith(
      submittedEndpoint,
      submittedBody
    );
  });
  it("refunds a changed or unavailable queued quote without a paid provider submission", async () => {
    const job = await queued();
    state.estimate.mockResolvedValue({
      costMicros: 10000000,
      quotedAtMs: Date.now(),
    });
    await tick();
    expect(state.submit).not.toHaveBeenCalled();
    expect(
      (await owner.video.get({ organizationId: org, id: job.id })).status
    ).toBe("failed");
    const ledger = await state.db.select().from(creditLedger);
    expect(ledger.reduce((sum: number, r: any) => sum + r.amount, 0)).toBe(0);
    await tick();
    expect(await state.db.select().from(creditLedger)).toHaveLength(2);
  });
  it("cancels an unsubmitted job and refunds once", async () => {
    const job = await queued();
    await owner.video.cancel({ organizationId: org, id: job.id });
    expect(
      (await owner.video.get({ organizationId: org, id: job.id })).status
    ).toBe("canceled");
    expect(await tick()).toBe(false);
    expect(state.submit).not.toHaveBeenCalled();
    const ledger = await state.db.select().from(creditLedger);
    expect(
      ledger
        .map((row: any) => row.amount)
        .reduce((a: number, b: number) => a + b, 0)
    ).toBe(0);
    await expect(
      owner.video.cancel({ organizationId: org, id: job.id })
    ).rejects.toThrow("no longer");
    expect(await state.db.select().from(creditLedger)).toHaveLength(2);
  });
  it("waits for provider confirmation before refunding cancellation", async () => {
    const job = await queued();
    await tick();
    state.submit.mockResolvedValue(accepted);
    await tick();
    await owner.video.cancel({ organizationId: org, id: job.id });
    state.poll.mockResolvedValueOnce(accepted);
    state.cancel.mockResolvedValue(null);
    await tick();
    expect(await state.db.select().from(creditLedger)).toHaveLength(1);
    state.poll.mockResolvedValueOnce({ ...accepted, status: "canceled" });
    await tick();
    expect(await state.db.select().from(creditLedger)).toHaveLength(2);
    expect(
      (await owner.video.get({ organizationId: org, id: job.id })).status
    ).toBe("canceled");
  });
  it("retains provider failure reasons and can recover older reasons without another generation or refund", async () => {
    const job = await queued();
    await tick();
    state.submit.mockResolvedValue({
      ...accepted,
      status: "failed",
      error: "Unsupported reference dimensions",
    });
    await tick();
    expect(
      (await owner.video.get({ organizationId: org, id: job.id })).error
    ).toContain("Unsupported reference dimensions");
    const ledger = await state.db.select().from(creditLedger);
    expect(ledger.reduce((sum: number, row: any) => sum + row.amount, 0)).toBe(
      0
    );
    await state.db
      .update(videoJobs)
      .set({
        error:
          "The provider could not generate this video. AI credits refunded.",
        nextPollAtMs: 0,
      })
      .where(eq(videoJobs.id, job.id));
    state.poll.mockResolvedValue({
      ...accepted,
      status: "failed",
      error: "Unsupported reference dimensions",
    });
    await refreshFailedVideoDiagnostic(state.db);
    await refreshFailedVideoDiagnostic(state.db);
    expect(state.poll).toHaveBeenCalledTimes(1);
    expect(state.submit).toHaveBeenCalledTimes(1);
    expect(await state.db.select().from(creditLedger)).toEqual(ledger);
    const saved = await owner.video.get({ organizationId: org, id: job.id });
    expect(saved.status).toBe("failed");
    expect(saved.error).toContain("Unsupported reference dimensions");
  });
  it("keeps a completed provider charge when storage fails, and retries saving without another generation", async () => {
    const job = await queued();
    await tick();
    state.submit.mockResolvedValue({
      ...accepted,
      status: "completed",
      video: { url: "https://cdn.example.test/result.mp4" },
    });
    await tick();
    state.upload
      .mockResolvedValueOnce({ error: { message: "Storage down" } })
      .mockResolvedValueOnce({ error: null });
    await tick();
    expect((await state.db.select().from(aiUsage))[0].status).toBe("succeeded");
    expect(await state.db.select().from(creditLedger)).toHaveLength(1);
    await tick();
    expect(
      (await owner.video.get({ organizationId: org, id: job.id })).status
    ).toBe("completed");
    expect(state.submit).toHaveBeenCalledTimes(1);
    expect(state.upload.mock.calls[0][0]).toBe(state.upload.mock.calls[1][0]);
  });
  it("recovers an expired worker lease and refunds a confirmed moderation rejection", async () => {
    const job = await queued();
    await state.db
      .update(videoJobs)
      .set({ leaseOwner: "old-worker", leaseUntilMs: Date.now() - 1 });
    await tick();
    state.submit.mockResolvedValue({ ...accepted, status: "nsfw" });
    await tick();
    expect(
      (await owner.video.get({ organizationId: org, id: job.id })).status
    ).toBe("failed");
    expect((await state.db.select().from(aiUsage))[0].costMicros).toBe(0);
    expect(await state.db.select().from(creditLedger)).toHaveLength(2);
  });
  it("validates source video timing and does not send hidden settings to edit/motion endpoints", async () => {
    const edit = {
      ...setup(),
      mode: "edit" as const,
      sourceVideoKey: `asset:${videoId}`,
    };
    expect(
      (await owner.video.quote({ organizationId: org, setup: edit })).credits
    ).toBe(555);
    const request = videoRequestBody(
      edit,
      ["https://reference.test/a.png"],
      "https://reference.test/a.mp4"
    );
    expect(request).not.toHaveProperty("duration");
    expect(request).not.toHaveProperty("aspect_ratio");
    const motion = { ...edit, mode: "motion" as const };
    expect(videoRequestBody(motion, ["image"], "video")).not.toHaveProperty(
      "generate_audio"
    );
    expect(videoRequestBody(motion, ["image"], "video")).not.toHaveProperty(
      "bitrate_mode"
    );
    expect(videoSetupProblem({ ...motion, imageKeys: [] })).toContain("1–8");
    await expect(
      owner.video.quote({
        organizationId: org,
        setup: { ...edit, sourceVideoKey: `asset:${imageId}` },
      })
    ).rejects.toThrow("MP4");
  });
});

it("bounds MP4 parsing and estimates video-specific units without recording fake LLM tokens", () => {
  expect(mp4Info(sampleMp4())).toEqual({
    durationSeconds: 5,
    width: 1280,
    height: 720,
  });
  expect(() => mp4Info(Buffer.from("not a video"))).toThrow("MP4");
  const invalid = sampleMp4();
  invalid.writeUInt32BE(0xffffffff, 0);
  expect(() => mp4Info(invalid)).toThrow("container");
  const rate = defaultVideoRates.find(
    rate => rate.model === "seedance-2.5/720p"
  )!;
  expect(
    videoQuote(
      { ...defaultVideoSetup, mode: "edit", sourceVideoKey: "asset:1" },
      [
        {
          key: "asset:1",
          name: "Video",
          storageKey: "v.mp4",
          fingerprint: "x",
          mimeType: "video/mp4",
          durationSeconds: 5,
          width: 1280,
          height: 720,
        },
      ],
      rate
    ).costMicros
  ).toBe(2773440);
});
it("never forwards provider credentials to an arbitrary request URL", () => {
  expect(() =>
    requestUrl(
      `https://evil.example/requests/${providerId}/status`,
      providerId,
      "status"
    )
  ).toThrow("Invalid");
  expect(() =>
    requestUrl(
      `https://api.higgsfield.ai/requests/${providerId}/status?redirect=evil`,
      providerId,
      "status"
    )
  ).toThrow("Invalid");
  expect(() =>
    requestUrl(
      `https://api.higgsfield.ai@evil.example/requests/${providerId}/status`,
      providerId,
      "status"
    )
  ).toThrow("Invalid");
});
