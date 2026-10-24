import { useState } from "react";
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
  const [failed, setFailed] = useState<Record<string, string>>({});
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
          <p className="mb-2 text-xs text-muted-foreground">
            {photos.length} {photos.length === 1 ? "photo" : "photos"} · select
            the angles you need
          </p>
          <div className="flex max-w-full gap-2 overflow-x-auto pb-2">
            {photos.map((photo, i) => {
              const checked = selected.includes(photo.key),
                unavailable = !photo.url || failed[photo.key] === photo.url;
              return (
                <button
                  type="button"
                  key={photo.key}
                  aria-label={`Use photo ${i + 1} for ${photo.name}`}
                  aria-pressed={checked}
                  disabled={
                    !checked && (unavailable || selected.length >= limit)
                  }
                  onClick={() => onToggle(photo.key)}
                  className={`w-24 shrink-0 rounded-lg border p-1 text-xs disabled:opacity-50 ${checked ? "border-primary bg-primary/10" : "border-border"}`}
                >
                  {unavailable ? (
                    <span className="grid h-20 place-items-center">
                      Image unavailable
                    </span>
                  ) : (
                    <img
                      className="h-20 w-full object-contain"
                      src={photo.url}
                      alt=""
                      loading="lazy"
                      onError={() =>
                        setFailed(previous => ({
                          ...previous,
                          [photo.key]: photo.url,
                        }))
                      }
                    />
                  )}
                  <span>
                    {checked ? "Selected · " : ""}Photo {i + 1}
                  </span>
                </button>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}
