import { describe, expect, it } from "vitest";
import {
  assetState,
  assetMatchesView,
  canEnhanceImage,
  canReviewAsset,
  canSubmitAsset,
  parseAssetKey,
  type LibraryAsset,
  type WorkflowSnapshot,
} from "../shared/assetLibrary";
import { detectAssetMime, normalizeCreative } from "./lib/assetLibrary";
import { defaultCreativeSetup } from "../shared/creativeBuilder";
import { originalProductSelections } from "../shared/productOverlay";
import { creativeVariants } from "../drizzle/schema";
const hash = "a".repeat(64);
const workflow = (action: string, fingerprint = hash): WorkflowSnapshot => ({
  id: 1,
  action: `asset_library.${action}`,
  actorUserId: 1,
  createdAtMs: 1,
  payload: { fingerprint },
});
describe("asset library state and version rules", () => {
  it.each(["asset:1", "creative:2"])("parses a valid reference %s", key => {
    expect(parseAssetKey(key).id).toBeGreaterThan(0);
  });
  it.each([
    "asset:0",
    "asset:-1",
    "asset:1x",
    "creative:01",
    "other:1",
    "asset:9007199254740992",
  ])("rejects ambiguous references %s", key => {
    expect(() => parseAssetKey(key)).toThrow();
  });
  it("starts unsubmitted results as drafts", () =>
    expect(assetState("pending", undefined, hash)).toBe("draft"));
  it("preserves pre-library approvals", () =>
    expect(assetState("approved", undefined, hash)).toBe("approved"));
  it("does not auto-submit a generated draft", () =>
    expect(canReviewAsset("draft", "approved")).toBe(false));
  it("tracks explicit submissions", () =>
    expect(assetState("pending", workflow("submitted"), hash)).toBe(
      "needs_review"
    ));
  it("distinguishes changes requested from rejection", () =>
    expect(assetState("rejected", workflow("changes_requested"), hash)).toBe(
      "changes_requested"
    ));
  it("invalidates an approval when the content fingerprint changes", () =>
    expect(
      assetState("approved", workflow("approved", "b".repeat(64)), hash)
    ).toBe("draft"));
  it("invalidates a submission when the content fingerprint changes", () =>
    expect(
      assetState("pending", workflow("submitted", "b".repeat(64)), hash)
    ).toBe("draft"));
  it("does not allow an already approved item to be resubmitted", () =>
    expect(canSubmitAsset("approved")).toBe(false));
  it("allows returned assets to be resubmitted", () =>
    expect(canSubmitAsset("changes_requested")).toBe(true));
  it("allows a reviewer to revoke an approval", () =>
    expect(canReviewAsset("approved", "rejected")).toBe(true));
  it("lists UGC video in both UGC and video views without changing its key", () => {
    const asset = {
      key: "asset:1",
      mediaType: "video",
      isUgc: true,
      purpose: "finished",
    } as LibraryAsset;
    expect(assetMatchesView(asset, "ugc")).toBe(true);
    expect(assetMatchesView(asset, "videos")).toBe(true);
    expect(assetMatchesView(asset, "images")).toBe(false);
  });
  it("uses the existing generated record as a library draft", () => {
    const row = {
      id: 19,
      name: "Generated image",
      status: "pending",
      imageUrl: "/media/test.png",
      imageStorageKey: "test.png",
      headline: "Hello",
      primaryText: "Example",
      description: "",
      callToAction: "LEARN_MORE",
      channel: "meta",
      format: "square_1_1",
      renderMetadata: null,
      reviewedAtMs: null,
      reviewedByUserId: null,
      createdAtMs: 10,
    } as typeof creativeVariants.$inferSelect;
    const asset = normalizeCreative(row);
    expect(asset.key).toBe("creative:19");
    expect(asset.state).toBe("draft");
    expect(asset.origin).toBe("generated");
    expect(
      normalizeCreative({ ...row, headline: "Edited" }).fingerprint
    ).not.toBe(asset.fingerprint);
  });
});
describe("upload signature validation", () => {
  it.each(["image/png", "image/jpeg", "image/webp"])(
    "allows enhancement of saved %s images",
    mimeType =>
      expect(
        canEnhanceImage({ mediaType: "image", mimeType, origin: "uploaded" })
      ).toBe(true)
  );
  it.each(["image/gif", "image/svg+xml", "video/mp4", "image/*"])(
    "does not send unsupported uploaded %s files for enhancement",
    mimeType =>
      expect(
        canEnhanceImage({ mediaType: "image", mimeType, origin: "uploaded" })
      ).toBe(false)
  );
  it("allows generated images with the legacy image MIME type", () =>
    expect(
      canEnhanceImage({
        mediaType: "image",
        mimeType: "image/*",
        origin: "generated",
      })
    ).toBe(true));
  it("accepts PNG bytes", () =>
    expect(
      detectAssetMime(
        Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13])
      )
    ).toBe("image/png"));
  it("rejects SVG/HTML disguised as images", () =>
    expect(
      detectAssetMime(Buffer.from("<svg onload='alert(1)'></svg>"))
    ).toBeNull());
  it("rejects a short corrupt file", () =>
    expect(detectAssetMime(Buffer.from([137, 80, 78]))).toBeNull());
  it("recognizes MP4", () =>
    expect(
      detectAssetMime(Buffer.from([0, 0, 0, 24, ...Buffer.from("ftypisom")]))
    ).toBe("video/mp4"));
  it("does not mislabel HEIC as MP4", () =>
    expect(
      detectAssetMime(Buffer.from([0, 0, 0, 24, ...Buffer.from("ftypheic")]))
    ).toBeNull());
});

describe("generated draft discovery preserves review handoff", () => {
  it("links draft outputs to Drafts and submissions to Needs Review", async () => {
    const { libraryAssetLink, isLibraryAsset } = await import(
      "../shared/assetWorkflow"
    );
    expect(libraryAssetLink("creative:8", "draft")).toBe(
      "/app/library?view=drafts&asset=creative%3A8"
    );
    expect(isLibraryAsset({ state: "draft" })).toBe(false);
    expect(libraryAssetLink("creative:8", "needs_review")).toContain(
      "view=needs_review"
    );
    expect(isLibraryAsset({ state: "needs_review" })).toBe(true);
    expect(libraryAssetLink("creative:8", "approved")).toContain(
      "view=approved"
    );
  });
});

it("offers original-product adjustment for saved catalog images without changing preservation or approval", () => {
  const metadata = {
    productIds: [622],
    requestedSetup: {
      ...defaultCreativeSetup(),
      products: [
        {
          productId: 622,
          imageId: 649,
          featuredSpecKeys: [],
          includePrice: false,
        },
      ],
    },
    width: 1080,
    height: 1080,
  };
  const asset = normalizeCreative({
    id: 92,
    name: "Saved catalog creative",
    status: "approved",
    imageStorageKey: "saved-design",
    renderMetadata: metadata,
  } as any);
  expect(asset).toMatchObject({
    hasProductOverlay: false,
    canAdjustOriginalProduct: true,
    state: "approved",
  });
  expect(originalProductSelections({ ...metadata, productIds: [999] })).toEqual(
    []
  );
  expect(
    originalProductSelections({
      ...metadata,
      requestedSetup: {
        ...metadata.requestedSetup,
        products: [
          { ...metadata.requestedSetup.products[0], imageIds: [649, 650] },
        ],
      },
    })
  ).toEqual([]);
  expect(
    normalizeCreative({ id: 1, renderMetadata: null } as any)
      .canAdjustOriginalProduct
  ).toBe(false);
});
