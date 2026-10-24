import { CatalogGallery } from "./CatalogGallery";
import type { VideoImageChoice } from "@shared/videoCreation";

export function ProductPhotoGroups({
  choices,
  selected,
  limit,
  onToggle,
}: {
  choices: VideoImageChoice[];
  selected: string[];
  limit: number;
  onToggle: (key: string) => void;
}) {
  const groups = new Map<string, VideoImageChoice[]>();
  for (const choice of choices) {
    const key = choice.product ? `product:${choice.product.id}` : choice.key;
    const photos = groups.get(key) ?? [];
    if (
      !photos.some(
        photo => photo.key === choice.key || photo.url === choice.url
      )
    )
      photos.push(choice);
    groups.set(key, photos);
  }
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {Array.from(groups.entries()).map(([key, photos]) => (
        <section
          key={key}
          aria-label={`Photos for ${photos[0].name}`}
          className="min-w-0 rounded-xl border p-3"
        >
          <h3 className="text-sm font-semibold">{photos[0].name}</h3>
          <CatalogGallery name={photos[0].name} groups={photos[0].mediaGroups}
            images={photos.map(photo => ({ id: Number(photo.key.split(":")[1]), url: photo.url, media: photo.media }))}
            selectedIds={selected.map(key => Number(key.split(":")[1]))}
            disabled={selected.length >= limit}
            onSelect={id => { const photo = photos.find(p => Number(p.key.split(":")[1]) === id); if (photo) onToggle(photo.key); }} />
        </section>
      ))}
    </div>
  );
}
