import { z } from "zod";

const url = z
  .string()
  .url()
  .max(2048)
  .refine(value => {
    const parsed = new URL(value);
    return (
      /^https?:$/.test(parsed.protocol) && !parsed.username && !parsed.password
    );
  }, "Use a public image URL without credentials.");
export const catalogMediaGroupSchema = z.object({
  id: z.string().trim().min(1).max(180),
  name: z.string().trim().min(1).max(240),
  role: z.enum(["system", "base_component", "optional_component"]),
  eligible: z.boolean().default(true),
  referenceOnly: z.boolean().optional(),
  expectedCount: z.number().int().min(0).max(1000).optional(),
  component: z
    .object({
      sourceCode: z.string().trim().min(1).max(180),
      kind: z.string().trim().min(1).max(120),
      optionAmount: z.string().max(80).optional(),
      amountMeaning: z.enum(["unknown", "upgrade_delta"]).default("unknown"),
    })
    .optional(),
  images: z
    .array(
      z.object({
        id: z.string().trim().min(1).max(180),
        // Candidates must be resolutions of this same view, never other angles.
        candidates: z.array(url).min(1).max(12),
      })
    )
    .max(1000),
});
export type CatalogMediaGroup = z.infer<typeof catalogMediaGroupSchema>;
export type CatalogMediaReference = {
  groupId: string;
  imageId: string;
  position: number;
};
export type CatalogImageMedia = {
  width: number;
  height: number;
  hasAlpha: boolean;
  candidates: string[];
  selectedSourceUrl: string;
  references: CatalogMediaReference[];
  unavailableCandidates: number;
  retired?: boolean;
};
export type CatalogMediaGroupSummary = Omit<CatalogMediaGroup, "images"> & {
  declaredImages: number;
  imageIds?: string[];
};

export function catalogImageEligible(
  image: { media?: CatalogImageMedia | null },
  groups?: CatalogMediaGroupSummary[] | null
) {
  if (image.media?.retired) return false;
  if (!image.media?.references.length) return true;
  return image.media.references.some(ref =>
    groups?.some(
      group =>
        group.id === ref.groupId &&
        group.eligible &&
        (!group.imageIds || group.imageIds.includes(ref.imageId))
    )
  );
}
export function catalogDefaultImage(
  image: { media?: CatalogImageMedia | null },
  groups?: CatalogMediaGroupSummary[] | null
) {
  if (image.media?.retired) return false;
  if (!image.media?.references.length) return true;
  return image.media.references.some(ref =>
    groups?.some(
      group =>
        group.id === ref.groupId &&
        group.eligible &&
        group.role === "system" &&
        (!group.imageIds || group.imageIds.includes(ref.imageId))
    )
  );
}

export function galleryGroups<
  T extends { id: number; media?: CatalogImageMedia | null },
>(images: T[], groups: CatalogMediaGroupSummary[] | null | undefined) {
  const known = new Set<string>();
  const result = (groups ?? [])
    .map(group => ({
      ...group,
      images: images
        .filter(image =>
          image.media?.references.some(
            ref =>
              ref.groupId === group.id &&
              (!group.imageIds || group.imageIds.includes(ref.imageId))
          )
        )
        .sort(
          (a, b) =>
            (a.media?.references.find(
              ref =>
                ref.groupId === group.id &&
                (!group.imageIds || group.imageIds.includes(ref.imageId))
            )?.position ?? 0) -
            (b.media?.references.find(
              ref =>
                ref.groupId === group.id &&
                (!group.imageIds || group.imageIds.includes(ref.imageId))
            )?.position ?? 0)
        ),
    }))
    .map(group => ({ ...group, sourceImageCount: group.images.length }));
  for (const group of result)
    for (const image of group.images) known.add(String(image.id));
  const legacy = images.filter(
    image =>
      !known.has(String(image.id)) &&
      !image.media?.retired &&
      !image.media?.references.length
  );
  const retired = images.filter(
    image =>
      !known.has(String(image.id)) &&
      (image.media?.retired || !!image.media?.references.length)
  );
  if (retired.length)
    result.push({
      id: "retired",
      name: "Previously imported option views",
      role: "optional_component",
      eligible: false,
      declaredImages: retired.length,
      sourceImageCount: retired.length,
      images: retired,
    });
  if (legacy.length) {
    // An older primary may predate source gallery identities. Keep it beside
    // the product's system views instead of making a Hero-only default gallery.
    // This is presentation only: source references, selection IDs and component
    // galleries remain unchanged. Source counts exclude these additional photos.
    const system = result.find(
      group => group.role === "system" && group.eligible
    );
    if (system) system.images = [...legacy, ...system.images];
    else
      result.unshift({
        id: "legacy",
        name: "Product photos",
        role: "system",
        eligible: true,
        declaredImages: legacy.length,
        sourceImageCount: legacy.length,
        images: legacy,
      });
  }
  return result;
}

/** Visible/selectable parent views; keep stored rows and saved selections unchanged. */
export function catalogCardGallery<
  T extends { media?: CatalogImageMedia | null },
>(
  images: T[],
  groups: CatalogMediaGroupSummary[] | null | undefined,
  representedGroupIds: string[] = []
) {
  const represented = new Set(representedGroupIds);
  return {
    groups: groups?.filter(g => !represented.has(g.id)),
    images: images.filter(
      image =>
        !image.media?.retired &&
        (!image.media?.references.length ||
          image.media.references.some(
            ref =>
              !represented.has(ref.groupId) &&
              groups?.some(
                group =>
                  group.id === ref.groupId &&
                  group.eligible &&
                  (!group.imageIds || group.imageIds.includes(ref.imageId))
              )
          ))
    ),
  };
}

/** Creation eligibility is distinct from catalog approval and publishing.
 * Callers must independently enforce workspace ownership and storage access. */
export function catalogCreationImageEligible(image: {
  media?: CatalogImageMedia | null;
}) {
  return !image.media?.retired;
}
export function catalogCreationGallery<
  T extends { media?: CatalogImageMedia | null },
>(images: T[], groups: CatalogMediaGroupSummary[] | null | undefined) {
  const usable = images.filter(catalogCreationImageEligible);
  const creationGroups: CatalogMediaGroupSummary[] = (groups ?? []).map(
    group => {
      const { imageIds: _imageIds, ...summary } = group;
      return { ...summary, eligible: true };
    }
  );
  const known = new Set(creationGroups.map(group => group.id));
  for (const image of usable)
    for (const ref of image.media?.references ?? []) {
      if (known.has(ref.groupId)) continue;
      known.add(ref.groupId);
      creationGroups.push({
        id: ref.groupId,
        name: "Product photos",
        role: "optional_component",
        eligible: true,
        declaredImages: 0,
      });
    }
  return { images: usable, groups: creationGroups };
}
