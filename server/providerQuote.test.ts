import { afterEach, expect, it, vi } from "vitest";
const estimate = vi.hoisted(() => vi.fn());
vi.mock("./lib/higgsfield", () => ({
  estimateHiggsfield: estimate,
  higgsfieldConfigured: () => true,
}));
import { providerRequestRate, assertAcceptedPrice } from "./lib/providerQuote";
import { defaultModelRate } from "./lib/modelCatalog";
import { generationModel, modelRequestBody } from "../shared/modelCatalog";
import { estimatedActionCredits } from "../shared/aiCredits";
import { rateInput } from "../shared/platformAdmin";
afterEach(() => vi.clearAllMocks());

it.each([
  [
    "higgsfield:bytedance/seedance-2.5/reference-to-video",
    {
      duration: 5,
      resolution: "480p",
      aspect_ratio: "1:1",
      generate_audio: true,
    },
    0.87,
  ],
  [
    "higgsfield:bytedance/seedance-2.5/video-edit",
    { resolution: "720p" },
    1.4567,
  ],
  [
    "higgsfield:kling-video/v3.0/pro/text-to-video",
    { duration: 10, sound: "off" },
    0.937,
  ],
])("uses account-specific request pricing for %s", async (id, options, usd) => {
  const model = generationModel(id as string)!;
  expect(model).toBeTruthy();
  const body = modelRequestBody(model, {
    prompt: "A studio scene",
    options: options as any,
    images: id.includes("reference")
      ? ["https://stored.example/product.png"]
      : [],
    video: id.includes("video-edit")
      ? "https://stored.example/source.mp4"
      : undefined,
  });
  estimate.mockResolvedValue({
    costMicros: Math.round(Number(usd) * 1e6),
    quotedAtMs: 123,
  });
  const base = {
    ...defaultModelRate(model),
    markupPercent: 100,
    creditValueMicros: 10000,
  };
  const rate = rateInput.parse(
    await providerRequestRate(base, model.providerModel, body)
  );
  expect(estimatedActionCredits(rate)).toBe(Math.ceil(Number(usd) * 200));
  expect(estimate).toHaveBeenCalledWith(model.providerModel, body);
  expect(rate.costBasis).toBe("provider_account_estimate");
  expect(rate.requestHash).toHaveLength(64);
  expect(rate.quotedAtMs).toBe(123);
});

it("applies the configured markup once and rejects a changed retail price", async () => {
  const model = generationModel(
    "higgsfield:bytedance/seedance-2.5/text-to-video"
  )!;
  const base = {
    ...defaultModelRate(model),
    markupPercent: 50,
    creditValueMicros: 10000,
  };
  estimate.mockResolvedValueOnce({ costMicros: 423000, quotedAtMs: 1 });
  const accepted = await providerRequestRate(base, model.providerModel, {
    duration: 5,
  });
  expect(estimatedActionCredits(accepted)).toBe(64);
  estimate.mockResolvedValueOnce({ costMicros: 823000, quotedAtMs: 2 });
  const updated = await providerRequestRate(accepted, model.providerModel, {
    duration: 10,
  });
  expect(() => assertAcceptedPrice(accepted, updated)).toThrow(
    "No generation was submitted"
  );
  expect(estimatedActionCredits(accepted)).toBe(64);
});
