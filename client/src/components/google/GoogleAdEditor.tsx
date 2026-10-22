import { useState } from "react";
import { Link, useSearch } from "wouter";
import {
  Image,
  Video,
  Type,
  Upload,
  Library,
  Link2,
  type LucideIcon,
} from "lucide-react";
import { trpc } from "@/lib/trpc";
import { useWorkspace } from "@/hooks/useWorkspace";
import { Button } from "@/components/ui/button";
import { StudioCard } from "@/components/configurator/StudioCard";
import { AssetUploadDialog } from "@/components/AssetUploadDialog";
import { mayCreateAssets } from "@shared/assetWorkflow";
import {
  googleAssetFieldSchema,
  googleAssetInputSchema,
  type GoogleAssetInput,
  type GoogleAdContent,
} from "@shared/googleCampaigns";
import {
  googleAssetFormat,
  type GoogleCreativeFormat,
} from "./GoogleCreativeFormat";
import { GoogleVideoTransfer } from "./GoogleVideoTransfer";
import { Field, label } from "./GoogleCampaignFields";

function youtubeId(value: string) {
  const input = value.trim();
  if (/^[\w-]{11}$/.test(input)) return input;
  try {
    const url = new URL(input);
    if (url.protocol !== "https:" || url.username || url.password) return input;
    const host = url.hostname.replace(/^www\./, "");
    if (host === "youtu.be") return url.pathname.slice(1);
    if (host === "youtube.com" || host === "m.youtube.com") {
      if (url.pathname === "/watch") return url.searchParams.get("v") || input;
      if (/^\/(shorts|embed)\//.test(url.pathname))
        return url.pathname.split("/")[2];
    }
  } catch {
    /* The asset schema reports invalid links and IDs. */
  }
  return input;
}

const fieldNames: Record<string, string> = {
  MARKETING_IMAGE: "Landscape image · 1.91:1",
  SQUARE_MARKETING_IMAGE: "Square image · 1:1",
  PORTRAIT_MARKETING_IMAGE: "Portrait image · 4:5",
  LOGO: "Square logo · 1:1",
  LANDSCAPE_LOGO: "Landscape logo · 4:1",
  YOUTUBE_VIDEO: "Video",
};
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
  const { membership } = useWorkspace();
  const library = trpc.assetLibrary.list.useQuery({ organizationId });
  const remote = trpc.googleAds.campaigns.resources.useQuery(
    { organizationId, connectionId, kind: "assets" },
    { enabled: !!connectionId, staleTime: 60000 }
  );
  const fields = googleAssetFieldSchema.options.filter(
    f =>
      (!adType ||
        !allowedAdFields[adType] ||
        allowedAdFields[adType].includes(f)) &&
      (brandAssets ||
        !["BUSINESS_NAME", "LOGO", "LANDSCAPE_LOGO"].includes(f)) &&
      (!format || googleAssetFormat(f) === format)
  );
  const [field, setField] = useState<GoogleAssetInput["field"]>(fields[0]);
  const activeField = fields.includes(field) ? field : fields[0];
  const media = googleAssetFormat(activeField);
  const [source, setSource] = useState<
    "library" | "upload" | "existing" | "youtube" | "text"
  >(media === "video" ? "existing" : media === "text" ? "text" : "library");
  const [value, setValue] = useState("");
  const [search, setSearch] = useState("");
  const [offset, setOffset] = useState(0);
  const [selectedVideo, setSelectedVideo] = useState(
    new URLSearchParams(useSearch()).get("asset") ?? ""
  );
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const images =
    library.data?.filter(
      a =>
        a.state === "approved" &&
        a.mediaType === (media === "video" ? "video" : "image")
    ) ?? [];
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
  const video = images.find(
    a => a.key === selectedVideo && a.mediaType === "video"
  );
  const sources: Array<{
    id: typeof source;
    title: string;
    description: string;
    icon: LucideIcon;
  }> =
    media === "text"
      ? [
          {
            id: "text",
            title: "Write text",
            description: "Add headlines and descriptions",
            icon: Type,
          },
          {
            id: "existing",
            title: "Google Ads Library",
            description: "Reuse text from this ad account",
            icon: Library,
          },
        ]
      : [
          {
            id: "library",
            title: "EvokeLoop Library",
            description:
              media === "video"
                ? "Choose an approved video"
                : "Choose approved images and logos",
            icon: Library,
          },
          {
            id: "upload",
            title: "Upload",
            description: "Add files from your device",
            icon: Upload,
          },
          {
            id: "existing",
            title: "Google Ads Library",
            description: "Reuse assets from this ad account",
            icon: Image,
          },
          ...(media === "video"
            ? [
                {
                  id: "youtube" as const,
                  title: "YouTube link",
                  description: "Use a video already on YouTube",
                  icon: Link2,
                },
              ]
            : []),
        ];
  const activeSource = sources.some(s => s.id === source)
    ? source
    : sources[0].id;
  const selected = (candidate: GoogleAssetInput) =>
    assets.some(a => JSON.stringify(a) === JSON.stringify(candidate));
  function add(candidate: GoogleAssetInput, toggle = false) {
    const parsed = googleAssetInputSchema.safeParse(candidate);
    if (!parsed.success) {
      setError(parsed.error.issues[0].message);
      return;
    }
    if (selected(candidate)) {
      if (toggle)
        onChange(
          assets.filter(a => JSON.stringify(a) !== JSON.stringify(candidate))
        );
      else setError("This asset is already selected for that placement.");
      return;
    }
    onChange([...assets, parsed.data]);
    setValue("");
    setError("");
  }
  const query = search.trim().toLowerCase();
  const items = (
    activeSource === "library"
      ? images.map(a => ({
          id: a.key,
          name: a.name,
          url: a.url,
          video: a.mediaType === "video",
          description: `${a.width ?? "?"} × ${a.height ?? "?"}`,
        }))
      : matchingRemote.map(a => ({
          id: a.id,
          name: a.name as string,
          url: "url" in a && typeof a.url === "string" ? a.url : undefined,
          video: false,
          description: label(a.type),
        }))
  ).filter(a => !query || a.name.toLowerCase().includes(query));
  return (
    <div className="google-assets">
      <h3>Asset source</h3>
      <div className="cfg-card-grid google-source-picker">
        {sources.map(({ id, title, description, icon: Icon }) => (
          <StudioCard
            key={id}
            title={title}
            description={description}
            selected={activeSource === id}
            disabled={
              id === "upload" && !mayCreateAssets(membership?.role ?? "")
            }
            onSelect={() => {
              setSource(id);
              setValue("");
              setSearch("");
              setOffset(0);
              setError("");
            }}
            media={
              <div className="activation-channel-art">
                <Icon size={32} aria-hidden="true" />
              </div>
            }
          />
        ))}
      </div>
      {notice && <p role="status">{notice}</p>}
      {activeSource === "upload" ? (
        <AssetUploadDialog
          inline
          open
          organizationId={organizationId}
          role={membership?.role ?? ""}
          parent={null}
          defaultDisposition="submit"
          defaultPurpose="finished"
          mediaFilter={media === "video" ? "video" : "image"}
          onClose={() => {}}
          onSaved={() => library.refetch()}
          onComplete={(key, state) => {
            setSource("library");
            setSelectedVideo(key);
            setNotice(
              state === "approved"
                ? "Uploaded and approved. Select the asset to add it to this draft."
                : "Uploaded for review. It will be available here after approval in the Asset Library."
            );
          }}
        />
      ) : (
        <>
          <div className="google-form-grid">
            <Field title="Placement">
              <select
                value={activeField}
                onChange={e => {
                  setField(e.target.value as typeof field);
                  setError("");
                }}
              >
                {fields.map(f => (
                  <option key={f} value={f}>
                    {fieldNames[f] || label(f)}
                  </option>
                ))}
              </select>
            </Field>
            {(activeSource === "library" || activeSource === "existing") && (
              <Field title="Search assets">
                <input
                  type="search"
                  value={search}
                  placeholder="Search by name"
                  onChange={e => {
                    setSearch(e.target.value);
                    setOffset(0);
                  }}
                />
              </Field>
            )}
          </div>
          {(activeSource === "library" || activeSource === "existing") && (
            <>
              {(activeSource === "library"
                ? library.isLoading
                : remote.isLoading) && <p role="status">Loading assets…</p>}
              <div className="cfg-card-grid google-asset-picker">
                {items.slice(offset, offset + 12).map(item => {
                  const candidate: GoogleAssetInput = {
                    field: activeField,
                    source:
                      activeSource === "library"
                        ? { kind: "library", key: item.id }
                        : { kind: "existing", id: item.id },
                  };
                  return (
                    <StudioCard
                      key={item.id}
                      title={item.name}
                      description={item.description}
                      image={item.video ? undefined : item.url}
                      contain
                      media={
                        item.video ? (
                          <video src={item.url} muted preload="metadata" />
                        ) : !item.url ? (
                          <div className="activation-channel-art">
                            {media === "video" ? (
                              <Video size={32} />
                            ) : media === "text" ? (
                              <Type size={32} />
                            ) : (
                              <Image size={32} />
                            )}
                          </div>
                        ) : undefined
                      }
                      selected={
                        item.video
                          ? selectedVideo === item.id
                          : selected(candidate)
                      }
                      onSelect={() =>
                        item.video
                          ? setSelectedVideo(item.id)
                          : add(candidate, true)
                      }
                    />
                  );
                })}
              </div>
              {!items.length && (
                <p>
                  No matching{" "}
                  {activeSource === "library" ? "approved EvokeLoop" : "Google"}{" "}
                  assets.{" "}
                  {activeSource === "library"
                    ? "Choose Upload to add a file, or review assets in the Library."
                    : "Try another search or source."}
                </p>
              )}
              {items.length > 12 && (
                <div className="google-actions">
                  <Button
                    variant="outline"
                    disabled={offset === 0}
                    onClick={() => setOffset(Math.max(0, offset - 12))}
                  >
                    Previous assets
                  </Button>
                  <span>
                    {offset + 1}–{Math.min(offset + 12, items.length)} of{" "}
                    {items.length}
                  </span>
                  <Button
                    variant="outline"
                    disabled={offset + 12 >= items.length}
                    onClick={() => setOffset(offset + 12)}
                  >
                    Next assets
                  </Button>
                </div>
              )}
              {activeSource === "existing" && (
                <p>
                  Showing up to the 200 most recent Google assets.{" "}
                  <button type="button" onClick={() => void remote.refetch()}>
                    Refresh Google library
                  </button>
                </p>
              )}
              {activeSource === "library" && media === "video" && video && (
                <GoogleVideoTransfer
                  key={`${connectionId}:${video.key}:${video.revision}`}
                  organizationId={organizationId}
                  connectionId={connectionId}
                  asset={video}
                  onUse={videoId =>
                    add({
                      field: "YOUTUBE_VIDEO",
                      source: { kind: "youtube", videoId },
                    })
                  }
                />
              )}
            </>
          )}
          {(activeSource === "text" || activeSource === "youtube") && (
            <>
              <Field
                title={
                  activeSource === "text" ? "Text" : "YouTube link or video ID"
                }
              >
                <input
                  value={value}
                  maxLength={activeSource === "text" ? 90 : 2048}
                  onChange={e => setValue(e.target.value)}
                />
              </Field>
              <Button
                variant="outline"
                disabled={!value.trim()}
                onClick={() =>
                  add({
                    field: activeField,
                    source:
                      activeSource === "text"
                        ? { kind: "text", text: value }
                        : { kind: "youtube", videoId: youtubeId(value) },
                  })
                }
              >
                Add asset
              </Button>
            </>
          )}
        </>
      )}
      {(error || library.error || remote.error) && (
        <p role="alert">
          {error || library.error?.message || remote.error?.message}
        </p>
      )}
      {!!assets.length && (
        <>
          <h3>Selected for this draft · {assets.length}</h3>
          <ul className="google-asset-list">
            {assets.map((a, i) => (
              <li key={i}>
                <span>
                  <strong>{fieldNames[a.field] || label(a.field)}</strong> ·{" "}
                  {a.source.kind === "text"
                    ? a.source.text
                    : a.source.kind === "library"
                      ? (library.data?.find(
                          l => l.key === (a.source as { key: string }).key
                        )?.name ?? a.source.key)
                      : a.source.kind === "existing"
                        ? (remote.data?.find(
                            r => r.id === (a.source as { id: string }).id
                          )?.name ?? `Google asset ${a.source.id}`)
                        : `YouTube ${a.source.videoId}`}
                </span>
                <button
                  type="button"
                  aria-label={`Remove selected asset ${i + 1}`}
                  onClick={() => onChange(assets.filter((_, j) => j !== i))}
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
      {activeSource === "library" && !images.length && (
        <Link href="/app/library">Open EvokeLoop Library</Link>
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
