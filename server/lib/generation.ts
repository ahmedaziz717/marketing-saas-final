export type GenerationSource = {
  storageKey: string;
  mimeType: string;
  kind: "brand" | "product";
};

const RASTER_MIME_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);

export function isSupportedGenerationImage(mimeType: string) {
  return RASTER_MIME_TYPES.has(mimeType.toLowerCase());
}

export function selectGenerationSources(brand: GenerationSource[], product: GenerationSource[], limit = 5) {
  const candidates = [...product, ...brand];
  const supported = candidates.filter(source => isSupportedGenerationImage(source.mimeType)).slice(0, limit);
  return {
    supported,
    unsupportedCount: candidates.length - candidates.filter(source => isSupportedGenerationImage(source.mimeType)).length,
  };
}

export type GenerationErrorCategory = "source_image" | "model_unavailable" | "model_access" | "planning_response" | "timeout" | "provider";

export function categorizeGenerationError(message: string): { category: GenerationErrorCategory; userMessage: string } {
  const normalized = message.toLowerCase();
  if (/source image|original image|no readable raster|could not be decoded|for image https?:/.test(normalized)) {
    return { category: "source_image", userMessage: "A selected source image could not be read. Use approved PNG, JPEG, or WebP assets, then retry." };
  }
  if (/sunburst credential|invalid_api_key|authentication|model_not_found|does not have access|sunburst request failed \((401|403)\)/.test(normalized)) {
    return { category: "model_access", userMessage: "AI generation is unavailable for this workspace. Ask an owner to check the connection, then retry." };
  }
  if (/required gpt|model.+unavailable|list image models|list llm models/.test(normalized)) {
    return { category: "model_unavailable", userMessage: "AI generation is temporarily unavailable. Your setup is saved; try again later." };
  }
  if (/json|creative plan|schema|concepts/.test(normalized)) {
    return { category: "planning_response", userMessage: "The creative plan response was incomplete. Retry to create a fresh generation attempt." };
  }
  if (/timeout|timed out|abort/.test(normalized)) {
    return { category: "timeout", userMessage: "Generation took too long. Try again with fewer products or sizes." };
  }
  return { category: "provider", userMessage: "AI could not complete this attempt. Your setup is saved; please try again." };
}
