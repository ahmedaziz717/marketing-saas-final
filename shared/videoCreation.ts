import { z } from "zod";
import { personReferenceKey, personReferenceSchema } from "./creativeBuilder";

export const ugcGenerationMessage =
  "Creator video generation is coming next. You can choose models and save your video setup now.";

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
export const videoSetupSchema = z
  .object({
    category: z.enum(["product", "ugc"]).default("product"),
    people: z.array(personReferenceSchema).max(4).default([]),
    title: z.string().trim().min(1).max(160),
    mode: z.enum(["create", "edit", "extend", "motion"]),
    prompt: z.string().trim().max(10000),
    imageKeys: z.array(assetKey).max(9),
    sourceVideoKey: assetKey.nullable(),
    duration: z.number().int().min(4).max(30),
    aspectRatio: z.enum(videoRatios),
    resolution: z.enum(videoResolutions),
    sound: z.boolean(),
    bitrate: z.enum(["default", "high"]),
    campaignPlanId: z.number().int().positive().optional(),
  })
  .superRefine((setup, ctx) => {
    if (setup.category === "product" && setup.people.length)
      ctx.addIssue({
        code: "custom",
        path: ["people"],
        message: "Model selection is available for creator videos.",
      });
    if (
      new Set(setup.people.map(personReferenceKey)).size !== setup.people.length
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
  if (setup.mode !== "create" && !setup.sourceVideoKey)
    return "Choose a source video first.";
  if (
    setup.mode === "motion" &&
    (!setup.imageKeys.length || setup.imageKeys.length > 8)
  )
    return "Motion control needs 1–8 reference images.";
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
  return `${setup.mode === "motion" ? "genjutsu" : "seedance-2.5"}/${setup.resolution}`;
}
export function videoEndpoint(setup: VideoSetup) {
  if (setup.mode === "motion")
    return "higgsfield/genjutsu/motion-transfer/v1.0";
  const task =
    setup.mode === "edit"
      ? "video-edit"
      : setup.mode === "extend"
        ? "video-extend"
        : setup.imageKeys.length
          ? "reference-to-video"
          : "text-to-video";
  return `bytedance/seedance-2.5/${task}`;
}

/** Send only fields documented for this endpoint. Hidden controls never leak into requests. */
export function videoRequestBody(
  setup: VideoSetup,
  images: string[],
  source?: string
) {
  const body: Record<string, unknown> = { resolution: setup.resolution };
  if (setup.prompt) body.prompt = setup.prompt;
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
