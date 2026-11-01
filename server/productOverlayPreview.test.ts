import sharp from "sharp";
import { expect, it, vi } from "vitest";
const storage = vi.hoisted(() => ({ read: vi.fn() }));
vi.mock("./storage", () => ({ storageGetBase64: storage.read }));
import { productOverlayPreview } from "./lib/productOverlayPreview";

it("loads the immutable design bytes rather than a stale or unauthorized media URL", async () => {
  const original = await sharp({
    create: {
      width: 2400,
      height: 1200,
      channels: 4,
      background: { r: 10, g: 20, b: 30, alpha: 0.5 },
    },
  })
    .png()
    .toBuffer();
  storage.read.mockResolvedValue(original.toString("base64"));
  const uri = await productOverlayPreview("org-7/creatives/4/original.png");
  expect(storage.read).toHaveBeenCalledWith("org-7/creatives/4/original.png");
  expect(uri).toMatch(/^data:image\/png;base64,/);
  const bytes = Buffer.from(uri.split(",")[1], "base64");
  expect(await sharp(bytes).metadata()).toMatchObject({
    width: 1600,
    height: 800,
    hasAlpha: true,
  });
});

it("does not enlarge a small design or hide unavailable originals", async () => {
  const original = await sharp({
    create: { width: 200, height: 100, channels: 4, background: "blue" },
  })
    .png()
    .toBuffer();
  storage.read.mockResolvedValueOnce(original.toString("base64"));
  const uri = await productOverlayPreview("small.png");
  expect(
    await sharp(Buffer.from(uri.split(",")[1], "base64")).metadata()
  ).toMatchObject({ width: 200, height: 100 });
  storage.read.mockRejectedValueOnce(new Error("Stored asset is unavailable"));
  await expect(productOverlayPreview("missing.png")).rejects.toThrow(
    "unavailable"
  );
});
