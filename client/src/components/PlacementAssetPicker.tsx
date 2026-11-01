import { useState } from "react";
import type { LibraryAsset } from "@shared/assetLibrary";
import type { PublicationContent } from "@shared/channels";
import { placementSlots, type PlacementSlot } from "@shared/metaPlacements";
import { assetFormat } from "@shared/assetFit";
import { ApprovedAssetPicker } from "./ApprovedAssetPicker";
import { Button } from "./ui/button";
export function PlacementAssetPicker({
  assets,
  value,
  onChange,
}: {
  assets: LibraryAsset[];
  value: PublicationContent["placementAssetKeys"];
  onChange: (
    value: NonNullable<PublicationContent["placementAssetKeys"]>
  ) => void;
}) {
  const [slot, setSlot] = useState<PlacementSlot | null>(null);
  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        One ad, three image sizes. Uses the ad set’s enabled placements. The
        square image is also the fallback for other placements.
      </p>
      <div className="grid gap-3 sm:grid-cols-3">
        {placementSlots.map(s => {
          const asset = assets.find(a => a.key === value?.[s.key]);
          return (
            <div key={s.key} className="rounded-xl border p-3">
              <p className="font-medium">{s.label}</p>
              <p className="text-xs text-muted-foreground">
                {s.ratio} · recommended {s.size}
              </p>
              <div className="my-3 flex h-40 items-center justify-center rounded-lg bg-muted">
                {asset ? (
                  <img
                    src={asset.url}
                    alt={asset.name}
                    className="max-h-full max-w-full object-contain"
                  />
                ) : (
                  <span className="text-sm">Choose an approved image</span>
                )}
              </div>
              {asset && <p className="mb-2 truncate text-xs">{asset.name}</p>}
              <Button
                type="button"
                variant="outline"
                className="w-full"
                onClick={() => setSlot(s.key)}
              >
                {asset ? "Change" : "Choose"} {s.ratio} image
              </Button>
            </div>
          );
        })}
      </div>
      {slot && (
        <ApprovedAssetPicker
          assets={assets.filter(a => assetFormat(a) === slot)}
          channel="meta_ads"
          multiple={false}
          selected={value?.[slot] ? [value[slot]!] : []}
          onClose={() => setSlot(null)}
          onSelect={keys => onChange({ ...value, [slot]: keys[0] })}
        />
      )}
    </div>
  );
}
