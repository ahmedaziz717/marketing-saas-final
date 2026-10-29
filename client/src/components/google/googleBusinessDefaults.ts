import { websiteAddressSchema } from "@shared/businessProfile";

/** Only workspace-owned business data; never the signed-in user's profile. */
export function googleBusinessDefaults(
  organizationId: number,
  brand: {
    organizationId: number;
    name?: string | null;
    businessProfile?: { website?: string } | null;
  } | null,
  organization?: { id: number; name: string }
) {
  if (brand && brand.organizationId !== organizationId) return null;
  const website = websiteAddressSchema.safeParse(
    brand?.businessProfile?.website ?? ""
  );
  return {
    businessName:
      brand?.name?.trim() ||
      (organization?.id === organizationId ? organization.name.trim() : ""),
    finalUrl:
      website.success && website.data.length <= 2048 ? website.data : "",
  };
}
