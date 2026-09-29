import { z } from "zod";
export const businessModels = [
  "products",
  "services",
  "directory",
  "membership",
  "saas",
  "mixed",
] as const;
export const businessModelLabels: Record<
  (typeof businessModels)[number],
  string
> = {
  products: "Products / ecommerce",
  services: "Services",
  directory: "Directory / marketplace",
  membership: "Membership / subscription",
  saas: "Software / SaaS",
  mixed: "Mixed business",
};
export const businessProfileSchema = z.object({
  model: z.enum(businessModels).default("products"),
  website: z
    .union([
      z.literal(""),
      z
        .string()
        .url()
        .refine(v => /^https?:\/\//.test(v)),
    ])
    .default(""),
  summary: z.string().trim().max(4000).default(""),
  audiences: z.string().trim().max(2000).default(""),
  goals: z.string().trim().max(2000).default(""),
  primaryOffer: z.string().trim().max(2000).default(""),
  timezone: z
    .string()
    .max(100)
    .refine(v => {
      try {
        new Intl.DateTimeFormat("en", { timeZone: v });
        return true;
      } catch {
        return false;
      }
    })
    .default("America/New_York"),
  currency: z
    .string()
    .regex(/^[A-Z]{3}$/)
    .default("USD"),
});
export type BusinessProfile = z.infer<typeof businessProfileSchema>;
export const offeringTypes = [
  "service",
  "subscription",
  "membership",
  "platform",
  "directory_category",
  "directory_listing",
  "free_offer",
] as const;
export const offeringLabels: Record<(typeof offeringTypes)[number], string> = {
  service: "Service",
  subscription: "Subscription plan",
  membership: "Membership",
  platform: "The platform",
  directory_category: "Directory category",
  directory_listing: "Third-party listing",
  free_offer: "Free offer",
};
export function offeringLabel(item: {
  recordType: string;
  serviceDetails?: { offeringType?: string } | null;
}) {
  const type = item.serviceDetails?.offeringType;
  return type && type in offeringLabels
    ? offeringLabels[type as keyof typeof offeringLabels]
    : item.recordType === "standalone"
      ? "Product"
      : item.recordType.replaceAll("_", " ");
}
