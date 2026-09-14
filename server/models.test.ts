import { describe, expect, it } from "vitest";
import {
  REQUIRED_IMAGE_MODEL_ID,
  REQUIRED_TEXT_MODEL_ID,
  requireLatestGptImageModel,
  requireLatestGptTextModel,
} from "./lib/models";

describe("GPT-only model policy", () => {
  it("requires GPT-5.5 rather than falling back to an older or non-GPT language model", () => {
    expect(requireLatestGptTextModel([{ id: "claude-sonnet-4-6" }, { id: REQUIRED_TEXT_MODEL_ID }])).toBe(REQUIRED_TEXT_MODEL_ID);
    expect(() => requireLatestGptTextModel([{ id: "gpt-5-mini" }, { id: "gemini-3-flash-preview" }])).toThrow(REQUIRED_TEXT_MODEL_ID);
  });

  it("requires the exact requested image model rather than falling back to a different image model", () => {
    expect(requireLatestGptImageModel([{ model: "old-enum", id: "gpt-image-2" }, { model: "provider-advertised-value", id: REQUIRED_IMAGE_MODEL_ID }])).toBe("provider-advertised-value");
    expect(() => requireLatestGptImageModel([{ model: "MODEL_GEMINI_2_5_FLASH_IMAGE" }])).toThrow(REQUIRED_IMAGE_MODEL_ID);
  });
});
