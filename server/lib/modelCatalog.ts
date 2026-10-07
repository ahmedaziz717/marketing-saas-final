import { providerRequestRate } from "./providerQuote";
import { videoQuote } from "./videoPricing";
import {
  defaultVideoSetup,
  videoModelOptions,
  type VideoReference,
} from "../../shared/videoCreation";
import { and, eq } from "drizzle-orm";
import { aiModelSettings, providerRates } from "../../drizzle/platformSchema";
import {
  generationModels,
  generationModel,
  DEFAULT_IMAGE_MODEL,
  DEFAULT_VIDEO_MODEL,
  modelDefaults,
  modelRequestBody,
  modelOptionsProblem,
  modelVideoMode,
  requiresVideo,
  type ModelOptions,
  type ModelDefinition,
  OPENAI_IMAGE_MODELS,
} from "../../shared/modelCatalog";
import type { ProviderRate } from "../../shared/platformAdmin";
import {
  estimatedActionCredits,
  retailCredits,
  rateCreditPolicy,
} from "../../shared/aiCredits";
import {
  estimateOpenAIImageAction,
  defaultImageActionAssumptions,
  type ImageActionAssumptions,
  imageProviderSize,
  type ImageOutputSize,
} from "../../shared/imageActionEstimate";
import {
  defaultVideoActionAssumptions,
  type VideoActionAssumptions,
} from "../../shared/videoActionEstimate";
import { effectiveRate, getCreditPolicy } from "./creditPricing";
import type { LibraryDatabase, LibraryTransaction } from "./assetLibrary";
import { ENV } from "../_core/env";
import { higgsfieldConfigured } from "./higgsfield";
type Database = LibraryDatabase | LibraryTransaction;
export function defaultModelRate(model: ModelDefinition): ProviderRate {
  const isOpenAI = model.provider === "openai";
  const known =
    isOpenAI &&
    (model.providerModel.includes("2.5") ||
      model.providerModel === "gpt-image-2");
  return {
    provider: model.provider,
    model: model.providerModel,
    kind: model.kind,
    credits: 0,
    inputPerMillion: known ? 5 : null,
    cachedInputPerMillion: known ? 1.25 : null,
    outputPerMillion: isOpenAI ? 0 : null,
    imageInputPerMillion: known ? 8 : undefined,
    imageOutputPerMillion: known ? 30 : undefined,
    perRequestUsd: null,
    costRules: model.costRules,
    billingMode: "cost",
    markupPercent: null,
    estimatedCostMicros: isOpenAI ? 200000 : undefined,
    automaticPricing: isOpenAI,
    sourceUrl: model.sourceUrl,
    pricingVerifiedAt: isOpenAI ? undefined : model.verifiedAt,
    pricingCheckedAt: isOpenAI ? undefined : model.verifiedAt,
    pricingVersion: "catalog-2026-10-05",
    note: model.pricingNote.slice(0, 1000),
  };
}
export async function initializeModelCatalog(db: Database) {
  await db
    .insert(providerRates)
    .values(
      generationModels.map(model => ({
        provider: model.provider,
        model: model.providerModel,
        kind: model.kind,
        config: defaultModelRate(model),
        updatedAtMs: Date.now(),
      }))
    )
    .onConflictDoNothing();
}
export function compatibleRoutes(id: string) {
  const model = generationModel(id);
  if (!model) return [];
  const suffix = id.includes("sunburst")
    ? "sunburst"
    : id.includes("flare")
      ? "flare"
      : null;
  return suffix
    ? generationModels
        .filter(m => m.kind === model.kind && m.providerModel.endsWith(suffix))
        .map(m => m.id)
    : [id];
}
export async function resolveModel(
  db: Database,
  id: string | undefined,
  kind: "image" | "video"
) {
  const requested =
    id || (kind === "image" ? DEFAULT_IMAGE_MODEL : DEFAULT_VIDEO_MODEL);
  const original = generationModel(requested);
  if (!original || original.kind !== kind)
    throw new Error("Choose a supported generation model.");
  const [setting] = await db
    .select()
    .from(aiModelSettings)
    .where(eq(aiModelSettings.id, requested));
  if (setting?.enabled === 0)
    throw new Error("This model is currently disabled. Choose another model.");
  const route = setting?.routeId || requested;
  if (!compatibleRoutes(requested).includes(route))
    throw new Error("This model route requires administrator review.");
  const model = generationModel(route)!;
  const [routeSetting] =
    route === requested
      ? [setting]
      : await db
          .select()
          .from(aiModelSettings)
          .where(eq(aiModelSettings.id, route));
  if (
    routeSetting?.enabled === 0 ||
    routeSetting?.availability === "unavailable"
  )
    throw new Error(
      "This model is unavailable with the provider account. Choose another model."
    );
  if (
    model.provider === "openai" &&
    model.id !== DEFAULT_IMAGE_MODEL &&
    routeSetting?.availability !== "available"
  )
    throw new Error(
      "This OpenAI model is awaiting account availability verification."
    );
  return model;
}
export async function modelRate(
  db: Database,
  model: ModelDefinition,
  options: ModelOptions = {}
) {
  const rate = await effectiveRate(
    db,
    model.provider,
    model.providerModel,
    model.kind,
    defaultModelRate(model)
  );
  if (
    model.provider === "openai" &&
    !(
      rate.pricingVerifiedAt ||
      rate.pricingVersion === "openai-sunburst-2026-09-30"
    )
  )
    throw new Error("This model requires verified pricing before generation.");
  const problem = modelOptionsProblem(model, options);
  if (problem) throw new Error(problem);
  return model.provider === "higgsfield"
    ? rate
    : configuredModelRate(model, rate, options);
}
export function configuredModelRate(
  model: ModelDefinition,
  rate: ProviderRate,
  options: ModelOptions = {},
  imageSize = defaultImageActionAssumptions.size
) {
  const settings = { ...modelDefaults(model), ...options };
  if (model.provider === "openai") {
    if (rate.perRequestUsd != null) return rate;
    return {
      ...rate,
      estimatedCostMicros: estimateOpenAIImageAction(rate, {
        ...defaultImageActionAssumptions,
        size: imageSize,
        quality: String(
          settings.quality ?? "medium"
        ) as ImageActionAssumptions["quality"],
      }).costMicros,
    };
  }
  if (rate.perRequestUsd != null || rate.perSecondUsd != null) return rate;
  if (
    model.providerModel.includes("seedance-2.") ||
    model.providerModel.includes("cinema-studio/4.0")
  )
    return {
      ...rate,
      outputPerMillion: model.providerModel.includes("seedance-2.0")
        ? String(settings.resolution).toLowerCase() === "4k"
          ? 8
          : 14
        : settings.resolution === "1080p"
          ? 23.4
          : 21.4,
      videoInputMultiplier: 0.6,
    };
  const rules = rate.costRules ?? model.costRules;
  const matching = rules.filter(rule =>
    Object.entries(rule.when).every(([k, v]) => settings[k] === v)
  );
  // Published ranges do not provide every configuration. Use their upper bound
  // as a clearly labeled estimate, never a fabricated exact provider invoice.
  const candidates = matching.length ? matching : rules;
  if (!candidates.length)
    throw new Error(
      "This model needs verified provider pricing before it can run."
    );
  const usd = Math.max(...candidates.map(rule => rule.usd));
  const unit = candidates[0].unit;
  if (unit === "second") return { ...rate, perSecondUsd: usd };
  return { ...rate, perRequestUsd: usd };
}
export async function imageModelQuote(
  db: Database,
  id?: string,
  options: ModelOptions = {},
  outputSize?: ImageOutputSize,
  request?: Record<string, unknown>
) {
  const model = await resolveModel(db, id, "image");
  let rate = await modelRate(db, model, options);
  if (outputSize && model.provider === "openai")
    rate = configuredModelRate(
      model,
      rate,
      options,
      imageProviderSize(
        model.providerModel,
        outputSize.width,
        outputSize.height
      )
    );
  if (model.provider === "higgsfield")
    rate = await providerRequestRate(
      rate,
      model.providerModel,
      request ??
        modelRequestBody(model, {
          prompt: "Image generation",
          images: [],
          options,
        })
    );
  return { model, rate, credits: estimatedActionCredits(rate) };
}
export async function imageBatchQuote(
  db: Database,
  id: string | undefined,
  options: ModelOptions = {},
  outputs: ImageOutputSize[]
) {
  const quotes = [];
  // Quote each provider canvas separately; do not reuse a square quote for a
  // landscape/portrait output. Model-specific request options are preserved.
  for (const output of outputs)
    quotes.push(await imageModelQuote(db, id, options, output));
  const base = quotes[0];
  if (!base) throw new Error("Choose at least one image output.");
  return {
    model: base.model,
    rate: base.rate,
    quotes,
    credits: quotes.reduce((sum, quote) => sum + quote.credits, 0),
  };
}

export async function syncOpenAIModelAvailability(db: Database) {
  if (!ENV.openAiApiKey)
    throw new Error("OpenAI credentials are not configured.");
  const response = await fetch("https://api.openai.com/v1/models", {
    headers: { Authorization: `Bearer ${ENV.openAiApiKey}` },
    signal: AbortSignal.timeout(20000),
    redirect: "error",
  });
  if (!response.ok)
    throw new Error("OpenAI model availability could not be verified.");
  const body = (await response.json()) as { data?: { id: string }[] };
  if (!Array.isArray(body.data))
    throw new Error("OpenAI returned an invalid model catalog.");
  const ids = new Set(body.data.map(m => m.id)),
    now = Date.now();
  for (const model of OPENAI_IMAGE_MODELS)
    await db
      .insert(aiModelSettings)
      .values({
        id: `openai:${model}`,
        enabled: 1,
        availability: ids.has(model) ? "available" : "unavailable",
        checkedAtMs: now,
        updatedAtMs: now,
      })
      .onConflictDoUpdate({
        target: aiModelSettings.id,
        set: {
          availability: ids.has(model) ? "available" : "unavailable",
          checkedAtMs: now,
        },
      });
  return {
    available: OPENAI_IMAGE_MODELS.filter(m => ids.has(m)),
    checkedAtMs: now,
  };
}
/** One complete action at the catalog defaults; never expose wholesale quotes
 * through the customer catalog. Token-based image quotes remain provisional.
 */
export function defaultModelActionQuote(
  model: ModelDefinition,
  base: ProviderRate
) {
  const rate = configuredModelRate(model, base);
  const defaults = modelDefaults(model);
  if (model.kind === "image") {
    const tokenBased =
      model.provider === "openai" && rate.perRequestUsd == null;
    const costMicros =
      rate.perRequestUsd != null
        ? Math.round(rate.perRequestUsd * 1e6)
        : (rate.estimatedCostMicros ?? null);
    return {
      costMicros,
      credits: estimatedActionCredits(rate),
      basis: tokenBased ? "Token-based estimate" : "Default settings estimate",
      settings: [
        "1 image",
        ...(tokenBased
          ? ["1024 × 1024", "1,000 text input tokens · no reference input"]
          : []),
        ...Object.entries(defaults).map(
          ([key, value]) => `${key.replaceAll("_", " ")}: ${value}`
        ),
      ].join(" · "),
    };
  }
  return videoModelActionQuote(model, base, defaultVideoActionAssumptions);
}
/** Admin comparisons and customer quotes share the same calculation.
 * Comparison assumptions never change saved rates or completed usage. */
export function adminModelActionQuote(
  model: ModelDefinition,
  rate: ProviderRate,
  assumptions: ImageActionAssumptions = defaultImageActionAssumptions,
  videoAssumptions: VideoActionAssumptions = defaultVideoActionAssumptions
) {
  if (model.kind === "video")
    return {
      ...videoModelActionQuote(model, rate, videoAssumptions),
      calculation: null,
    };
  if (
    model.provider === "openai" &&
    model.kind === "image" &&
    rate.perRequestUsd == null
  ) {
    const calculation = estimateOpenAIImageAction(rate, assumptions);
    const format = (n: number) => n.toLocaleString("en-US");
    return {
      costMicros: calculation.costMicros,
      credits: retailCredits(calculation.costMicros, rateCreditPolicy(rate)),
      basis: "Token-based comparison",
      settings: `1 image · ${assumptions.size.replace("x", " × ")} · ${assumptions.quality} · ${format(assumptions.textInputTokens)} text + ${format(assumptions.imageInputTokens)} image input tokens`,
      calculation,
    };
  }
  return {
    ...defaultModelActionQuote(model, rate),
    ...(rate.perRequestUsd != null
      ? { basis: "Per-request provider rate" }
      : {}),
    calculation: null,
  };
}
export function videoModelActionQuote(
  model: ModelDefinition,
  base: ProviderRate,
  assumptions: VideoActionAssumptions
) {
  const defaults = modelDefaults(model),
    props = model.inputSchema.properties;
  const options: ModelOptions = { ...defaults };
  for (const [key, value] of [
    ["duration", assumptions.duration],
    ["resolution", assumptions.resolution],
    ["aspect_ratio", assumptions.aspectRatio],
  ] as const) {
    if (value === "default") continue;
    if (!props[key])
      throw new Error(
        `This model does not offer a ${key.replaceAll("_", " ")} setting. Choose Model default.`
      );
    options[key] = value;
  }
  if (assumptions.sound !== "default") {
    const key = props.generate_audio
      ? "generate_audio"
      : props.sound
        ? "sound"
        : null;
    if (!key)
      throw new Error(
        "This model does not offer an audio setting. Choose Model default."
      );
    options[key] =
      props[key].type === "boolean"
        ? assumptions.sound === "on"
        : assumptions.sound;
  }
  const problem = modelOptionsProblem(model, options);
  if (problem) throw new Error(problem);
  const source = requiresVideo(model);
  const seconds = Number(options.duration ?? defaults.duration ?? 5);
  const setup = {
    ...defaultVideoSetup,
    modelId: model.id,
    modelOptions: options,
    mode: modelVideoMode(model),
    duration: seconds,
    resolution: String(options.resolution ?? "720p"),
    aspectRatio: String(options.aspect_ratio ?? "16:9"),
    sourceVideoKey: source ? "asset:1" : null,
  };
  const refs: VideoReference[] = source
    ? [
        {
          key: "asset:1",
          name: "Source",
          mimeType: "video/mp4",
          storageKey: "",
          fingerprint: "",
          durationSeconds: assumptions.sourceSeconds,
          width: 1280,
          height: 720,
        },
      ]
    : [];
  const rate = configuredModelRate(model, base, videoModelOptions(setup));
  const quote = videoQuote(setup, refs, rate);
  return {
    costMicros: quote.costMicros,
    credits: quote.credits,
    basis: "Video settings estimate",
    settings: `${quote.durationSeconds}s video · ${props.resolution ? setup.resolution : "model resolution"} · ${props.aspect_ratio ? setup.aspectRatio : "model framing"}${source ? ` · ${assumptions.sourceSeconds}s source at 1280 × 720` : ""}${options.sound != null || options.generate_audio != null ? ` · audio: ${options.sound ?? (options.generate_audio ? "on" : "off")}` : ""}`,
  };
}
export async function publicModelCatalog(db: Database) {
  const [settings, rows, policy] = await Promise.all([
    db.select().from(aiModelSettings),
    db.select().from(providerRates),
    getCreditPolicy(db),
  ]);
  const mapped = new Map(settings.map(s => [s.id, s]));
  return Promise.all(
    generationModels.map(async original => {
      const setting = mapped.get(original.id),
        model = generationModel(setting?.routeId || original.id) ?? original;
      const verified = mapped.get(model.id);
      let reason =
        setting?.enabled === 0 || verified?.enabled === 0
          ? "Disabled by administrator"
          : model.provider === "openai"
            ? !ENV.openAiApiKey
              ? "Provider setup required"
              : verified?.availability === "unavailable"
                ? "Not available on this OpenAI account"
                : model.id !== DEFAULT_IMAGE_MODEL &&
                    verified?.availability !== "available"
                  ? "Awaiting account verification"
                  : null
            : !higgsfieldConfigured(model.kind)
              ? "Provider setup required"
              : null;
      let credits: number | null = null;
      const defaults = modelDefaults(model),
        seconds = Number(defaults.duration ?? 5);
      try {
        const base =
          rows.find(
            r =>
              r.provider === model.provider && r.model === model.providerModel
          )?.config ?? defaultModelRate(model);
        if (
          model.provider === "openai" &&
          !(
            base.pricingVerifiedAt ||
            base.pricingVersion === "openai-sunburst-2026-09-30"
          )
        )
          reason ||= "Pricing verification required";
        const rate = {
          ...base,
          billingMode: "cost",
          markupPercent: base.markupPercent ?? policy.markupPercent,
          creditValueMicros: policy.creditValueMicros,
        } satisfies ProviderRate;
        // Account discounts and request-dependent costs require a real quote.
        // Never advertise public list-price credits as this customer's price.
        if (model.provider !== "higgsfield")
          credits = defaultModelActionQuote(model, rate).credits;
      } catch {
        reason ||= "Pricing verification required";
      }
      return {
        id: original.id,
        name: original.name,
        variant: original.variant,
        maker: original.maker,
        kind: original.kind,
        routeId: model.id,
        provider: model.provider,
        direct: model.provider === "openai",
        enabled: setting?.enabled !== 0,
        available: !reason,
        reason,
        estimatedCredits: credits,
        estimatedSeconds: model.kind === "video" ? seconds : null,
        checkedAtMs: verified?.checkedAtMs ?? model.verifiedAt,
      };
    })
  );
}
