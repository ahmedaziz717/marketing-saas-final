import { expect, it } from "vitest";
import {
  parsePublishedPricing,
  parsePublishedImagePricing,
} from "./publishedPricing";
const text =
  "Model ID: `gpt-5.5`\n## Pricing\n### Text tokens\n| Input | $5 | 1M tokens |\n| Cached input | $0.5 | 1M tokens |\n| Output | $30 | 1M tokens |\nprompts with >272K input tokens are priced at 2x input and 1.5x output\n## Other";
it("reads exact image model standard rates without using batch or adjacent model prices", () => {
  const pricing =
    "# Pricing\nImage generation models\nPrices per 1M tokens.\nStandard\n| Model | Modality | Input | Cached input | Output |\n| gpt-image-2 | Image | $8.00 | $2.00 | $30.00 |\n| gpt-image-2 | Text | $5.00 | $1.25 | - |\n| gpt-image-1 | Image | $10.00 | $2.50 | $40.00 |\nBatch\n| gpt-image-2 | Image | $4.00 | $1.00 | $15.00 |\n| gpt-image-2 | Text | $2.50 | $0.625 | - |";
  expect(
    parsePublishedImagePricing("gpt-image-2", pricing).prices
  ).toMatchObject({
    inputPerMillion: 5,
    imageInputPerMillion: 8,
    imageOutputPerMillion: 30,
    outputPerMillion: 0,
  });
  expect(() => parsePublishedImagePricing("gpt-image-1", pricing)).toThrow();
  expect(() =>
    parsePublishedImagePricing(
      "gpt-image-2",
      pricing.replace("Prices per 1M tokens.", "Prices per 1K tokens.")
    )
  ).toThrow();
  expect(() =>
    parsePublishedImagePricing(
      "gpt-image-2",
      pricing.replace(
        "| gpt-image-1 | Image | $10.00 | $2.50 | $40.00 |",
        "| gpt-image-2 | Image | $10.00 | $2.50 | $40.00 |"
      )
    )
  ).toThrow();
});
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
