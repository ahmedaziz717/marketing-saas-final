import { processNextBuilderJob } from "./jobs/creativeWorker";
import { randomUUID, createHash } from "node:crypto";
import sharp from "sharp";
import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const provider = vi.hoisted(() => ({
  calls: 0,
  failAt: 0,
  bytes: "",
  requests: [] as any[],
  storage: new Map<string, Buffer>(),
}));
vi.mock("./_core/llm", () => ({
  listLLMModels: async () => ({ data: [{ id: "gpt-5.5" }] }),
  invokeLLM: async () => ({
    choices: [
      {
        message: {
          content: JSON.stringify({
            headline: "Light your space",
            subheadline: "Made with aluminum",
            cta: "Explore",
          }),
        },
      },
    ],
  }),
}));
vi.mock("./lib/openaiSunburst", () => ({
  generateSunburstImage: async (input: any) => {
    provider.calls++;
    provider.requests.push(input);
    if (provider.calls === provider.failAt) throw new Error("Provider timeout");
    return {
      url: "/manus-storage/test/output-" + provider.calls + ".png",
      storageKey: "test/output-" + provider.calls + ".png",
    };
  },
}));
vi.mock("./storage", async original => ({
  ...(await original<typeof import("./storage")>()),
  storageGetBase64: async (key: string) =>
    provider.storage.get(key)?.toString("base64") ?? provider.bytes,
  storagePut: async (key: string, bytes: Buffer) => {
    provider.storage.set(key, bytes);
    return { key, url: "/media/" + key };
  },
}));

import {
  activityEvents,
  brandAssets,
  brandKits,
  campaignBriefs,
  creativeJobs,
  creativeVariants,
  organizationMemberships,
  organizations,
  productImages,
  products,
  users,
} from "../drizzle/schema";
import {
  applyCreativeTheme,
  defaultCreativeSetup,
} from "../shared/creativeBuilder";
import { getDb } from "./db";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";
import { readLibraryAsset } from "./lib/assetLibrary";

const suffix = randomUUID();
let organizationId = 0,
  userId = 0,
  productId = 0,
  imageId = 0,
  logoAssetId = 0;
let caller: ReturnType<typeof appRouter.createCaller>;
const database = async () => {
  const db = await getDb();
  if (!db) throw new Error("Use an isolated integration database");
  return db;
};
const setup = () => ({
  ...defaultCreativeSetup(),
  categoryHandling: "neutral" as const,
  products: [
    { productId, imageId, featuredSpecKeys: ["Power"], includePrice: true },
  ],
  logoAssetId,
});

beforeAll(async () => {
  const db = await database();
  const now = Date.now();
  provider.bytes = (
    await sharp({
      create: { width: 32, height: 32, channels: 4, background: "white" },
    })
      .png()
      .toBuffer()
  ).toString("base64");
  userId = Number(
    (
      await db
        .insert(users)
        .values({
          openId: "builder-" + suffix,
          name: "Builder integration",
          email: "builder@example.test",
          loginMethod: "test",
        })
        .returning({ insertId: users.id })
    )[0].insertId
  );
  organizationId = Number(
    (
      await db
        .insert(organizations)
        .values({
          name: "Builder integration",
          slug: "builder-" + suffix,
          createdByUserId: userId,
          createdAtMs: now,
        })
        .returning({ insertId: organizations.id })
    )[0].insertId
  );
  await db
    .insert(organizationMemberships)
    .values({
      userId,
      organizationId,
      role: "owner",
      status: "active",
      createdAtMs: now,
    })
    .returning({ insertId: organizationMemberships.id });
  const kitId = Number(
    (
      await db
        .insert(brandKits)
        .values({
          organizationId,
          name: "Studio",
          colors: ["#ffffff"],
          fonts: ["Inter"],
          voice: "Clear",
          requiredClaims: "",
          prohibitedContent: "",
          status: "active",
          updatedByUserId: userId,
          updatedAtMs: now,
        })
        .returning({ insertId: brandKits.id })
    )[0].insertId
  );
  logoAssetId = Number(
    (
      await db
        .insert(brandAssets)
        .values({
          organizationId,
          brandKitId: kitId,
          name: "Studio mark",
          type: "logo",
          storageKey: "test/logo.png",
          url: "/manus-storage/test/logo.png",
          mimeType: "image/png",
          status: "approved",
          uploadedByUserId: userId,
          createdAtMs: now,
        })
        .returning({ insertId: brandAssets.id })
    )[0].insertId
  );
  productId = Number(
    (
      await db
        .insert(products)
        .values({
          organizationId,
          name: "Studio lamp",
          dedupeKey: "lamp-" + suffix,
          productUrl: "https://example.test/products/studio-lamp",
          price: "89.00",
          currency: "USD",
          specifications: { Power: "12 W", Material: "Aluminum" },
          provenance: {},
          status: "approved",
          createdAtMs: now,
          updatedAtMs: now,
        })
        .returning({ insertId: products.id })
    )[0].insertId
  );
  imageId = Number(
    (
      await db
        .insert(productImages)
        .values({
          organizationId,
          productId,
          sourceUrl: "https://example.test/lamp.png",
          storageKey: "test/lamp.png",
          url: "/manus-storage/test/lamp.png",
          createdAtMs: now,
        })
        .returning({ insertId: productImages.id })
    )[0].insertId
  );
  const user = (
    await db.select().from(users).where(eq(users.id, userId)).limit(1)
  )[0];
  caller = appRouter.createCaller({ user, req: {}, res: {} } as TrpcContext);
});

afterAll(async () => {
  if (!organizationId) return;
  const db = await database();
  for (const table of [
    activityEvents,
    creativeVariants,
    creativeJobs,
    campaignBriefs,
    productImages,
    products,
    brandAssets,
    brandKits,
    organizationMemberships,
  ])
    await db.delete(table).where(eq(table.organizationId, organizationId));
  await db.delete(organizations).where(eq(organizations.id, organizationId));
  await db.delete(users).where(eq(users.id, userId));
});

describe.sequential("persistent creative builder", () => {
  it("round-trips setup fields and rejects stale edits", async () => {
    const draft = setup();
    draft.theme = "cyber-monday";
    draft.basePrompt =
      "Create a premium product-led commerce composition with clear hierarchy and generous safe space.";
    draft.themePrompt =
      "Use electric cyan data light, restrained violet depth, and a polished digital retail-event atmosphere.";
    draft.mood = "premium";
    draft.artStyle = "editorial";
    draft.shot = "lifestyle";
    draft.extraDirection = "Warm evening light";
    const saved = await caller.creativeBuilder.save({
      organizationId,
      setup: draft,
    });
    const loaded = (
      await caller.creativeBuilder.options({ organizationId })
    ).drafts.find(item => item.id === saved.briefId);
    expect(loaded?.setup).toEqual(draft);
    expect(loaded?.setup).toMatchObject({
      theme: "cyber-monday",
      basePrompt: draft.basePrompt,
      themePrompt: draft.themePrompt,
      mood: "premium",
      artStyle: "editorial",
      shot: "lifestyle",
    });
    const db = await database();
    const persisted = await db
      .select({ creativeDirection: campaignBriefs.creativeDirection })
      .from(campaignBriefs)
      .where(eq(campaignBriefs.id, saved.briefId))
      .limit(1);
    expect(persisted[0]?.creativeDirection).toContain("Mood: Premium");
    expect(persisted[0]?.creativeDirection).toContain("Art style: Editorial");
    await expect(
      caller.creativeBuilder.save({
        organizationId,
        setup: draft,
        briefId: saved.briefId,
        expectedUpdatedAtMs: saved.updatedAtMs - 1,
      })
    ).rejects.toThrow(/another session/);
  });

  it("rejects other companies and reader roles at the server", async () => {
    await expect(
      caller.creativeBuilder.options({
        organizationId: organizationId + 999_999,
      })
    ).rejects.toThrow(/access/);
    const db = await database();
    await db
      .update(organizationMemberships)
      .set({ role: "reviewer" })
      .where(
        and(
          eq(organizationMemberships.organizationId, organizationId),
          eq(organizationMemberships.userId, userId)
        )
      );
    await expect(
      caller.creativeBuilder.save({ organizationId, setup: setup() })
    ).rejects.toThrow(/role/);
    await db
      .update(organizationMemberships)
      .set({ role: "owner" })
      .where(
        and(
          eq(organizationMemberships.organizationId, organizationId),
          eq(organizationMemberships.userId, userId)
        )
      );
  });

  it("preserves a single audit chain across simultaneous setup saves", async () => {
    const saved = await Promise.all(
      Array.from({ length: 6 }, (_, index) =>
        caller.creativeBuilder.save({
          organizationId,
          setup: { ...setup(), name: "Concurrent setup " + index },
        })
      )
    );
    expect(new Set(saved.map(item => item.briefId)).size).toBe(6);
    expect((await caller.activity.list({ organizationId })).verified).toBe(
      true
    );
  });

  it("starts asynchronously, persists pending results, deduplicates retries and provides an authenticated download", async () => {
    const generationSetup = applyCreativeTheme(
      { ...setup(), mood: "dark", artStyle: "animation" },
      "holiday"
    );
    const saved = await caller.creativeBuilder.save({
      organizationId,
      setup: generationSetup,
    });
    const quote = await caller.creativeBuilder.quote({
      organizationId,
      setup: generationSetup,
    });
    const request = {
      organizationId,
      quotedCredits: quote.credits,
      briefId: saved.briefId,
      expectedUpdatedAtMs: saved.updatedAtMs,
      requestId: randomUUID(),
    };
    const started = await caller.creativeBuilder.generate(request);
    expect(started.status).toBe("queued");
    await processNextBuilderJob(await database());
    await vi.waitFor(
      async () => {
        const state = await caller.creatives.overview({ organizationId });
        expect(state.jobs.find(job => job.id === started.jobId)?.status).toBe(
          "completed"
        );
      },
      { timeout: 10_000, interval: 30 }
    );
    const state = await caller.creatives.overview({ organizationId });
    const persistedJob = state.jobs.find(job => job.id === started.jobId);
    expect(persistedJob?.briefSnapshot.setup).toMatchObject({
      theme: "holiday",
      mood: "dark",
      artStyle: "animation",
      themePrompt: generationSetup.themePrompt,
      copy: generationSetup.copy,
    });
    const variants = state.variants.filter(
      item => item.jobId === started.jobId
    );
    expect(variants).toHaveLength(3);
    expect(
      variants.every(
        item =>
          item.status === "pending" &&
          item.renderMetadata?.productIds[0] === productId &&
          item.renderMetadata?.mood === "dark" &&
          item.renderMetadata?.artStyle === "animation"
      )
    ).toBe(true);
    const calls = provider.calls;
    expect(await caller.creativeBuilder.generate(request)).toMatchObject({
      jobId: started.jobId,
      status: "completed",
    });
    expect(provider.calls).toBe(calls);
    expect(
      await caller.creatives.download({
        organizationId,
        variantId: variants[0].id,
      })
    ).toMatchObject({ mimeType: "image/png", base64: provider.bytes });
    const events = await caller.activity.list({ organizationId });
    expect(events.verified).toBe(true);
    expect(JSON.stringify(events.events)).not.toContain("OPENAI_API_KEY");
  });

  it("enhances a workspace draft as a linked new version and blocks stale sources before generation", async () => {
    const db = await database();
    const [source] = await db
      .select()
      .from(creativeVariants)
      .where(eq(creativeVariants.organizationId, organizationId))
      .limit(1);
    const key = `creative:${source.id}` as const;
    const asset = await readLibraryAsset(db, organizationId, key);
    const input = { organizationId, key, revision: asset.revision };
    await expect(
      caller.creativeBuilder.enhancementSetup({
        ...input,
        organizationId: organizationId + 999999,
      })
    ).rejects.toThrow(/access/);
    await expect(
      caller.creativeBuilder.enhancementSetup({
        ...input,
        revision: "f".repeat(64),
      })
    ).rejects.toThrow(/changed/);
    const prepared = await caller.creativeBuilder.enhancementSetup(input);
    expect(prepared.setup.enhancement).toMatchObject({
      assetKey: key,
      revision: asset.revision,
    });
    expect(prepared.setup.copy).toEqual(source.renderMetadata?.copy);
    expect(prepared.setup.formatIds).toEqual([source.format]);
    const saved = await caller.creativeBuilder.save({
      organizationId,
      setup: prepared.setup,
    });
    const quote = await caller.creativeBuilder.quote({
      organizationId,
      setup: prepared.setup,
    });
    const started = await caller.creativeBuilder.generate({
      organizationId,
      briefId: saved.briefId,
      expectedUpdatedAtMs: saved.updatedAtMs,
      requestId: randomUUID(),
      quotedCredits: quote.credits,
    });
    const calls = provider.calls;
    await processNextBuilderJob(db);
    const job = await caller.creativeBuilder.studioJob({
      organizationId,
      jobId: started.jobId,
    });
    expect(job.status).toBe("completed");
    expect(provider.calls).toBe(calls + 1);
    expect(provider.requests.at(-1).prompt).toContain(
      prepared.setup.enhancement!.instruction
    );
    const enhanced = await readLibraryAsset(
      db,
      organizationId,
      `creative:${job.variants[0].id}`
    );
    expect(enhanced).toMatchObject({ state: "draft", parentKey: key });
    expect((await readLibraryAsset(db, organizationId, key)).revision).toBe(
      asset.revision
    );
    const retry = await caller.creativeBuilder.generate({
      organizationId,
      briefId: saved.briefId,
      expectedUpdatedAtMs: saved.updatedAtMs,
      requestId: randomUUID(),
      quotedCredits: quote.credits,
    });
    await db
      .update(creativeVariants)
      .set({ name: "Changed after queueing" })
      .where(eq(creativeVariants.id, source.id));
    const before = provider.calls;
    await processNextBuilderJob(db);
    expect(
      (
        await caller.creativeBuilder.studioJob({
          organizationId,
          jobId: retry.jobId,
        })
      ).status
    ).toBe("failed");
    expect(provider.calls).toBe(before);
  });

  it("saves failure without partial results and allows a new attempt", async () => {
    const saved = await caller.creativeBuilder.save({
      organizationId,
      setup: setup(),
    });
    provider.failAt = provider.calls + 2;
    const quote = await caller.creativeBuilder.quote({
      organizationId,
      setup: setup(),
    });
    const started = await caller.creativeBuilder.generate({
      organizationId,
      quotedCredits: quote.credits,
      briefId: saved.briefId,
      expectedUpdatedAtMs: saved.updatedAtMs,
      requestId: randomUUID(),
    });
    await processNextBuilderJob(await database());
    await vi.waitFor(
      async () => {
        const state = await caller.creatives.overview({ organizationId });
        expect(state.jobs.find(job => job.id === started.jobId)?.status).toBe(
          "failed"
        );
        expect(
          state.variants.filter(item => item.jobId === started.jobId)
        ).toEqual([]);
      },
      { timeout: 10_000, interval: 30 }
    );
    provider.failAt = 0;
    const retryQuote = await caller.creativeBuilder.quote({
      organizationId,
      setup: setup(),
    });
    const retry = await caller.creativeBuilder.generate({
      organizationId,
      quotedCredits: retryQuote.credits,
      briefId: saved.briefId,
      expectedUpdatedAtMs: saved.updatedAtMs,
      requestId: randomUUID(),
    });
    expect(retry.jobId).not.toBe(started.jobId);
    await processNextBuilderJob(await database());
    await vi.waitFor(
      async () =>
        expect(
          (await caller.creatives.overview({ organizationId })).jobs.find(
            job => job.id === retry.jobId
          )?.status
        ).toBe("completed"),
      { timeout: 10_000, interval: 30 }
    );
  });
});

it("recovers a sharp same-product source into a separate version without providers and rejects stale or revoked access", async () => {
  const db = await database();
  const [template] = await db
    .select()
    .from(creativeVariants)
    .where(eq(creativeVariants.organizationId, organizationId))
    .limit(1);
  const cutout = async (width: number) =>
    sharp({
      create: { width, height: width * 2, channels: 4, background: "red" },
    })
      .extend({
        left: 2,
        right: 2,
        top: 2,
        bottom: 2,
        background: { r: 0, g: 0, b: 0, alpha: 0 },
      })
      .png()
      .toBuffer();
  const old = await cutout(20),
    larger = await cutout(80);
  const background = await sharp({
    create: { width: 200, height: 200, channels: 4, background: "blue" },
  })
    .png()
    .toBuffer();
  provider.storage.set("recovery-old", old);
  provider.storage.set("recovery-large", larger);
  provider.storage.set("recovery-design", background);
  const { id: _id, ...base } = template;
  const [source] = await db
    .insert(creativeVariants)
    .values({
      ...base,
      name: "Recovery fixture",
      renderMetadata: {
        ...template.renderMetadata!,
        width: 200,
        height: 200,
        productIds: [productId],
        productPreservation: {
          method: "editable_original_v3",
          applied: false,
          alignment: "needs_adjustment",
          automaticFailure: "source_resolution",
          designStorageKey: "recovery-design",
          designUrl: "/recovery-design",
          layers: [
            {
              sourceKey: "recovery-old",
              sha256: createHash("sha256").update(old).digest("hex"),
              width: 60,
              height: 120,
              left: 50,
              top: 40,
            },
          ],
        },
      },
    })
    .returning();
  const [image] = await db
    .insert(productImages)
    .values({
      organizationId,
      productId,
      sourceUrl: "https://example.test/same-view-large.png",
      storageKey: "recovery-large",
      url: "/recovery-large",
      createdAtMs: Date.now(),
    })
    .returning();
  // A catalog creative without preservation can be adjusted after generation.
  const [withoutOverlay] = await db
    .insert(creativeVariants)
    .values({
      ...base,
      name: "Catalog image without original layer",
      status: "approved",
      imageStorageKey: "recovery-design",
      imageUrl: "/recovery-design",
      renderMetadata: {
        ...template.renderMetadata!,
        productPreservation: undefined,
        width: 200,
        height: 200,
        productIds: [productId],
        requestedSetup: {
          ...setup(),
          preserveProduct: undefined,
          products: [
            {
              productId,
              imageId: image.id,
              featuredSpecKeys: [],
              includePrice: false,
            },
          ],
        },
      },
    })
    .returning();
  const originalAsset = await readLibraryAsset(
    db,
    organizationId,
    `creative:${withoutOverlay.id}`
  );
  expect(originalAsset).toMatchObject({
    hasProductOverlay: false,
    canAdjustOriginalProduct: true,
    state: "approved",
  });
  const originalCalls = provider.calls;
  const initialOverlay = await caller.creativeBuilder.productOverlay({
    organizationId,
    variantId: withoutOverlay.id,
  });
  expect(initialOverlay).toMatchObject({
    applied: false,
    alignment: "needs_adjustment",
    layers: [{ productId }],
  });
  const initialRequest = {
    organizationId,
    variantId: withoutOverlay.id,
    revision: initialOverlay.revision,
    layers: [{ left: 50, top: 40, width: 60, height: 120 }],
  };
  const adjusted =
    await caller.creativeBuilder.saveProductOverlay(initialRequest);
  expect(
    await readLibraryAsset(db, organizationId, adjusted.key)
  ).toMatchObject({
    parentKey: originalAsset.key,
    hasProductOverlay: true,
    state: "draft",
  });
  expect(
    await readLibraryAsset(db, organizationId, originalAsset.key)
  ).toMatchObject({
    revision: originalAsset.revision,
    hasProductOverlay: false,
    state: "approved",
  });
  expect(provider.calls).toBe(originalCalls);
  provider.storage.set("recovery-large", await cutout(81));
  await expect(
    caller.creativeBuilder.saveProductOverlay(initialRequest)
  ).rejects.toMatchObject({ code: "CONFLICT" });
  provider.storage.set("recovery-large", larger);
  const preview = await caller.creativeBuilder.productOverlay({
    organizationId,
    variantId: source.id,
  });
  const candidate = preview.replacementSources.find(
    item => item.key === `catalog-image:${image.id}`
  )!;
  const replacements = [
    {
      index: 0,
      key: candidate.key,
      revision: candidate.revision,
      sameViewConfirmed: true as const,
    },
  ];
  const calls = provider.calls;
  const recovery = await caller.creativeBuilder.productOverlay({
    organizationId,
    variantId: source.id,
    replacements,
  });
  expect(recovery.layers[0]).toMatchObject({
    sourceWidth: 80,
    sourceHeight: 160,
    width: 60,
    left: 50,
    top: 40,
  });
  const request = {
    organizationId,
    variantId: source.id,
    revision: preview.revision,
    replacements,
    layers: [{ width: 60, left: 50, top: 40 }],
  };
  await expect(
    caller.creativeBuilder.saveProductOverlay({
      ...request,
      revision: "f".repeat(64),
    })
  ).rejects.toMatchObject({ code: "CONFLICT" });
  const saved = await caller.creativeBuilder.saveProductOverlay(request);
  expect(saved.id).not.toBe(source.id);
  expect(await readLibraryAsset(db, organizationId, saved.key)).toMatchObject({
    parentKey: `creative:${source.id}`,
    state: "draft",
  });
  expect(
    (await readLibraryAsset(db, organizationId, `creative:${source.id}`))
      .revision
  ).toBe(preview.revision);
  const [result] = await db
    .select()
    .from(creativeVariants)
    .where(eq(creativeVariants.id, saved.id));
  expect(result.renderMetadata?.productPreservation?.layers[0].sourceKey).toBe(
    "recovery-large"
  );
  const pixel = await sharp(provider.storage.get(result.imageStorageKey!)!)
    .extract({ left: 0, top: 0, width: 1, height: 1 })
    .removeAlpha()
    .raw()
    .toBuffer();
  expect([...pixel]).toEqual([0, 0, 255]);
  expect(provider.calls).toBe(calls);
  await db
    .update(productImages)
    .set({ storageKey: "changed-source" })
    .where(eq(productImages.id, image.id));
  await expect(
    caller.creativeBuilder.saveProductOverlay(request)
  ).rejects.toMatchObject({ code: "CONFLICT" });
  await expect(
    caller.creativeBuilder.productOverlay({
      organizationId: organizationId + 999999,
      variantId: source.id,
    })
  ).rejects.toThrow(/access/);
  await db
    .update(organizationMemberships)
    .set({ status: "suspended" })
    .where(eq(organizationMemberships.organizationId, organizationId));
  try {
    await expect(
      caller.creativeBuilder.productOverlay({
        organizationId,
        variantId: source.id,
      })
    ).rejects.toThrow(/access/);
  } finally {
    await db
      .update(organizationMemberships)
      .set({ status: "active" })
      .where(eq(organizationMemberships.organizationId, organizationId));
  }
});

it("persists person choices and rejects unapproved or cross-workspace person assets", async () => {
  const db = await database();
  const { loadInputs } = await import("./routers/creativeBuilder");
  const draft = {
    ...setup(),
    shot: "female" as const,
    person: { kind: "library" as const, id: "female-auburn-4" },
    personHair: "auburn" as const,
  };
  const saved = await caller.creativeBuilder.save({
    organizationId,
    setup: draft,
  });
  expect(
    (await caller.creativeBuilder.options({ organizationId })).drafts.find(
      d => d.id === saved.briefId
    )?.setup.person
  ).toEqual(draft.person);
  const kit = (
    await db
      .select()
      .from(brandKits)
      .where(eq(brandKits.organizationId, organizationId))
      .limit(1)
  )[0];
  const otherOrg = (
    await db
      .insert(organizations)
      .values({
        name: "Other person tenant",
        slug: `person-${suffix}`,
        createdByUserId: userId,
        createdAtMs: Date.now(),
      })
      .returning()
  )[0];
  const asset = (
    await db
      .insert(brandAssets)
      .values({
        organizationId,
        brandKitId: kit.id,
        name: "Uploaded person",
        type: "reference",
        storageKey: "test/person.png",
        url: "/test/person.png",
        mimeType: "image/png",
        status: "pending",
        metadata: { kind: "lifestyle_person", gender: "female" },
        uploadedByUserId: userId,
        createdAtMs: Date.now(),
      })
      .returning()
  )[0];
  const assetSetup = {
    ...draft,
    person: { kind: "asset" as const, assetId: asset.id },
  };
  try {
    await expect(
      loadInputs(db, organizationId, assetSetup)
    ).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
    await db
      .update(brandAssets)
      .set({ status: "approved" })
      .where(eq(brandAssets.id, asset.id));
    expect(
      (await loadInputs(db, organizationId, assetSetup)).personAsset?.id
    ).toBe(asset.id);
    await db
      .update(brandAssets)
      .set({ organizationId: otherOrg.id })
      .where(eq(brandAssets.id, asset.id));
    await expect(
      loadInputs(db, organizationId, assetSetup)
    ).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
  } finally {
    await db.delete(brandAssets).where(eq(brandAssets.id, asset.id));
    await db.delete(organizations).where(eq(organizations.id, otherOrg.id));
  }
});

it("creates a draft image from a pending product without category, price, URL, description or specs", async () => {
  const db = await database();
  const [pending] = await db
    .insert(products)
    .values({
      organizationId,
      name: "Incomplete imported product",
      status: "pending",
      dedupeKey: "incomplete-" + suffix,
      productUrl: "",
      provenance: {},
      createdAtMs: Date.now(),
      specifications: {},
      updatedAtMs: Date.now(),
    })
    .returning();
  const [photo] = await db
    .insert(productImages)
    .values({
      organizationId,
      productId: pending.id,
      storageKey: "test/incomplete.png",
      url: "/manus-storage/test/incomplete.png",
      isPrimary: 1,
      sourceUrl: "https://example.test/incomplete.png",
      createdAtMs: Date.now(),
    })
    .returning();
  const input = {
    ...defaultCreativeSetup(),
    products: [
      {
        productId: pending.id,
        imageId: photo.id,
        featuredSpecKeys: [],
        includePrice: false,
      },
    ],
    formatIds: [defaultCreativeSetup().formatIds[0]],
    copy: { headline: "Explore the design", subheadline: "", cta: "Explore" },
  };
  // Discovery, copy and quote must all work without manually opting into neutral wording.
  const options = await caller.creativeBuilder.options({ organizationId });
  expect(options.products.find(p => p.id === pending.id)?.status).toBe(
    "pending"
  );
  await expect(
    caller.creativeBuilder.refreshCopy({ organizationId, setup: input })
  ).resolves.toHaveProperty("headline");
  const quote = await caller.creativeBuilder.quote({
    organizationId,
    setup: input,
  });
  const saved = await caller.creativeBuilder.save({
    organizationId,
    setup: input,
  });
  const started = await caller.creativeBuilder.generate({
    organizationId,
    briefId: saved.briefId,
    expectedUpdatedAtMs: saved.updatedAtMs,
    requestId: randomUUID(),
    quotedCredits: quote.credits,
  });
  await processNextBuilderJob(db);
  await vi.waitFor(
    async () => {
      const overview = await caller.creatives.overview({ organizationId });
      expect(overview.jobs.find(job => job.id === started.jobId)?.status).toBe(
        "completed"
      );
      expect(
        overview.variants
          .filter(item => item.jobId === started.jobId)
          .map(item => item.status)
      ).toEqual(["pending"]);
    },
    { timeout: 10000 }
  );
  const [unchanged] = await db
    .select()
    .from(products)
    .where(eq(products.id, pending.id));
  expect(unchanged.status).toBe("pending");
  expect(unchanged.category).toBeNull();
});
