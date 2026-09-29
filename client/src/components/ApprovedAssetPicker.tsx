import { useState } from "react";
import type { LibraryAsset } from "@shared/assetLibrary";
import {
  assetFit,
  assetFormat,
  assetSizeLabel,
  assetFormats,
} from "@shared/assetFit";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "./ui/dialog";
import { Button } from "./ui/button";
import { channelInput } from "./ChannelConnections";
export function ApprovedAssetPicker({
  assets,
  channel,
  multiple,
  selected,
  onSelect,
  onClose,
}: {
  assets: LibraryAsset[];
  channel: string;
  multiple: boolean;
  selected: string[];
  onSelect: (keys: string[]) => void;
  onClose: () => void;
}) {
  const [keys, setKeys] = useState(
      selected.filter(key =>
        assets.some(
          a =>
            a.key === key &&
            a.state === "approved" &&
            assetFit(a, channel, multiple)
        )
      )
    ),
    [search, setSearch] = useState(""),
    [format, setFormat] = useState("all");
  const eligible = assets.filter(
    a => a.state === "approved" && assetFit(a, channel, multiple)
  );
  const rows = eligible.filter(
    a =>
      a.name.toLowerCase().includes(search.toLowerCase()) &&
      (format === "all" || assetFormat(a) === format)
  );
  return (
    <Dialog open onOpenChange={open => !open && onClose()}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-5xl">
        <DialogHeader>
          <DialogTitle>Choose approved assets</DialogTitle>
          <DialogDescription>
            {channel === "meta_ads" ? "Meta Ads" : "Facebook"} ·{" "}
            {multiple
              ? "Choose 2–10 square images. Selection order becomes carousel order."
              : "Choose a finished asset. Only compatible approved assets are shown."}
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-wrap gap-3">
          <input
            aria-label="Search approved assets"
            className={channelInput + " flex-1"}
            placeholder="Search assets…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
          <select
            aria-label="Asset dimensions"
            className={channelInput + " w-auto"}
            value={format}
            onChange={e => setFormat(e.target.value)}
          >
            <option value="all">All sizes</option>
            {assetFormats.map(f => (
              <option key={f} value={f}>
                {f}
              </option>
            ))}
          </select>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {rows.map(a => (
            <button
              type="button"
              key={a.key}
              aria-pressed={keys.includes(a.key)}
              className={
                "rounded-xl border-2 p-3 text-left " +
                (keys.includes(a.key)
                  ? "border-primary bg-primary/5"
                  : "border-border")
              }
              onClick={() =>
                setKeys(old =>
                  multiple
                    ? old.includes(a.key)
                      ? old.filter(k => k !== a.key)
                      : old.length < 10
                        ? [...old, a.key]
                        : old
                    : [a.key]
                )
              }
            >
              <div className="relative flex h-44 items-center justify-center rounded-lg bg-muted">
                {a.mediaType === "video" ? (
                  <video
                    src={a.url}
                    preload="metadata"
                    className="max-h-full"
                  />
                ) : (
                  <img
                    src={a.url}
                    alt={a.name}
                    loading="lazy"
                    className="max-h-full object-contain"
                  />
                )}
                {keys.includes(a.key) && (
                  <span className="absolute left-2 top-2 rounded-full bg-primary px-3 py-1 text-primary-foreground">
                    {keys.indexOf(a.key) + 1}
                  </span>
                )}
              </div>
              <p className="mt-3 font-medium">{a.name}</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Approved · {assetSizeLabel(a)}
              </p>
            </button>
          ))}
        </div>
        {!rows.length && (
          <p className="p-8 text-center">
            No matching approved assets. Create or upload a compatible size in
            Content Studio and approve it in Asset Library.
          </p>
        )}
        <div className="sticky bottom-0 flex items-center justify-between border-t bg-background py-3">
          <span>{keys.length} selected</span>
          <Button
            disabled={multiple ? keys.length < 2 : keys.length !== 1}
            onClick={() => {
              onSelect(keys);
              onClose();
            }}
          >
            Use selected assets
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
