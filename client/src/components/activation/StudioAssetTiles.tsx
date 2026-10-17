import { useState } from "react";
import { Search } from "lucide-react";
import type { LibraryAsset } from "@shared/assetLibrary";
import {
  assetFit,
  assetFormat,
  assetFormats,
  assetFormatFilterLabel,
  assetSizeLabel,
} from "@shared/assetFit";
import { StudioCard } from "../configurator/StudioCard";

export function StudioAssetTiles({
  assets,
  channel,
  selected,
  multiple = false,
  requiredFormat,
  onSelect,
}: {
  assets: LibraryAsset[];
  channel: string;
  selected: string[];
  multiple?: boolean;
  requiredFormat?: string;
  onSelect: (keys: string[]) => void;
}) {
  const [search, setSearch] = useState("");
  const [format, setFormat] = useState("all");
  const [media, setMedia] = useState("all");
  const [limit, setLimit] = useState(24);
  const eligible = assets.filter(
    a =>
      a.state === "approved" &&
      a.purpose === "finished" &&
      assetFit(a, channel, multiple) &&
      (!requiredFormat || assetFormat(a) === requiredFormat)
  );
  const rows = eligible.filter(
    a =>
      a.name.toLowerCase().includes(search.toLowerCase()) &&
      (format === "all" || assetFormat(a) === format) &&
      (media === "all" || a.mediaType === media)
  );
  return (
    <section
      aria-label="Approved asset library"
      className="activation-inline-assets"
    >
      <div className="activation-asset-filters">
        <label className="cfg-search">
          <Search size={16} />
          <input
            aria-label="Search approved assets"
            placeholder="Search approved assets…"
            value={search}
            onChange={e => {
              setSearch(e.target.value);
              setLimit(24);
            }}
          />
        </label>
        {!requiredFormat && (
          <label className="cfg-field">
            <span>Size & ratio</span>
            <select
              aria-label="Asset dimensions"
              value={format}
              onChange={e => {
                setFormat(e.target.value);
                setLimit(24);
              }}
            >
              <option value="all">All sizes</option>
              {assetFormats.map(f => (
                <option key={f} value={f}>
                  {assetFormatFilterLabel(f)}
                </option>
              ))}
            </select>
          </label>
        )}
        {channel === "facebook" && (
          <label className="cfg-field">
            <span>Media</span>
            <select
              aria-label="Asset media type"
              value={media}
              onChange={e => {
                setMedia(e.target.value);
                setLimit(24);
              }}
            >
              <option value="all">Images & videos</option>
              <option value="image">Images</option>
              <option value="video">Videos</option>
            </select>
          </label>
        )}
      </div>
      <p className="activation-help">
        {rows.length} approved {rows.length === 1 ? "asset" : "assets"} ·{" "}
        {multiple
          ? `${selected.length}/10 selected · select 2–10 images`
          : "Select a tile to use it"}
      </p>
      <div className="cfg-card-grid">
        {rows.slice(0, limit).map(a => (
          <StudioCard
            key={a.key}
            title={a.name}
            description={assetSizeLabel(a)}
            badge={
              a.mediaType === "video" ? "Approved video" : "Approved image"
            }
            selected={selected.includes(a.key)}
            disabled={
              multiple && selected.length >= 10 && !selected.includes(a.key)
            }
            media={
              a.mediaType === "video" ? (
                <video
                  src={a.url}
                  muted
                  preload="metadata"
                  aria-label={a.name}
                />
              ) : (
                <img src={a.url} alt={a.name} loading="lazy" />
              )
            }
            onSelect={() =>
              onSelect(
                multiple
                  ? selected.includes(a.key)
                    ? selected.filter(key => key !== a.key)
                    : [...selected, a.key]
                  : [a.key]
              )
            }
          />
        ))}
      </div>
      {!rows.length && (
        <p role="status" className="activation-help">
          {eligible.length
            ? "No approved assets match these filters."
            : "No compatible approved assets yet. Approve a finished creative in the Asset Library to use it here."}
        </p>
      )}
      {rows.length > limit && (
        <button
          className="cfg-secondary"
          type="button"
          onClick={() => setLimit(n => n + 24)}
        >
          Show more assets
        </button>
      )}
    </section>
  );
}
