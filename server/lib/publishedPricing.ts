import { createHash } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { providerRates } from "../../drizzle/platformSchema";
import { getDb } from "../db";
import type { ProviderRate } from "../../shared/platformAdmin";

const models = [
  "gpt-5.5",
  "gpt-image-2.5-sunburst",
  "gpt-image-2.5-flare",
  "gpt-image-2",
  "gpt-image-1.5",
  "gpt-image-1",
  "gpt-image-1-mini",
] as const;
const day = 86400000;
/** The central image table is authoritative when a model page omits prices. */
export function parsePublishedImagePricing(model: string, markdown: string) {
  if (
    !models.includes(model as (typeof models)[number]) ||
    !model.startsWith("gpt-image-")
  )
    throw new Error("Unrecognized image model");
  const imageSection = markdown.split(/\nImage generation models\n/)[1];
  const standard = imageSection
    ?.split(/\nStandard\n/)[1]
    ?.split(/\nBatch\n/)[0];
  if (
    !imageSection?.includes("Prices per 1M tokens.") ||
    !standard?.includes("| Model | Modality | Input | Cached input | Output |")
  )
    throw new Error("Standard image pricing unavailable");
  const rows = standard
    .split("\n")
    .filter(line => line.startsWith(`| ${model} |`))
    .map(line =>
      line
        .split("|")
        .slice(1, -1)
        .map(v => v.trim())
    );
  const text = rows.filter(row => row[1] === "Text"),
    image = rows.filter(row => row[1] === "Image");
  if (
    rows.length !== 2 ||
    text.length !== 1 ||
    image.length !== 1 ||
    rows.some(row => row.length !== 5)
  )
    throw new Error("Ambiguous model pricing; review required");
  const price = (value: string, allowNoOutput = false) => {
    if (value === "-" && allowNoOutput) return 0;
    if (!/^\$[0-9]+(?:\.[0-9]+)?$/.test(value))
      throw new Error("Invalid image price");
    const n = Number(value.slice(1));
    if (!Number.isFinite(n) || n > 1000000)
      throw new Error("Invalid image price");
    return n;
  };
  return {
    prices: {
      inputPerMillion: price(text[0][2]),
      cachedInputPerMillion: price(text[0][3]),
      outputPerMillion: price(text[0][4], true),
      imageInputPerMillion: price(image[0][2]),
      imageOutputPerMillion: price(image[0][4]),
      perRequestUsd: null,
    } satisfies Partial<ProviderRate>,
    version: createHash("sha256")
      .update(rows.map(row => row.join("|")).join("\n"))
      .digest("hex")
      .slice(0, 16),
  };
}
export function parsePublishedPricing(model: string, markdown: string) {
  if (
    !models.includes(model as (typeof models)[number]) ||
    !markdown.includes(`Model ID: \`${model}\``)
  )
    throw new Error("Unrecognized pricing document");
  const section = markdown.match(/## Pricing\n([\s\S]*?)(?=\n## |$)/)?.[1];
  if (!section) throw new Error("Pricing section unavailable");
  function tokens(heading: string, metric: string) {
    const block = section!
      .split(`### ${heading}\n`)[1]
      ?.split(/\n### |\n## /)[0];
    const matches = Array.from(
      (block ?? "").matchAll(
        new RegExp(
          `^\\| ${metric} \\| \\$([0-9]+(?:\\.[0-9]+)?) \\| 1M tokens \\|$`,
          "gm"
        )
      )
    );
    if (matches.length !== 1)
      throw new Error("Pricing format changed; review required");
    const value = Number(matches[0][1]);
    if (!Number.isFinite(value) || value < 0 || value > 1000000)
      throw new Error("Invalid published price");
    return value;
  }
  const prices: Partial<ProviderRate> = {
    inputPerMillion: tokens("Text tokens", "Input"),
    cachedInputPerMillion: tokens("Text tokens", "Cached input"),
    perRequestUsd: null,
  };
  if (model === "gpt-5.5") {
    const context = section.match(
      /prompts with >([\d.]+)K input tokens are priced at ([\d.]+)x input and ([\d.]+)x output/
    );
    if (!context) throw new Error("Long-context pricing requires review");
    prices.outputPerMillion = tokens("Text tokens", "Output");
    prices.longContextThreshold = Number(context[1]) * 1000;
    prices.longContextInputMultiplier = Number(context[2]);
    prices.longContextOutputMultiplier = Number(context[3]);
  } else {
    prices.imageInputPerMillion = tokens("Image tokens", "Input");
    prices.imageOutputPerMillion = tokens("Image tokens", "Output");
    prices.outputPerMillion = section.includes("Text output is not billed")
      ? 0
      : tokens("Text tokens", "Output");
  }
  return {
    prices,
    version: createHash("sha256").update(section).digest("hex").slice(0, 16),
  };
}
function isAutomatic(rate: ProviderRate) {
  if (rate.automaticPricing !== undefined) return rate.automaticPricing;
  // Only adopt the exact originally seeded standard rates. Never overwrite an
  // existing contract override simply because its model name matches.
  if (rate.perRequestUsd !== null) return false;
  if (rate.model === "gpt-5.5")
    return (
      rate.inputPerMillion === 5 &&
      rate.cachedInputPerMillion === 0.5 &&
      rate.outputPerMillion === 30 &&
      rate.note.startsWith(
        "Standard global API list pricing verified 2026-09-30"
      )
    );
  return (
    rate.pricingVersion === "openai-sunburst-2026-09-30" &&
    rate.inputPerMillion === 5 &&
    rate.imageInputPerMillion === 8 &&
    rate.imageOutputPerMillion === 30
  );
}
let pending: Promise<void> | undefined;
export async function syncPublishedPricing(force = false) {
  if (pending) return pending;
  pending = (async () => {
    const db = await getDb();
    if (!db) return;
    const rates = await db
      .select()
      .from(providerRates)
      .where(eq(providerRates.provider, "openai"));
    for (const row of rates) {
      if (
        !models.includes(row.model as (typeof models)[number]) ||
        !isAutomatic(row.config)
      )
        continue;
      if (!force && Date.now() - (row.config.pricingCheckedAt ?? 0) < day)
        continue;
      const imageModel = row.model.startsWith("gpt-image-");
      const sourceUrl = imageModel
        ? "https://developers.openai.com/api/docs/pricing"
        : `https://developers.openai.com/api/docs/models/${row.model}`;
      let config: ProviderRate;
      try {
        const response = await fetch(sourceUrl + ".md", {
          signal: AbortSignal.timeout(15000),
          redirect: "error",
        });
        if (!response.ok) throw new Error("Published pricing unavailable");
        const markdown = await response.text();
        if (markdown.length > 200000)
          throw new Error("Unexpected pricing document");
        const { prices, version } = imageModel
          ? parsePublishedImagePricing(row.model, markdown)
          : parsePublishedPricing(row.model, markdown);
        config = {
          ...row.config,
          ...prices,
          automaticPricing: true,
          sourceUrl,
          pricingVersion: `published-${version}`,
          pricingVerifiedAt: Date.now(),
          pricingCheckedAt: Date.now(),
          pricingError: "",
          note: "Automatically checked official standard global pricing. Direct Images API has no cache discount. Contract discounts, nonstandard processing tiers, and billing adjustments require reconciliation.",
        };
      } catch {
        config = {
          ...row.config,
          automaticPricing: true,
          pricingCheckedAt: Date.now(),
          pricingError:
            "Could not verify published pricing. Last known rates retained; review the official source before billing customers.",
        };
      }
      // Optimistic concurrency prevents the scheduled check overwriting an admin edit.
      await db
        .update(providerRates)
        .set({ config, updatedAtMs: Date.now() })
        .where(
          and(
            eq(providerRates.id, row.id),
            eq(providerRates.updatedAtMs, row.updatedAtMs)
          )
        );
    }
  })().finally(() => {
    pending = undefined;
  });
  return pending;
}
export function startPublishedPricingChecks() {
  const run = () => {
    void syncPublishedPricing().catch(() =>
      console.error("Published pricing check unavailable")
    );
  };
  run();
  const interval = setInterval(run, 6 * 60 * 60 * 1000);
  interval.unref();
}
