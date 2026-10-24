import { useState } from "react";
import {
  galleryGroups,
  type CatalogImageMedia,
  type CatalogMediaGroupSummary,
} from "@shared/catalogMedia";

export function CatalogGallery({
  name,
  images,
  groups,
  selected,
  selectedIds,
  disabled,
  onSelect,
}: {
  name: string;
  images: Array<{ id: number; url: string; media?: CatalogImageMedia | null }>;
  groups?: CatalogMediaGroupSummary[] | null;
  selected?: number | null;
  selectedIds?: number[];
  disabled?: boolean;
  onSelect?: (id: number) => void;
}) {
  const [failed, setFailed] = useState<Record<number, string>>({});
  const galleries = galleryGroups(images, groups);
  return (
    <div className="min-w-0 space-y-3" aria-label={`Photos for ${name}`}>
      {!galleries.length && (
        <p className="text-xs text-muted-foreground">
          No gallery images have been imported.
        </p>
      )}
      {galleries.map(group => (
        <section key={group.id} className="min-w-0 rounded-lg border p-2">
          <h4 className="text-xs font-semibold">{group.name}</h4>
          <p className="mb-2 text-xs text-muted-foreground">
            {group.id === "legacy" ? "Previously imported photos" : group.role === "optional_component"
              ? "Optional component look; not the exact configured system"
              : group.role === "base_component"
                ? "Base component gallery"
                : "System gallery"}
            {` · ${group.images.length} imported`}
            {!group.eligible && " · Not eligible for this system"}
          </p>
          {!group.images.length ||
          (group.expectedCount != null &&
            group.images.length < group.expectedCount) ? (
            <p role="status" className="mb-2 text-xs">
              Gallery incomplete
              {group.expectedCount != null
                ? `: source reports ${group.expectedCount} images`
                : ""}
              . Image URLs must be supplied by the source.
            </p>
          ) : null}
          <div className="flex max-w-full gap-2 overflow-x-auto pb-1">
            {group.images.map((photo, index) => {
              const checked =
                selected === photo.id || selectedIds?.includes(photo.id);
              const unavailable = failed[photo.id] === photo.url;
              const content = (
                <>
                  {unavailable ? (
                    <span className="grid h-20 place-items-center">
                      Image unavailable
                    </span>
                  ) : (
                    <img
                      src={photo.url}
                      alt={`Photo ${index + 1}`}
                      loading="lazy"
                      className="h-20 w-full object-contain"
                      onError={() =>
                        setFailed(old => ({ ...old, [photo.id]: photo.url }))
                      }
                    />
                  )}
                  <span className="block">Photo {index + 1}</span>
                  {photo.media && (
                    <small>
                      {photo.media.width} × {photo.media.height}
                    </small>
                  )}
                </>
              );
              const className = `w-24 shrink-0 rounded border p-1 text-center text-xs ${checked ? "border-primary bg-primary/10" : "border-border"}`;
              return onSelect ? (
                <button
                  key={photo.id}
                  type="button"
                  className={className}
                  aria-label={`Use photo ${index + 1} for ${name}${group.id === "legacy" ? "" : ` — ${group.name}`}`}
                  aria-pressed={!!checked}
                  disabled={
                    !checked && (disabled || !group.eligible || unavailable)
                  }
                  onClick={() => onSelect(photo.id)}
                >
                  {content}
                </button>
              ) : (
                <a
                  key={photo.id}
                  className={className}
                  href={photo.url}
                  target="_blank"
                  rel="noreferrer"
                  aria-label={`Open photo ${index + 1} for ${name} — ${group.name}`}
                >
                  {content}
                </a>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}
