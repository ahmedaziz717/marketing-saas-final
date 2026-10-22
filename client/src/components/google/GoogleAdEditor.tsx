import { useState } from "react";
import { Link, useSearch } from "wouter";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import {
  googleAssetFieldSchema,
  type GoogleAssetInput,
  type GoogleAdContent,
} from "@shared/googleCampaigns";
import { Field, label } from "./GoogleCampaignFields";

export function AssetEditor({
  organizationId,
  connectionId,
  assets,
  onChange,
  brandAssets = true,
  adType,
}: {
  organizationId: number;
  connectionId: string;
  assets: GoogleAssetInput[];
  onChange: (assets: GoogleAssetInput[]) => void;
  brandAssets?: boolean;
  adType?: string;
}) {
  const library = trpc.assetLibrary.list.useQuery({ organizationId });
  const remote = trpc.googleAds.campaigns.resources.useQuery(
    { organizationId, connectionId, kind: "assets" },
    { enabled: !!connectionId, staleTime: 60000 }
  );
  const [field, setField] =
      useState<GoogleAssetInput["field"]>("MARKETING_IMAGE"),
    [kind, setKind] = useState<GoogleAssetInput["source"]["kind"]>("library"),
    [value, setValue] = useState(
      new URLSearchParams(useSearch()).get("asset") ?? ""
    );
  const [error, setError] = useState("");
  const allowedAdFields: Record<string, string[]> = {
    DISPLAY: [
      "MARKETING_IMAGE",
      "SQUARE_MARKETING_IMAGE",
      "LOGO",
      "LANDSCAPE_LOGO",
    ],
    DEMAND_GEN: [
      "MARKETING_IMAGE",
      "SQUARE_MARKETING_IMAGE",
      "PORTRAIT_MARKETING_IMAGE",
      "LOGO",
    ],
    APP: [
      "MARKETING_IMAGE",
      "SQUARE_MARKETING_IMAGE",
      "PORTRAIT_MARKETING_IMAGE",
      "YOUTUBE_VIDEO",
    ],
    PERFORMANCE_MAX: [
      "MARKETING_IMAGE",
      "SQUARE_MARKETING_IMAGE",
      "PORTRAIT_MARKETING_IMAGE",
      "LOGO",
      "LANDSCAPE_LOGO",
      "YOUTUBE_VIDEO",
    ],
  };
  const fields = googleAssetFieldSchema.options.filter(
    f =>
      (!adType ||
        !allowedAdFields[adType] ||
        allowedAdFields[adType].includes(f)) &&
      (brandAssets || !["BUSINESS_NAME", "LOGO", "LANDSCAPE_LOGO"].includes(f))
  );
  const images =
    library.data?.filter(
      a => a.mediaType === "image" && a.state === "approved"
    ) ?? [];
  return (
    <div className="google-assets">
      <h3>Creative assets</h3>
      <p>
        Select approved workspace images, reuse Google assets, or add text and
        YouTube videos. Square and landscape placements need separate image
        sizes.
      </p>
      <div className="google-form-grid">
        <Field title="Placement">
          <select
            value={field}
            onChange={e => setField(e.target.value as typeof field)}
          >
            {fields.map(f => (
              <option key={f} value={f}>
                {label(f)}
              </option>
            ))}
          </select>
        </Field>
        <Field title="Asset source">
          <select
            value={kind}
            onChange={e => {
              setKind(e.target.value as typeof kind);
              setValue("");
            }}
          >
            {[
              ["library", "Approved library image"],
              ["existing", "Existing Google asset"],
              ["text", "New text"],
              ["youtube", "YouTube video"],
            ].map(([v, t]) => (
              <option key={v} value={v}>
                {t}
              </option>
            ))}
          </select>
        </Field>
        <Field
          title={
            kind === "text"
              ? "Text"
              : kind === "youtube"
                ? "YouTube video ID"
                : "Asset"
          }
        >
          {kind === "text" || kind === "youtube" ? (
            <input
              value={value}
              maxLength={kind === "text" ? 90 : 11}
              onChange={e => setValue(e.target.value)}
            />
          ) : (
            <select value={value} onChange={e => setValue(e.target.value)}>
              <option value="">Choose an asset…</option>
              {kind === "library"
                ? images.map(a => (
                    <option key={a.key} value={a.key}>
                      {a.name} · {a.width ?? "?"} × {a.height ?? "?"}
                    </option>
                  ))
                : remote.data?.map(a => (
                    <option key={a.id} value={a.id}>
                      {a.name} · {a.type}
                    </option>
                  ))}
            </select>
          )}
        </Field>
      </div>
      <Button
        variant="outline"
        disabled={!value}
        onClick={() => {
          const source =
            kind === "text"
              ? { kind, text: value }
              : kind === "library"
                ? { kind, key: value }
                : kind === "youtube"
                  ? { kind, videoId: value }
                  : { kind, id: value };
          const candidate = { field, source } as GoogleAssetInput;
          if (
            assets.some(a => JSON.stringify(a) === JSON.stringify(candidate))
          ) {
            setError("This asset is already selected for that placement.");
            return;
          }
          onChange([...assets, candidate]);
          setValue("");
          setError("");
        }}
      >
        Add asset
      </Button>
      {(error || library.error || remote.error) && (
        <p role="alert">
          {error || library.error?.message || remote.error?.message}
        </p>
      )}
      <ul className="google-asset-list">
        {assets.map((a, i) => (
          <li key={i}>
            <span>
              <strong>{label(a.field)}</strong> ·{" "}
              {a.source.kind === "text"
                ? a.source.text
                : a.source.kind === "library"
                  ? (images.find(
                      l => l.key === (a.source as { key: string }).key
                    )?.name ?? a.source.key)
                  : a.source.kind === "existing"
                    ? (remote.data?.find(
                        r => r.id === (a.source as { id: string }).id
                      )?.name ?? `Google asset ${a.source.id}`)
                    : a.source.videoId}
            </span>
            <button
              aria-label={`Remove selected asset ${i + 1}`}
              onClick={() => onChange(assets.filter((_, j) => j !== i))}
            >
              Remove
            </button>
          </li>
        ))}
      </ul>
      {kind === "library" && !images.length && (
        <p>
          <Link href="/app/library">
            Approve an image in your asset library
          </Link>{" "}
          to make it available here.
        </p>
      )}
    </div>
  );
}
export function AdEditor({
  organizationId,
  connectionId,
  type,
  ad,
  onChange,
  part,
}: {
  part: "creative" | "copy";
  organizationId: number;
  connectionId: string;
  type: string;
  ad: GoogleAdContent;
  onChange: (ad: GoogleAdContent) => void;
}) {
  const patch = (p: Partial<GoogleAdContent>) => onChange({ ...ad, ...p });
  return (
    <>
      {part === "creative" && (
        <div className="google-form-grid">
          <Field
            title={type === "PERFORMANCE_MAX" ? "Asset group name" : "Ad name"}
          >
            <input
              value={ad.name}
              onChange={e => patch({ name: e.target.value })}
            />
          </Field>
          {!["SHOPPING", "APP"].includes(type) && (
            <Field title="Landing page">
              <input
                type="url"
                value={ad.finalUrl}
                placeholder="https://"
                onChange={e => patch({ finalUrl: e.target.value })}
              />
            </Field>
          )}
        </div>
      )}
      {part === "copy" && (
        <>
          {type !== "SHOPPING" && (
            <>
              <Field title="Headlines · one per line · 30 characters each">
                <textarea
                  rows={4}
                  value={ad.headlines.join("\n")}
                  onChange={e =>
                    patch({ headlines: e.target.value.split("\n") })
                  }
                />
              </Field>
              <Field title="Descriptions · one per line · 90 characters each">
                <textarea
                  rows={3}
                  value={ad.descriptions.join("\n")}
                  onChange={e =>
                    patch({ descriptions: e.target.value.split("\n") })
                  }
                />
              </Field>
            </>
          )}
          {["DISPLAY", "PERFORMANCE_MAX"].includes(type) && (
            <Field title="Long headline · up to 90 characters">
              <input
                maxLength={90}
                value={ad.longHeadline ?? ""}
                onChange={e => patch({ longHeadline: e.target.value })}
              />
            </Field>
          )}
          {["DISPLAY", "PERFORMANCE_MAX", "DEMAND_GEN"].includes(type) && (
            <Field title="Business name · up to 25 characters">
              <input
                maxLength={25}
                value={ad.businessName ?? ""}
                onChange={e => patch({ businessName: e.target.value })}
              />
            </Field>
          )}
          {type === "SEARCH" && (
            <div className="google-form-grid">
              <Field title="Display path 1">
                <input
                  maxLength={15}
                  value={ad.path1}
                  onChange={e => patch({ path1: e.target.value })}
                />
              </Field>
              <Field title="Display path 2">
                <input
                  maxLength={15}
                  value={ad.path2}
                  onChange={e => patch({ path2: e.target.value })}
                />
              </Field>
            </div>
          )}
          {type === "SHOPPING" && (
            <p>
              Shopping ads use titles and descriptions from the selected
              Merchant Center feed.
            </p>
          )}
        </>
      )}
      {part === "creative" && ["SEARCH", "SHOPPING"].includes(type) && (
        <p>
          {type === "SEARCH"
            ? "Search ads use the headlines and descriptions in Copy. No image is required by this ad format."
            : "Product images and landing pages come from the selected Merchant Center feed."}
        </p>
      )}
      {part === "creative" && !["SEARCH", "SHOPPING"].includes(type) && (
        <AssetEditor
          organizationId={organizationId}
          connectionId={connectionId}
          adType={type}
          assets={ad.assets}
          onChange={assets => patch({ assets })}
        />
      )}
    </>
  );
}
