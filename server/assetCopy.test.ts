import { beforeEach, expect, it, vi } from "vitest";
const llm = vi.hoisted(() => vi.fn());
vi.mock("./_core/llm", () => ({
  listLLMModels: async () => ({ data: [{ id: "test-model" }] }),
  invokeLLM: llm,
}));
vi.mock("./lib/models", () => ({
  requireLatestGptTextModel: () => "test-model",
}));
import { generateAssetCopy } from "./lib/assetCopy";
import {
  assetCopyRequestSchema,
  copyContentFromSets,
  replaceCopyOption,
} from "../shared/adCopy";
import { metaTextFeed } from "../shared/metaCreative";
import { contentSchema } from "../shared/channels";
const options = Array.from({ length: 5 }, (_, i) => ({
  message: `Primary text ${i + 1}`,
  headline: `Headline ${i + 1}`,
  description: `Description ${i + 1}`,
}));
const input = () =>
  assetCopyRequestSchema.parse({ organizationId: 1, assetKeys: ["asset:1"] });
const response = (data: unknown) =>
  llm.mockResolvedValue({
    choices: [{ message: { content: JSON.stringify(data) } }],
  });
beforeEach(() => llm.mockReset());
it("generates five complete sets and carries all 15 values into the Meta feed", async () => {
  response({ options });
  const result = await generateAssetCopy(input(), { brand: "Test" }, [
    "data:image/jpeg;base64,test",
  ]);
  expect(result.options).toHaveLength(5);
  expect(llm.mock.calls[0][0].messages[0].content).toContain("exactly 5");
  const saved = contentSchema.parse({
    title: "Five options",
    ...copyContentFromSets(result.options),
  });
  const feed = metaTextFeed(saved);
  expect(feed.bodies).toEqual(options.map(o => ({ text: o.message })));
  expect(feed.titles).toEqual(options.map(o => ({ text: o.headline })));
  expect(feed.descriptions).toEqual(
    options.map(o => ({ text: o.description }))
  );
});
it.each([3, 6])(
  "rejects %i sets instead of silently applying an incomplete/oversized response",
  async count => {
    response({
      options: Array.from({ length: count }, (_, i) => ({
        message: `M${i}`,
        headline: `H${i}`,
        description: `D${i}`,
      })),
    });
    await expect(generateAssetCopy(input(), {}, [])).rejects.toThrow(
      "existing copy is unchanged"
    );
  }
);
it("rejects duplicate or empty ad fields", async () => {
  for (const invalid of [
    options.map(o => ({ ...o, headline: "Same" })),
    options.map(o => ({ ...o, description: " " })),
  ]) {
    response({ options: invalid });
    await expect(generateAssetCopy(input(), {}, [])).rejects.toThrow(
      "existing copy is unchanged"
    );
  }
});
it("generates only the selected field and leaves the other 14 values unchanged", async () => {
  response({ text: "A fresh headline" });
  const target = { index: 2, field: "headline" as const };
  const result = await generateAssetCopy(
    { ...input(), currentOptions: options, regeneration: target },
    {},
    []
  );
  expect(result.options).toEqual([
    { ...options[2], headline: "A fresh headline" },
  ]);
  expect(llm.mock.calls[0][0].messages[0].content).toContain(
    "Rewrite only the headline"
  );
  const original = copyContentFromSets(options);
  const next = replaceCopyOption(original, target, result.options[0]);
  expect(next).toEqual({
    ...original,
    textVariants: {
      ...original.textVariants,
      headlines: ["Headline 2", "A fresh headline", "Headline 4", "Headline 5"],
    },
  });
  response({ text: options[1].headline });
  await expect(
    generateAssetCopy(
      { ...input(), currentOptions: options, regeneration: target },
      {},
      []
    )
  ).rejects.toThrow("unchanged");
});
it("regenerates one whole set without changing the other four", async () => {
  const replacement = {
    message: "New primary",
    headline: "New title",
    description: "New description",
  };
  response({ options: [replacement] });
  const target = { index: 4, field: "set" as const };
  const result = await generateAssetCopy(
    { ...input(), currentOptions: options, regeneration: target },
    {},
    []
  );
  expect(llm.mock.calls[0][0].messages[0].content).toContain("exactly 1");
  expect(
    replaceCopyOption(copyContentFromSets(options), target, result.options[0])
  ).toEqual(copyContentFromSets([...options.slice(0, 4), replacement]));
});
it("validates regeneration indexes and keeps organic generation at three captions", async () => {
  expect(
    assetCopyRequestSchema.safeParse({
      ...input(),
      currentOptions: options,
      regeneration: { index: 5, field: "set" },
    }).success
  ).toBe(false);
  expect(
    assetCopyRequestSchema.safeParse({
      ...input(),
      regeneration: { index: 0, field: "headline" },
    }).success
  ).toBe(false);
  response({ options: options.slice(0, 3) });
  expect(
    (await generateAssetCopy({ ...input(), channel: "facebook" }, {}, []))
      .options
  ).toHaveLength(3);
});
