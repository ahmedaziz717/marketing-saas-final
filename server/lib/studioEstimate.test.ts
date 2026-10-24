import { describe, expect, it } from "vitest";
import {
  generationModel,
  DEFAULT_IMAGE_MODEL,
  DEFAULT_VIDEO_MODEL,
  modelDefaults,
  type ModelDefinition,
} from "../../shared/modelCatalog";
import { defaultModelRate } from "./modelCatalog";
import { studioPlanningEstimate } from "./studioEstimate";
import type { ProviderRate } from "../../shared/platformAdmin";
const image = generationModel(DEFAULT_IMAGE_MODEL)!;
const video = generationModel(DEFAULT_VIDEO_MODEL)!;
const square = [{ width: 1024, height: 1024 }];
const priced = (model: ModelDefinition): ProviderRate => ({
  ...defaultModelRate(model),
  billingMode: "cost",
  markupPercent: 100,
  creditValueMicros: 10000,
});
describe("Studio planning estimates", () => {
  it("changes with OpenAI quality, canvas and output count", () => {
    const rate = priced(image);
    const low = studioPlanningEstimate(
      image,
      rate,
      { quality: "low" },
      square
    ).credits;
    const high = studioPlanningEstimate(
      image,
      rate,
      { quality: "high" },
      square
    ).credits;
    expect(high).toBeGreaterThan(low);
    expect(
      studioPlanningEstimate(image, rate, { quality: "high" }, [
        { width: 1536, height: 1024 },
      ]).credits
    ).toBeLessThan(high); // Sunburst normalizes the long edge: landscape has fewer pixels than square.
    expect(
      studioPlanningEstimate(image, rate, { quality: "high" }, [
        ...square,
        ...square,
      ]).credits
    ).toBe(high * 2);
  });
  it("uses duration and reviewed per-second rates, markup and discounts", () => {
    const rate: ProviderRate = {
      ...priced(video),
      perSecondUsd: 0.1,
      perRequestUsd: null,
    };
    const options = { ...modelDefaults(video), duration: 5 };
    expect(studioPlanningEstimate(video, rate, options, square).credits).toBe(
      100
    );
    expect(
      studioPlanningEstimate(video, rate, { ...options, duration: 10 }, square)
        .credits
    ).toBe(200);
    const discounted = {
      ...rate,
      providerDiscountPercent: 20,
      providerDiscountEvidence: "Verified account agreement",
      providerDiscountVerifiedAt: Date.now(),
      providerDiscountValidUntil: Date.now() + 86400000,
    };
    expect(
      studioPlanningEstimate(video, discounted, options, square).credits
    ).toBe(80);
    expect(() =>
      studioPlanningEstimate(
        video,
        { ...discounted, providerDiscountValidUntil: 1 },
        options,
        square
      )
    ).toThrow(/verification/);
  });
  it("honors setting-dependent cost rules including audio", () => {
    const ruleModel = {
      ...video,
      providerModel: "test/video-generation",
      costRules: [
        { when: { generate_audio: false }, usd: 0.3, unit: "request" as const },
        { when: { generate_audio: true }, usd: 0.5, unit: "request" as const },
      ],
    };
    const rate: ProviderRate = {
      ...priced(video),
      perSecondUsd: null,
      perRequestUsd: null,
      outputPerMillion: null,
      costRules: ruleModel.costRules,
    };
    expect(
      studioPlanningEstimate(ruleModel, rate, { generate_audio: false }, square)
        .credits
    ).toBe(60);
    expect(
      studioPlanningEstimate(ruleModel, rate, { generate_audio: true }, square)
        .credits
    ).toBe(100);
  });
  it("labels a missing source duration as an assumption and updates when known", () => {
    const sourceModel: ModelDefinition = {
      ...video,
      inputSchema: {
        ...video.inputSchema,
        required: ["video_url"],
        properties: {
          ...video.inputSchema.properties,
          video_url: { type: "string" },
        },
      },
      variant: "Video editing",
      providerModel: "test/video-edit",
    };
    const rate: ProviderRate = {
      ...priced(video),
      perSecondUsd: 0.1,
      perRequestUsd: null,
    };
    const estimate = studioPlanningEstimate(sourceModel, rate, {}, square);
    expect(estimate.estimated).toBe(true);
    expect(estimate.assumptions).toContain("5-second");
    expect(
      studioPlanningEstimate(sourceModel, rate, {}, square, 12).assumptions
    ).not.toContain("5-second");
  });
});
