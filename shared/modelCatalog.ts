import { z } from "zod";
import higgsfieldData from "./data/higgsfieldModels.json";
import type { ProviderRate } from "./platformAdmin";

export type ModelProperty = {
  type?: string | string[];
  title?: string;
  description?: string;
  enum?: (string | number)[];
  default?: unknown;
  minimum?: number;
  maximum?: number;
  minLength?: number;
  maxLength?: number;
  minItems?: number;
  maxItems?: number;
  format?: string;
};
export type ModelDefinition = {
  id: string;
  provider: "openai" | "higgsfield";
  providerModel: string;
  name: string;
  variant: string;
  maker: string;
  kind: "image" | "video";
  inputSchema: {
    properties: Record<string, ModelProperty>;
    required?: string[];
  };
  costRules: NonNullable<ProviderRate["costRules"]>;
  sourceUrl: string;
  pricingNote: string;
  verifiedAt: number;
};
export const modelOptionsSchema = z
  .record(
    z.string().max(80),
    z.union([z.string().max(10000), z.number().finite(), z.boolean()])
  )
  .refine(
    v =>
      Object.keys(v).length <= 40 &&
      !Object.keys(v).some(k =>
        ["__proto__", "constructor", "prototype"].includes(k)
      ),
    "Invalid model options"
  );
export type ModelOptions = z.infer<typeof modelOptionsSchema>;
export const DEFAULT_IMAGE_MODEL = "openai:gpt-image-2.5-sunburst";
export const DEFAULT_VIDEO_MODEL =
  "higgsfield:bytedance/seedance-2.5/reference-to-video";
export const OPENAI_IMAGE_MODELS = [
  "gpt-image-2.5-sunburst",
  "gpt-image-2.5-flare",
  "gpt-image-2",
  "gpt-image-1.5",
  "gpt-image-1",
  "gpt-image-1-mini",
] as const;
const openaiModels: ModelDefinition[] = OPENAI_IMAGE_MODELS.map(model => ({
  id: `openai:${model}`,
  provider: "openai",
  providerModel: model,
  name:
    model === "gpt-image-2.5-sunburst"
      ? "GPT Image 2.5 Sunburst"
      : model === "gpt-image-2.5-flare"
        ? "GPT Image 2.5 Flare"
        : model.replace("gpt-image-", "GPT Image "),
  variant: "Generate & edit",
  maker: "OpenAI",
  kind: "image",
  inputSchema: {
    required: ["prompt"],
    properties: {
      prompt: { type: "string" },
      image_urls: { type: "array", maxItems: 16 },
      quality: {
        type: "string",
        enum: model.includes("2.5")
          ? ["low", "medium", "high", "xhigh", "max"]
          : ["low", "medium", "high"],
        default: "medium",
      },
    },
  },
  costRules: [],
  sourceUrl: `https://developers.openai.com/api/docs/models/${model}`,
  pricingNote:
    "Token-based estimate; settled from reported input and output usage.",
  verifiedAt: Date.UTC(2026, 9, 5),
}));
export const generationModels: ModelDefinition[] = [
  ...openaiModels,
  ...(higgsfieldData as unknown as ModelDefinition[]),
];
export function generationModel(id: string) {
  return generationModels.find(m => m.id === id);
}
export function modelDefaults(model: ModelDefinition): ModelOptions {
  return Object.fromEntries(
    Object.entries(model.inputSchema.properties).flatMap(([k, v]) =>
      ![/(_url|_urls)$/, /^prompt$/].some(pattern => pattern.test(k)) &&
      v.default !== null &&
      ["string", "number", "boolean"].includes(typeof v.default)
        ? [[k, v.default as string | number | boolean]]
        : []
    )
  );
}
export function referenceCapacity(model: ModelDefinition) {
  const p = model.inputSchema.properties;
  return p.image_urls
    ? (p.image_urls.maxItems ?? 9)
    : p.image_url
      ? p.end_image_url || p.last_image_url
        ? 2
        : 1
      : p.first_frame_url
        ? 2
        : 0;
}
export function requiresVideo(model: ModelDefinition) {
  return (model.inputSchema.required ?? []).some(k =>
    ["video_url", "video_urls"].includes(k)
  );
}
export function modelOptionsProblem(
  model: ModelDefinition,
  options: ModelOptions
) {
  for (const [key, value] of Object.entries(options)) {
    const p = model.inputSchema.properties[key];
    if (
      !p ||
      [
        "prompt",
        "image_url",
        "image_urls",
        "video_url",
        "video_urls",
        "audio_url",
        "audio_urls",
        "file_url",
        "link_url",
        "first_frame_url",
        "last_frame_url",
        "end_image_url",
        "last_image_url",
      ].includes(key)
    )
      return "Choose model settings from the available controls.";
    if (p.enum && !p.enum.includes(value as string | number))
      return `Choose a supported ${p.title || key}.`;
    if (p.type === "string" && typeof value !== "string")
      return `Invalid ${key}.`;
    if (p.type === "boolean" && typeof value !== "boolean")
      return `Invalid ${key}.`;
    if (
      ["integer", "number"].includes(String(p.type)) &&
      (typeof value !== "number" ||
        (p.type === "integer" && !Number.isInteger(value)) ||
        value < (p.minimum ?? -Infinity) ||
        value > (p.maximum ?? Infinity))
    )
      return `Choose a supported ${p.title || key}.`;
    if (
      typeof value === "string" &&
      (value.length > (p.maxLength ?? 10000) ||
        value.length < (p.minLength ?? 0))
    )
      return `Check ${p.title || key}.`;
    if (["num_images", "batch_size", "n"].includes(key) && value !== 1)
      return "Each image step generates one image.";
    if (
      key === "enhance_prompt" &&
      model.providerModel.startsWith("marketing-studio/") &&
      value !== false
    )
      return "Preset enhancement is not supported in this editor.";
    if (key === "output_format" && model.kind === "video" && value !== "mp4")
      return "Choose MP4 output.";
  }
  return null;
}
/** Data-only request mapping. URLs always come from tenant-checked stored references. */
export function modelRequestBody(
  model: ModelDefinition,
  input: {
    prompt: string;
    images: string[];
    video?: string;
    options: ModelOptions;
  }
) {
  const problem = modelOptionsProblem(model, input.options);
  if (problem) throw new Error(problem);
  const properties = model.inputSchema.properties;
  const body: Record<string, unknown> = {
    ...modelDefaults(model),
    ...input.options,
  };
  if (body.enable_thinking === true && body.prompt_extend === false)
    throw new Error("Thinking mode requires prompt enhancement.");
  if (body.multi_shots === true)
    throw new Error("Build multiple shots with individual workflow steps.");
  if (properties.prompt) body.prompt = input.prompt;
  if (input.images.length > referenceCapacity(model))
    throw new Error(
      `${model.name} supports ${referenceCapacity(model)} reference images. Choose a compatible model or remove extra references.`
    );
  if (input.images.length) {
    if (properties.image_urls) body.image_urls = input.images;
    else if (properties.image_url) {
      body.image_url = input.images[0];
      const end = properties.end_image_url
        ? "end_image_url"
        : properties.last_image_url
          ? "last_image_url"
          : null;
      if (end && input.images[1]) body[end] = input.images[1];
    } else if (properties.first_frame_url) {
      body.first_frame_url = input.images[0];
      if (input.images[1]) body.last_frame_url = input.images[1];
    }
  }
  if (input.video) {
    if (properties.video_url) body.video_url = input.video;
    else if (properties.video_urls) body.video_urls = [input.video];
    else throw new Error("This model does not accept a source video.");
  }
  for (const key of ["num_images", "batch_size", "n"])
    if (properties[key]) body[key] = 1;
  if (properties.output_format && model.kind === "video")
    body.output_format = "mp4";
  for (const key of model.inputSchema.required ?? [])
    if (
      body[key] === undefined ||
      body[key] === "" ||
      (Array.isArray(body[key]) && !(body[key] as unknown[]).length)
    )
      throw new Error(`${model.name} requires ${key.replaceAll("_", " ")}.`);
  for (const [key, value] of Object.entries(body)) {
    const p = properties[key];
    if (
      Array.isArray(value) &&
      ((p.minItems != null && value.length < p.minItems) ||
        (p.maxItems != null && value.length > p.maxItems))
    )
      throw new Error(`Check the number of ${key.replaceAll("_", " ")}.`);
    if (typeof value === "string" && p.maxLength && value.length > p.maxLength)
      throw new Error(`${p.title || key} is too long for ${model.name}.`);
  }
  return body;
}

export function modelVideoMode(
  model?: ModelDefinition
): "create" | "edit" | "extend" | "motion" {
  if (!model) return "create";
  if (/motion|genjutsu/.test(model.providerModel)) return "motion";
  if (/video-edit/.test(model.providerModel)) return "edit";
  if (/video-extend/.test(model.providerModel)) return "extend";
  return "create";
}
