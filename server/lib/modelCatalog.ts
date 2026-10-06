import { videoQuote } from "./videoPricing";
import {
  defaultVideoSetup,
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
  modelOptionsProblem,
  modelVideoMode,
  requiresVideo,
  type ModelOptions,
  type ModelDefinition,
  OPENAI_IMAGE_MODELS,
} from "../../shared/modelCatalog";
import type { ProviderRate } from "../../shared/platformAdmin";
import { estimatedActionCredits } from "../../shared/aiCredits";
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
  return configuredModelRate(model, rate, options);
}
export function configuredModelRate(
  model: ModelDefinition,
  rate: ProviderRate,
  options: ModelOptions = {}
) {
  const settings = { ...modelDefaults(model), ...options };
  if (model.provider === "openai") {
    const factor: Record<string, number> = {
      low: 0.35,
      medium: 1,
      high: 2,
      xhigh: 4,
      max: 8,
    };
    return {
      ...rate,
      estimatedCostMicros: Math.ceil(
        (rate.estimatedCostMicros ?? 200000) *
          (factor[String(settings.quality)] ?? 1)
      ),
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
  options: ModelOptions = {}
) {
  const model = await resolveModel(db, id, "image"),
    rate = await modelRate(db, model, options);
  return { model, rate, credits: estimatedActionCredits(rate) };
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
        const rate = configuredModelRate(model, {
          ...base,
          billingMode: "cost",
          markupPercent: base.markupPercent ?? policy.markupPercent,
          creditValueMicros: policy.creditValueMicros,
        });
        if (model.kind === "image") credits = estimatedActionCredits(rate);
        else {
          const source = requiresVideo(model);
          const refs: VideoReference[] = source
            ? [
                {
                  key: "asset:1",
                  name: "Source",
                  mimeType: "video/mp4",
                  storageKey: "",
                  fingerprint: "",
                  durationSeconds: seconds,
                  width: 1280,
                  height: 720,
                },
              ]
            : [];
          credits = videoQuote(
            {
              ...defaultVideoSetup,
              modelId: model.id,
              mode: modelVideoMode(model),
              duration: seconds,
              resolution: String(defaults.resolution ?? "720p"),
              aspectRatio: String(defaults.aspect_ratio ?? "16:9"),
              sourceVideoKey: source ? "asset:1" : null,
            },
            refs,
            rate
          ).credits;
        }
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
