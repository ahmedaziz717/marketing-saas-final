import { beforeEach, expect, it, vi } from "vitest";
import sharp from "sharp";
const f = vi.hoisted(() => ({
  asset: vi.fn(),
  storage: vi.fn(),
  access: vi.fn(),
  rows: vi.fn(),
  fetch: vi.fn(),
  row: null as any,
}));
vi.mock("./lib/assetLibrary", () => ({ readLibraryAsset: f.asset }));
vi.mock("./storage", () => ({
  normalizeStorageKey: (key: string) => {
    if (key.includes("..")) throw new Error("Invalid key");
    return key;
  },
  storageGetBase64: f.storage,
}));
vi.mock("./lib/googleAdsApi", () => ({ googleAdsRows: f.rows }));
vi.mock("./lib/googleAdsConnections", () => ({
  withGoogleAdsAccess: f.access,
}));
vi.mock("./lib/websiteCrawler", () => ({ safeFetchImage: f.fetch }));
import { googleCopyContext } from "./lib/googleCopyContext";
import type { GoogleAssetInput } from "../shared/googleCampaigns";
const db = {
  select: () => ({
    from: () => ({ where: () => ({ limit: async () => [f.row] }) }),
  }),
} as any;
const creative: GoogleAssetInput = {
  field: "SQUARE_MARKETING_IMAGE",
  source: { kind: "library", key: "creative:4" },
};
const google: GoogleAssetInput = {
  field: "MARKETING_IMAGE",
  source: { kind: "existing", id: "123" },
};
let pixels: Buffer;
beforeEach(async () => {
  vi.resetAllMocks();
  pixels = await sharp({
    create: { width: 1600, height: 1000, channels: 3, background: "#336699" },
  })
    .png()
    .toBuffer();
  f.row = { key: "org-7/creative.png", metadata: { productIds: [11, 11, 12] } };
  f.asset.mockResolvedValue({
    name: "Approved product creative",
    state: "approved",
    mediaType: "image",
    headline: "Approved headline",
    copyText: "Approved copy",
  });
  f.storage.mockResolvedValue(pixels.toString("base64"));
  f.access.mockImplementation(async (_db, _org, _id, callback) =>
    callback(
      { accountId: "222", details: { google: { loginCustomerId: "333" } } },
      "synthetic-token"
    )
  );
  f.rows.mockResolvedValue([
    {
      asset: {
        id: "123",
        name: "Remote creative",
        type: "IMAGE",
        imageAsset: {
          fullSize: { url: "https://example.test/google-image.png" },
        },
      },
    },
  ]);
  f.fetch.mockResolvedValue({ data: pixels });
});

it("grounds approved creative references in scoped original bytes and metadata, with bounded visual dimensions", async () => {
  const result = await googleCopyContext(db, 7, [creative]);
  expect(f.asset).toHaveBeenCalledWith(db, 7, "creative:4");
  expect(f.storage).toHaveBeenCalledWith("org-7/creative.png", 8 * 1024 * 1024);
  expect(result.assets[0]).toMatchObject({
    reference: "creative:4",
    evidence: "selected_image",
    imageIndex: 0,
    description: "Approved headline\nApproved copy",
  });
  expect(result.productIds).toEqual([11, 12]);
  const image = await sharp(
    Buffer.from(result.images[0].split(",")[1], "base64")
  ).metadata();
  expect(image.width).toBe(1024);
  expect(image.height).toBe(640);
  expect(f.access).not.toHaveBeenCalled();
});

it("deduplicates a source reused in several placements without pretending to inspect another image", async () => {
  const result = await googleCopyContext(db, 7, [
    creative,
    { ...creative, field: "LOGO" },
  ]);
  expect(result.images).toHaveLength(1);
  expect(result.assets).toHaveLength(1);
  expect(f.storage).toHaveBeenCalledTimes(1);
});

it.each(["pending", "rejected", "changes_requested"])(
  "rejects %s library assets before reading bytes",
  async state => {
    f.asset.mockResolvedValue({
      name: "Unreviewed",
      state,
      mediaType: "image",
    });
    await expect(googleCopyContext(db, 7, [creative])).rejects.toThrow(
      "approved image or video"
    );
    expect(f.storage).not.toHaveBeenCalled();
  }
);

it("rejects foreign workspace storage even when the selected record's approval is valid", async () => {
  f.row.key = "org-8/private.png";
  await expect(googleCopyContext(db, 7, [creative])).rejects.toThrow(
    "usable workspace media"
  );
  expect(f.storage).not.toHaveBeenCalled();
});

it("requires a connection for Google references and validates its workspace access before reading assets", async () => {
  await expect(googleCopyContext(db, 7, [google])).rejects.toThrow(
    "Choose a Google account"
  );
  expect(f.access).not.toHaveBeenCalled();
  f.access.mockRejectedValue(new Error("Foreign account"));
  await expect(
    googleCopyContext(db, 7, [google], "connection")
  ).rejects.toThrow("Foreign account");
  expect(f.rows).not.toHaveBeenCalled();
  expect(f.fetch).not.toHaveBeenCalled();
});

it("reads only selected account assets and safely fetches returned media rather than caller URLs", async () => {
  const result = await googleCopyContext(db, 7, [google], "connection");
  expect(f.access).toHaveBeenCalledWith(
    db,
    7,
    "connection",
    expect.any(Function)
  );
  expect(f.rows.mock.calls[0][2]).toContain("asset.id IN (123)");
  expect(f.rows.mock.calls[0][3]).toBe("333");
  expect(f.fetch).toHaveBeenCalledWith("https://example.test/google-image.png");
  expect(result.assets[0]).toMatchObject({
    reference: "google:123",
    imageIndex: 0,
    evidence: "selected_image",
  });
});

it("does not generate from stale Google selections or silently skip unreadable image content", async () => {
  f.rows.mockResolvedValue([]);
  await expect(
    googleCopyContext(db, 7, [google], "connection")
  ).rejects.toThrow("no longer available");
  f.storage.mockResolvedValue(Buffer.from("not an image").toString("base64"));
  await expect(googleCopyContext(db, 7, [creative])).rejects.toThrow(
    "could not be inspected"
  );
});

it("labels videos as metadata-only and never pretends thumbnails are the video content", async () => {
  f.asset.mockResolvedValue({
    name: "Approved video",
    state: "approved",
    mediaType: "video",
  });
  const result = await googleCopyContext(db, 7, [
    { field: "YOUTUBE_VIDEO", source: { kind: "library", key: "asset:9" } },
    {
      field: "YOUTUBE_VIDEO",
      source: { kind: "youtube", videoId: "abcdefghijk" },
    },
  ]);
  expect(result.images).toEqual([]);
  expect(result.assets.every(a => a.evidence === "metadata_only")).toBe(true);
  expect(f.storage).not.toHaveBeenCalled();
});

it("rejects excessive visual selections instead of silently omitting selected images", async () => {
  const selected = Array.from({ length: 21 }, (_, i) => ({
    field: "MARKETING_IMAGE",
    source: { kind: "library", key: `asset:${i + 1}` },
  })) as GoogleAssetInput[];
  await expect(googleCopyContext(db, 7, selected)).rejects.toThrow(
    "at most 20 image references"
  );
});
