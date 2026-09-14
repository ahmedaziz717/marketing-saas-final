import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocked = vi.hoisted(() => ({
  put: vi.fn(async () => ({ key: "org-1/creative.png", url: "/manus-storage/creative.png" })),
  prepare: vi.fn(async (bytes: Buffer) => bytes),
}));

vi.mock("./storage", () => ({ storagePut: mocked.put }));
vi.mock("./lib/creativeImages", () => ({ prepareCreativeOutput: mocked.prepare }));

import { ENV } from "./_core/env";
import {
  generateSunburstImage,
  sunburstCanvasSize,
} from "./lib/openaiSunburst";
import { REQUIRED_IMAGE_MODEL_ID } from "./lib/models";

const originalKey = ENV.openAiApiKey;

describe("direct GPT Image 2.5 Sunburst client", () => {
  beforeEach(() => {
    ENV.openAiApiKey = "server-only-test-key";
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            data: [{ b64_json: Buffer.from("generated").toString("base64") }],
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        )
      )
    );
  });

  afterEach(() => {
    ENV.openAiApiKey = originalKey;
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it("sends raster references only to the Sunburst image-edit endpoint", async () => {
    const result = await generateSunburstImage({
      prompt: "Create the approved product advertisement.",
      originalImages: [{ b64Json: "cG5n", mimeType: "image/png" }],
      outputSize: { width: 1080, height: 1350, background: "#ffffff" },
      storagePrefix: "org-1/creatives/7",
    });
    expect(result.storageKey).toBe("org-1/creative.png");
    expect(fetch).toHaveBeenCalledTimes(1);
    const [url, init] = vi.mocked(fetch).mock.calls[0];
    expect(url).toBe("https://api.openai.com/v1/images/edits");
    const body = JSON.parse(String(init?.body));
    expect(body).toMatchObject({
      model: REQUIRED_IMAGE_MODEL_ID,
      quality: "medium",
      output_format: "png",
    });
    expect(body.model).toBe("gpt-image-2.5-sunburst");
    expect(body).not.toHaveProperty("input_fidelity");
    expect(body.images[0].image_url).toBe("data:image/png;base64,cG5n");
  });

  it("uses bounded custom Sunburst canvases and fails closed without the credential", async () => {
    expect(sunburstCanvasSize(1080, 1920)).toBe("864x1536");
    expect(sunburstCanvasSize(1200, 628)).toBe("1536x800");
    ENV.openAiApiKey = "";
    await expect(
      generateSunburstImage({
        prompt: "test",
        outputSize: { width: 1080, height: 1080, background: "#ffffff" },
        storagePrefix: "org-1/creatives/7",
      })
    ).rejects.toThrow(/Sunburst credential/);
    expect(fetch).not.toHaveBeenCalled();
  });
});
