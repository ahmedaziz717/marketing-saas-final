import {
  activeVideoStatuses,
  videoStatusLabels,
  type VideoStatus,
} from "@shared/videoCreation";
import { useEffect, useRef, useState } from "react";
import { Link, useLocation, useSearch } from "wouter";
import {
  FileText,
  Film,
  FolderOpen,
  Image,
  Loader2,
  Megaphone,
  MessageSquare,
  RefreshCw,
  Search,
  Upload,
} from "lucide-react";
import { trpc } from "@/lib/trpc";
import { useWorkspace } from "@/hooks/useWorkspace";
import { Button } from "./ui/button";
import { AssetWorkbench } from "./AssetWorkbench";
import { AssetUploadDialog } from "./AssetUploadDialog";
import { PublicationStatus, type Publication } from "./PublicationComposer";
import { assetSizeLabel } from "@shared/assetFit";
import type { LibraryAsset } from "@shared/assetLibrary";
import {
  isWorkingAsset,
  libraryAssetLink,
  mayCreateAssets,
  workflowLabel,
} from "@shared/assetWorkflow";
import {
  activationHref,
  contentDraftStates,
  studioContentHref,
  studioDraftFilters,
  studioDraftsHref,
  type StudioDraftFilter,
} from "@shared/contentWorkflow";

type Draft = {
  key: string;
  type: "images" | "social" | "ads" | "videos" | "media";
  videoJob?: { id: string; status: VideoStatus };
  title: string;
  copy: string;
  at: number;
  asset?: LibraryAsset;
  publication?: Publication;
};
export function StudioDrafts({ planId }: { planId?: number }) {
  const { organizationId, membership } = useWorkspace();
  const role = membership?.role ?? "";
  const canCreate = mayCreateAssets(role);
  const canCompose = ["owner", "admin", "creator", "publisher"].includes(role);
  const params = new URLSearchParams(useSearch());
  const [, navigate] = useLocation();
  const filter: StudioDraftFilter =
    studioDraftFilters.find(f => f.id === params.get("filter"))?.id ?? "all";
  const search = params.get("q") ?? "";
  const [uploadOpen, setUploadOpen] = useState(false);
  const scope = { organizationId: organizationId! };
  const utils = trpc.useUtils();
  const publications = trpc.publishing.list.useQuery(scope, {
    enabled: !!organizationId,
  });
  const jobs = trpc.creatives.overview.useQuery(scope, {
    enabled: !!organizationId && canCreate,
    refetchInterval: q =>
      q.state.data?.jobs.some(j => ["running", "queued"].includes(j.status))
        ? 5000
        : false,
  });
  const videoJobs = trpc.video.list.useQuery(scope, {
    enabled: !!organizationId && canCreate,
    refetchInterval: query =>
      query.state.data?.some(job => activeVideoStatuses.includes(job.status))
        ? 5000
        : false,
  });
  const videoPending = videoJobs.data?.some(job =>
    activeVideoStatuses.includes(job.status)
  );
  const pending = jobs.data?.jobs.some(j =>
    ["running", "queued"].includes(j.status)
  );
  const studio = trpc.assetLibrary.studioList.useQuery(scope, {
    enabled: !!organizationId && canCreate,
    refetchInterval: pending || videoPending ? 5000 : false,
  });
  const wasGenerating = useRef(false);
  useEffect(() => {
    if (wasGenerating.current && !pending && !videoPending)
      void studio.refetch();
    wasGenerating.current = Boolean(pending || videoPending);
  }, [pending, videoPending, studio.refetch]);
  const library = trpc.assetLibrary.list.useQuery(scope, {
    enabled: !!organizationId && !canCreate,
  });
  const assets = (canCreate ? studio.data : library.data) ?? [];
  const assetByKey = new Map(assets.map(asset => [asset.key, asset]));
  const records: Draft[] = [
    ...(canCreate
      ? (videoJobs.data ?? [])
          .filter(
            job =>
              job.status !== "completed" &&
              job.status !== "canceled" &&
              (!planId || job.setup.campaignPlanId === planId)
          )
          .map(job => ({
            key: `video:${job.id}`,
            type: "videos" as const,
            title: job.setup.title,
            copy: job.setup.prompt,
            at: job.updatedAtMs,
            videoJob: { id: job.id, status: job.status },
          }))
      : []),
    ...(canCreate
      ? assets
          .filter(isWorkingAsset)
          .filter(asset => !planId || asset.campaignPlanId === planId)
          .map(asset => ({
            key: asset.key,
            type:
              asset.mediaType === "image"
                ? ("images" as const)
                : asset.mediaType === "video"
                  ? ("videos" as const)
                  : ("media" as const),
            title: asset.name,
            copy: [asset.headline, asset.primaryText, asset.copyText]
              .filter(Boolean)
              .join(" "),
            at: Math.max(asset.createdAtMs, asset.reviewedAtMs ?? 0),
            asset,
          }))
      : []),
    ...(publications.data?.items ?? [])
      .filter(
        item =>
          contentDraftStates.includes(item.state) &&
          (!planId || item.content.campaignPlanId === planId)
      )
      .map(item => ({
        key: item.id,
        type:
          item.channel === "facebook" ? ("social" as const) : ("ads" as const),
        title: item.content.title,
        copy: [
          item.content.message,
          item.content.headline,
          item.content.description,
        ]
          .filter(Boolean)
          .join(" "),
        at: item.updatedAtMs,
        publication: item,
        asset: item.assetKey
          ? assetByKey.get(item.assetKey as LibraryAsset["key"])
          : undefined,
      })),
  ].sort((a, b) => b.at - a.at || a.key.localeCompare(b.key));
  const visible = records.filter(
    item =>
      (filter === "all" || item.type === filter) &&
      `${item.title} ${item.copy}`
        .toLowerCase()
        .includes(search.trim().toLowerCase())
  );
  const needsImages = canCreate && ["all", "images", "videos"].includes(filter);
  const needsContent = !["images", "videos"].includes(filter);
  const loading =
    (needsImages && (studio.isLoading || videoJobs.isLoading)) ||
    (needsContent && publications.isLoading);
  const failed =
    (needsImages && (!!studio.error || !!videoJobs.error)) ||
    (needsContent && !!publications.error);
  const listHref = studioDraftsHref({ filter, search, plan: planId });
  const refresh = () =>
    Promise.all([
      ...(canCreate
        ? [studio.refetch(), jobs.refetch(), videoJobs.refetch()]
        : [library.refetch()]),
      publications.refetch(),
    ]);
  const afterUpload = () =>
    Promise.all([
      utils.assetLibrary.list.invalidate(),
      utils.assetLibrary.studioList.invalidate(),
      utils.creatives.overview.invalidate(),
      utils.brand.assets.invalidate(),
      utils.activity.list.invalidate(),
    ]);
  return (
    <section aria-labelledby="studio-drafts-heading">
      <div className="mb-5 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 id="studio-drafts-heading" className="text-xl font-semibold">
            Your drafts
          </h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Pick up an unfinished image, video, social post, or ad.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            aria-label="Refresh drafts"
            disabled={
              publications.isFetching || (canCreate && studio.isFetching)
            }
            onClick={() => void refresh()}
          >
            <RefreshCw size={16} aria-hidden="true" />
          </Button>
          {canCreate && (
            <Button variant="outline" onClick={() => setUploadOpen(true)}>
              <Upload size={16} className="mr-2" aria-hidden="true" />
              Upload media
            </Button>
          )}
        </div>
      </div>
      <div className="mb-6 space-y-4">
        <label className="relative block max-w-xl">
          <Search
            size={17}
            className="pointer-events-none absolute left-3.5 top-3.5 text-muted-foreground"
            aria-hidden="true"
          />
          <span className="sr-only">Search drafts</span>
          <input
            className="h-11 w-full rounded-xl border bg-background pl-11 pr-4 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            placeholder="Search names, captions, and ad copy…"
            value={search}
            onChange={e =>
              navigate(
                studioDraftsHref({
                  filter,
                  plan: planId,
                  search: e.target.value,
                }),
                { replace: true }
              )
            }
          />
        </label>
        <div aria-label="Draft types" className="flex flex-wrap gap-2">
          {studioDraftFilters.map(f => (
            <Button
              key={f.id}
              variant={filter === f.id ? "default" : "outline"}
              aria-pressed={filter === f.id}
              onClick={() =>
                navigate(
                  studioDraftsHref({ filter: f.id, plan: planId, search })
                )
              }
            >
              {f.label}
              <span
                aria-hidden="true"
                className="ml-2 rounded-md bg-background/20 px-1.5 text-xs tabular-nums"
              >
                {loading || failed
                  ? "—"
                  : records.filter(item => f.id === "all" || item.type === f.id)
                      .length}
              </span>
            </Button>
          ))}
        </div>
      </div>
      {needsImages && pending && (
        <p role="status" className="mb-5 rounded-xl bg-muted p-4 text-sm">
          <Loader2 className="mr-2 inline h-4 w-4 animate-spin" />
          Images are generating. Completed versions appear here automatically.
        </p>
      )}
      {needsImages && jobs.data?.jobs[0]?.status === "failed" && (
        <p role="alert" className="mb-4 rounded-xl border p-4 text-sm">
          The latest image generation failed.{" "}
          <Link
            href={`/app/creatives/images${planId ? "?plan=" + planId : ""}`}
            className="text-primary underline"
          >
            Review saved setup
          </Link>
        </p>
      )}
      {failed && (
        <div
          role="alert"
          className="surface mb-5 flex flex-wrap items-center justify-between gap-3 p-4 text-sm"
        >
          {studio.error && needsImages
            ? "Media drafts could not be loaded."
            : "Post and ad drafts could not be loaded."}
          <Button variant="outline" onClick={() => void refresh()}>
            Try again
          </Button>
        </div>
      )}
      {loading ? (
        <p role="status" className="surface p-8">
          <Loader2 className="mr-2 inline h-4 w-4 animate-spin" />
          Loading drafts…
        </p>
      ) : visible.length ? (
        <>
          <p role="status" className="mb-3 text-xs text-muted-foreground">
            {visible.length} {visible.length === 1 ? "draft" : "drafts"}
            {search ? " matching your search" : ""} · Most recent first
          </p>
          <div
            className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3"
            aria-label="Draft results"
          >
            {visible.map(item => {
              const post = item.publication;
              const label =
                item.type === "images"
                  ? "Image"
                  : item.type === "social"
                    ? "Social post"
                    : item.type === "ads"
                      ? "Ad"
                      : item.type === "videos"
                        ? "Video"
                        : "File";
              const Icon =
                item.type === "images"
                  ? Image
                  : item.type === "social"
                    ? MessageSquare
                    : item.type === "ads"
                      ? Megaphone
                      : item.type === "videos"
                        ? Film
                        : FileText;
              return (
                <article
                  key={item.key}
                  className="surface flex min-w-0 flex-col overflow-hidden"
                  aria-label={`${label}: ${item.title}`}
                >
                  <div className="relative flex aspect-[16/9] items-center justify-center overflow-hidden border-b bg-muted/40 p-3">
                    {item.asset?.mediaType === "image" ? (
                      <img
                        src={item.asset.url}
                        alt=""
                        loading="lazy"
                        className="h-full w-full min-w-0 object-contain"
                      />
                    ) : item.asset?.mediaType === "video" ? (
                      <video
                        src={item.asset.url}
                        controls
                        playsInline
                        preload="metadata"
                        className="h-full w-full object-contain"
                      />
                    ) : (
                      <div className="flex max-w-full flex-col items-center gap-3 p-4 text-center">
                        <Icon
                          size={30}
                          className="shrink-0 text-primary/70"
                          aria-hidden="true"
                        />
                        <p className="line-clamp-2 break-words text-sm text-muted-foreground">
                          {post?.content.message ||
                            (item.type === "media" || item.type === "videos"
                              ? item.videoJob
                                ? videoStatusLabels[item.videoJob.status]
                                : "Video asset"
                              : "Text or link post")}
                        </p>
                      </div>
                    )}
                  </div>
                  <div className="flex flex-1 flex-col p-5">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="inline-flex items-center gap-1.5 text-xs font-medium text-primary">
                        <Icon size={14} aria-hidden="true" />
                        {label}
                      </span>
                      {post ? (
                        <PublicationStatus item={post} />
                      ) : (
                        <span className="rounded-full border bg-muted px-2.5 py-1 text-xs">
                          {item.videoJob
                            ? videoStatusLabels[item.videoJob.status]
                            : workflowLabel(item.asset!.state)}
                        </span>
                      )}
                    </div>
                    <h3 className="mt-3 line-clamp-2 break-words font-semibold">
                      {item.title}
                    </h3>
                    {item.copy && (
                      <p className="mt-2 line-clamp-2 break-words text-sm text-muted-foreground">
                        {item.copy}
                      </p>
                    )}
                    <p className="mt-3 text-xs text-muted-foreground">
                      Updated {new Date(item.at).toLocaleDateString()}
                      {!post && item.asset?.mediaType === "image"
                        ? ` · ${assetSizeLabel(item.asset)}`
                        : ""}
                    </p>
                    <div className="mt-auto flex flex-wrap gap-x-4 gap-y-3 pt-5 text-sm font-medium">
                      {item.videoJob ? (
                        <Link
                          href={`/app/creatives/video?video=${item.videoJob.id}`}
                          className="text-primary underline-offset-4 hover:underline"
                        >
                          {item.videoJob.status === "draft"
                            ? "Edit video draft"
                            : "View generation"}
                        </Link>
                      ) : post ? (
                        <>
                          {canCompose && (
                            <Link
                              href={studioContentHref(post.channel, {
                                id: post.id,
                                plan: planId,
                              })}
                              className="text-primary underline-offset-4 hover:underline"
                            >
                              Edit draft
                            </Link>
                          )}
                          <Link
                            href={activationHref(post.channel, post.id)}
                            className="text-muted-foreground underline-offset-4 hover:text-primary hover:underline"
                          >
                            Review & schedule
                          </Link>
                        </>
                      ) : (
                        <Link
                          href={studioDraftsHref({
                            filter,
                            plan: planId,
                            search,
                            asset: item.key,
                          })}
                          className="text-primary underline-offset-4 hover:underline"
                        >
                          Open draft
                        </Link>
                      )}
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        </>
      ) : (
        !failed && (
          <div className="surface p-8 text-center sm:py-12">
            <FolderOpen size={30} className="mx-auto text-primary" />
            <h3 className="mt-4 font-semibold">
              {filter === "images" && !canCreate
                ? "Image drafts require a creator role"
                : search || filter !== "all"
                  ? "No matching drafts"
                  : "No drafts yet"}
            </h3>
            <p className="mx-auto mt-2 max-w-lg text-sm leading-6 text-muted-foreground">
              {filter === "images" && !canCreate
                ? "You can browse submitted and approved images in Asset Library."
                : search || filter !== "all"
                  ? "Try another type or clear your search to see more work."
                  : "Create an image, video, post, or ad. When you save a draft, it appears here."}
            </p>
            {search || filter !== "all" ? (
              <Button
                variant="outline"
                className="mt-5"
                onClick={() => navigate(studioDraftsHref({ plan: planId }))}
              >
                Show all drafts
              </Button>
            ) : (
              <Link
                href={`/app/creatives${planId ? "?plan=" + planId : ""}`}
                className="mt-5 inline-block text-sm font-medium text-primary"
              >
                Create new content
              </Link>
            )}
          </div>
        )
      )}
      <div className="mt-6 flex flex-wrap gap-x-5 gap-y-2 text-sm text-muted-foreground">
        <Link href="/app/library" className="hover:text-primary">
          Submitted & approved assets: Asset Library
        </Link>
        <Link href="/app/publishing" className="hover:text-primary">
          Posts ready for publishing: Calendar
        </Link>
      </div>
      {publications.data?.truncated && needsContent && (
        <p className="mt-3 text-xs text-muted-foreground">
          Showing drafts from the 500 most recent post and ad records. Existing
          direct links still open older records.
        </p>
      )}
      {(params.has("asset") || params.has("revise")) && (
        <AssetWorkbench
          surface="studio"
          detailsOnly
          onDetailsClose={() => navigate(listHref)}
        />
      )}
      {canCreate && organizationId && uploadOpen && (
        <AssetUploadDialog
          open
          onClose={() => setUploadOpen(false)}
          organizationId={organizationId}
          role={role}
          parent={null}
          defaultDisposition="draft"
          onSaved={afterUpload}
          onComplete={(key, state) =>
            navigate(
              state === "draft"
                ? studioDraftsHref({ asset: key, filter: "all", plan: planId })
                : libraryAssetLink(key as LibraryAsset["key"], state)
            )
          }
        />
      )}
    </section>
  );
}
