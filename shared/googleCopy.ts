import { z } from "zod";

// https://developers.google.com/google-ads/api/performance-max/asset-requirements
// Suggestions and saved text use the same Google field names and character limits.
export const googleCopyFields = [
  "headlines",
  "longHeadlines",
  "descriptions",
] as const;
export type GoogleCopyField = (typeof googleCopyFields)[number];
export const googleCopySpecs = {
  headlines: {
    field: "HEADLINE",
    label: "Headlines",
    maximum: 15,
    characters: 30,
  },
  longHeadlines: {
    field: "LONG_HEADLINE",
    label: "Long headlines",
    maximum: 5,
    characters: 90,
  },
  descriptions: {
    field: "DESCRIPTION",
    label: "Descriptions",
    maximum: 5,
    characters: 90,
  },
} as const;
export const googleCopyCountsSchema = z.object({
  headlines: z.number().int().min(0).max(15),
  longHeadlines: z.number().int().min(0).max(5),
  descriptions: z.number().int().min(0).max(5),
});
export const googleCopyRequestSchema = z
  .object({
    counts: googleCopyCountsSchema,
    target: z.enum(googleCopyFields).optional(),
    existingCopy: z
      .object({
        headlines: z.array(z.string().max(30)).max(15),
        longHeadlines: z.array(z.string().max(90)).max(5),
        descriptions: z.array(z.string().max(90)).max(5),
      })
      .optional(),
  })
  .refine(
    v => Object.values(v.counts).some(n => n > 0),
    "Choose at least one suggestion."
  );
export type GoogleCopyCounts = z.infer<typeof googleCopyCountsSchema>;
export type GoogleCopyRequest = z.infer<typeof googleCopyRequestSchema>;
export type GoogleCopySet = Record<GoogleCopyField, string[]>;
export const emptyGoogleCopy = (): GoogleCopySet => ({
  headlines: [],
  longHeadlines: [],
  descriptions: [],
});

export function remainingGoogleCopy(fields: string[]): GoogleCopyCounts {
  return Object.fromEntries(
    googleCopyFields.map(key => [
      key,
      Math.max(
        0,
        googleCopySpecs[key].maximum -
          fields.filter(field => field === googleCopySpecs[key].field).length
      ),
    ])
  ) as GoogleCopyCounts;
}
