import { z } from "zod";

export const searchCopyFields = {
  headlines: {
    label: "Headlines",
    singular: "headline",
    maximum: 15,
    minimum: 3,
    characters: 30,
  },
  descriptions: {
    label: "Descriptions",
    singular: "description",
    maximum: 4,
    minimum: 2,
    characters: 90,
  },
  path1: {
    label: "Display path 1",
    singular: "display path 1",
    maximum: 1,
    minimum: 0,
    characters: 15,
  },
  path2: {
    label: "Display path 2",
    singular: "display path 2",
    maximum: 1,
    minimum: 0,
    characters: 15,
  },
} as const;
export type SearchCopyField = keyof typeof searchCopyFields;
const distinct = (values: string[]) =>
  new Set(values.map(v => v.toLowerCase())).size === values.length;
export const searchCopySuggestionsSchema = z.object({
  headlines: z
    .array(z.string().trim().min(1).max(30))
    .length(15)
    .refine(distinct),
  descriptions: z
    .array(z.string().trim().min(1).max(90))
    .length(4)
    .refine(distinct),
  path1: z
    .array(
      z
        .string()
        .trim()
        .min(1)
        .max(15)
        .regex(/^[^\s/?#]+$/)
    )
    .length(1),
  path2: z
    .array(
      z
        .string()
        .trim()
        .min(1)
        .max(15)
        .regex(/^[^\s/?#]+$/)
    )
    .length(1),
});
export type SearchCopySuggestions = z.infer<typeof searchCopySuggestionsSchema>;
export const searchCopyUrlSchema = z
  .string()
  .trim()
  .url()
  .max(2048)
  .refine(value => {
    try {
      const url = new URL(value);
      return url.protocol === "https:" && !url.username && !url.password;
    } catch {
      return false;
    }
  }, "Use the campaign's public HTTPS landing page.");
