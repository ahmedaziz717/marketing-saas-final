import { z } from "zod";

const path = z
  .string()
  .trim()
  .max(200)
  .regex(
    /^(?:[A-Za-z0-9_$-]+(?:\.[A-Za-z0-9_$-]+)*)?$/,
    "Use dot-separated JSON field names."
  )
  .refine(
    value =>
      !value
        .split(".")
        .some(part => ["__proto__", "prototype", "constructor"].includes(part)),
    "Unsupported field path."
  );
export const API_CATALOG_FIELDS = [
  "id",
  "name",
  "description",
  "sku",
  "productUrl",
  "imageUrl",
  "price",
  "currency",
  "category",
  "specifications",
  "features",
  "availability",
] as const;
export const apiCatalogMappingSchema = z.object({
  itemsPath: path.default(""),
  nextPath: path.default(""),
  fields: z
    .object(
      Object.fromEntries(
        API_CATALOG_FIELDS.map(field => [field, path.optional()])
      ) as Record<
        (typeof API_CATALOG_FIELDS)[number],
        z.ZodOptional<typeof path>
      >
    )
    .default({}),
});
export const apiCatalogAuthSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("none") }),
  z.object({
    type: z.literal("basic"),
    username: z
      .string()
      .max(500)
      .refine(v => !/[\r\n:]/.test(v)),
    password: z
      .string()
      .min(1)
      .max(4000)
      .refine(v => !/[\r\n]/.test(v)),
  }),
  z.object({
    type: z.literal("bearer"),
    token: z
      .string()
      .min(1)
      .max(4000)
      .refine(v => !/[\r\n]/.test(v)),
  }),
  z.object({
    type: z.literal("header"),
    name: z
      .string()
      .regex(/^(?:Authorization|X-[A-Za-z0-9-]{1,60})$/i)
      .refine(
        v =>
          !/^x-(?:forwarded|real-ip|http-method|original-url|rewrite-url)/i.test(
            v
          )
      ),
    value: z
      .string()
      .min(1)
      .max(4000)
      .refine(v => !/[\r\n]/.test(v)),
  }),
]);
export const apiCatalogConfigSchema = apiCatalogMappingSchema.extend({
  auth: apiCatalogAuthSchema.default({ type: "none" }),
  notes: z.string().max(12000).default(""),
});
export const apiInstructionFileSchema = z.object({
  name: z.string().min(1).max(180),
  mimeType: z.enum([
    "image/png",
    "image/jpeg",
    "image/webp",
    "application/pdf",
    "text/plain",
    "text/markdown",
    "application/json",
  ]),
  base64: z
    .string()
    .min(1)
    .max(6 * 1024 * 1024),
});
export type ApiCatalogConfig = z.infer<typeof apiCatalogConfigSchema>;
export type ApiCatalogMapping = z.infer<typeof apiCatalogMappingSchema>;
export type ApiInstructionFile = z.infer<typeof apiInstructionFileSchema>;
