import { z } from "zod";
export const serviceDetailsSchema = z.object({
  pricing: z
    .enum(["fixed", "starting_at", "hourly", "recurring", "quote"])
    .default("quote"),
  duration: z.string().max(200).default(""),
  area: z.string().max(500).default(""),
  delivery: z.enum(["onsite", "remote", "both"]).default("both"),
  packages: z.string().max(3000).default(""),
  cta: z
    .enum(["Book now", "Get a quote", "Contact us", "Learn more"])
    .default("Get a quote"),
});
export const catalogEntrySchema = z.object({
  name: z.string().trim().min(1).max(300),
  description: z.string().max(10000).default(""),
  productUrl: z
    .string()
    .url()
    .refine(v => /^https?:\/\//.test(v), "Use an HTTP(S) URL"),
  recordType: z
    .enum([
      "standalone",
      "service",
      "family",
      "accessory",
      "material",
      "software",
      "bundle",
    ])
    .default("standalone"),
  sku: z.string().max(180).default(""),
  category: z.string().max(240).default(""),
  price: z.string().max(80).default(""),
  currency: z.string().max(16).default(""),
  specifications: z.record(z.string(), z.string().max(1000)).default({}),
  serviceDetails: serviceDetailsSchema.nullable().default(null),
  imageUrl: z.union([z.literal(""), z.string().url()]).default(""),
});
export type CatalogEntry = z.infer<typeof catalogEntrySchema>;
export const STORE_PROVIDERS = [
  "shopify",
  "bigcommerce",
  "woocommerce",
] as const;
export type StoreProvider = (typeof STORE_PROVIDERS)[number];
