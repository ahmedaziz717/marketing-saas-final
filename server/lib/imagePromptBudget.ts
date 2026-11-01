import type { ModelDefinition } from "../../shared/modelCatalog";

export const IMAGE_PROMPT_TOO_LONG =
  "The creative instructions exceed this image model's prompt limit. Shorten the brand voice guide or additional creative direction, reduce selected product details, or choose a model with a larger limit. Your saved brand guide and setup have not been changed.";

export function imagePromptLimit(model: ModelDefinition): number | undefined {
  return (
    model.inputSchema.properties.prompt?.maxLength ??
    (model.provider === "openai" && model.providerModel.startsWith("gpt-image-")
      ? 32_000
      : undefined)
  );
}

export function assertImagePromptBudget(
  prompt: string,
  model: ModelDefinition
) {
  const limit = imagePromptLimit(model);
  // UTF-16 length is conservative for providers that count Unicode code points.
  if (limit !== undefined && prompt.length > limit)
    throw new Error(IMAGE_PROMPT_TOO_LONG);
}
