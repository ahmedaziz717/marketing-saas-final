import { CatalogGallery } from "./CatalogGallery";
import type { VideoImageChoice } from "@shared/videoCreation";

export function ProductPhotoGroups({
  choices,
  selected,
  limit,
  onToggle,
  primaryImageIds,
}: {
  /** Explicit catalog primary IDs by product; never infer Hero from a paged result. */
  primaryImageIds?: Record<number, number>;
  choices: (VideoImageChoice & { isPrimary?: boolean | number })[];
  selected: string[];
  limit: number;
  onToggle: (key: string) => void;
}) {
  const groups = new Map<string, typeof choices>();
  for (const choice of choices) {
    const key = choice.product ? `product:${choice.product.id}` : choice.key;
    const photos = groups.get(key) ?? [];
    if (!photos.some(photo => photo.key === choice.key)) photos.push(choice);
    groups.set(key, photos);
  }
  return (
    <div className="grid min-w-0 gap-4 sm:grid-cols-2">
      {Array.from(groups.entries()).map(([key, photos]) => (
        <section
          key={key}
          aria-label={`Photos for ${photos[0].name}`}
          className="min-w-0 self-start rounded-xl border p-3"
        >
          <h3 className="text-sm font-semibold">{photos[0].name}</h3>
          <CatalogGallery
            primaryId={
              photos[0].product
                ? primaryImageIds?.[photos[0].product.id]
                : undefined
            }
            name={photos[0].name}
            groups={photos[0].mediaGroups}
            images={photos.map(photo => ({
              id: Number(photo.key.split(":")[1]),
              url: photo.url,
              isPrimary: photo.isPrimary,
              media: photo.media,
            }))}
            selectedIds={photos
              .filter(photo => selected.includes(photo.key))
              .map(photo => Number(photo.key.split(":")[1]))}
            disabled={selected.length >= limit}
            onSelect={id => {
              const photo = photos.find(
                p => Number(p.key.split(":")[1]) === id
              );
              if (photo) onToggle(photo.key);
            }}
          />
        </section>
      ))}
    </div>
  );
}
