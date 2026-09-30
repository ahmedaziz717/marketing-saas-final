import { expect, it } from "vitest";
import { parsePublishedPricing } from "./publishedPricing";
const text =
  "Model ID: `gpt-5.5`\n## Pricing\n### Text tokens\n| Input | $5 | 1M tokens |\n| Cached input | $0.5 | 1M tokens |\n| Output | $30 | 1M tokens |\nprompts with >272K input tokens are priced at 2x input and 1.5x output\n## Other";
it("reads exact-model standard pricing and long context, with a content version", () => {
  const parsed = parsePublishedPricing("gpt-5.5", text);
  expect(parsed.prices).toMatchObject({
    inputPerMillion: 5,
    cachedInputPerMillion: 0.5,
    outputPerMillion: 30,
    longContextThreshold: 272000,
    longContextInputMultiplier: 2,
  });
  expect(
    parsePublishedPricing("gpt-5.5", text.replace("$30", "$32")).version
  ).not.toBe(parsed.version);
});
it("rejects missing, ambiguous, wrong-model, or differently-unitized prices", () => {
  for (const invalid of [
    text.replace("1M tokens", "1K tokens"),
    text.replace(">272K", "large"),
    text.replace(
      "| Input | $5 | 1M tokens |",
      "| Input | $5 | 1M tokens |\n| Input | $8 | 1M tokens |"
    ),
  ])
    expect(() => parsePublishedPricing("gpt-5.5", invalid)).toThrow();
  expect(() => parsePublishedPricing("other", text)).toThrow();
});
it("prices image and text input independently", () => {
  const document =
    "Model ID: `gpt-image-2.5-sunburst`\n## Pricing\n### Text tokens\n| Input | $5 | 1M tokens |\n| Cached input | $1.25 | 1M tokens |\n### Image tokens\n| Input | $8 | 1M tokens |\n| Output | $30 | 1M tokens |\nText output is not billed";
  expect(
    parsePublishedPricing("gpt-image-2.5-sunburst", document).prices
  ).toMatchObject({
    inputPerMillion: 5,
    imageInputPerMillion: 8,
    imageOutputPerMillion: 30,
    outputPerMillion: 0,
  });
});
