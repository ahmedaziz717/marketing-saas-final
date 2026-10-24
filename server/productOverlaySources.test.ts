import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ read: vi.fn(), cutout: vi.fn() }));
vi.mock("./lib/imageEnhancement", () => ({ readEnhancementSource: mocks.read }));
vi.mock("./lib/productPreservation", () => ({ readProductCutout: mocks.cutout }));
import { readOverlaySources, catalogOverlaySources } from "./lib/productOverlaySources";
import { PgDialect } from "drizzle-orm/pg-core";
import { productOverlayReplacementsSchema, type ProductOverlayMetadata } from "../shared/productOverlay";
const metadata: ProductOverlayMetadata = { method: "editable_original_v3", applied: false, designStorageKey: "complete", designUrl: "/complete", layers: [{ sourceKey: "old", sha256: "old-digest", width: 525, height: 727, left: 443, top: 211 }] };
const replacement = { index: 0, key: "asset:9", revision: "a".repeat(64), sameViewConfirmed: true as const };
beforeEach(() => {
  vi.resetAllMocks();
  mocks.cutout.mockImplementation(async key => ({sourceKey: key, sha256: key === "old" ? "old-digest" : "new-digest", width: key === "old" ? 164 : 656, height: key === "old" ? 227 : 908, png: Buffer.from(key)}));
  mocks.read.mockResolvedValue({asset: {origin: "uploaded", purpose: "source", sourceType: "product", state: "approved"}, source: {storageKey: "new"}});
});
it("uses exact workspace and revision, preserving the immutable old metadata", async () => {
  const before = JSON.stringify(metadata);
  const result = await readOverlaySources({} as any, 3, metadata, [replacement]);
  expect(mocks.read).toHaveBeenCalledWith({}, 3, "asset:9", replacement.revision);
  expect(result[0]).toMatchObject({width: 656, sourceKey: "new"});
  expect(JSON.stringify(metadata)).toBe(before);
});
it.each(["Tenant-scoped source not found", "Source revision changed"])("propagates access/concurrency rejection: %s", async message => {
  mocks.read.mockRejectedValue(new Error(message));
  await expect(readOverlaySources({} as any, 3, metadata, [replacement])).rejects.toThrow(message);
  expect(mocks.cutout).toHaveBeenCalledTimes(1);
});
it.each(["draft", "rejected"])("rejects unapproved source %s", async state => {
  mocks.read.mockResolvedValue({asset: {origin: "uploaded", purpose: "source", sourceType: "product", state}, source: {storageKey: "new"}});
  await expect(readOverlaySources({} as any, 3, metadata, [replacement])).rejects.toThrow(/approved uploaded/);
});
it("rejects changed originals, insufficient resolution, and different proportions", async () => {
  mocks.cutout.mockResolvedValueOnce({sha256: "changed"});
  await expect(readOverlaySources({} as any, 3, metadata, [replacement])).rejects.toThrow(/saved original changed/);
  for (const [width, height] of [[100, 138], [656, 400]]) {
    mocks.cutout.mockResolvedValueOnce({sha256: "old-digest", width: 164, height: 227}).mockResolvedValueOnce({width, height});
    await expect(readOverlaySources({} as any, 3, metadata, [replacement])).rejects.toThrow(/same product and view/);
  }
});
it("rejects duplicate slots, generated references, and missing same-view confirmation", () => {
  for (const input of [[replacement, replacement], [{...replacement, key: "creative:9"}], [{...replacement, sameViewConfirmed: false}]])
    expect(productOverlayReplacementsSchema.safeParse(input).success).toBe(false);
});

it("restricts catalog lookup to workspace, approved product and the selected layer's product ID", async () => {
  const where = vi.fn().mockResolvedValue([{image: {id: 733, productId: 712, storageKey: "new", url: "/new", media: null}, product: {id: 712, name: "Same product", updatedAtMs: 7, status: "approved"}}]);
  const db = {select: () => ({from: () => ({innerJoin: () => ({where})})})} as any;
  const candidates = await catalogOverlaySources(db, 3, [712]);
  const replacement = {index: 0, key: candidates[0].key, revision: candidates[0].revision, sameViewConfirmed: true as const};
  const result = await readOverlaySources(db, 3, metadata, [replacement], [712, 724]);
  expect(result[0].sourceKey).toBe("new");
  const query = new PgDialect().sqlToQuery(where.mock.calls.at(-1)![0]);
  expect(query.params).toEqual([3, 712, "approved"]);
  expect(query.sql).toContain('"organizationId"');
  expect(query.sql).toContain('"productId"');
  expect(mocks.read).not.toHaveBeenCalled();
  await expect(readOverlaySources(db, 3, metadata, [{...replacement, revision: "b".repeat(64)}], [712])).rejects.toThrow(/changed or is unavailable/);
  where.mockResolvedValue([]);
  await expect(readOverlaySources(db, 3, metadata, [replacement], [712])).rejects.toThrow(/changed or is unavailable/);
});
