import { createHash } from "node:crypto";
import { applicationPromptForRun, visualDirectionDefaults } from "./promptRegistry";
import {
  type VideoSetup,
  type VideoReference,
  videoRequestBody,
} from "../../shared/videoCreation";
import { readLifestylePortrait } from "./lifestylePeople";
import { storageClient, assetBucket, normalizeStorageKey } from "../storage";
import { productFactsDirection } from "../../shared/studioProductFacts";

export function videoCatalogContext(
  setup: VideoSetup,
  references: VideoReference[]
) {
  const products = references
    .filter(r => r.key !== setup.sourceVideoKey)
    .flatMap((ref, index) =>
      ref.productFacts
        ? [{ referenceImage: index + 1, ...ref.productFacts }]
        : []
    );
  return products.length
    ? `${productFactsDirection}\nSelected catalog products: ${JSON.stringify(products)}`
    : "";
}

/** Used for estimation and submission. Real references let the provider price
 * source duration, dimensions and input-dependent model options correctly. */
export async function prepareVideoRequest(
  organizationId: number,
  setup: VideoSetup,
  references: VideoReference[]
) {
  const signed = new Map<string, string>();
  for (const reference of references) {
    let storageKey = reference.storageKey;
    if (reference.key.startsWith("person_library:")) {
      const portrait = await readLifestylePortrait(
        reference.key.slice("person_library:".length)
      );
      const bytes = Buffer.from(portrait.b64Json, "base64");
      const digest = createHash("sha256").update(bytes).digest("hex");
      storageKey = `org/${organizationId}/video-references/library/${digest}.png`;
      const uploaded = await storageClient()
        .storage.from(assetBucket())
        .upload(storageKey, bytes, { contentType: "image/png", upsert: true });
      if (uploaded.error) throw new Error("Portrait storage unavailable");
    }
    const { data, error } = await storageClient()
      .storage.from(assetBucket())
      .createSignedUrl(normalizeStorageKey(storageKey), 86400);
    if (error || !data?.signedUrl)
      throw new Error("Reference storage unavailable");
    signed.set(reference.key, data.signedUrl);
  }
  return videoRequestBody(
    setup,
    references
      .filter(r => r.key !== setup.sourceVideoKey)
      .map(r => signed.get(r.key)!),
    signed.get(setup.sourceVideoKey ?? ""),
    videoCatalogContext(setup, references),
    {
      ...(await visualDirectionDefaults(organizationId, setup.direction)),
      "video.direction": (
        await applicationPromptForRun("video.direction", setup.defaultInstructions, organizationId)
      ).value,
    }
  );
}
