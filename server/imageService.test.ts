import sharp from "sharp";
import { afterEach, describe, expect, it, vi } from "vitest";
vi.mock("./_core/env", () => ({
  ENV: { openAiApiKey: "test-only" },
}));
vi.mock("./storage", () => ({
  storagePut: vi.fn(async () => ({
    key: "org-1/result.png",
    url: "/manus-storage/org-1/result.png",
  })),
  storageGetBase64: vi.fn(),
}));
import { generateImage } from "./_core/imageGeneration";
import { storagePut } from "./storage";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe("portable image service", () => {
  it("uses the required image model directly and stores correctly sized PNG output", async () => {
    const png = await sharp({
      create: { width: 64, height: 64, channels: 3, background: "white" },
    })
      .png()
      .toBuffer();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            id: "gpt-image-2.5-sunburst",
          })
        )
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            data: [{ b64_json: png.toString("base64") }],
          })
        )
      );
    vi.stubGlobal("fetch", fetchMock);
    const result = await generateImage({
      prompt: "Finished ad",
      originalImages: [{ b64Json: "reference", mimeType: "image/png" }],
      outputSize: { width: 728, height: 90, background: "white" },
      storagePrefix: "org-1/creatives/4",
    });
    const request = JSON.parse(fetchMock.mock.calls[1][1].body);
    expect(request).toMatchObject({
      model: "gpt-image-2.5-sunburst",
      quality: "medium",
      images: [{ image_url: "data:image/png;base64,reference" }],
    });
    const stored = vi.mocked(storagePut).mock.calls[0];
    expect(stored[0]).toMatch(/^org-1\/creatives\/4\//);
    expect(await sharp(stored[1] as Buffer).metadata()).toMatchObject({
      width: 728,
      height: 90,
      format: "png",
    });
    expect(result).toEqual({
      url: "/manus-storage/org-1/result.png",
      storageKey: "org-1/result.png",
    });
  });

  it("does not generate with an older model when the requested engine is unavailable", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        new Response(
          JSON.stringify({
            models: [{ id: "gpt-image-2", model: "old-engine" }],
          })
        )
      );
    vi.stubGlobal("fetch", fetchMock);
    await expect(generateImage({ prompt: "Finished ad" })).rejects.toThrow(
      /unavailable/
    );
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(storagePut).not.toHaveBeenCalled();
  });
});
