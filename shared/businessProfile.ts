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
/** Normalize only public website syntax; crawler still enforces network safety. */
export const websiteAddressSchema = z
  .string()
  .trim()
  .transform(value => {
    if (!value || /^[a-z][a-z0-9+.-]*:/i.test(value)) return value;
    return "https://" + value.replace(/^\/\//, "");
  })
  .pipe(
    z
      .string()
      .url("Enter a valid website, for example learnlikethis.com")
      .refine(value => {
        let url: URL;
        try {
          url = new URL(value);
        } catch {
          return false;
        }
        return (
          ["http:", "https:"].includes(url.protocol) &&
          !url.username &&
          !url.password &&
          url.hostname.includes(".")
        );
      }, "Enter a public HTTP or HTTPS website address")
  );
export const businessProfileSchema = z.object({
  model: z.enum(businessModels).default("products"),
  website: z.union([z.literal(""), websiteAddressSchema]).default(""),
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

// AI suggestions sometimes express list-valued answers as arrays. Accept only
// arrays of strings here; saved user input retains the strict text schema.
const suggestedText = (limit: number) =>
  z
    .union([z.string(), z.array(z.string())])
    .transform(value => (Array.isArray(value) ? value.join("\n") : value))
    .pipe(z.string().trim().max(limit))
    .default("");
export const suggestedBusinessProfileSchema = businessProfileSchema.extend({
  audiences: suggestedText(2000),
  goals: suggestedText(2000),
});
