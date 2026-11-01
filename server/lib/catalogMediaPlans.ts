import type { CatalogMediaReference } from "../../shared/catalogMedia";
import type { CatalogEntry } from "../../shared/catalog";
export function catalogMediaPlans(item: CatalogEntry) {
  const imageUrls = Array.from(
    new Set([item.imageUrl, ...(item.imageUrls ?? [])].filter(Boolean))
  );
  const plans: Array<{
    candidates: string[];
    references: CatalogMediaReference[];
  }> = [];
  for (const group of item.mediaGroups ?? []) {
    if (!group.eligible) continue;
    for (const [position, image] of Array.from(group.images.entries())) {
      const candidates = Array.from(new Set(image.candidates));
      const known = plans.find(plan =>
        plan.candidates.some(url => candidates.includes(url))
      );
      const reference = { groupId: group.id, imageId: image.id, position };
      if (known) {
        known.candidates = Array.from(
          new Set([...known.candidates, ...candidates])
        );
        known.references.push(reference);
      } else plans.push({ candidates, references: [reference] });
    }
  }
  for (const url of imageUrls)
    if (!plans.some(plan => plan.candidates.includes(url)))
      plans.push({ candidates: [url], references: [] });
  if (plans.length > 1000 || plans.some(plan => plan.candidates.length > 12))
    throw new Error(
      "The product gallery exceeds the supported image/candidate limits; split the source record."
    );

  return plans;
}
