import {
  DEFAULT_IMAGE_MODEL,
  DEFAULT_VIDEO_MODEL,
  generationModel,
} from "./modelCatalog";

export type WorkflowModelKind = "text" | "image" | "video";
export const DEFAULT_TEXT_MODEL = "gpt-5.5";
/** Chat-completions models supported by the existing text-and-image prompt writer.
 * Additional models are offered only when account availability and pricing are configured. */
export const workflowTextModels = [
  { id: DEFAULT_TEXT_MODEL, name: "GPT-5.5" },
  { id: "gpt-5.4-mini", name: "GPT-5.4 Mini" },
] as const;
export function workflowModel(id: string) {
  const text = workflowTextModels.find(m => m.id === id);
  return text ? { ...text, kind: "text" as const } : generationModel(id);
}
export function defaultWorkflowModel(kind: WorkflowModelKind) {
  return kind === "text"
    ? DEFAULT_TEXT_MODEL
    : kind === "image"
      ? DEFAULT_IMAGE_MODEL
      : DEFAULT_VIDEO_MODEL;
}
export function workflowModelKind(type: string): WorkflowModelKind | undefined {
  return type === "assistant"
    ? "text"
    : type === "generate_image"
      ? "image"
      : type === "generate_video"
        ? "video"
        : undefined;
}
