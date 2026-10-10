import { z } from "zod";
import {
  generationModel,
  modelOptionsSchema,
  modelRequestBody,
  modelDefaults,
  requiresVideo,
  type ModelOptions,
} from "./modelCatalog";
import {
  CREATIVE_ART_STYLES,
  CREATIVE_MOODS,
  getCreativeArtStyle,
  getCreativeMood,
  personReferenceKey,
  personReferenceSchema,
} from "./creativeBuilder";
import {
  CREATIVE_THEMES,
  getCreativeTheme,
  type CreativeThemeId,
} from "./creativeThemes";

export const videoModes = [
  {
    id: "create",
    label: "Create video",
    description:
      "Bring your product, service, or brand to life from a prompt and reference images.",
  },
  {
    id: "edit",
    label: "Edit video",
    description:
      "Describe what to change in an existing clip. Its duration and framing are preserved.",
  },
  {
    id: "extend",
    label: "Extend video",
    description:
      "Continue an existing clip with a new scene or camera movement.",
  },
  {
    id: "motion",
    label: "Motion control",
    description:
      "Transfer movement from a reference clip to the subject in your images.",
  },
] as const;
export type VideoMode = (typeof videoModes)[number]["id"];
export const videoRatios = [
  "16:9",
  "9:16",
  "1:1",
  "4:3",
  "3:4",
  "21:9",
] as const;
export const videoResolutions = ["480p", "720p", "1080p"] as const;
const assetKey = z.string().regex(/^(asset|creative):[1-9][0-9]*$/);
export const videoImageKey = z
  .string()
  .regex(/^(asset|creative|product_image):[1-9][0-9]*$/);
export const videoDirectionSchema = z.object({
  theme: z.custom<CreativeThemeId>(
    value => typeof value === "string" && Boolean(CREATIVE_THEMES[value])
  ),
  themePrompt: z.string().trim().max(4000).default(""),
  mood: z.enum(
    CREATIVE_MOODS.map(option => option.id) as [
      "clean",
      ...Array<(typeof CREATIVE_MOODS)[number]["id"]>,
    ]
  ),
  artStyle: z.enum(
    CREATIVE_ART_STYLES.map(option => option.id) as [
      "realistic",
      ...Array<(typeof CREATIVE_ART_STYLES)[number]["id"]>,
    ]
  ),
  setting: z.enum(["product", "lifestyle", "people"]).default("product"),
  placement: z.enum(["auto", "left", "center", "right"]).default("auto"),
  extraDirection: z.string().trim().max(4000).default(""),
});
export type VideoDirection = z.infer<typeof videoDirectionSchema>;
export const defaultVideoDirection: VideoDirection = {
  theme: "spotlight",
  themePrompt: "",
  mood: "clean",
  artStyle: "realistic",
  setting: "product",
  placement: "auto",
  extraDirection: "",
};
export type VideoImageChoice = {
  key: string;
  name: string;
  url: string;
  detail?: string;
  origin: "catalog" | "uploaded" | "generated";
  width?: number;
  height?: number;
  durationSeconds?: number;
};
export const videoSetupSchema = z
  .object({
    category: z.enum(["product", "ugc"]).default("product"),
    modelId: z.string().max(240).optional(),
    modelOptions: modelOptionsSchema.optional(),
    people: z.array(personReferenceSchema).max(4).default([]),
    title: z.string().trim().min(1).max(160),
    mode: z.enum(["create", "edit", "extend", "motion"]),
    prompt: z.string().trim().max(10000),
    imageKeys: z.array(videoImageKey).max(9),
    direction: videoDirectionSchema.nullable().optional(),
    sourceVideoKey: assetKey.nullable(),
    duration: z.number().int().min(1).max(120),
    aspectRatio: z.string().max(20),
    resolution: z.string().max(20),
    sound: z.boolean(),
    bitrate: z.enum(["default", "high"]),
    campaignPlanId: z.number().int().positive().optional(),
  })
  .superRefine((setup, ctx) => {
    if (setup.category === "product" && (setup.people ?? []).length)
      ctx.addIssue({
        code: "custom",
        path: ["people"],
        message: "Model selection is available for creator videos.",
      });
    if (
      new Set(setup.people.map(personReferenceKey)).size !==
      (setup.people ?? []).length
    )
      ctx.addIssue({
        code: "custom",
        path: ["people"],
        message: "Choose each model only once.",
      });
  });
export type VideoSetup = z.infer<typeof videoSetupSchema>;
export const defaultVideoSetup: VideoSetup = {
  category: "product",
  people: [],
  title: "Untitled product video",
  mode: "create",
  prompt: "",
  imageKeys: [],
  direction: defaultVideoDirection,
  sourceVideoKey: null,
  duration: 5,
  aspectRatio: "16:9",
  resolution: "720p",
  sound: true,
  bitrate: "default",
};
export function videoSetupProblem(setup: VideoSetup): string | null {
  if (new Set(setup.imageKeys).size !== setup.imageKeys.length)
    return "Choose each reference image only once.";
  if (setup.modelId) {
    const model = generationModel(setup.modelId);
    if (!model || model.kind !== "video") return "Choose a video model.";
    try {
      modelRequestBody(model, {
        prompt: videoPrompt(setup),
        images: [...setup.imageKeys, ...(setup.people ?? [])].map(
          () => "https://reference.invalid/image"
        ),
        video: setup.sourceVideoKey
          ? "https://reference.invalid/video"
          : undefined,
        options: videoModelOptions(setup),
      });
    } catch (error) {
      return error instanceof Error ? error.message : "Check model settings.";
    }
    return null;
  }
  if (new Set(setup.imageKeys).size !== setup.imageKeys.length)
    return "Choose each reference image only once.";
  if (setup.mode !== "create" && !setup.sourceVideoKey)
    return "Choose a source video first.";
  if (
    setup.mode === "motion" &&
    ((!setup.imageKeys.length && !(setup.people ?? []).length) ||
      setup.imageKeys.length + (setup.people ?? []).length > 8)
  )
    return "Motion control needs 1–8 reference images.";
  if (setup.imageKeys.length + (setup.people ?? []).length > 9)
    return "Use up to 9 total images, including selected people.";
  if (!setup.prompt && setup.mode !== "motion")
    return "Describe the video you want to create.";
  return null;
}
export const videoStatusLabels = {
  draft: "Draft",
  queued: "Queued",
  submitting: "Starting generation",
  generating: "Generating",
  saving: "Saving video",
  completed: "Ready to review",
  failed: "Failed",
  canceled: "Canceled",
  attention: "Needs attention",
} as const;
export type VideoStatus = keyof typeof videoStatusLabels;
export const activeVideoStatuses: VideoStatus[] = [
  "queued",
  "submitting",
  "generating",
  "saving",
];
export type VideoReference = {
  key: string;
  storageKey: string;
  fingerprint: string;
  name: string;
  mimeType: string;
  width?: number;
  height?: number;
  durationSeconds?: number;
};
export function videoModelKey(setup: VideoSetup) {
  if (setup.modelId)
    return generationModel(setup.modelId)?.providerModel ?? "invalid";
  return `${setup.mode === "motion" ? "genjutsu" : "seedance-2.5"}/${setup.resolution}`;
}
export function videoEndpoint(setup: VideoSetup) {
  if (setup.modelId)
    return generationModel(setup.modelId)?.providerModel ?? "invalid";
  if (setup.mode === "motion")
    return "higgsfield/genjutsu/motion-transfer/v1.0";
  const task =
    setup.mode === "edit"
      ? "video-edit"
      : setup.mode === "extend"
        ? "video-extend"
        : setup.imageKeys.length || (setup.people ?? []).length
          ? "reference-to-video"
          : "text-to-video";
  return `bytedance/seedance-2.5/${task}`;
}

/** Older saved jobs keep their exact prompt unless creative direction was selected. */
export function videoPrompt(setup: VideoSetup) {
  const identity = (setup.people ?? []).length
    ? `The LAST ${(setup.people ?? []).length} reference images are the selected people, in order. Include these people and preserve their distinct appearance throughout the video. These portraits specify identity, not product endorsements or testimonials. Adapt poses, clothing and lighting to the scene. Keep children and teens age-appropriate, with ordinary clothing and activities and no adult themes.`
    : "";
  if (!setup.direction)
    return [setup.prompt, identity].filter(Boolean).join("\n\n");
  const direction = setup.direction,
    theme = getCreativeTheme(direction.theme);
  return [
    setup.prompt,
    identity,
    `Creative theme — ${theme.name}: ${direction.themePrompt || theme.direction}`,
    `Mood — ${getCreativeMood(direction.mood).name}: ${getCreativeMood(direction.mood).direction}`,
    `Art style — ${getCreativeArtStyle(direction.artStyle).name}: ${getCreativeArtStyle(direction.artStyle).direction}`,
    direction.setting === "product"
      ? "Setting: focus on the product, service, or brand concept; no people."
      : direction.setting === "lifestyle"
        ? "Setting: a relevant lifestyle environment without people."
        : "Setting: a relevant lifestyle environment with people.",
    direction.placement === "auto"
      ? "Compose the subject naturally for the selected video format."
      : `Keep the main subject toward the ${direction.placement} of the frame.`,
    direction.extraDirection,
    "Adapt this visual direction into coherent motion. Preserve reference subjects, product geometry and materials. Theme names and examples are visual inspiration, not factual offers. Do not invent discounts, claims, prices, logos, or on-screen copy. Add speech or text only when explicitly requested in the video description.",
  ]
    .filter(Boolean)
    .join("\n\n");
}

/** Send only fields documented for this endpoint. Hidden controls never leak into requests. */
export function videoRequestBody(
  setup: VideoSetup,
  images: string[],
  source?: string
) {
  if (setup.modelId) {
    const model = generationModel(setup.modelId);
    if (!model || model.kind !== "video")
      throw new Error("Choose a video model.");
    return modelRequestBody(model, {
      prompt: videoPrompt(setup),
      images,
      video: source,
      options: videoModelOptions(setup),
    });
  }
  const body: Record<string, unknown> = { resolution: setup.resolution };
  const prompt = videoPrompt(setup);
  if (prompt) body.prompt = prompt;
  if (images.length) body.image_urls = images;
  if (setup.mode === "motion") return { ...body, video_url: source };
  body.output_format = "mp4";
  body.generate_audio = setup.sound;
  if (setup.bitrate === "high") body.bitrate_mode = "high";
  if (setup.mode === "create" || setup.mode === "extend")
    body.duration = setup.duration;
  if (setup.mode === "create") body.aspect_ratio = setup.aspectRatio;
  else body.video_url = source;
  return body;
}

export function videoModelOptions(setup: VideoSetup): ModelOptions {
  const model = generationModel(setup.modelId || "");
  if (!model) return {};
  const p = model.inputSchema.properties;
  return {
    ...modelDefaults(model),
    ...setup.modelOptions,
    ...(p.duration ? { duration: setup.duration } : {}),
    ...(p.resolution ? { resolution: setup.resolution } : {}),
    ...(p.aspect_ratio ? { aspect_ratio: setup.aspectRatio } : {}),
    ...(p.generate_audio && setup.modelOptions?.generate_audio === undefined
      ? { generate_audio: setup.sound }
      : {}),
    ...(p.sound && setup.modelOptions?.sound === undefined
      ? {
          sound:
            p.sound.type === "boolean"
              ? setup.sound
              : setup.sound
                ? "on"
                : "off",
        }
      : {}),
  };
}
