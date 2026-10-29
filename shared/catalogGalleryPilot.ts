import { z } from "zod";
import { apiCatalogMappingSchema } from "./apiCatalog";

export const galleryPilotRecipeSchema = z
  .object({
    detailUrlTemplate: apiCatalogMappingSchema.shape.detailUrlTemplate.unwrap(),
    mediaGroupsFromDetails: z.literal(true).optional(),
    // Keep relative first-frame aliases tied to the reviewed image directory.
    // The normal importer still applies public-network/redirect image validation.
    imageBaseUrl: apiCatalogMappingSchema.shape.imageBaseUrl,
    detailRootPath: apiCatalogMappingSchema.shape.detailRootPath,
    detailIdentityPath: z
      .string()
      .min(1)
      .max(200)
      .regex(/^[A-Za-z0-9_$-]+(?:\.[A-Za-z0-9_$-]+)*$/)
      .refine(
        value =>
          !value
            .split(".")
            .some(key =>
              ["__proto__", "constructor", "prototype"].includes(key)
            )
      ),
    mediaGroupRules: apiCatalogMappingSchema.shape.mediaGroupRules
      .unwrap()
      .min(1),
  })
  .strict();
export const galleryPilotTokenSchema = z
  .object({
    ciphertext: z.string().max(2_000_000),
    iv: z.string().max(100),
    tag: z.string().max(100),
  })
  .strict();
export const GALLERY_PILOT_BATCH = 12;
export const GALLERY_PILOT_MAX_IMAGES = 250;
export const GALLERY_PILOT_MAX_CANDIDATES = 500;
