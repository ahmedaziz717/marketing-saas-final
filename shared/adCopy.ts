import { z } from "zod";
import {
  channelSchema,
  scopeSchema,
  type PublicationContent,
} from "./channels";

export const adCopyFields = ["message", "headline", "description"] as const;
export type AdCopyField = (typeof adCopyFields)[number];
export const copyVariantKeys = {
  message: "messages",
  headline: "headlines",
  description: "descriptions",
} as const;
export const copyFieldLabels = {
  message: "Primary text",
  headline: "Headline",
  description: "Description",
} as const;
export const copyFieldLimits = {
  message: 5000,
  headline: 200,
  description: 300,
};
export const copySetSchema = z.object({
  message: z.string().max(5000),
  headline: z.string().max(200),
  description: z.string().max(300),
});
export type CopySet = z.infer<typeof copySetSchema>;
export type CopyContent = Pick<
  PublicationContent,
  AdCopyField | "textVariants"
>;
export const copyRegenerationSchema = z.object({
  index: z.number().int().min(0).max(4),
  field: z.enum(["set", ...adCopyFields]),
});
export type CopyRegeneration = z.infer<typeof copyRegenerationSchema>;
export const assetCopyRequestSchema = scopeSchema
  .extend({
    channel: channelSchema.default("meta_ads"),
    assetKeys: z
      .array(z.string().regex(/^(asset|creative):[1-9][0-9]*$/))
      .min(1)
      .max(10),
    direction: z.string().trim().max(2000).default(""),
    promotion: z
      .object({
        audience: z.string().max(2000),
        goal: z.string().max(2000),
        offer: z.string().max(2000),
      })
      .optional(),
    currentOptions: z.array(copySetSchema).max(5).default([]),
    regeneration: copyRegenerationSchema.optional(),
  })
  .superRefine((value, ctx) => {
    if (value.regeneration && !value.currentOptions[value.regeneration.index])
      ctx.addIssue({
        code: "custom",
        path: ["regeneration", "index"],
        message: "Choose an existing copy option to regenerate.",
      });
  });
export type AssetCopyRequest = z.infer<typeof assetCopyRequestSchema>;

export function copySets(content: CopyContent): CopySet[] {
  const count = Math.max(
    1,
    ...adCopyFields.map(
      field => 1 + (content.textVariants?.[copyVariantKeys[field]].length ?? 0)
    )
  );
  return Array.from({ length: count }, (_, index) => ({
    message:
      index === 0
        ? content.message
        : (content.textVariants?.messages[index - 1] ?? ""),
    headline:
      index === 0
        ? content.headline
        : (content.textVariants?.headlines[index - 1] ?? ""),
    description:
      index === 0
        ? content.description
        : (content.textVariants?.descriptions[index - 1] ?? ""),
  }));
}
export function copyContentFromSets(options: CopySet[]): CopyContent {
  const [first, ...rest] = options;
  return {
    ...first,
    textVariants: {
      messages: rest.map(o => o.message),
      headlines: rest.map(o => o.headline),
      descriptions: rest.map(o => o.description),
    },
  };
}
// A targeted regeneration must never overwrite an unrelated field or option.
export function replaceCopyOption(
  content: CopyContent,
  target: CopyRegeneration,
  copy: CopySet
): CopyContent {
  let next = { ...content };
  for (const field of adCopyFields) {
    if (target.field !== "set" && target.field !== field) continue;
    if (target.index === 0) next[field] = copy[field];
    else {
      const key = copyVariantKeys[field];
      const variants = next.textVariants ?? {
        messages: [],
        headlines: [],
        descriptions: [],
      };
      const values = [...variants[key]];
      while (values.length < target.index) values.push("");
      values[target.index - 1] = copy[field];
      next = { ...next, textVariants: { ...variants, [key]: values } };
    }
  }
  return next;
}
