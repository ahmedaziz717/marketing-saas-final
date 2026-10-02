import type { PublicationContent, Channel } from "@shared/channels";
import type { LibraryAsset } from "@shared/assetLibrary";
export function ContentPreview({
  channel,
  content,
  asset,
  assets = [],
}: {
  channel: Channel;
  content: PublicationContent;
  asset?: LibraryAsset;
  assets?: LibraryAsset[];
}) {
  const keys =
    content.carouselAssetKeys ??
    Object.values(content.placementAssetKeys ?? {}).filter(
      (v): v is string => !!v
    );
  const media = keys.length
    ? keys
        .map(key => assets.find(a => a.key === key))
        .filter((a): a is LibraryAsset => !!a)
    : asset
      ? [asset]
      : [];
  return (
    <section
      aria-label="Content preview"
      className="min-w-0 rounded-2xl border bg-background p-4 sm:col-span-2"
    >
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-semibold">
          {channel === "facebook" ? "Post preview" : "Ad preview"}
        </h3>
        <span className="text-xs text-muted-foreground">
          {channel === "facebook" ? "Facebook" : "Meta Ads"} · Approximate
          preview
        </span>
      </div>
      <p className="whitespace-pre-wrap break-words text-sm leading-6">
        {content.message || "Your text will appear here."}
      </p>
      {!!media.length && (
        <div
          className={`mt-3 grid gap-3 ${media.length > 1 ? "sm:grid-cols-3" : ""}`}
        >
          {media.map(a => (
            <figure
              key={a.key}
              className="min-w-0 overflow-hidden rounded-xl bg-muted/40"
            >
              {a.mediaType === "video" ? (
                <video
                  src={a.url}
                  controls
                  preload="metadata"
                  className="max-h-72 w-full"
                />
              ) : (
                <img
                  src={a.url}
                  alt={a.name}
                  className="max-h-72 w-full object-contain"
                />
              )}
              <figcaption className="break-words p-2 text-xs text-muted-foreground">
                {a.name}
              </figcaption>
            </figure>
          ))}
        </div>
      )}
      {content.link && (
        <p className="mt-3 break-all text-xs text-muted-foreground">
          {content.link}
        </p>
      )}
      {channel === "meta_ads" && (
        <div className="mt-3 rounded-xl bg-muted/50 p-3">
          <p className="break-words font-semibold">
            {content.headline || "Your headline"}
          </p>
          <p className="mt-1 break-words text-sm">{content.description}</p>
          <span className="mt-3 inline-block rounded-lg border px-3 py-1 text-sm">
            {content.callToAction.toLowerCase().replaceAll("_", " ")}
          </span>
        </div>
      )}
    </section>
  );
}
