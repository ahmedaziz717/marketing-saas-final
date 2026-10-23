import { beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_IMAGE_MODEL, generationModel } from "../shared/modelCatalog";
import { defaultCreativeSetup } from "../shared/creativeBuilder";
import {
  buildCreativePrompt,
  type BuilderBrandKit,
} from "./lib/creativeBuilder";
import {
  assertImagePromptBudget,
  IMAGE_PROMPT_TOO_LONG,
} from "./lib/imagePromptBudget";
import { categorizeGenerationError } from "./lib/generation";
const model = generationModel(DEFAULT_IMAGE_MODEL)!;
describe("assembled image prompt budgets", () => {
  it("accepts the exact limit and rejects overflow", () => {
    expect(() =>
      assertImagePromptBudget("x".repeat(32_000), model)
    ).not.toThrow();
    expect(() => assertImagePromptBudget("x".repeat(32_001), model)).toThrow(
      IMAGE_PROMPT_TOO_LONG
    );
  });
  it("uses the selected provider schema limit", () => {
    const limited = {
      ...model,
      provider: "higgsfield" as const,
      inputSchema: { properties: { prompt: { maxLength: 600 } } },
    };
    expect(() =>
      assertImagePromptBudget("x".repeat(600), limited)
    ).not.toThrow();
    expect(() => assertImagePromptBudget("x".repeat(601), limited)).toThrow(
      IMAGE_PROMPT_TOO_LONG
    );
  });
  it("never truncates selected copy or original brand requirements to fit", () => {
    const brand = {
      name: "Business",
      voice: "x".repeat(30_000),
      colors: [],
      fonts: [],
      requiredClaims: "Terms apply",
      prohibitedContent: "No invented claims",
    } as unknown as BuilderBrandKit;
    const original = structuredClone(brand);
    expect(() =>
      buildCreativePrompt({
        setup: defaultCreativeSetup(),
        brand,
        products: [],
        formatId: "story_9_16",
        hasLogo: false,
      })
    ).toThrow(IMAGE_PROMPT_TOO_LONG);
    expect(brand).toEqual(original);
  });
  it("returns an actionable safe error rather than raw provider content", () => {
    for (const error of [
      IMAGE_PROMPT_TOO_LONG,
      "400 string_above_max_length: invalid prompt secret content",
    ]) {
      expect(categorizeGenerationError(error)).toEqual({
        category: "prompt_length",
        userMessage: IMAGE_PROMPT_TOO_LONG,
      });
    }
  });
});
