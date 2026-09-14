import { beforeEach, describe, expect, it, vi } from "vitest";
import { defaultCreativeSetup } from "../shared/creativeBuilder";

const mocked = vi.hoisted(() => ({
  generate: vi.fn(),
  activity: vi.fn(async () => {}),
  renew: vi.fn(async () => {}),
}));
vi.mock("./_core/imageGeneration", () => ({
  listImageModels: async () => ({
    models: [
      { id: "gpt-image-2.5-sunburst", model: "advertised-image-engine" },
    ],
  }),
  generateImage: mocked.generate,
}));
vi.mock("./lib/creativeImages", () => ({
  readGenerationSource: async (key: string) => ({
    b64Json: key,
    mimeType: "image/png",
  }),
}));
vi.mock("./lib/activity", () => ({
  appendActivity: mocked.activity,
  withOrganizationTransaction: (db: any, _organizationId: number, operation: any) => db.transaction(operation),
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
      values: async (rows: any) => {
        written.push(rows);
        return [{ insertId: 1 }];
      },
    }),
    update: () => ({
      set: (values: any) => ({
        where: async () => {
          updates.push(values);
          return [{ affectedRows: 1 }];
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
  it("references the first composition for the other sizes while retaining product and logo sources", async () => {
    const { db, args, written, updates } = fixture();
    await runBuilderJob(db, args);
    expect(mocked.generate).toHaveBeenCalledTimes(3);
    const requests = mocked.generate.mock.calls.map(call => call[0]);
    expect(requests[0]).toMatchObject({
      model: "advertised-image-engine",
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
