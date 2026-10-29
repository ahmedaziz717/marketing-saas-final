import { expect, it } from "vitest";
import { generationModel } from "../../shared/modelCatalog";
import {
  defaultCreditPolicy,
  estimatedActionCredits,
} from "../../shared/aiCredits";
import { defaultVideoSetup } from "../../shared/videoCreation";
import { defaultModelRate } from "./modelCatalog";
import {
  seedanceCanvas,
  seedanceDescriptionEstimate,
  providerDiscount,
} from "./seedancePricing";
import { videoQuote } from "./videoPricing";

const endpoint = "bytedance/seedance-2.5/reference-to-video";
const model = generationModel(`higgsfield:${endpoint}`)!;
const rate = { ...defaultModelRate(model), ...defaultCreditPolicy };
const body = {
  duration: 5,
  resolution: "480p",
  aspect_ratio: "1:1",
  image_urls: ["https://example.test/product.png"],
};
const estimate = (
  request = body,
  prices = model.pricingNote,
  customRate = rate,
  context = {}
) =>
  seedanceDescriptionEstimate(endpoint, request, prices, customRate, context)!;

it("fixes the square canvas and prices image references without video-input discounts", () => {
  expect(estimate()).toMatchObject({
    width: 640,
    height: 640,
    tokens: 48000,
    costMicros: 1027200,
    sourceSeconds: 0,
    discount: 0,
  });
  expect(estimate({ ...body, duration: 10 }).costMicros).toBe(2054400);
  expect(estimate({ ...body, resolution: "720p" })).toMatchObject({
    width: 960,
    height: 960,
    costMicros: 2311200,
  });
  expect(estimate({ ...body, resolution: "1080p" })).toMatchObject({
    width: 1440,
    height: 1440,
    perThousand: 0.0234,
  });
});

it.each(["480p", "720p", "1080p"])(
  "supports every standard aspect ratio at %s",
  resolution => {
    for (const aspect_ratio of ["16:9", "4:3", "1:1", "3:4", "9:16", "21:9"]) {
      const quote = estimate({ ...body, resolution, aspect_ratio });
      const [w, h] = seedanceCanvas(endpoint, resolution, aspect_ratio)!;
      expect(quote.tokens).toBe(Math.ceil((w * h * 5 * 24) / 1024));
    }
  }
);

it("reads changed dollar rates from the API but rejects changed billing grammar", () => {
  const updated = model.pricingNote.replaceAll("$0.0214", "$0.03");
  expect(estimate(body, updated).costMicros).toBe(1440000);
  expect(estimate(body, updated.replace("24 / 1024", "30 / 1024"))).toBeNull();
  expect(estimate(body, "Now costs $0.01 per request")).toBeNull();
});

it("prices source-video seconds and the reduced token rate exactly once", () => {
  const withVideo = {
    ...body,
    video_urls: ["https://example.test/reference.mp4"],
  };
  expect(estimate(withVideo)).toBeNull();
  const sourceQuote = estimate(withVideo, model.pricingNote, rate, {
    sourceSeconds: 5,
  });
  expect(sourceQuote).toMatchObject({ tokens: 96000, costMicros: 1232640 });
  expect(sourceQuote.perThousand).toBeCloseTo(0.01284, 10);
  for (const mode of ["video-edit", "video-extend"]) {
    const m = generationModel(`higgsfield:bytedance/seedance-2.5/${mode}`)!;
    const result = seedanceDescriptionEstimate(
      m.providerModel,
      { ...withVideo, duration: 8 },
      m.pricingNote,
      rate,
      { sourceSeconds: 5, sourceRatio: 1 }
    )!;
    expect(result.outputSeconds).toBe(mode === "video-edit" ? 5 : 8);
    expect(result.perThousand).toBe(0.01284);
  }
});

it("requires current account evidence and does not infer a promotional discount", () => {
  expect(providerDiscount(rate)).toBe(0);
  expect(() =>
    providerDiscount({ ...rate, providerDiscountPercent: 15 })
  ).toThrow(/verification/);
  const discounted = {
    ...rate,
    providerDiscountPercent: 15,
    providerDiscountEvidence: "Verified account contract",
    providerDiscountVerifiedAt: Date.now(),
    providerDiscountValidUntil: Date.now() + 86400000,
  };
  const quote = estimate(body, model.pricingNote, discounted);
  expect(quote.costMicros).toBe(873120);
  expect(
    estimatedActionCredits({
      ...discounted,
      perRequestUsd: quote.costMicros / 1e6,
    })
  ).toBe(175);
  expect(() =>
    providerDiscount({
      ...discounted,
      providerDiscountValidUntil: Date.now() - 1,
    })
  ).toThrow(/verification/);
});

it("uses a separate Seedance 2.0 rate, canvas and 4K token tier", () => {
  const m = generationModel("higgsfield:bytedance/seedance-2.0/text-to-video")!;
  const q = (resolution: string) =>
    seedanceDescriptionEstimate(
      m.providerModel,
      { ...body, resolution, aspect_ratio: "16:9" },
      m.pricingNote,
      rate
    )!;
  expect(q("480p")).toMatchObject({
    width: 864,
    height: 496,
    perThousand: 0.014,
  });
  expect(q("4k")).toMatchObject({
    width: 3840,
    height: 2160,
    perThousand: 0.008,
  });
});

it("uses source framing for image-to-video and keeps measured wholesale separate from the saved quote", () => {
  const m = generationModel(
    "higgsfield:bytedance/seedance-2.5/image-to-video"
  )!;
  const q = seedanceDescriptionEstimate(
    m.providerModel,
    { ...body, aspect_ratio: "16:9" },
    m.pricingNote,
    rate,
    { imageRatio: 1 }
  )!;
  expect(q.width).toBe(640);
  const { costMicros, ...pricingCalculation } = q;
  const saved = {
    ...rate,
    perRequestUsd: costMicros / 1e6,
    pricingCalculation,
  };
  const setup = {
    ...defaultVideoSetup,
    resolution: "480p",
    aspectRatio: "1:1",
  };
  const before = estimatedActionCredits(saved);
  const measured = videoQuote(setup, [], saved, {
    width: 640,
    height: 640,
    durationSeconds: 5.056,
  });
  expect(measured.costMicros).toBeGreaterThan(costMicros);
  expect(estimatedActionCredits(saved)).toBe(before);
});
