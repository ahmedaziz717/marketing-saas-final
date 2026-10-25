import {
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type TouchEvent,
} from "react";
import {
  galleryGroups,
  type CatalogImageMedia,
  type CatalogMediaGroupSummary,
} from "@shared/catalogMedia";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

export type CatalogGalleryImage = {
  id: number;
  url: string;
  isPrimary?: boolean | number;
  media?: CatalogImageMedia | null;
};
/** Preview is independent of generation selection. primaryId is the catalog primary, never the selected reference. */
export function CatalogGallery({
  name,
  images,
  groups,
  primaryId,
  selected,
  selectedIds,
  disabled,
  onSelect,
}: {
  name: string;
  images: CatalogGalleryImage[];
  groups?: CatalogMediaGroupSummary[] | null;
  primaryId?: number | null;
  selected?: number | null;
  selectedIds?: number[];
  disabled?: boolean;
  onSelect?: (id: number) => void;
}) {
  const [failed, setFailed] = useState<Record<number, string>>({});
  const [groupId, setGroupId] = useState<string>();
  const [previewId, setPreviewId] = useState<number>();
  const strip = useRef<HTMLDivElement>(null);
  const touch = useRef<{ x: number; y: number } | null>(null);
  const galleries = galleryGroups(images, groups);
  const heroId = primaryId ?? images.find(photo => photo.isPrimary)?.id;
  const group =
    galleries.find(g => g.id === groupId) ??
    galleries.find(g => g.images.some(photo => photo.id === heroId)) ??
    galleries[0];
  const photos = [...(group?.images ?? [])].sort(
    (a, b) => Number(b.id === heroId) - Number(a.id === heroId)
  );
  const preview =
    photos.find(photo => photo.id === previewId) ??
    photos.find(photo => photo.id === heroId) ??
    photos[0];
  const index = photos.findIndex(photo => photo.id === preview?.id);
  const label = (id: number) =>
    id === heroId
      ? "Hero"
      : String(
          images
            .filter(photo => photo.id !== heroId)
            .findIndex(photo => photo.id === id) + (heroId == null ? 1 : 2)
        );
  useEffect(() => {
    strip.current
      ?.querySelector<HTMLElement>('[aria-pressed="true"]')
      ?.scrollIntoView?.({ block: "nearest", inline: "nearest" });
  }, [preview?.id, group?.id]);
  function move(delta: number) {
    if (photos.length)
      setPreviewId(photos[(index + delta + photos.length) % photos.length].id);
  }
  function keyboard(event: KeyboardEvent) {
    if (event.key === "ArrowRight" || event.key === "ArrowLeft") {
      event.preventDefault();
      move(event.key === "ArrowRight" ? 1 : -1);
    } else if (event.key === "Home" || event.key === "End") {
      event.preventDefault();
      setPreviewId(photos[event.key === "Home" ? 0 : photos.length - 1]?.id);
    }
  }
  const gesture = {
    onTouchStart: (event: TouchEvent) => {
      const p = event.touches[0];
      touch.current = p ? { x: p.clientX, y: p.clientY } : null;
    },
    onTouchEnd: (event: TouchEvent) => {
      const p = event.changedTouches[0],
        start = touch.current;
      touch.current = null;
      if (
        start &&
        p &&
        Math.abs(p.clientX - start.x) > 40 &&
        Math.abs(p.clientX - start.x) > Math.abs(p.clientY - start.y)
      )
        move(p.clientX < start.x ? 1 : -1);
    },
    onTouchCancel: () => {
      touch.current = null;
    },
  };
  const navigation = photos.length > 1 && (
    <div className="flex items-center justify-between gap-2">
      <button
        type="button"
        className="min-h-10 rounded border px-3"
        aria-label="Previous image"
        onClick={() => move(-1)}
      >
        ←
      </button>
      <span className="text-xs" aria-live="polite">
        {preview && label(preview.id)} · {index + 1} / {photos.length}
      </span>
      <button
        type="button"
        className="min-h-10 rounded border px-3"
        aria-label="Next image"
        onClick={() => move(1)}
      >
        →
      </button>
    </div>
  );
  return (
    <div
      className="min-w-0 max-w-full space-y-2"
      aria-label={`Photos for ${name}`}
    >
      {!galleries.length && (
        <p className="text-xs text-muted-foreground">
          No gallery images have been imported.
        </p>
      )}
      {galleries.length > 1 && (
        <label className="block text-xs">
          Gallery
          <select
            className="mt-1 block w-full min-w-0 rounded border bg-background p-2"
            aria-label={`Gallery for ${name}`}
            value={group?.id}
            onChange={e => {
              setGroupId(e.target.value);
              setPreviewId(undefined);
            }}
          >
            {galleries.map(g => (
              <option key={g.id} value={g.id}>
                {g.name} ({g.images.length})
                {!g.eligible ? " — Not eligible" : ""}
              </option>
            ))}
          </select>
        </label>
      )}
      {group && (
        <>
          <p className="text-xs text-muted-foreground">
            {group.role === "optional_component"
              ? "Optional component look; not the exact configured system"
              : group.role === "base_component"
                ? "Base component gallery"
                : group.id === "legacy"
                  ? "Previously imported photos"
                  : "Product gallery"}
            {group.referenceOnly &&
              "; reference photos - actual configuration may vary"}
            {!group.eligible && " · Not eligible for this system"}
          </p>
          {(!photos.length ||
            (group.expectedCount != null &&
              group.sourceImageCount < group.expectedCount)) && (
            <p role="status" className="text-xs">
              Gallery incomplete
              {group.expectedCount != null
                ? `: source reports ${group.expectedCount} images`
                : ""}
              . Image URLs must be supplied by the source.
            </p>
          )}
          {preview && (
            <Dialog>
              <div onKeyDown={keyboard} {...gesture} className="space-y-2">
                <DialogTrigger asChild>
                  <button
                    type="button"
                    className="relative block h-44 w-full overflow-hidden rounded-lg bg-muted/30"
                    aria-label={`Enlarge ${label(preview.id)} for ${name}`}
                  >
                    {failed[preview.id] === preview.url ? (
                      <span>Image unavailable</span>
                    ) : (
                      <img
                        src={preview.url}
                        alt={`${name} — ${label(preview.id)} preview`}
                        className="h-full w-full object-contain"
                        onError={() =>
                          setFailed(old => ({
                            ...old,
                            [preview.id]: preview.url,
                          }))
                        }
                      />
                    )}
                    <span className="absolute bottom-1 right-1 rounded bg-background/90 px-2 py-1 text-xs">
                      Enlarge
                    </span>
                  </button>
                </DialogTrigger>
                {navigation}
              </div>
              <DialogContent
                className="max-h-[90dvh] overflow-auto sm:max-w-4xl"
                onKeyDown={keyboard}
              >
                <DialogTitle>
                  {name} — {label(preview.id)}
                </DialogTitle>
                <DialogDescription>
                  {group.name}. Swipe or use arrow keys to browse; Escape
                  closes.
                </DialogDescription>
                <div {...gesture}>
                  {failed[preview.id] === preview.url ? (
                    <p>Image unavailable</p>
                  ) : (
                    <img
                      src={preview.url}
                      alt={`${name} — ${label(preview.id)} enlarged`}
                      className="h-[60dvh] w-full object-contain"
                    />
                  )}
                </div>
                {navigation}
                <a
                  href={preview.url}
                  target="_blank"
                  rel="noreferrer"
                  className="text-sm underline"
                >
                  Open original image
                </a>
              </DialogContent>
            </Dialog>
          )}
          <div
            ref={strip}
            className="flex max-w-full gap-2 overflow-x-auto overscroll-x-contain pb-2"
            aria-label="Image thumbnails"
          >
            {photos.map(photo => {
              const checked =
                  selected === photo.id || !!selectedIds?.includes(photo.id),
                unavailable = failed[photo.id] === photo.url;
              return (
                <div key={photo.id} className="w-16 shrink-0">
                  <button
                    type="button"
                    onKeyDown={keyboard}
                    onClick={() => setPreviewId(photo.id)}
                    aria-label={`Preview ${label(photo.id)} for ${name}`}
                    aria-pressed={preview?.id === photo.id}
                    className={`block w-full rounded border p-1 text-xs ${preview?.id === photo.id ? "border-primary bg-primary/10" : "border-border"}`}
                  >
                    {unavailable ? (
                      <span className="grid h-12 place-items-center">
                        Unavailable
                      </span>
                    ) : (
                      <img
                        src={photo.url}
                        alt=""
                        loading="lazy"
                        className="h-12 w-full object-contain"
                        onError={() =>
                          setFailed(old => ({ ...old, [photo.id]: photo.url }))
                        }
                      />
                    )}
                    {label(photo.id)}
                  </button>
                  {onSelect && (
                    <label className="flex min-h-10 items-center justify-center gap-1 text-xs">
                      <input
                        type="checkbox"
                        checked={checked}
                        disabled={
                          !checked &&
                          (!!disabled ||
                            !group.eligible ||
                            unavailable ||
                            !!photo.media?.retired)
                        }
                        aria-label={`Use ${label(photo.id)} for ${name} - ${group.name}`}
                        onChange={() => onSelect(photo.id)}
                      />{" "}
                      Use
                    </label>
                  )}
                </div>
              );
            })}
          </div>
          {preview && (
            <details className="text-xs text-muted-foreground">
              <summary className="cursor-pointer py-1">Image details</summary>
              <p>
                {group.name} · {label(preview.id)}
              </p>
              {preview.media && (
                <p>
                  {preview.media.width} x {preview.media.height}
                </p>
              )}
              <a
                href={preview.url}
                target="_blank"
                rel="noreferrer"
                className="underline"
              >
                Original image
              </a>
            </details>
          )}
        </>
      )}
    </div>
  );
}
