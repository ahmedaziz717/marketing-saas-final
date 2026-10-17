import { createHash } from "node:crypto";
import { storagePut, storageClient, assetBucket } from "../storage";
import {
  modelRequestBody,
  type ModelDefinition,
  type ModelOptions,
} from "../../shared/modelCatalog";
export type ImageSource = { b64Json: string; mimeType?: string };

/** Content-addressed references avoid replacing another action's input. */
export async function prepareImageRequest(
  model: ModelDefinition,
  input: {
    prompt: string;
    originalImages?: ImageSource[];
    modelOptions?: ModelOptions;
    storagePrefix: string;
  }
) {
  const images: string[] = [];
  for (const source of input.originalImages ?? []) {
    const bytes = Buffer.from(source.b64Json, "base64");
    const digest = createHash("sha256").update(bytes).digest("hex");
    const stored = await storagePut(
      `${input.storagePrefix}/references/${digest}.png`,
      bytes,
      source.mimeType || "image/png"
    );
    const { data, error } = await storageClient()
      .storage.from(assetBucket())
      .createSignedUrl(stored.key, 86400);
    if (error || !data?.signedUrl)
      throw new Error("Could not prepare the reference image.");
    images.push(data.signedUrl);
  }
  return modelRequestBody(model, {
    prompt: input.prompt,
    images,
    options: input.modelOptions ?? {},
  });
}
