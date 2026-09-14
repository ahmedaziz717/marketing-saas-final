import sharp from "sharp";
import { describe, expect, it, vi } from "vitest";

vi.mock("./storage", () => ({ storageGetBase64: vi.fn() }));
import { storageGetBase64 } from "./storage";
import {
  prepareCreativeOutput,
  readGenerationSource,
} from "./lib/creativeImages";

describe("creative image handling", () => {
  it("exports the requested dimensions while preserving edge content instead of cropping", async () => {
    const source = await sharp({
      create: { width: 100, height: 100, channels: 4, background: "red" },
    })
      .png()
      .toBuffer();
    const output = await prepareCreativeOutput(source, {
      width: 300,
      height: 100,
      background: "white",
    });
    expect(await sharp(output).metadata()).toMatchObject({
      width: 300,
      height: 100,
      format: "png",
    });
    const pixels = await sharp(output).ensureAlpha().raw().toBuffer();
    const pixel = (x: number, y: number) => [
      ...pixels.subarray((y * 300 + x) * 4, (y * 300 + x) * 4 + 3),
    ];
    expect(pixel(0, 50)).toEqual([255, 255, 255]);
    expect(pixel(100, 50)).toEqual([255, 0, 0]);
    expect(pixel(199, 50)).toEqual([255, 0, 0]);
  });

  it("rasterizes saved SVG logos into readable generation references", async () => {
    vi.mocked(storageGetBase64).mockResolvedValue(
      Buffer.from(
        '<svg xmlns="http://www.w3.org/2000/svg" width="80" height="20"><rect width="80" height="20" fill="white"/></svg>'
      ).toString("base64")
    );
    const source = await readGenerationSource("org-1/logo.svg");
    expect(source.mimeType).toBe("image/png");
    expect(
      await sharp(Buffer.from(source.b64Json, "base64")).metadata()
    ).toMatchObject({ width: 80, height: 20, format: "png" });
  });

  it("rejects invalid source bytes", async () => {
    vi.mocked(storageGetBase64).mockResolvedValue(
      Buffer.from("not an image").toString("base64")
    );
    await expect(readGenerationSource("org-1/broken.png")).rejects.toThrow(
      /could not be decoded/
    );
  });
});
