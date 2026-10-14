import { useState, type ReactNode } from "react";
import { Film, ImagePlus, RefreshCw } from "lucide-react";
import { Link } from "wouter";
import { trpc } from "@/lib/trpc";
import type { CreativeSetup } from "@shared/creativeBuilder";
import { videoSetupSchema, type VideoSetup } from "@shared/videoCreation";
import type { LibraryAsset } from "@shared/assetLibrary";

type Trial = {
  key: string;
  title: string;
  url: string;
  createdAtMs: number;
  status: string;
  imageSetup?: CreativeSetup | null;
  videoSetup?: VideoSetup | null;
};

export function StudioPreview({
  organizationId,
  kind,
  briefId,
  assets,
  videos,
  children,
  reuse,
}: {
  organizationId: number;
  kind: "image" | "video";
  briefId?: number;
  assets: LibraryAsset[];
  videos: Array<{
    id: string;
    status: string;
    assetKey: string | null;
    setup: VideoSetup;
    createdAtMs: number;
  }>;
  children: ReactNode;
  reuse: (trial: {
    imageSetup?: CreativeSetup | null;
    videoSetup?: VideoSetup | null;
  }) => void;
}) {
  const [selected, setSelected] = useState<Trial | null>(null);
  const [all, setAll] = useState(false);
  const history = trpc.creativeBuilder.studioHistory.useQuery(
    { organizationId, briefId: all ? undefined : briefId },
    { enabled: kind === "image", refetchOnWindowFocus: true }
  );
  const trials: Trial[] =
    kind === "image"
      ? (history.data ?? []).flatMap(item =>
          item.url
            ? [
                {
                  ...item,
                  key: "creative:" + item.id,
                  url: item.url,
                  imageSetup: item.setup,
                },
              ]
            : []
        )
      : videos
          .flatMap(item => {
            const asset = assets.find(a => a.key === item.assetKey);
            const setup = videoSetupSchema.safeParse(item.setup);
            return asset?.mediaType === "video" && item.status === "completed"
              ? [
                  {
                    key: item.id,
                    title: item.setup.title,
                    url: asset.url,
                    createdAtMs: item.createdAtMs,
                    status: item.status,
                    videoSetup: setup.success ? setup.data : null,
                  },
                ]
              : [];
          })
          .slice(0, 24);
  return (
    <div className="cfg-preview-gallery">
      {selected ? (
        <div className="cfg-result-preview">
          {kind === "image" ? (
            <img src={selected.url} alt={selected.title} />
          ) : (
            <video
              key={selected.key}
              src={selected.url}
              controls
              preload="metadata"
            />
          )}
          <div className="cfg-result-details">
            <strong>{selected.title}</strong>
            <small>
              Generated {new Date(selected.createdAtMs).toLocaleString()} ·{" "}
              {selected.status}
            </small>
            <button
              type="button"
              disabled={!selected.imageSetup && !selected.videoSetup}
              onClick={() => {
                reuse(selected);
                setSelected(null);
              }}
            >
              Use these settings as a new draft
            </button>
          </div>
        </div>
      ) : (
        children
      )}
      <div className="cfg-trials-heading">
        <strong>
          {kind === "image" && briefId && !all
            ? "Versions of this creative"
            : "Recent creations"}
        </strong>
        {kind === "image" && briefId && (
          <button
            type="button"
            onClick={() => {
              setAll(!all);
              setSelected(null);
            }}
          >
            {all ? "This creative" : "All recent"}
          </button>
        )}
        {kind === "image" && (
          <button
            type="button"
            aria-label="Refresh previous versions"
            disabled={history.isFetching}
            onClick={() => history.refetch()}
          >
            <RefreshCw size={14} />
          </button>
        )}
      </div>
      <div className="cfg-trials" aria-label="Previous generated versions">
        <button
          type="button"
          aria-pressed={!selected}
          className="cfg-trial cfg-trial-current"
          onClick={() => setSelected(null)}
        >
          <ImagePlus size={22} />
          <span>Current setup</span>
        </button>
        {trials.map(item => (
          <button
            type="button"
            key={item.key}
            className="cfg-trial"
            aria-label={"Preview " + item.title}
            aria-pressed={selected?.key === item.key}
            onClick={() => setSelected(item)}
            title={
              item.title + " · " + new Date(item.createdAtMs).toLocaleString()
            }
          >
            {kind === "image" ? (
              <img src={item.url} alt="" loading="lazy" />
            ) : (
              <span className="cfg-trial-video">
                <video src={item.url + "#t=0.1"} muted preload="metadata" />
                <Film size={16} />
              </span>
            )}
            <span>{item.title}</span>
            <small>{new Date(item.createdAtMs).toLocaleDateString()}</small>
          </button>
        ))}
      </div>
      {history.error && kind === "image" ? (
        <p className="cfg-help">
          Previous images could not load. Refresh to try again.
        </p>
      ) : (
        !trials.length && (
          <p className="cfg-help">
            {history.isLoading && kind === "image"
              ? "Loading previous images…"
              : "Your generated versions will appear here."}
          </p>
        )
      )}
      <Link href="/app/creatives/drafts" className="cfg-history-link">
        View all creative work →
      </Link>
    </div>
  );
}
