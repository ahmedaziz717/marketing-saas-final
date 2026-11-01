import { beforeEach, expect, it, vi } from "vitest";
import { TRPCError } from "@trpc/server";
const read = vi.hoisted(() => vi.fn());
vi.mock("./lib/assetLibrary", async original => ({
  ...(await original<any>()),
  readLibraryAsset: read,
}));
import { loadInputs } from "./routers/creativeBuilder";
import { defaultCreativeSetup } from "../shared/creativeBuilder";
import { brandKits } from "../drizzle/schema";
const setup = { ...defaultCreativeSetup(), sourceAssetKeys: ["asset:5"] };
function database() {
  return {
    select: () => ({
      from: (table: unknown) => {
        const rows =
          table === brandKits
            ? [{ id: 1, organizationId: 1 }]
            : [{ storageKey: "org-1/source.png" }];
        return {
          where: () =>
            Object.assign(Promise.resolve(rows), {
              limit: () => Promise.resolve(rows),
            }),
        };
      },
    }),
  } as any;
}
beforeEach(() => { read.mockReset(); });
it("rejects unapproved and non-image sources before generation", async () => {
  for (const source of [
    { state: "draft", mediaType: "image", mimeType: "image/png" },
    { state: "approved", mediaType: "video", mimeType: "video/mp4" },
    { state: "approved", mediaType: "image", mimeType: "image/gif" },
  ]) {
    read.mockResolvedValue(source);
    await expect(loadInputs(database(), 1, setup)).rejects.toMatchObject({
      code: "PRECONDITION_FAILED",
    });
  }
});
it("passes workspace scope to the existing library access check and propagates a foreign-source rejection", async () => {
  read.mockRejectedValue(new TRPCError({ code: "NOT_FOUND" }));
  const db = database();
  await expect(loadInputs(db, 2, setup)).rejects.toMatchObject({
    code: "NOT_FOUND",
  });
  expect(read).toHaveBeenCalledWith(db, 2, "asset:5");
});
it("preserves approved source identity and storage for the generation snapshot", async () => {
  read.mockResolvedValue({
    state: "approved",
    mediaType: "image",
    mimeType: "image/png",
    url: "/source.png",
  });
  const result = await loadInputs(database(), 1, setup);
  expect(result.products).toEqual([]);
  expect(result.references).toEqual([
    {
      id: 5,
      key: "asset:5",
      storageKey: "org-1/source.png",
      url: "/source.png",
    },
  ]);
});
