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
export const googleCopyAdTypes = ["PERFORMANCE_MAX", "DISPLAY"] as const;
export type GoogleCopyAdType = typeof googleCopyAdTypes[number];
// https://developers.google.com/google-ads/api/docs/responsive-display-ads/create-responsive-display-ads
export function googleCopyCapabilities(adType: GoogleCopyAdType = "PERFORMANCE_MAX") {
  return adType === "DISPLAY" ? {
    label: "Responsive Display",
    specs: {headlines: {...googleCopySpecs.headlines,maximum:5},longHeadlines:{...googleCopySpecs.longHeadlines,maximum:1},descriptions:googleCopySpecs.descriptions},
    minimums:{headlines:1,longHeadlines:1,descriptions:1},requiresShortHeadline:false,
  } : {label:"PMax",specs:googleCopySpecs,minimums:{headlines:3,longHeadlines:1,descriptions:2},requiresShortHeadline:true};
}
export const googleCopyCountsSchema = z.object({
  headlines: z.number().int().min(0).max(15),
  longHeadlines: z.number().int().min(0).max(5),
  descriptions: z.number().int().min(0).max(5),
});
export const googleCopyRequestSchema = z
  .object({
    adType: z.enum(googleCopyAdTypes).optional(),
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
  ).superRefine((value,ctx)=>{
    const {specs}=googleCopyCapabilities(value.adType);
    for(const key of googleCopyFields) {
      if(value.counts[key]>specs[key].maximum) ctx.addIssue({code:"custom",path:["counts",key],message:`${specs[key].label}: maximum ${specs[key].maximum} for this ad format.`});
      if((value.existingCopy?.[key].length??0)>specs[key].maximum) ctx.addIssue({code:"custom",path:["existingCopy",key],message:`${specs[key].label}: maximum ${specs[key].maximum} for this ad format.`});
    }
  });
export type GoogleCopyCounts = z.infer<typeof googleCopyCountsSchema>;
export type GoogleCopyRequest = z.infer<typeof googleCopyRequestSchema>;
export type GoogleCopySet = Record<GoogleCopyField, string[]>;
export const emptyGoogleCopy = (): GoogleCopySet => ({
  headlines: [],
  longHeadlines: [],
  descriptions: [],
});

export function remainingGoogleCopy(fields: string[], adType:GoogleCopyAdType="PERFORMANCE_MAX"): GoogleCopyCounts {
  const {specs}=googleCopyCapabilities(adType);
  return Object.fromEntries(
    googleCopyFields.map(key => [
      key,
      Math.max(
        0,
        specs[key].maximum -
          fields.filter(field => field === specs[key].field).length
      ),
    ])
  ) as GoogleCopyCounts;
}
