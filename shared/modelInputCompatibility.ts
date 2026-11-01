import {
  referenceCapacity,
  requiresVideo,
  type ModelDefinition,
} from "./modelCatalog";

/** null means an unresolved workflow binding, never an assumed empty input. */
export type ModelInputSelection = {
  images: number | null;
  minimumImages?: number;
  hasVideo: boolean | null;
  audio?: number | null;
};
export function modelInputCompatibility(
  model: ModelDefinition,
  input: ModelInputSelection,
  { discovery = false }: { discovery?: boolean } = {}
): string | null {
  const p = model.inputSchema.properties;
  const capacity = referenceCapacity(model);
  const images = Math.max(input.images ?? 0, input.minimumImages ?? 0);
  const count = input.images === null ? `at least ${images}` : String(images);
  if (images > capacity)
    return capacity === 0
      ? `Does not accept images; ${count} selected. Remove the images or choose another model.`
      : `Accepts up to ${capacity} images; ${count} selected (including logos and people). Remove images or choose another model.`;
  if (input.hasVideo && !p.video_url && !p.video_urls)
    return "Does not accept a source video. Remove the clip or choose another model.";
  if (input.audio && !p.audio_url && !p.audio_urls)
    return "Does not accept audio references. Remove the audio or choose another model.";
  // Empty setup is discovery, not a dead end: users can choose a model before adding its inputs.
  const empty = input.images === 0 && input.hasVideo === false && !input.audio;
  if (!(discovery && empty)) {
    if (input.hasVideo === false && requiresVideo(model))
      return "Requires an existing source video. Add a clip; photos and logos cannot replace it.";
    if (
      input.images === 0 &&
      (model.inputSchema.required ?? []).some(k =>
        ["image_url", "image_urls", "first_frame_url"].includes(k)
      )
    )
      return "Requires an image. Add an image before using this model.";
  }
  return null;
}
export function modelInputGuidance(model: ModelDefinition): string {
  const p = model.inputSchema.properties;
  const n = referenceCapacity(model);
  if (requiresVideo(model))
    return `Existing video required${n ? ` · up to ${n} image references` : ""}`;
  if (p.image_urls)
    return `Up to ${n} image references${p.video_urls || p.video_url ? " · source video optional" : ""}`;
  if (p.image_url || p.first_frame_url)
    return n === 2
      ? "1 start image · optional end image"
      : "1 source image required";
  return "Text prompt · no image references";
}
