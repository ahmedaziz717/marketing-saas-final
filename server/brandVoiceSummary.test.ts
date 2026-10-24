import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  download: vi.fn(),
  upload: vi.fn(),
  llm: vi.fn(),
}));
vi.mock("./storage", () => ({
  assetBucket: () => "test",
  storageClient: () => ({ storage: { from: () => mocks } }),
}));
vi.mock("./_core/llm", () => ({ invokeLLM: mocks.llm }));
vi.mock("./lib/promptRegistry", () => ({
  applicationPrompt: async () => ({
    version: 1,
    value: "Summarize faithfully",
  }),
}));
import {
  generationBrand,
  previewGenerationBrand,
  brandSummaryKey,
  BRAND_SUMMARY_FAILED,
} from "./lib/brandVoiceSummary";
import {
  buildCreativePrompt,
  type BuilderBrandKit,
} from "./lib/creativeBuilder";
import { defaultCreativeSetup } from "../shared/creativeBuilder";
import { categorizeGenerationError } from "./lib/generation";
const summary = {
  identity: "Independent IT provider",
  audience: "Small businesses",
  tone: "Clear and practical",
  messagingPriorities: "Dependable support",
  doRules: "Explain tradeoffs",
  dontRules: "Never guarantee compliance",
  constraints: "Qualify availability",
};
const brand = {
  name: "Business",
  voice: "A long guide. ".repeat(2200),
  colors: [],
  fonts: [],
  requiredClaims: "Terms apply",
  prohibitedContent: "No invented endorsements",
} as unknown as BuilderBrandKit;
beforeEach(() => {
  vi.clearAllMocks();
  mocks.download.mockResolvedValue({
    error: { statusCode: "404" },
    data: null,
  });
  mocks.upload.mockResolvedValue({ error: null });
  mocks.llm.mockResolvedValue({
    choices: [
      {
        finish_reason: "stop",
        message: {
          content: JSON.stringify({ ...summary, cannotSummarize: false }),
        },
      },
    ],
  });
});
describe("cached semantic brand voice", () => {
  it("previews precisely the cached voice used by generation without AI or writes", async () => {
    mocks.download.mockResolvedValue({
      error: null,
      data: { text: async () => JSON.stringify(summary) },
    });
    const preview = await previewGenerationBrand(17, brand);
    const generated = await generationBrand(17, brand);
    expect(preview.status).toBe("ready");
    expect(preview.voice).toBe(generated.voice);
    expect(mocks.download.mock.calls[0][0]).toBe(
      mocks.download.mock.calls[1][0]
    );
    expect(mocks.llm).not.toHaveBeenCalled();
    expect(mocks.upload).not.toHaveBeenCalled();
  });
  it("does not replace a missing summary with an excerpt or trigger generation", async () => {
    const preview = await previewGenerationBrand(17, brand);
    expect(preview).toMatchObject({
      status: "pending",
      voice: null,
      summarized: true,
    });
    expect(JSON.stringify(preview)).not.toContain(brand.voice!);
    expect(mocks.llm).not.toHaveBeenCalled();
    expect(mocks.upload).not.toHaveBeenCalled();
    await previewGenerationBrand(81, {
      ...brand,
      voice: brand.voice + "Changed",
    });
    expect(mocks.download.mock.calls[1][0]).not.toBe(
      mocks.download.mock.calls[0][0]
    );
  });
  it("previews short guides unchanged and reports cache outages without spending", async () => {
    expect(
      await previewGenerationBrand(17, {
        ...brand,
        voice: "Practical guidance",
      })
    ).toMatchObject({
      status: "ready",
      voice: "Practical guidance",
      summarized: false,
    });
    mocks.download.mockResolvedValue({ error: { statusCode: "503" } });
    expect(await previewGenerationBrand(17, brand)).toMatchObject({
      status: "unavailable",
      voice: null,
    });
    expect(mocks.llm).not.toHaveBeenCalled();
    expect(mocks.upload).not.toHaveBeenCalled();
  });
  it.each([17, 81])(
    "summarizes workspace %s without mutating its original guide",
    async organizationId => {
      const source = structuredClone(brand);
      const result = await generationBrand(organizationId, source);
      expect(source).toEqual(brand);
      expect(JSON.parse(result.voice!)).toEqual(summary);
      expect(mocks.llm.mock.calls[0][0].messages[1].content).toContain(
        brand.voice
      );
      expect(mocks.llm.mock.calls[0][0].includedInAction).toBe(true);
      const prompt = buildCreativePrompt({
        setup: defaultCreativeSetup(),
        brand: result,
        products: [],
        formatId: "story_9_16",
        hasLogo: false,
      });
      expect(prompt.length).toBeLessThan(32000);
      expect(prompt).toContain("Never guarantee compliance");
      expect(prompt).toContain("Terms apply");
      expect(prompt).not.toContain(brand.voice!);
    }
  );
  it("reuses persisted summary across calls without invoking AI", async () => {
    mocks.download.mockResolvedValue({
      error: null,
      data: { text: async () => JSON.stringify(summary) },
    });
    await generationBrand(17, brand);
    await generationBrand(17, brand);
    expect(mocks.llm).not.toHaveBeenCalled();
    expect(mocks.upload).not.toHaveBeenCalled();
  });
  it("invalidates on source or policy edits and isolates workspaces", () => {
    const key = brandSummaryKey(17, brand);
    expect(brandSummaryKey(81, brand)).not.toBe(key);
    expect(
      brandSummaryKey(17, { ...brand, voice: brand.voice + "new" })
    ).not.toBe(key);
    expect(
      brandSummaryKey(17, { ...brand, prohibitedContent: "New rule" })
    ).not.toBe(key);
  });
  it("coalesces concurrent requests within a worker", async () => {
    await Promise.all([generationBrand(17, brand), generationBrand(17, brand)]);
    expect(mocks.llm).toHaveBeenCalledTimes(1);
  });
  it.each([
    "not json",
    JSON.stringify({ ...summary, cannotSummarize: true }),
    JSON.stringify({
      ...summary,
      tone: "x".repeat(7000),
      cannotSummarize: false,
    }),
  ])("fails closed for unsafe summary %s", async content => {
    mocks.llm.mockResolvedValue({
      choices: [{ finish_reason: "stop", message: { content } }],
    });
    await expect(generationBrand(17, brand)).rejects.toThrow(
      BRAND_SUMMARY_FAILED
    );
    expect(mocks.upload).not.toHaveBeenCalled();
    expect(categorizeGenerationError(BRAND_SUMMARY_FAILED).category).toBe(
      "brand_summary"
    );
  });
  it("does not spend on cache outages, or short guides", async () => {
    mocks.download.mockResolvedValue({ error: { statusCode: "503" } });
    await expect(generationBrand(17, brand)).rejects.toThrow(
      BRAND_SUMMARY_FAILED
    );
    expect(
      await generationBrand(17, { ...brand, voice: "Warm and practical" })
    ).toEqual({ ...brand, voice: "Warm and practical" });
    expect(mocks.llm).not.toHaveBeenCalled();
  });
});
