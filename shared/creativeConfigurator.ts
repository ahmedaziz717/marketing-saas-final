import {
  creativeSetupSchema,
  defaultCreativeSetup,
  type CreativeSetup,
} from "./creativeBuilder";
import {
  defaultVideoSetup,
  defaultVideoDirection,
  videoSetupSchema,
  videoReferenceCount,
  type VideoSetup,
} from "./videoCreation";
import {
  DEFAULT_IMAGE_MODEL,
  generationModel,
  modelDefaults,
  modelVideoMode,
  referenceCapacity,
  type ModelDefinition,
  type ModelOptions,
} from "./modelCatalog";

export type ConfiguratorState = {
  version: 1;
  kind: "image" | "video";
  image: CreativeSetup;
  video: VideoSetup;
};
export function newConfiguration(): ConfiguratorState {
  return {
    version: 1,
    kind: "image",
    image: {
      ...defaultCreativeSetup(),
      name: "Untitled creative",
      formatIds: ["square_1_1"],
      modelId: DEFAULT_IMAGE_MODEL,
    },
    video: {
      ...defaultVideoSetup,
      title: "Untitled video",
      modelId: "higgsfield:bytedance/seedance-2.5/text-to-video",
      direction: { ...defaultVideoDirection },
    },
  };
}
export function readConfiguration(
  raw: string | null
): ConfiguratorState | null {
  try {
    const value = JSON.parse(raw ?? "null");
    if (value?.version !== 1 || !["image", "video"].includes(value.kind))
      return null;
    const image = creativeSetupSchema.safeParse(value.image),
      video = videoSetupSchema.safeParse(value.video);
    return image.success && video.success
      ? {
          version: 1,
          kind: value.kind,
          image: image.data,
          video: videoWithSources(video.data),
        }
      : null;
  } catch {
    return null;
  }
}
export function videoWithModel(
  setup: VideoSetup,
  model: ModelDefinition,
  options: ModelOptions = modelDefaults(model)
): VideoSetup {
  return {
    ...setup,
    modelId: model.id,
    modelOptions: options,
    mode: modelVideoMode(model),
    duration: Number(options.duration ?? 5),
    aspectRatio: String(options.aspect_ratio ?? "16:9"),
    resolution: String(options.resolution ?? "720p"),
    sound: Boolean(options.generate_audio ?? options.sound ?? false),
  };
}
/** Seedance's prompt and reference modes share settings, but use different endpoints. */
export function videoWithSources(setup: VideoSetup): VideoSetup {
  const prefix = "higgsfield:bytedance/seedance-2.5/";
  if (
    setup.mode !== "create" ||
    ![prefix + "text-to-video", prefix + "reference-to-video"].includes(
      setup.modelId ?? ""
    )
  )
    return setup;
  const modelId =
    prefix +
    (videoReferenceCount(setup) || setup.sourceVideoKey
      ? "reference-to-video"
      : "text-to-video");
  if (modelId === setup.modelId) return setup;
  const model = generationModel(modelId)!;
  const modelOptions = Object.fromEntries(
    Object.entries(setup.modelOptions ?? {}).filter(([key]) =>
      Object.hasOwn(model.inputSchema.properties, key)
    )
  );
  return { ...setup, modelId, modelOptions };
}
/** Explain incompatibilities without silently dropping references or changing the user's model. */
export function modelCompatibility(
  model: ModelDefinition,
  references: number,
  hasVideo: boolean
): string | null {
  if (references > referenceCapacity(model))
    return `Supports ${referenceCapacity(model)} image references; your setup has ${references}. Remove references or choose another model.`;
  if (
    hasVideo &&
    !model.inputSchema.properties.video_url &&
    !model.inputSchema.properties.video_urls
  )
    return "This model does not accept a source video. Remove the source clip to use it.";
  const unsupported = (model.inputSchema.required ?? []).filter(
    k =>
      ![
        "prompt",
        "image_url",
        "image_urls",
        "first_frame_url",
        "last_frame_url",
        "end_image_url",
        "last_image_url",
        "video_url",
        "video_urls",
      ].includes(k) &&
      model.inputSchema.properties[k]?.default === undefined &&
      !model.inputSchema.properties[k]?.enum &&
      !["string", "integer", "number", "boolean"].includes(
        String(model.inputSchema.properties[k]?.type)
      )
  );
  if (unsupported.length)
    return "This model requires inputs that are not yet supported in this configurator.";
  if (
    (model.inputSchema.required ?? []).some(k =>
      /audio_url|file_url|link_url/.test(k)
    )
  )
    return "This model needs an audio or file input. That input is not available in this prototype yet.";
  return null;
}
export function imageReferenceCount(setup: CreativeSetup) {
  return (
    (setup.promotionMode === "platform"
      ? 0
      : setup.productMode === "together"
        ? setup.products.filter(p => p.imageId !== null).length
        : setup.products.some(p => p.imageId !== null)
          ? 1
          : 0) +
    (setup.referenceAssetIds?.length ?? 0) +
    (setup.enhancement ? 1 : 0) +
    (setup.sourceAssetKeys?.length ?? 0) +
    (setup.people?.length ?? (setup.person ? 1 : 0)) +
    (setup.logoAssetId ? 1 : 0)
  );
}
export const configuratorSections = [
  {
    id: "type",
    title: "Type & Source",
    subtitle: "Start with an idea",
    categories: [
      { id: "type", title: "Creative type" },
      { id: "source", title: "Subject & sources" },
      { id: "productDetails", title: "Product details" },
      { id: "brand", title: "Brand & logo" },
    ],
  },
  {
    id: "look",
    title: "Look & Feel",
    subtitle: "Make it yours",
    categories: [
      { id: "scene", title: "Scene" },
      { id: "people", title: "People" },
      { id: "theme", title: "Theme" },
      { id: "style", title: "Art style" },
      { id: "mood", title: "Mood" },
      { id: "composition", title: "Composition" },
      { id: "fonts", title: "Fonts" },
    ],
  },
  {
    id: "message",
    title: "Story & Sound",
    subtitle: "Tell your story",
    categories: [
      { id: "message", title: "Copy & prompt" },
      { id: "direction", title: "Creative direction" },
      { id: "audio", title: "Audio" },
      { id: "subtitles", title: "Subtitles" },
    ],
  },
  {
    id: "model",
    title: "AI Model",
    subtitle: "Choose your engine",
    categories: [
      { id: "model", title: "Model library" },
      { id: "settings", title: "Model settings" },
    ],
  },
  {
    id: "output",
    title: "Output & Review",
    subtitle: "Bring it to life",
    categories: [
      { id: "format", title: "Format & size" },
      { id: "review", title: "Review configuration" },
    ],
  },
] as const;

export type ConfigurationSnapshot = {
  config: ConfiguratorState;
  credits: number | null;
  capturedAt: number;
};
export function readConfigurationSnapshot(
  raw: string | null
): ConfigurationSnapshot | null {
  try {
    const value = JSON.parse(raw ?? "null");
    const config = readConfiguration(JSON.stringify(value?.config));
    if (
      !config ||
      !Number.isFinite(value.capturedAt) ||
      value.capturedAt < 0 ||
      !(
        value.credits === null ||
        (Number.isFinite(value.credits) && value.credits >= 0)
      )
    )
      return null;
    return { config, credits: value.credits, capturedAt: value.capturedAt };
  } catch {
    return null;
  }
}
