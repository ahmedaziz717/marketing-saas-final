import { it, expect } from "vitest";
import {
  estimateImageCostMicros,
  estimateCostMicros,
  type ProviderRate,
} from "../../shared/platformAdmin";
const rate: ProviderRate = {
  provider: "openai",
  model: "gpt-image-2.5-sunburst",
  kind: "image",
  credits: 10,
  inputPerMillion: 5,
  cachedInputPerMillion: 1.25,
  outputPerMillion: 0,
  perRequestUsd: null,
  imageInputPerMillion: 8,
  imageOutputPerMillion: 30,
  note: "Verified standard pricing",
};
const usage = {
  _evokeloop_api: "images",
  input_tokens: 2932,
  input_tokens_details: { text_tokens: 1283, image_tokens: 1649 },
  output_tokens: 628,
  output_tokens_details: { text_tokens: 0, image_tokens: 628 },
};
it("calculates real recorded Sunburst usage by modality, rather than pricing all input as text", () => {
  expect(estimateImageCostMicros(rate, usage)).toBe(38447);
  expect(
    estimateImageCostMicros(rate, {
      ...usage,
      input_tokens: 2881,
      input_tokens_details: { text_tokens: 1232, image_tokens: 1649 },
    })
  ).toBe(38192);
  expect(
    estimateImageCostMicros(rate, {
      ...usage,
      input_tokens_details: {
        ...usage.input_tokens_details,
        cached_tokens: 100,
      },
    })
  ).toBe(38447);
});
it("does not guess missing rates, invalid token categories, or Responses API image cache usage", () => {
  expect(
    estimateImageCostMicros({ ...rate, imageInputPerMillion: null }, usage)
  ).toBeNull();
  expect(
    estimateImageCostMicros(rate, { ...usage, _evokeloop_api: "responses" })
  ).toBeNull();
  expect(
    estimateImageCostMicros(rate, { ...usage, input_tokens: 1 })
  ).toBeNull();
  expect(
    estimateImageCostMicros(rate, {
      ...usage,
      input_tokens_details: { text_tokens: -1, image_tokens: 2933 },
    })
  ).toBeNull();
  expect(
    estimateImageCostMicros(rate, {
      ...usage,
      output_tokens_details: { text_tokens: 0, image_tokens: 500 },
    })
  ).toBeNull();
  expect(estimateImageCostMicros(rate, {})).toBeNull();
});
it("handles documented image output totals without optional output breakdown and text-only inputs", () => {
  expect(
    estimateImageCostMicros(rate, {
      ...usage,
      output_tokens_details: undefined,
    })
  ).toBe(38447);
  expect(
    estimateImageCostMicros(
      { ...rate, imageInputPerMillion: null },
      {
        ...usage,
        input_tokens: 1283,
        input_tokens_details: { text_tokens: 1283, image_tokens: 0 },
      }
    )
  ).toBe(25255);
});
it("preserves explicit per-request overrides and rejects invalid cached text usage", () => {
  expect(estimateImageCostMicros({ ...rate, perRequestUsd: 0.2 }, {})).toBe(
    200000
  );
  expect(estimateCostMicros(rate, 100, 100, 101)).toBeNull();
  expect(estimateCostMicros(rate, -1, 100)).toBeNull();
});
it("uses model token rates for completed images regardless of a shared reservation estimate", () => {
  const reportedUsage = {
    _evokeloop_api: "images",
    input_tokens: 2000,
    input_tokens_details: { text_tokens: 1000, image_tokens: 1000 },
    output_tokens: 1000,
  };
  const models = [
    ["gpt-image-2.5-sunburst", 5, 8, 30, 43000],
    ["gpt-image-2.5-flare", 5, 8, 30, 43000],
    ["gpt-image-2", 5, 8, 30, 43000],
    ["gpt-image-1.5", 5, 8, 32, 45000],
    ["gpt-image-1", 5, 10, 40, 55000],
    ["gpt-image-1-mini", 2, 2.5, 8, 12500],
  ] as const;
  for (const [
    model,
    inputPerMillion,
    imageInputPerMillion,
    imageOutputPerMillion,
    expected,
  ] of models) {
    expect(
      estimateImageCostMicros(
        {
          ...rate,
          model,
          inputPerMillion,
          imageInputPerMillion,
          imageOutputPerMillion,
          estimatedCostMicros: 200000,
        },
        reportedUsage
      )
    ).toBe(expected);
  }
});
