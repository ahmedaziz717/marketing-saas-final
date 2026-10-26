import { GoogleAssetMetrics } from "./GoogleAssetMetrics";
import { Button } from "@/components/ui/button";
import {
  pmaxImageCapacity,
  pmaxMarketingImageFields,
  pmaxCanReplaceImage,
  type GoogleChange,
} from "@shared/googleCampaigns";
import { label } from "./GoogleCampaignFields";

type Change = Extract<GoogleChange, { kind: "asset_group_assets" }>;
export function GoogleAssetReplacement({
  change,
  assets,
  onChange,
  disabled = false,
}: {
  change: Change;
  assets: any[];
  onChange: (change: Change) => void;
  disabled?: boolean;
}) {
  const group = assets.filter(
    a => String(a.assetGroup.id) === change.assetGroupId
  );
  const capacity = pmaxImageCapacity(
    group.map(a => ({
      assetId: String(a.asset.id),
      field: a.assetGroupAsset.fieldType,
    })),
    change.add,
    change.remove
  );
  const removalsOnly = change.remove.length > 0 && change.add.length === 0;
  const full = capacity.filter(c => c.replacementsNeeded > 0);
  return (
    <section
      className="google-existing-assets"
      aria-label="Existing assets and replacements"
    >
      <h3>
        {removalsOnly
          ? "Review selected removals"
          : full.length
            ? "Choose images to replace"
            : change.remove.length
              ? "Review selected replacements"
              : "Existing assets are kept"}
      </h3>
      <p>
        {removalsOnly
          ? "This saved draft explicitly removes the associations listed below. All other images, text, logos, videos and campaign settings stay unchanged. Cancel removals to keep everything."
          : "Adding creative keeps existing images, text, logos, videos and campaign settings unless you explicitly select replacements. Nothing is removed automatically."}
      </p>
      {full.length > 0 && (
        <p>
          You can replace an image with a different size. The new image must
          meet Google’s specifications, and the group must retain at least one
          landscape and one square image. Unavailable choices protect that
          required coverage.
        </p>
      )}
      {full.map(c => (
        <p key={c.field} role="status">
          {label(c.field)}: {c.current}/{c.max} slots used. Choose{" "}
          {c.replacementsNeeded} existing image
          {c.replacementsNeeded === 1 ? "" : "s"} to replace with your {c.added}{" "}
          new image{c.added === 1 ? "" : "s"}.{" "}
          {c.remaining > 0
            ? `${c.remaining} replacement choices still needed.`
            : "Replacement choices ready for review."}
        </p>
      ))}
      {group.length > 0 && (
        <div className="google-current-assets">
          {group
            .filter(a =>
              pmaxMarketingImageFields.includes(a.assetGroupAsset.fieldType)
            )
            .map(a => {
              const field = a.assetGroupAsset.fieldType;
              const id = String(a.asset.id);
              const selected = change.remove.some(
                r => r.assetId === id && r.field === field
              );
              const selectedCount = change.remove.filter(r =>
                pmaxMarketingImageFields.includes(r.field)
              ).length;
              const required = full[0]?.replacementsNeeded ?? 0;
              return (
                <label key={a.assetGroupAsset.resourceName}>
                  {a.asset.imageAsset?.fullSize?.url && (
                    <img
                      src={a.asset.imageAsset.fullSize.url}
                      alt={a.asset.name || `Image ${id}`}
                    />
                  )}
                  {full.length > 0 && (
                    <input
                      type="checkbox"
                      checked={selected}
                      disabled={
                        disabled ||
                        (!selected &&
                          (selectedCount >= required ||
                            !pmaxCanReplaceImage(
                              { assetId: id, field },
                              group.map(a => ({
                                assetId: String(a.asset.id),
                                field: a.assetGroupAsset.fieldType,
                              })),
                              change.add,
                              change.remove
                            )))
                      }
                      onChange={e =>
                        onChange({
                          ...change,
                          remove: e.target.checked
                            ? [...change.remove, { assetId: id, field }]
                            : change.remove.filter(
                                r => !(r.assetId === id && r.field === field)
                              ),
                        })
                      }
                    />
                  )}
                  <span>
                    {full.length > 0 ? "Replace " : ""}
                    {a.asset.name || `image ${id}`} · {label(field)}
                  </span>
                  <GoogleAssetMetrics
                    resourceName={a.assetGroupAsset.resourceName}
                  />
                </label>
              );
            })}
        </div>
      )}
      {change.remove.length > 0 && (
        <>
          {group
            .filter(
              a =>
                ["HEADLINE", "LONG_HEADLINE", "DESCRIPTION"].includes(
                  a.assetGroupAsset.fieldType
                ) &&
                change.remove.some(
                  r =>
                    r.assetId === String(a.asset.id) &&
                    r.field === a.assetGroupAsset.fieldType
                )
            )
            .map(a => (
              <p key={a.assetGroupAsset.resourceName}>
                Selected {label(a.assetGroupAsset.fieldType).toLowerCase()} to
                replace:{" "}
                {a.asset.textAsset?.text || `Google asset ${a.asset.id}`}
              </p>
            ))}
          <p role="status">
            Only the {change.remove.length} selected association
            {change.remove.length === 1 ? "" : "s"} will be{" "}
            {removalsOnly ? "removed" : "replaced"} on confirmation. The
            original files remain in Google’s library and other groups are
            unchanged.
          </p>
          <Button
            variant="outline"
            className="h-auto max-w-full whitespace-normal text-left"
            disabled={disabled}
            onClick={() => onChange({ ...change, remove: [] })}
          >
            {removalsOnly
              ? "Cancel removals · keep all existing assets"
              : "Cancel replacements · keep all existing assets"}
          </Button>
        </>
      )}
    </section>
  );
}
