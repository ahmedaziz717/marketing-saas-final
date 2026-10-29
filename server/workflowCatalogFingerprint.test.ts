import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ read: vi.fn(), asset: vi.fn() }));
vi.mock("./lib/videoCatalog", () => ({ readVideoCatalogImage: mocks.read }));
vi.mock("./lib/assetLibrary", async original => ({
  ...(await original<any>()),
  readLibraryAsset: mocks.asset,
}));
import { workflowPublicationAsset } from "./lib/workflowPublicationAsset";
beforeEach(() => {
  mocks.read
    .mockReset()
    .mockResolvedValue({
      reference: { fingerprint: "geometry-v2" },
      legacyFingerprint: "identity-v1",
    });
  mocks.asset.mockReset().mockResolvedValue({ key: "asset:9", state: "draft" });
});
const db = {
  select: () => ({
    from: () => ({ where: () => ({ limit: async () => [{ id: 9 }] }) }),
  }),
} as any;
const image = {
  type: "image" as const,
  key: "product_image:7",
  url: "/media/image",
  name: "Product",
  fingerprint: "identity-v1",
};
it("retains old workflow identity and returns existing materialized asset without changing review state", async () => {
  expect(await workflowPublicationAsset(db, 3, 4, image)).toEqual({
    key: "asset:9",
    state: "draft",
  });
  expect(mocks.asset).toHaveBeenCalledWith(db, 3, "asset:9");
});
it("accepts a current v2 output only against its geometry-fenced fingerprint", async () => {
  await expect(
    workflowPublicationAsset(db, 3, 4, {
      ...image,
      catalogSourceVersion: 2,
      fingerprint: "geometry-v2",
    })
  ).resolves.toMatchObject({ state: "draft" });
});
it.each([
  { ...image, fingerprint: "changed-image" },
  { ...image, catalogSourceVersion: 2 as const },
  { ...image, catalogSourceVersion: 3 as any, fingerprint: "geometry-v2" },
])("rejects mismatched or unknown-version workflow references", async value => {
  await expect(workflowPublicationAsset(db, 3, 4, value)).rejects.toThrow(
    /image changed/
  );
  expect(mocks.asset).not.toHaveBeenCalled();
});
