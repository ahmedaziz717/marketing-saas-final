import { catalogCardGallery } from "@shared/catalogMedia";
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
      {Array.from(groups.entries()).map(([key, photos]) => {
        const gallery = catalogCardGallery(
          photos,
          photos[0].mediaGroups,
          photos[0].representedGroupIds
        );
        const unavailable = gallery.images[0]?.unavailableReason;
        const retained = photos.filter(
          photo =>
            selected.includes(photo.key) && !gallery.images.includes(photo)
        );
        return (
          <section
            key={key}
            aria-label={`Photos for ${photos[0].name}`}
            className="min-w-0 self-start rounded-xl border p-3"
          >
            <h3 className="text-sm font-semibold">{photos[0].name}</h3>
            {photos[0].componentKind && (
              <p className="text-xs text-muted-foreground">
                {photos[0].componentKind} Option
              </p>
            )}
            {unavailable && (
              <p role="status" className="text-xs text-muted-foreground">
                {unavailable}
              </p>
            )}
            {retained.map(photo => (
              <p
                key={photo.key}
                role="status"
                className="text-xs text-muted-foreground"
              >
                Saved reference retained:{" "}
                {photo.unavailableReason ??
                  "Choose the separate component card before use."}{" "}
                <button type="button" onClick={() => onToggle(photo.key)}>
                  Remove saved reference
                </button>
              </p>
            ))}
            <CatalogGallery
              primaryId={
                photos[0].product
                  ? primaryImageIds?.[photos[0].product.id]
                  : undefined
              }
              name={photos[0].name}
              groups={gallery.groups}
              images={gallery.images.map(photo => ({
                id: Number(photo.key.split(":")[1]),
                url: photo.url,
                isPrimary: photo.isPrimary,
                media: photo.media,
              }))}
              selectedIds={photos
                .filter(photo => selected.includes(photo.key))
                .map(photo => Number(photo.key.split(":")[1]))}
              disabled={!!unavailable || selected.length >= limit}
              onSelect={id => {
                const photo = photos.find(
                  p => Number(p.key.split(":")[1]) === id
                );
                if (
                  photo &&
                  (!photo.unavailableReason || selected.includes(photo.key))
                )
                  onToggle(photo.key);
              }}
            />
          </section>
        );
      })}
    </div>
  );
}
