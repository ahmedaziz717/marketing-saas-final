import { googleCopyCapabilities } from "@shared/googleCopy";
import { useEffect, useRef, useState } from "react";
import {
  googleImageMatches,
  googleMarketingImagePlacement,
} from "@shared/googleImagePlacement";
import { GooglePmaxCopyEditor } from "./GooglePmaxCopyEditor";
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
import { ChoiceField, VisualSelect } from "@/components/choices/VisualSelect";
import { AssetUploadDialog } from "@/components/AssetUploadDialog";
import { mayCreateAssets } from "@shared/assetWorkflow";
import {
  googleAssetFieldSchema,
  pmaxMarketingImageFields,
  pmaxMarketingImageMaximum,
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
  const isPmax = !adType || adType === "PERFORMANCE_MAX";
  // The EvokeLoop library belongs to the workspace, not the selected Google account.
  // Refresh when returning from Creative Studio so newly approved outputs appear.
  const library = trpc.assetLibrary.list.useQuery(
    { organizationId },
    { refetchOnMount: "always" }
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
  const [automaticPlacement, setAutomaticPlacement] = useState(true);
  const automatic = media === "image" && automaticPlacement;
  const [source, setSource] = useState<
    "library" | "upload" | "existing" | "youtube" | "text"
  >(media === "text" ? "text" : "library");
  const remote = trpc.googleAds.campaigns.resources.useQuery(
    { organizationId, connectionId, kind: "assets" },
    { enabled: !!connectionId && source === "existing", staleTime: 60000 }
  );
  const [value, setValue] = useState("");
  const [search, setSearch] = useState("");
  const [offset, setOffset] = useState(0);
  const [selectedVideo, setSelectedVideo] = useState(
    new URLSearchParams(useSearch()).get("asset") ?? ""
  );
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [loadedDimensions, setLoadedDimensions] = useState<
    Record<string, { width: number; height: number }>
  >({});
  const entryKey = new URLSearchParams(useSearch()).get("asset");
  const entryApplied = useRef(false);
  useEffect(() => {
    if (entryApplied.current || !library.data || !entryKey || media !== "image")
      return;
    const entry = library.data.find(
      row =>
        row.key === entryKey &&
        row.state === "approved" &&
        row.mediaType === "image"
    );
    if (!entry) return;
    entryApplied.current = true;
    const placement = googleMarketingImagePlacement(entry.width, entry.height);
    if (!placement || !fields.includes(placement)) {
      setNotice(
        "This image needs a compatible placement. Choose a Google-supported image size or select its placement explicitly when dimensions are unavailable."
      );
      return;
    }
    const candidate: GoogleAssetInput = {
      field: placement,
      source: { kind: "library", key: entry.key },
    };
    if (
      !assets.some(asset => JSON.stringify(asset) === JSON.stringify(candidate))
    ) {
      if (
        isPmax &&
        assets.filter(a => pmaxMarketingImageFields.includes(a.field)).length >=
          pmaxMarketingImageMaximum
      ) {
        setNotice(
          "Select up to 20 images for one asset group. Remove a selected image before adding another."
        );
        return;
      }
      onChange([...assets, candidate]);
    }
  }, [library.data, entryKey, media]);
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
  const sourceQuery = activeSource === "library" ? library : remote;
  useEffect(() => {
    setOffset(0);
    setSearch("");
    setError("");
  }, [organizationId, connectionId, activeSource, media]);
  const selectedImageCount = assets.filter(a =>
    pmaxMarketingImageFields.includes(a.field)
  ).length;
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
    if (
      isPmax &&
      pmaxMarketingImageFields.includes(parsed.data.field) &&
      selectedImageCount >= pmaxMarketingImageMaximum
    ) {
      setError(
        "Select up to 20 images for one asset group. Remove a selected image before adding another."
      );
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
          width: a.width,
          height: a.height,
        }))
      : matchingRemote.map(a => ({
          id: a.id,
          name: a.name as string,
          url: "url" in a && typeof a.url === "string" ? a.url : undefined,
          video: false,
          description: label(a.type),
          width: "width" in a ? Number(a.width) || undefined : undefined,
          height: "height" in a ? Number(a.height) || undefined : undefined,
        }))
  ).filter(a => !query || a.name.toLowerCase().includes(query));
  // A refresh or asset-type change can shrink the results while a later page is open.
  const pageOffset = Math.min(
    offset,
    Math.max(0, Math.ceil(items.length / 12) - 1) * 12
  );
  useEffect(() => {
    if (offset !== pageOffset) setOffset(pageOffset);
  }, [offset, pageOffset]);
  return (
    <div className="google-assets">
      <h3>Asset source</h3>
      {media === "image" && isPmax && (
        <p role="status">
          {selectedImageCount}/20 images selected for this draft. Existing group
          capacity is checked separately before review.
        </p>
      )}
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
              if (id === "library") void library.refetch();
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
            <ChoiceField className="cfg-field">
              <span>Placement</span>
              <VisualSelect
                density="compact"
                aria-label="Placement"
                value={automatic ? "AUTO_IMAGE" : activeField}
                onChange={e => {
                  setAutomaticPlacement(e.target.value === "AUTO_IMAGE");
                  if (e.target.value !== "AUTO_IMAGE")
                    setField(e.target.value as typeof field);
                  setError("");
                }}
              >
                {media === "image" && (
                  <option value="AUTO_IMAGE">
                    Automatic image size · recommended
                  </option>
                )}
                {fields.map(f => (
                  <option key={f} value={f}>
                    {fieldNames[f] || label(f)}
                  </option>
                ))}
              </VisualSelect>
            </ChoiceField>
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
              <div className="google-actions">
                <p role="status">
                  {sourceQuery.isLoading
                    ? "Loading assets…"
                    : sourceQuery.isFetching
                      ? "Refreshing assets…"
                      : `${items.length} ${activeSource === "library" ? "approved EvokeLoop" : "Google"} assets`}
                </p>
                <Button
                  type="button"
                  variant="outline"
                  disabled={sourceQuery.isFetching}
                  onClick={() => void sourceQuery.refetch()}
                >
                  {activeSource === "library"
                    ? "Refresh EvokeLoop library"
                    : "Refresh Google library"}
                </Button>
              </div>
              {activeSource === "library" && (
                <p className="activation-help">
                  Approved Creative Studio outputs and uploads from this
                  workspace. These assets are not limited to the selected Google
                  account.
                </p>
              )}
              {sourceQuery.error && (
                <p role="alert">
                  {sourceQuery.error.message}
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => void sourceQuery.refetch()}
                  >
                    Retry loading assets
                  </Button>
                </p>
              )}
              <div className="cfg-card-grid google-asset-picker">
                {items.slice(pageOffset, pageOffset + 12).map(item => {
                  const dimensions =
                    item.width && item.height
                      ? item
                      : loadedDimensions[
                          `${activeSource}:${item.id}:${item.url}`
                        ];
                  const inferred = googleMarketingImagePlacement(
                    dimensions?.width,
                    dimensions?.height
                  );
                  const placement = automatic ? inferred : activeField;
                  const supported =
                    media !== "image" ||
                    (!!placement &&
                      fields.includes(placement) &&
                      (!dimensions?.width ||
                        !dimensions?.height ||
                        googleImageMatches(
                          placement,
                          dimensions?.width,
                          dimensions?.height
                        )));
                  const placementIssue =
                    media !== "image" || supported
                      ? ""
                      : !dimensions?.width || !dimensions?.height
                        ? "Dimensions unavailable. Select a placement explicitly; review will verify the image."
                        : "This image does not meet the selected Google size. Use automatic size or a compatible image.";
                  const candidate: GoogleAssetInput = {
                    field: placement ?? activeField,
                    source:
                      activeSource === "library"
                        ? { kind: "library", key: item.id }
                        : { kind: "existing", id: item.id },
                  };
                  return (
                    <StudioCard
                      key={item.id}
                      title={item.name}
                      description={`${item.description}${supported && media === "image" && placement ? " · " + fieldNames[placement] : ""}${placementIssue ? " · " + placementIssue : ""}`}
                      image={item.video ? undefined : item.url}
                      contain
                      media={
                        item.video ? (
                          <video src={item.url} muted preload="metadata" />
                        ) : item.url && media === "image" ? (
                          <img
                            src={item.url}
                            alt={item.name}
                            loading="lazy"
                            onLoad={event => {
                              const image = event.currentTarget;
                              const key = `${activeSource}:${item.id}:${item.url}`;
                              if (image.naturalWidth && image.naturalHeight)
                                setLoadedDimensions(previous =>
                                  previous[key]?.width === image.naturalWidth &&
                                  previous[key]?.height === image.naturalHeight
                                    ? previous
                                    : {
                                        ...previous,
                                        [key]: {
                                          width: image.naturalWidth,
                                          height: image.naturalHeight,
                                        },
                                      }
                                );
                            }}
                          />
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
                          : supported
                            ? add(candidate, true)
                            : setError(placementIssue)
                      }
                    />
                  );
                })}
              </div>
              {!sourceQuery.isLoading &&
                !sourceQuery.error &&
                !items.length && (
                  <p>
                    No matching{" "}
                    {activeSource === "library"
                      ? "approved EvokeLoop"
                      : "Google"}{" "}
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
                    disabled={pageOffset === 0}
                    onClick={() => setOffset(Math.max(0, pageOffset - 12))}
                  >
                    Previous assets
                  </Button>
                  <span>
                    {pageOffset + 1}–{Math.min(pageOffset + 12, items.length)}{" "}
                    of {items.length}
                  </span>
                  <Button
                    variant="outline"
                    disabled={pageOffset + 12 >= items.length}
                    onClick={() => setOffset(pageOffset + 12)}
                  >
                    Next assets
                  </Button>
                </div>
              )}
              {activeSource === "existing" && (
                <p>Showing up to the 200 most recent Google assets.</p>
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
      {error && <p role="alert">{error}</p>}
      {!!assets.length && (
        <>
          <h3>Selected for this draft · {assets.length}</h3>
          <ul className="google-asset-list">
            {assets.map((a, i) => {
              const item =
                a.source.kind === "library"
                  ? library.data?.find(
                      row => row.key === (a.source as { key: string }).key
                    )
                  : undefined;
              const corrected =
                item && googleMarketingImagePlacement(item.width, item.height);
              const canCorrect =
                corrected &&
                corrected !== a.field &&
                fields.includes(corrected) &&
                [
                  "MARKETING_IMAGE",
                  "SQUARE_MARKETING_IMAGE",
                  "PORTRAIT_MARKETING_IMAGE",
                ].includes(a.field);
              return (
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
                  {canCorrect && (
                    <Button
                      variant="outline"
                      type="button"
                      onClick={() =>
                        onChange(
                          assets
                            .map((asset, index) =>
                              index === i
                                ? { ...asset, field: corrected! }
                                : asset
                            )
                            .filter(
                              (asset, index, all) =>
                                all.findIndex(
                                  other =>
                                    JSON.stringify(other) ===
                                    JSON.stringify(asset)
                                ) === index
                            )
                        )
                      }
                    >
                      Use detected {fieldNames[corrected!]}
                    </Button>
                  )}
                  <button
                    type="button"
                    aria-label={`Remove selected asset ${i + 1}`}
                    onClick={() => onChange(assets.filter((_, j) => j !== i))}
                  >
                    Remove
                  </button>
                </li>
              );
            })}
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
  const copyCapabilities=googleCopyCapabilities(type === "DISPLAY" ? "DISPLAY" : "PERFORMANCE_MAX");
  return (
    <>
      {part === "creative" && (
        <div className="google-form-grid">
          <Field
            title={type === "PERFORMANCE_MAX" ? "Asset group name" : "Ad name"}
          >
            <input
              data-google-field="ad.name"
              value={ad.name}
              onChange={e => patch({ name: e.target.value })}
            />
          </Field>
          {!["SHOPPING", "APP"].includes(type) && (
            <Field title="Landing page">
              <input
                type="url"
                data-google-field="ad.finalUrl"
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
          {["PERFORMANCE_MAX", "DISPLAY"].includes(type) && (
            <>
              <p aria-live="polite">
                Headlines: {ad.headlines.filter(v => v.trim()).length}/{copyCapabilities.minimums.headlines}
                required ({copyCapabilities.specs.headlines.maximum} maximum). Descriptions:{" "}
                {ad.descriptions.filter(v => v.trim()).length}/{copyCapabilities.minimums.descriptions} required ({copyCapabilities.specs.descriptions.maximum}
                maximum). Long headlines:{" "}
                {(ad.longHeadline?.trim() ? 1 : 0) +
                  ad.assets.filter(a => a.field === "LONG_HEADLINE").length}
                /1 required ({copyCapabilities.specs.longHeadlines.maximum} maximum).
              </p>
              <GooglePmaxCopyEditor
                adType={type === "DISPLAY" ? "DISPLAY" : "PERFORMANCE_MAX"}
                organizationId={organizationId}
                connectionId={connectionId}
                assets={[
                  ...ad.assets,
                  ...ad.headlines.map(text => ({
                    field: "HEADLINE" as const,
                    source: { kind: "text" as const, text },
                  })),
                  ...ad.descriptions.map(text => ({
                    field: "DESCRIPTION" as const,
                    source: { kind: "text" as const, text },
                  })),
                  ...(ad.longHeadline !== undefined
                    ? [
                        {
                          field: "LONG_HEADLINE" as const,
                          source: {
                            kind: "text" as const,
                            text: ad.longHeadline,
                          },
                        },
                      ]
                    : []),
                ]}
                onChange={items => {
                  const texts = (field: string) =>
                    items
                      .filter(
                        a => a.field === field && a.source.kind === "text"
                      )
                      .map(a =>
                        a.source.kind === "text" ? a.source.text : ""
                      );
                  const longs = texts("LONG_HEADLINE");
                  onChange({
                    ...ad,
                    headlines: texts("HEADLINE"),
                    descriptions: texts("DESCRIPTION"),
                    longHeadline: longs[0] ?? undefined,
                    assets: [
                      ...items.filter(
                        a =>
                          ![
                            "HEADLINE",
                            "LONG_HEADLINE",
                            "DESCRIPTION",
                          ].includes(a.field) || a.source.kind !== "text"
                      ),
                      ...longs.slice(1).map(text => ({
                        field: "LONG_HEADLINE" as const,
                        source: { kind: "text" as const, text },
                      })),
                    ],
                  });
                }}
              />
            </>
          )}
          {!["SHOPPING", "PERFORMANCE_MAX", "DISPLAY"].includes(type) && (
            <div aria-live="polite">
              {(
                [
                  ["Headlines", ad.headlines, 30],
                  ["Descriptions", ad.descriptions, 90],
                ] as const
              ).flatMap(([name, values, limit]) =>
                values.flatMap((text, index) =>
                  text.length > limit
                    ? [
                        <p role="alert" key={name + index}>
                          {name} line {index + 1}: {text.length}/{limit}{" "}
                          characters. Shorten by {text.length - limit}.
                        </p>,
                      ]
                    : []
                )
              )}
            </div>
          )}
          {!["SHOPPING", "PERFORMANCE_MAX", "DISPLAY"].includes(type) && (
            <>
              <Field title="Headlines · one per line · 30 characters each">
                <textarea
                  rows={4}
                  data-google-field="ad.headlines"
                  value={ad.headlines.join("\n")}
                  onChange={e =>
                    patch({ headlines: e.target.value.split("\n") })
                  }
                />
              </Field>
              <Field title="Descriptions · one per line · 90 characters each">
                <textarea
                  rows={3}
                  data-google-field="ad.descriptions"
                  value={ad.descriptions.join("\n")}
                  onChange={e =>
                    patch({ descriptions: e.target.value.split("\n") })
                  }
                />
              </Field>
            </>
          )}
          {["DISPLAY", "PERFORMANCE_MAX", "DEMAND_GEN"].includes(type) && (
            <Field title="Business name · up to 25 characters">
              <input
                maxLength={25}
                data-google-field="ad.businessName"
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
