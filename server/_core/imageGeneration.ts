import { generateSunburstImage, requireSunburstCredential, type GenerateSunburstOptions } from '../lib/openaiSunburst';
import { REQUIRED_IMAGE_MODEL_ID } from '../lib/models';
export type GenerateImageOptions = {
  prompt: string;
  originalImages?: Array<{ url?: string; b64Json?: string; mimeType?: string }>;
  model?: string;
  quality?: string;
  outputSize?: { width: number; height: number; background: string };
  storagePrefix?: string;
};
export type GenerateImageResponse = { url?: string; storageKey?: string };
export type ImageModelInfo = { model?: string; id?: string };
export type ListImageModelsResponse = { models: ImageModelInfo[] };

export async function listImageModels(): Promise<ListImageModelsResponse> {
  const response = await fetch(`https://api.openai.com/v1/models/${REQUIRED_IMAGE_MODEL_ID}`, {
    headers: { Authorization: `Bearer ${requireSunburstCredential()}` }, signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) throw new Error('Required image model is unavailable');
  const model = await response.json() as { id?: string };
  if (model.id !== REQUIRED_IMAGE_MODEL_ID) throw new Error('Required image model is unavailable');
  return { models: [{ id: model.id, model: model.id }] };
}
export async function generateImage(options: GenerateImageOptions): Promise<GenerateImageResponse> {
  if (options.model && options.model !== REQUIRED_IMAGE_MODEL_ID) throw new Error('Required image model is unavailable');
  if (!options.model) await listImageModels();
  if (options.originalImages?.some(image => !image.b64Json)) throw new Error('Source images must be read from approved storage before generation');
  const quality = options.quality || 'medium';
  if (!['low', 'medium', 'high', 'xhigh', 'max'].includes(quality)) throw new Error('Unsupported image quality');
  return generateSunburstImage({
    prompt: options.prompt,
    originalImages: options.originalImages?.map(image => ({ b64Json: image.b64Json!, mimeType: image.mimeType })),
    quality: quality as GenerateSunburstOptions['quality'],
    outputSize: options.outputSize || { width: 1080, height: 1080, background: '#ffffff' },
    storagePrefix: options.storagePrefix || 'generated',
  });
}
