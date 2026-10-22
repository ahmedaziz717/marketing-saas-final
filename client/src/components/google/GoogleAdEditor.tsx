import { Image, Video, Type } from "lucide-react";
import { useState } from "react";
import { Link, useSearch } from "wouter";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import {
  googleAssetFieldSchema,
  googleAssetInputSchema,
  type GoogleAssetInput,
  type GoogleAdContent,
} from "@shared/googleCampaigns";
import { StudioCard } from "@/components/configurator/StudioCard";
import {
  googleAssetFormat,
  type GoogleCreativeFormat,
} from "./GoogleCreativeFormat";
import { Field, label } from "./GoogleCampaignFields";

export function AssetEditor({
  organizationId,
  connectionId,
  assets,
  onChange,
  brandAssets = true,
  adType,
  format,
}: {
  organizationId: number;
  connectionId: string;
  assets: GoogleAssetInput[];
  onChange: (assets: GoogleAssetInput[]) => void;
  brandAssets?: boolean;
  adType?: string;
  format?: GoogleCreativeFormat;
}) {
  const library = trpc.assetLibrary.list.useQuery({ organizationId });
  const remote = trpc.googleAds.campaigns.resources.useQuery(
    { organizationId, connectionId, kind: "assets" },
    { enabled: !!connectionId, staleTime: 60000 }
  );
  const [field, setField] = useState<GoogleAssetInput["field"]>(
      format === "video"
        ? "YOUTUBE_VIDEO"
        : format === "text"
          ? "HEADLINE"
          : format === "logo"
            ? "LOGO"
            : "MARKETING_IMAGE"
    ),
    [kind, setKind] = useState<GoogleAssetInput["source"]["kind"]>(
      format === "video" ? "existing" : format === "text" ? "text" : "library"
    ),
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
      (brandAssets ||
        !["BUSINESS_NAME", "LOGO", "LANDSCAPE_LOGO"].includes(f)) &&
      (!format || googleAssetFormat(f) === format)
  );
  const activeField = fields.includes(field) ? field : fields[0];
  const media = googleAssetFormat(activeField);
  const sources =
    media === "video"
      ? [
          ["existing", "Existing Google video"],
          ["youtube", "YouTube video"],
        ]
      : media === "text"
        ? [
            ["text", "New text"],
            ["existing", "Existing Google text"],
          ]
        : [
            ["library", "Approved library image"],
            ["existing", "Existing Google image"],
          ];
  const activeKind = (
    sources.some(([id]) => id === kind) ? kind : sources[0][0]
  ) as typeof kind;
  const matchingRemote =
    remote.data?.filter(
      a =>
        a.type ===
        (media === "video"
          ? "YOUTUBE_VIDEO"
          : media === "text"
            ? "TEXT"
            : "IMAGE")
    ) ?? [];
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
            value={activeField}
            onChange={e => {
              setField(e.target.value as typeof field);
              setValue("");
              setError("");
            }}
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
            value={activeKind}
            onChange={e => {
              setKind(e.target.value as typeof kind);
              setValue("");
            }}
          >
            {sources.map(([v, t]) => (
              <option key={v} value={v}>
                {t}
              </option>
            ))}
          </select>
        </Field>
        <Field
          title={
            activeKind === "text"
              ? "Text"
              : activeKind === "youtube"
                ? "YouTube video ID"
                : "Asset"
          }
        >
          {activeKind === "text" || activeKind === "youtube" ? (
            <input
              value={value}
              maxLength={activeKind === "text" ? 90 : 11}
              onChange={e => setValue(e.target.value)}
            />
          ) : (
            <span>Choose an asset below.</span>
          )}
        </Field>
      </div>
      {media === "video" && (
        <p>
          Videos must already be on YouTube or available as Google video assets.
          Direct library video upload is not supported here.
        </p>
      )}
      {(activeKind === "library" || activeKind === "existing") && (
        <div className="cfg-card-grid google-asset-picker">
          {(activeKind === "library"
            ? images.map(a => ({
                id: a.key,
                name: a.name,
                url: a.url,
                description: `${a.width ?? "?"} × ${a.height ?? "?"}`,
              }))
            : matchingRemote.map(a => ({ ...a, description: label(a.type) }))
          ).map(a => (
            <StudioCard
              key={a.id}
              title={a.name}
              description={a.description}
              image={
                "url" in a && typeof a.url === "string" ? a.url : undefined
              }
              media={
                !("url" in a && a.url) ? (
                  <div className="activation-channel-art">
                    {media === "video" ? (
                      <Video size={36} aria-hidden="true" />
                    ) : media === "text" ? (
                      <Type size={36} aria-hidden="true" />
                    ) : (
                      <Image size={36} aria-hidden="true" />
                    )}
                  </div>
                ) : undefined
              }
              contain
              selected={value === a.id}
              onSelect={() => {
                setValue(a.id);
                setError("");
              }}
            />
          ))}
        </div>
      )}
      {activeKind === "existing" &&
        !remote.isLoading &&
        !matchingRemote.length && (
          <p>
            No matching Google assets are available. Choose another asset
            source.
          </p>
        )}
      <Button
        variant="outline"
        disabled={!value}
        onClick={() => {
          const source =
            activeKind === "text"
              ? { kind: activeKind, text: value }
              : activeKind === "library"
                ? { kind: activeKind, key: value }
                : activeKind === "youtube"
                  ? { kind: activeKind, videoId: value }
                  : { kind: activeKind, id: value };
          const candidate = { field: activeField, source } as GoogleAssetInput;
          const parsed = googleAssetInputSchema.safeParse(candidate);
          if (!parsed.success) {
            setError(parsed.error.issues[0].message);
            return;
          }
          if (
            (activeKind === "library" && !images.some(a => a.key === value)) ||
            (activeKind === "existing" &&
              !matchingRemote.some(a => a.id === value))
          ) {
            setError("Choose an available asset of the selected type.");
            return;
          }
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
      {activeKind === "library" && !images.length && (
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
  format,
}: {
  part: "creative" | "copy";
  format?: GoogleCreativeFormat;
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
          key={`${type}:${format}`}
          format={format}
          adType={type}
          assets={ad.assets}
          onChange={assets => patch({ assets })}
        />
      )}
    </>
  );
}
