import { randomUUID } from "node:crypto";
import sharp from "sharp";
import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const provider = vi.hoisted(() => ({ calls: 0, failAt: 0, bytes: "" }));
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
vi.mock("./_core/imageGeneration", () => ({
  listImageModels: async () => ({
    models: [{ id: "gpt-image-2.5-sunburst", model: "test-image-service" }],
  }),
  generateImage: async () => {
    provider.calls++;
    if (provider.calls === provider.failAt) throw new Error("Provider timeout");
    return {
      url: "/manus-storage/test/output-" + provider.calls + ".png",
      storageKey: "test/output-" + provider.calls + ".png",
    };
  },
}));
vi.mock("./storage", async original => ({
  ...(await original<typeof import("./storage")>()),
  storageGetBase64: async () => provider.bytes,
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
import { defaultCreativeSetup } from "../shared/creativeBuilder";
import { getDb } from "./db";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

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
      await db.insert(users).values({
        openId: "builder-" + suffix,
        name: "Builder integration",
        email: "builder@example.test",
        loginMethod: "test",
      })
    )[0].insertId
  );
  organizationId = Number(
    (
      await db.insert(organizations).values({
        name: "Builder integration",
        slug: "builder-" + suffix,
        createdByUserId: userId,
        createdAtMs: now,
      })
    )[0].insertId
  );
  await db.insert(organizationMemberships).values({
    userId,
    organizationId,
    role: "owner",
    status: "active",
    createdAtMs: now,
  });
  const kitId = Number(
    (
      await db.insert(brandKits).values({
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
    )[0].insertId
  );
  logoAssetId = Number(
    (
      await db.insert(brandAssets).values({
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
    )[0].insertId
  );
  productId = Number(
    (
      await db.insert(products).values({
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
    )[0].insertId
  );
  imageId = Number(
    (
      await db.insert(productImages).values({
        organizationId,
        productId,
        sourceUrl: "https://example.test/lamp.png",
        storageKey: "test/lamp.png",
        url: "/manus-storage/test/lamp.png",
        createdAtMs: now,
      })
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
    draft.extraDirection = "Warm evening light";
    const saved = await caller.creativeBuilder.save({
      organizationId,
      setup: draft,
    });
    const loaded = (
      await caller.creativeBuilder.options({ organizationId })
    ).drafts.find(item => item.id === saved.briefId);
    expect(loaded?.setup).toEqual(draft);
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
    const saved = await caller.creativeBuilder.save({
      organizationId,
      setup: setup(),
    });
    const request = {
      organizationId,
      briefId: saved.briefId,
      expectedUpdatedAtMs: saved.updatedAtMs,
      requestId: randomUUID(),
    };
    const started = await caller.creativeBuilder.generate(request);
    expect(started.status).toBe("running");
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
    const variants = state.variants.filter(
      item => item.jobId === started.jobId
    );
    expect(variants).toHaveLength(3);
    expect(
      variants.every(
        item =>
          item.status === "pending" &&
          item.renderMetadata?.productIds[0] === productId
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
    expect(JSON.stringify(events.events)).not.toContain("test-image-service");
  });

  it("saves failure without partial results and allows a new attempt", async () => {
    const saved = await caller.creativeBuilder.save({
      organizationId,
      setup: setup(),
    });
    provider.failAt = provider.calls + 2;
    const started = await caller.creativeBuilder.generate({
      organizationId,
      briefId: saved.briefId,
      expectedUpdatedAtMs: saved.updatedAtMs,
      requestId: randomUUID(),
    });
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
    const retry = await caller.creativeBuilder.generate({
      organizationId,
      briefId: saved.briefId,
      expectedUpdatedAtMs: saved.updatedAtMs,
      requestId: randomUUID(),
    });
    expect(retry.jobId).not.toBe(started.jobId);
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
