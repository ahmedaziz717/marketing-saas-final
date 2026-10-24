vi.mock("./lib/lifestylePeople", () => ({
  readLifestylePortrait: async (id: string) => ({
    b64Json: "person:" + id,
    mimeType: "image/png",
  }),
}));
import { beforeEach, describe, expect, it, vi } from "vitest";
import sharp from "sharp";
import { defaultCreativeSetup } from "../shared/creativeBuilder";
vi.mock("./lib/promptRegistry", async () => {
  const { PROMPT_REGISTRY } = await import("../shared/promptRegistry");
  return {
    creativePromptDefaults: async () =>
      Object.fromEntries(PROMPT_REGISTRY.map(p => [p.id, p.baseline])),
  };
});

const mocked = vi.hoisted(() => ({
  generate: vi.fn(),
  activity: vi.fn(async () => {}),
  renew: vi.fn(async () => {}),
  read: vi.fn(),
  put: vi.fn(),
  vision: vi.fn(),
}));
vi.mock("./_core/llm", () => ({
  invokeLLM: mocked.vision,
  listLLMModels: async () => ({ data: [{ id: "gpt-5.5" }] }),
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
import { readProductCutout } from "./lib/productPreservation";

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
  mocked.vision.mockResolvedValue({
    choices: [
      {
        message: {
          content: JSON.stringify({
            confidence: 0.98,
            regions: [{ left: 0, top: 0, width: 250, height: 250 }],
          }),
        },
      },
    ],
  });
  let image = 0;
  mocked.generate.mockImplementation(async () => ({
    url: "/generated-" + ++image + ".png",
    storageKey: "generated-" + image + ".png",
  }));
});

describe("creative generation orchestration", () => {
  it("enhances the exact asset as a new draft and retains editable original-product layers without flattening the design", async () => {
    const { db, args, written } = fixture();
    const bytes = await sharp({
      create: { width: 80, height: 90, channels: 4, background: "red" },
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
    mocked.read.mockResolvedValue(bytes.toString("base64"));
    const cutout = await readProductCutout("original-product.png");
    args.setup = {
      ...args.setup,
      name: "Lamp · Enhanced",
      formatIds: ["square_1_1"],
      preserveProduct: true,
      enhancement: {
        assetKey: "creative:99",
        revision: "a".repeat(64),
        instruction:
          "Recreate this Studio product advertisement as a stunning, professional ad creative with dramatically improved visual quality.",
      },
    };
    args.resolved.enhancement = {
      productOverlay: {
        method: "editable_original_v3",
        applied: true,
        designStorageKey: "prior-design.png",
        designUrl: "/prior-design.png",
        layers: [
          {
            sourceKey: cutout.sourceKey,
            sha256: cutout.sha256,
            left: 10,
            top: 10,
            width: 80,
            height: 90,
          },
        ],
      },
    };
    args.resolved.references = [
      {
        id: 99,
        key: "creative:99",
        storageKey: "exact-original-ad.png",
        url: "/exact-original-ad.png",
      },
    ];
    await runBuilderJob(db, args);
    expect(mocked.generate).toHaveBeenCalledTimes(1);
    expect(
      mocked.generate.mock.calls[0][0].originalImages.map((i: any) => i.b64Json)
    ).toEqual(["lamp.png", "exact-original-ad.png", "logo.png"]);
    expect(mocked.generate.mock.calls[0][0].prompt).toContain(
      "Reference 2 is the existing advertisement"
    );
    expect(mocked.generate.mock.calls[0][0].prompt).toContain(
      args.setup.enhancement.instruction
    );
    expect(mocked.generate.mock.calls[0][0].prompt).toContain(
      "PRODUCT OVERLAY WORKFLOW"
    );
    expect(written[0][0]).toMatchObject({
      name: "Lamp · Enhanced",
      status: "pending",
      renderMetadata: {
        parentVariantId: 99,
        enhancement: { sourceAssetKey: "creative:99" },
        productPreservation: {
          applied: false,
          designStorageKey: "generated-1.png",
          layers: [
            { sourceKey: "original-product.png", sha256: cutout.sha256 },
          ],
        },
      },
    });
  });
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

it("saves the full creative untouched and retains product, logo and campaign references with editable overlay metadata", async () => {
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
  expect(mocked.put).not.toHaveBeenCalled();
  for (const variant of written.flat()) {
    expect(variant.imageStorageKey).toMatch(/^scene-/);
    expect(variant.renderMetadata.productPreservation).toMatchObject({
      method: "editable_original_v3",
      designStorageKey: variant.imageStorageKey,
      applied: false,
    });
    expect(variant.renderMetadata.productPreservation.layers[0]).toMatchObject({
      sourceKey: "lamp.png",
    });
  }
  for (const [request] of mocked.generate.mock.calls) {
    expect(request.prompt).not.toContain("BACKGROUND-ONLY PASS");
    expect(request.prompt).toContain("Catalog facts:");
    expect(request.prompt).toContain(args.setup.copy.headline);
    expect(request.originalImages.map((r: any) => r.b64Json)).toEqual(
      expect.arrayContaining([
        "lamp.png",
        "logo.png",
        "campaign-with-product.png",
        "person:adult-female-brown",
      ])
    );
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

it.each([{ matched: false, lowResolution: false }, { matched: true, lowResolution: false }, { matched: true, lowResolution: true }])(
  "finishes every size with original artwork and immutable editor base (automatic product match/resolution: %j)",
  async ({ matched, lowResolution }) => {
    const applied = matched && !lowResolution;
    const { db, args, written } = fixture();
    args.setup.preserveLogo = true;
    args.setup.preserveProduct = true;
    const logo = await sharp({
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
    const product = lowResolution ? logo : await sharp({ create: { width: 1600, height: 960, channels: 4, background: "red" } })
      .extend({ left: 4, right: 4, top: 4, bottom: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer();
    const storage = new Map<string, Buffer>([
      ["logo.png", logo],
      ["lamp.png", product],
    ]);
    mocked.read.mockImplementation(async (key: string) =>
      storage.get(key)!.toString("base64")
    );
    mocked.generate.mockImplementation(async (request: any) => {
      const key = `design-${request.outputSize.width}x${request.outputSize.height}.png`;
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
    const logoResponse = await mocked.vision();
    mocked.vision.mockClear();
    let visionCall = 0;
    mocked.vision.mockImplementation(async () => {
      if (++visionCall % 2 === 1 || !matched) return logoResponse;
      const size = mocked.generate.mock.calls.at(-1)![0].outputSize;
      return {
        choices: [
          {
            message: {
              content: JSON.stringify({
                products: [
                  {
                    left: 400,
                    top: 400,
                    width: 300,
                    height: Math.round(
                      ((300 * size.width) / size.height) * 0.6
                    ),
                    confidence: 0.98,
                    sameAngle: true,
                  },
                ],
              }),
            },
          },
        ],
      };
    });
    mocked.put.mockImplementation(async (key: string, bytes: Buffer) => {
      const unique = key + "-" + storage.size;
      storage.set(unique, bytes);
      return { key: unique, url: "/" + unique };
    });
    await runBuilderJob(db, args);
    expect(written.flat()).toHaveLength(3);
    expect(mocked.put).toHaveBeenCalledTimes(applied ? 6 : 3);
    expect(mocked.vision).toHaveBeenCalledTimes(6);
    expect(
      mocked.vision.mock.calls.every(
        ([request]) => request.includedInAction === true
      )
    ).toBe(true);
    for (const variant of written.flat()) {
      expect(variant.imageStorageKey).toContain(
        applied ? "product-finish" : "original-logo-"
      );
      const metadata = variant.renderMetadata.logoPreservation;
      expect(metadata).toMatchObject({
        method: "original_logo_v1",
        sourceKey: "logo.png",
      });
      expect(metadata.designStorageKey).toMatch(/^design-/);
      const preservation = variant.renderMetadata.productPreservation;
      expect(preservation).toMatchObject({
        applied,
        alignment: applied ? "automatic" : "needs_adjustment",
        automaticFailure: applied ? undefined : lowResolution ? "source_resolution" : "alignment_unavailable",
      });
      if (matched && lowResolution) {
        // Keep the confident model match, not the generic editor fallback box.
        expect(Math.abs(preservation.layers[0].left - variant.renderMetadata.width * 0.4)).toBeLessThanOrEqual(1);
        expect(Math.abs(preservation.layers[0].width - variant.renderMetadata.width * 0.3)).toBeLessThanOrEqual(1);
      }
      expect(preservation.designStorageKey).toContain("original-logo-");
      if (applied)
        expect(preservation.designStorageKey).not.toBe(variant.imageStorageKey);
      else expect(preservation.designStorageKey).toBe(variant.imageStorageKey);
      const pixel = await sharp(storage.get(variant.imageStorageKey)!)
        .extract({
          left: metadata.left,
          top: metadata.top,
          width: 1,
          height: 1,
        })
        .raw()
        .toBuffer();
      expect([...pixel]).toEqual([255, 0, 0, 255]);
    }
    expect(mocked.generate.mock.calls[1][0].originalImages[0].b64Json).toMatch(
      /^design-/
    );
    expect(mocked.generate.mock.calls[0][0].prompt).toContain(
      "ORIGINAL LOGO FINISH"
    );
  }
);

it("fails invalid queued logos before any image generation", async () => {
  const { db, args, written, updates } = fixture();
  args.setup.preserveLogo = true;
  mocked.read.mockResolvedValue(
    (
      await sharp({
        create: { width: 30, height: 30, channels: 3, background: "white" },
      })
        .png()
        .toBuffer()
    ).toString("base64")
  );
  await runBuilderJob(db, args);
  expect(mocked.generate).not.toHaveBeenCalled();
  expect(written).toEqual([]);
  expect(updates).toContainEqual(
    expect.objectContaining({
      status: "failed",
      errorMessage: expect.stringContaining("transparent logo"),
    })
  );
});
