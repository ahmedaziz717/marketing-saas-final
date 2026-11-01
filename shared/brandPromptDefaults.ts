import { z } from "zod";
import { promptGroup } from "./promptPresentation";
import type { PromptDefinition } from "./promptRegistry";

export const brandPromptProfileSchema = z
  .object({
    general: z.string().trim().min(20).max(900),
    copy: z.string().trim().min(20).max(900),
    visual: z.string().trim().min(20).max(900),
  })
  .strict();
export type BrandPromptProfile = z.infer<typeof brandPromptProfileSchema>;

/** System templates remain immutable. Personalization is a workspace revision. */
export function personalizedBrandDefault(
  definition: PromptDefinition,
  brandName: string,
  profile: BrandPromptProfile
) {
  if (!definition.editable || promptGroup(definition.id) === "technical")
    throw new Error("Only user-facing creative defaults can be personalized.");
  const direction =
    promptGroup(definition.id) === "visual" ||
    definition.id === "creative.image"
      ? profile.visual
      : [
            "creative.copy",
            "copy.asset",
            "publishing.copy",
            "google.pmax.copy",
          ].includes(definition.id)
        ? profile.copy
        : profile.general;
  const value = `${definition.baseline}\n\nBrand Kit: ${brandName}\n${direction}\nUse the current Brand Kit for up-to-date facts, required claims and restrictions; these instructions do not authorize invented claims.`;
  if (value.length > definition.maxLength)
    throw new Error(
      "Personalized instructions exceed this default's limit. The existing default is unchanged."
    );
  return value;
}

/** Explicit saves and restores are intentional user choices, never overwrite them. */
export function mayPersonalizeBrandDefault(
  current?: { action: string } | null
) {
  return !current || current.action === "personalize_brand";
}
