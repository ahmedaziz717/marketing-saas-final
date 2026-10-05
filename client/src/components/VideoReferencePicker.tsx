import { useState } from "react";
import { Check, Film, Search, Upload } from "lucide-react";
import { trpc } from "@/lib/trpc";
import type { LibraryAsset } from "@shared/assetLibrary";
import type { VideoImageChoice } from "@shared/videoCreation";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "./ui/dialog";

export function VideoReferencePicker({
  organizationId,
  kind,
  assets,
  selected,
  limit,
  onChange,
  onClose,
  onUpload,
}: {
  organizationId: number;
  kind: "images" | "video";
  assets: LibraryAsset[];
  selected: string[];
  limit: number;
  onChange: (keys: string[]) => void;
  onClose: () => void;
  onUpload: () => void;
}) {
  const [tab, setTab] = useState<"products" | "assets">(
    kind === "images" ? "products" : "assets"
  );
  const [search, setSearch] = useState("");
  const [origin, setOrigin] = useState("all");
  const [offset, setOffset] = useState(0);
  const catalog = trpc.video.catalogImages.useQuery(
    { organizationId, search, offset },
    { enabled: tab === "products" && kind === "images" }
  );
  const choices: VideoImageChoice[] =
    tab === "products"
      ? (catalog.data?.items ?? [])
      : assets.filter(
          asset =>
            (kind === "video"
              ? asset.mimeType === "video/mp4"
              : asset.mediaType === "image" &&
                asset.mimeType !== "image/gif") &&
            !["rejected", "changes_requested"].includes(asset.state) &&
            (origin === "all" || asset.origin === origin) &&
            asset.name.toLowerCase().includes(search.toLowerCase())
        );
  return (
    <Dialog
      open
      onOpenChange={open => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="flex max-h-[88dvh] flex-col overflow-hidden sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>
            {kind === "video"
              ? "Choose a source video"
              : "Choose reference images"}
          </DialogTitle>
          <DialogDescription>
            {kind === "video"
              ? "Use an MP4 clip of 4–30 seconds."
              : `Combine up to ${limit} product photos and image assets. Selection order matches the image numbers in your prompt.`}
          </DialogDescription>
        </DialogHeader>
        {kind === "images" && (
          <div
            className="flex gap-1 rounded-xl bg-muted p-1"
            role="group"
            aria-label="Image source"
          >
            {(
              [
                ["products", "Product images"],
                ["assets", "Image assets"],
              ] as const
            ).map(([value, label]) => (
              <button
                key={value}
                type="button"
                aria-pressed={tab === value}
                className={`flex-1 rounded-lg px-3 py-2.5 text-sm font-medium ${tab === value ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
                onClick={() => {
                  setTab(value);
                  setSearch("");
                  setOffset(0);
                }}
              >
                {label}
              </button>
            ))}
          </div>
        )}
        <div className="flex flex-wrap gap-2">
          <label className="relative min-w-0 flex-1">
            <Search
              size={16}
              className="absolute left-3 top-3.5 text-muted-foreground"
            />
            <span className="sr-only">Search references</span>
            <Input
              className="h-11 pl-9"
              maxLength={200}
              value={search}
              placeholder={
                tab === "products"
                  ? "Search products or SKU…"
                  : "Search image assets…"
              }
              onChange={e => {
                setSearch(e.target.value);
                setOffset(0);
              }}
            />
          </label>
          {tab === "assets" && (
            <select
              aria-label="Reference origin"
              className="h-11 rounded-lg border bg-background px-3 text-sm"
              value={origin}
              onChange={e => setOrigin(e.target.value)}
            >
              <option value="all">All assets</option>
              <option value="generated">AI generated</option>
              <option value="uploaded">Uploaded</option>
            </select>
          )}
          <Button variant="outline" className="h-11" onClick={onUpload}>
            <Upload size={16} className="mr-2" />
            Upload
          </Button>
        </div>
        {tab === "products" && (
          <p className="text-xs text-muted-foreground">
            Images from approved catalog products. Every angle is available to
            select.
          </p>
        )}
        <div className="min-h-0 overflow-y-auto p-1">
          {tab === "products" && catalog.isLoading ? (
            <p role="status" className="py-12 text-center text-sm">
              Loading product images…
            </p>
          ) : tab === "products" && catalog.error ? (
            <p role="alert" className="py-8 text-sm text-destructive">
              Product images could not be loaded.{" "}
              <button
                className="underline"
                onClick={() => void catalog.refetch()}
              >
                Try again
              </button>
            </p>
          ) : choices.length ? (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {choices.map(asset => {
                const index = selected.indexOf(asset.key),
                  checked = index !== -1;
                return (
                  <button
                    key={asset.key}
                    type="button"
                    aria-label={`${asset.name}${asset.detail ? ` · ${asset.detail}` : ""}`}
                    aria-pressed={checked}
                    disabled={
                      !checked && selected.length >= limit && kind !== "video"
                    }
                    onClick={() =>
                      onChange(
                        kind === "video"
                          ? [asset.key]
                          : checked
                            ? selected.filter(key => key !== asset.key)
                            : [...selected, asset.key]
                      )
                    }
                    className={`relative min-w-0 overflow-hidden rounded-xl border-2 text-left disabled:opacity-40 ${checked ? "border-primary bg-primary/5" : "border-transparent bg-muted/40 hover:border-primary/40"}`}
                  >
                    {kind === "video" ? (
                      <div className="flex aspect-video items-center justify-center bg-slate-900 text-white">
                        <Film size={32} />
                      </div>
                    ) : (
                      <img
                        src={asset.url}
                        alt=""
                        loading="lazy"
                        className="aspect-square w-full object-contain p-2"
                      />
                    )}
                    {checked && (
                      <span className="absolute right-2 top-2 flex items-center gap-1 rounded-full bg-primary px-2 py-1 text-xs text-primary-foreground">
                        <Check size={13} />
                        {index + 1}
                      </span>
                    )}
                    <span
                      className="block truncate px-3 pt-2 text-sm font-medium"
                      title={asset.name}
                    >
                      {asset.name}
                    </span>
                    <span className="block truncate px-3 pb-3 pt-1 text-xs text-muted-foreground">
                      {asset.detail ??
                        (asset.width && asset.height
                          ? `${asset.width} × ${asset.height}`
                          : asset.origin === "generated"
                            ? "AI generated"
                            : "Uploaded")}
                    </span>
                  </button>
                );
              })}
            </div>
          ) : (
            <p className="rounded-xl border border-dashed p-10 text-center text-sm text-muted-foreground">
              {tab === "products"
                ? "No matching product images. Try another search, choose Image assets, or upload an image."
                : "No matching assets. Upload an image or try another search."}
            </p>
          )}
        </div>
        {tab === "products" &&
          (offset > 0 || catalog.data?.nextOffset != null) && (
            <div className="flex items-center justify-between">
              <Button
                size="sm"
                variant="outline"
                disabled={offset === 0 || catalog.isFetching}
                onClick={() => setOffset(Math.max(0, offset - 60))}
              >
                Previous
              </Button>
              <span className="text-xs text-muted-foreground">
                Page {Math.floor(offset / 60) + 1}
              </span>
              <Button
                size="sm"
                variant="outline"
                disabled={
                  catalog.data?.nextOffset == null || catalog.isFetching
                }
                onClick={() => setOffset(catalog.data?.nextOffset ?? offset)}
              >
                Next
              </Button>
            </div>
          )}
        <div className="flex items-center justify-between gap-3 border-t pt-4">
          <p className="text-sm text-muted-foreground">
            {selected.length} / {limit} selected
          </p>
          <Button onClick={onClose}>
            Use selected {kind === "video" ? "video" : "images"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
