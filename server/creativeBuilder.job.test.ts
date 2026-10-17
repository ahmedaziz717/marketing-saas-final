vi.mock("./lib/lifestylePeople", () => ({
  readLifestylePortrait: async (id: string) => ({
    b64Json: "person:" + id,
    mimeType: "image/png",
  }),
}));
import { beforeEach, describe, expect, it, vi } from "vitest";
import sharp from "sharp";
import { defaultCreativeSetup } from "../shared/creativeBuilder";

const mocked = vi.hoisted(() => ({
  generate: vi.fn(),
  activity: vi.fn(async () => {}),
  renew: vi.fn(async () => {}),
  read: vi.fn(),
  put: vi.fn(),
}));
vi.mock("./storage", () => ({
  storageGetBase64: mocked.read,
  storagePut: mocked.put,
}));
vi.mock("./lib/openaiSunburst", () => ({
  generateSunburstImage: mocked.generate,
}));
vi.mock("./lib/creativeImages", () => ({
  readGenerationSource: async (key: string) => ({
    b64Json: key,
    mimeType: "image/png",
  }),
}));
vi.mock("./lib/activity", () => ({
  appendActivity: mocked.activity,
  withOrganizationTransaction: (
    db: any,
    _organizationId: number,
    operation: any
  ) => db.transaction(operation),
}));
vi.mock("./lib/creativeJobs", () => ({
  renewBuilderJob: mocked.renew,
  CREATIVE_JOB_LEASE_MS: 600_000,
  recoverExpiredBuilderJobs: vi.fn(),
}));
import { runBuilderJob } from "./routers/creativeBuilder";

function fixture() {
  const written: any[] = [];
  const updates: any[] = [];
  const db: any = {
    select: () => ({
      from: () => ({
        where: () => ({
          limit: () => ({ for: async () => [{ status: "running" }] }),
        }),
      }),
    }),
    insert: () => ({
      values: (rows: any) => ({
        returning: async () => {
          written.push(rows);
          return [{ insertId: 1 }];
        },
      }),
    }),
    update: () => ({
      set: (values: any) => ({
        where: () => {
          updates.push(values);
          const rows = [{ id: 1 }];
          return Object.assign(Promise.resolve(rows), {
            returning: async () => rows,
          });
        },
      }),
    }),
    transaction: async (callback: any) => callback(db),
  };
  const setup = {
    ...defaultCreativeSetup(),
    products: [
      {
        productId: 11,
        imageId: 21,
        featuredSpecKeys: ["Power"],
        includePrice: false,
      },
    ],
    logoAssetId: 31,
  };
  const args: any = {
    organizationId: 1,
    actorUserId: 2,
    briefId: 3,
    jobId: 4,
    setup,
    resolved: {
      brand: { name: "Studio", colors: ["#ffffff"], fonts: [], voice: "Clear" },
      logo: { storageKey: "logo.png" },
      products: [
        {
          id: 11,
          name: "Lamp",
          image: { storageKey: "lamp.png" },
          specifications: { Power: "12 W" },
          featuredSpecifications: { Power: "12 W" },
        },
      ],
    },
  };
  return { db, args, written, updates };
}

beforeEach(() => {
  vi.clearAllMocks();
  let image = 0;
  mocked.generate.mockImplementation(async () => ({
    url: "/generated-" + ++image + ".png",
    storageKey: "generated-" + image + ".png",
  }));
});

describe("creative generation orchestration", () => {
  it("keeps the frozen quote for each generated size and supports older jobs with one saved rate", async () => {
    const { db, args } = fixture();
    args.rateSnapshots = [11000, 22000, 33000].map(estimatedCostMicros => ({
      provider: "openai",
      model: "gpt-image-2.5-sunburst",
      kind: "image",
      estimatedCostMicros,
    }));
    args.rateSnapshot = { estimatedCostMicros: 200000 };
    await runBuilderJob(db, args);
    expect(
      mocked.generate.mock.calls.map(
        call => call[0].rateSnapshot.estimatedCostMicros
      )
    ).toEqual([11000, 22000, 33000]);
    mocked.generate.mockClear();
    delete args.rateSnapshots;
    await runBuilderJob(db, args);
    expect(
      mocked.generate.mock.calls.every(
        call => call[0].rateSnapshot === args.rateSnapshot
      )
    ).toBe(true);
  });
  it("references the first composition for the other sizes while retaining product and logo sources", async () => {
    const { db, args, written, updates } = fixture();
    await runBuilderJob(db, args);
    expect(mocked.generate).toHaveBeenCalledTimes(3);
    const requests = mocked.generate.mock.calls.map(call => call[0]);
    expect(requests[0]).toMatchObject({
      outputSize: { width: 1080, height: 1920 },
    });
    expect(
      requests[0].originalImages.map((source: any) => source.b64Json)
    ).toEqual(["lamp.png", "logo.png"]);
    expect(
      requests[1].originalImages.map((source: any) => source.b64Json)
    ).toEqual(["generated-1.png", "lamp.png", "logo.png"]);
    expect(requests[2].originalImages[0].b64Json).toBe("generated-1.png");
    expect(written.flat()).toHaveLength(3);
    expect(
      written
        .flat()
        .every(
          (variant: any) =>
            variant.status === "pending" && variant.organizationId === 1
        )
    ).toBe(true);
    expect(updates).toContainEqual(
      expect.objectContaining({ status: "completed", leaseExpiresAtMs: null })
    );
    expect(mocked.activity).toHaveBeenCalledWith(
      expect.objectContaining({ action: "creative_generation.completed" }),
      db
    );
  });

  it("records failure without saving a partial set if a later image fails", async () => {
    const { db, args, written, updates } = fixture();
    mocked.generate
      .mockResolvedValueOnce({ url: "/first.png", storageKey: "first.png" })
      .mockRejectedValueOnce(new Error("Provider timeout"));
    await runBuilderJob(db, args);
    expect(written).toEqual([]);
    expect(updates).toContainEqual(
      expect.objectContaining({ status: "failed", leaseExpiresAtMs: null })
    );
    expect(mocked.activity).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "creative_generation.failed",
        payload: { category: "timeout" },
      }),
      db
    );
  });

  it("does not reuse another product's composition or specification callouts in separate product sets", async () => {
    const { db, args } = fixture();
    args.setup.formatIds = ["square_1_1"];
    args.resolved.products.push({
      id: 12,
      name: "Shelf",
      image: { storageKey: "shelf.png" },
      specifications: { Material: "Oak" },
      featuredSpecifications: { Material: "Oak" },
    });
    await runBuilderJob(db, args);
    const second = mocked.generate.mock.calls[1][0];
    expect(second.originalImages.map((source: any) => source.b64Json)).toEqual([
      "shelf.png",
      "logo.png",
    ]);
    expect(second.prompt).toContain("Oak");
    expect(second.prompt).not.toContain("12 W");
  });
});

it("sends the selected person as the final image reference for master and every size", async () => {
  const { db, args } = fixture();
  args.setup.shot = "female";
  args.setup.person = { kind: "library", id: "female-brown-3" };
  await runBuilderJob(db, args);
  const requests = mocked.generate.mock.calls.map(call => call[0]);
  expect(requests).toHaveLength(3);
  for (const request of requests) {
    expect(request.originalImages.at(-1).b64Json).toBe("person:female-brown-3");
    expect(request.prompt).toContain(
      "LAST 1 reference image(s) are the selected people"
    );
    expect(
      request.originalImages.some((x: any) => x.b64Json === "lamp.png")
    ).toBe(true);
    expect(
      request.originalImages.some((x: any) => x.b64Json === "logo.png")
    ).toBe(true);
  }
});

it("generates directory promotions without product images and retains their references", async () => {
  const { db, args, written } = fixture();
  args.setup = {
    ...defaultCreativeSetup("directory"),
    promotion: {
      kind: "category",
      title: "Music lessons",
      description: "Discover independent music teachers.",
    },
    referenceAssetIds: [44],
  };
  args.resolved.products = [];
  args.resolved.references = [{ id: 44, storageKey: "learning-reference.png" }];
  await runBuilderJob(db, args);
  expect(mocked.generate).toHaveBeenCalledTimes(3);
  expect(mocked.generate.mock.calls[0][0].originalImages[0].b64Json).toBe(
    "learning-reference.png"
  );
  expect(mocked.generate.mock.calls[0][0].prompt).toContain("Music lessons");
  const variants = written.flat().filter((r: any) => r.name);
  expect(variants.some((r: any) => r.name.startsWith("Music lessons"))).toBe(
    true
  );
});

it("retains four ordered identities, including kids and uploaded references, in every size", async () => {
  const { db, args } = fixture();
  args.setup.shot = "multiple";
  args.setup.people = [
    { kind: "library", id: "girls-child-a-0" },
    { kind: "asset", assetId: 41 },
    { kind: "library", id: "male-brown-3" },
    { kind: "library", id: "boys-teen-2" },
  ];
  args.resolved.personAssets = [{ id: 41, storageKey: "uploaded-mother.png" }];
  await runBuilderJob(db, args);
  expect(mocked.generate).toHaveBeenCalledTimes(3);
  for (const [request] of mocked.generate.mock.calls) {
    expect(request.originalImages.slice(-4).map((x: any) => x.b64Json)).toEqual(
      [
        "person:girls-child-a-0",
        "uploaded-mother.png",
        "person:male-brown-3",
        "person:boys-teen-2",
      ]
    );
    expect(request.prompt).toContain("Include exactly these 4 people");
    expect(request.prompt).toContain(
      "Children and teens must retain age-appropriate appearance"
    );
  }
});

it("fails instead of silently omitting an unavailable selected identity", async () => {
  const { db, args, updates } = fixture();
  args.setup.shot = "multiple";
  args.setup.people = [{ kind: "asset", assetId: 999 }];
  await runBuilderJob(db, args);
  expect(mocked.generate).not.toHaveBeenCalled();
  expect(updates).toContainEqual(expect.objectContaining({ status: "failed" }));
});

it("adds original cutouts only after scene generation and excludes product, logo and campaign references in every size", async () => {
  const { db, args, written } = fixture();
  args.setup.preserveProduct = true;
  const product = await sharp({
    create: { width: 100, height: 60, channels: 4, background: "red" },
  })
    .extend({
      left: 4,
      right: 4,
      top: 4,
      bottom: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .png()
    .toBuffer();
  const storage = new Map<string, Buffer>([
    ["lamp.png", product],
    ["logo.png", product],
  ]);
  args.resolved.references = [
    { id: 50, storageKey: "campaign-with-product.png" },
  ];
  args.setup.people = [{ kind: "library", id: "adult-female-brown" }];
  mocked.read.mockImplementation(async (key: string) =>
    storage.get(key)!.toString("base64")
  );
  mocked.generate.mockImplementation(async (request: any) => {
    const key = `scene-${request.outputSize.width}x${request.outputSize.height}.png`;
    storage.set(
      key,
      await sharp({
        create: {
          width: request.outputSize.width,
          height: request.outputSize.height,
          channels: 4,
          background: "blue",
        },
      })
        .png()
        .toBuffer()
    );
    return { storageKey: key, url: "/" + key };
  });
  mocked.put.mockImplementation(async (key: string, bytes: Buffer) => {
    storage.set(key, bytes);
    return { key, url: "/" + key };
  });
  await runBuilderJob(db, args);
  expect(mocked.generate).toHaveBeenCalledTimes(3);
  expect(mocked.put).toHaveBeenCalledTimes(3);
  const variants = written.flat();
  for (const variant of variants) {
    expect(variant.imageStorageKey).toMatch(/-preserved.png$/);
    expect(variant.renderMetadata.productPreservation.method).toBe(
      "original_cutout_v2"
    );
    const layer = variant.renderMetadata.productPreservation.layers[0];
    const pixel = await sharp(storage.get(variant.imageStorageKey)!)
      .extract({
        left: layer.left + Math.floor(layer.width / 2),
        top: layer.top + Math.floor(layer.height / 2),
        width: 1,
        height: 1,
      })
      .removeAlpha()
      .raw()
      .toBuffer();
    expect([...pixel]).toEqual([255, 0, 0]);
  }
  for (const [request] of mocked.generate.mock.calls) {
    expect(request.prompt).toContain("BACKGROUND-ONLY PASS");
    expect(request.prompt).not.toContain("Catalog facts:");
    expect(request.prompt).not.toContain(args.setup.copy.headline);
    expect(request.originalImages.map((r: any) => r.b64Json)).toEqual([
      "person:adult-female-brown",
    ]);
  }
});

it("does not spend credits or return an AI redraw when a queued product image is not a cutout", async () => {
  const { db, args, written, updates } = fixture();
  args.setup.preserveProduct = true;
  mocked.read.mockResolvedValue(
    (
      await sharp({
        create: { width: 20, height: 20, channels: 3, background: "white" },
      })
        .png()
        .toBuffer()
    ).toString("base64")
  );
  await runBuilderJob(db, args);
  expect(mocked.generate).not.toHaveBeenCalled();
  expect(mocked.put).not.toHaveBeenCalled();
  expect(written).toEqual([]);
  expect(updates).toContainEqual(
    expect.objectContaining({
      status: "failed",
      errorMessage: expect.stringContaining("transparent PNG"),
    })
  );
});

it("checks all copy layouts before spending credits, including a later small output", async () => {
  const { db, args, written, updates } = fixture();
  args.setup.preserveProduct = true;
  args.setup.formatIds = ["square_1_1", "google_leaderboard"];
  args.setup.copy = {
    headline: "Long headline ".repeat(13),
    subheadline: "Detailed specification and product features ".repeat(9),
    cta: "View every available product configuration",
  };
  const png = await sharp({
    create: { width: 100, height: 100, channels: 4, background: "red" },
  })
    .extend({
      left: 3,
      right: 3,
      top: 3,
      bottom: 3,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .png()
    .toBuffer();
  mocked.read.mockResolvedValue(png.toString("base64"));
  await runBuilderJob(db, args);
  expect(mocked.generate).not.toHaveBeenCalled();
  expect(mocked.put).not.toHaveBeenCalled();
  expect(written).toEqual([]);
  expect(updates).toContainEqual(
    expect.objectContaining({
      status: "failed",
      errorMessage: expect.stringContaining("layout cannot"),
    })
  );
});
