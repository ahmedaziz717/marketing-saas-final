import sharp from "sharp";
import { expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ invoke: vi.fn() }));
vi.mock("./_core/llm", () => ({
  invokeLLM: mocks.invoke,
  listLLMModels: async () => ({ data: [{ id: "gpt-5.5" }] }),
}));
import {
  automaticProductOverlay,
  productOverlayFailureDiagnostic,
  ProductOverlayResolutionError,
} from "./lib/productOverlay";
const base = {
  left: 100,
  top: 100,
  width: 300,
  height: 600,
  confidence: 0.99,
  sameAngle: true,
};
it.each([
  [{ ...base, confidence: 0.7 }, "low_confidence"],
  [{ ...base, sameAngle: false }, "camera_angle"],
  [{ ...base, width: 600 }, "aspect_mismatch"],
  [{ ...base, left: 900 }, "invalid_geometry"],
  [{ ...base, width: -1 }, "invalid_response"],
] as const)(
  "records a safe reason for rejected alignment: %s",
  async (box, reason) => {
    mocks.invoke.mockResolvedValue({
      choices: [{ message: { content: JSON.stringify({ products: [box] }) } }],
    });
    const design = await sharp({
      create: { width: 1000, height: 1000, channels: 4, background: "blue" },
    })
      .png()
      .toBuffer();
    const png = await sharp({
      create: { width: 400, height: 800, channels: 4, background: "red" },
    })
      .png()
      .toBuffer();
    await expect(
      automaticProductOverlay(
        design,
        [
          {
            png,
            width: 400,
            height: 800,
            sourceKey: "private",
            sha256: "hash",
          },
        ],
        { width: 1000, height: 1000 }
      )
    ).rejects.toMatchObject({
      diagnostic: expect.objectContaining({ stage: "alignment", reason }),
    });
  }
);

it("keeps provider errors and internal storage details out of persisted diagnostics", async () => {
  const secret = "https://private.example/key?token=secret";
  for (const stage of [
    "source_read",
    "storage",
    "render",
    "alignment",
  ] as const) {
    const diagnostic = productOverlayFailureDiagnostic(
      new Error(secret),
      stage
    );
    expect(JSON.stringify(diagnostic)).not.toContain(secret);
    expect(Object.keys(diagnostic)).toEqual(["stage", "reason"]);
  }
  expect(
    productOverlayFailureDiagnostic(
      new ProductOverlayResolutionError(secret),
      "alignment"
    )
  ).toEqual({ stage: "render", reason: "source_resolution" });
});

it.each([
  [{ ...base, confidence: 0.7 }, "low_confidence"],
  [{ ...base, sameAngle: false }, "camera_angle"],
  [{ ...base, width: 600 }, "aspect_mismatch"],
  [{ ...base, left: 900 }, "invalid_geometry"],
] as const)(
  "explicit suggestions use the same rejection guards as automatic finishing: %s",
  async (box, reason) => {
    const { suggestProductPlacement } = await import("./lib/productOverlay");
    mocks.invoke.mockResolvedValue({
      choices: [{ message: { content: JSON.stringify({ products: [box] }) } }],
    });
    const png = await sharp({
      create: { width: 1000, height: 1000, channels: 4, background: "blue" },
    })
      .png()
      .toBuffer();
    await expect(
      suggestProductPlacement(
        png,
        [
          {
            png,
            width: 400,
            height: 800,
            sourceKey: "private",
            sha256: "hash",
          },
        ],
        { width: 1000, height: 1000 }
      )
    ).rejects.toMatchObject({
      diagnostic: expect.objectContaining({ reason }),
    });
  }
);
