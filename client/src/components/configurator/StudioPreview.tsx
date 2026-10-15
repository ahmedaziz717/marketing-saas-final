import { useEffect, useRef, useState, type ReactNode } from "react";
import { Film, ImagePlus, RefreshCw } from "lucide-react";
import { Link } from "wouter";
import { trpc } from "@/lib/trpc";
import type { CreativeSetup } from "@shared/creativeBuilder";
import { videoSetupSchema, type VideoSetup } from "@shared/videoCreation";
import {
  libraryAssetLink,
  mayApproveAndAdd,
  mayReviewAssets,
  workflowLabel,
} from "@shared/assetWorkflow";
import { canSubmitAsset } from "@shared/assetLibrary";
import type { LibraryAsset } from "@shared/assetLibrary";
import { StudioGeneration } from "./StudioGeneration";

type Trial = {
  key: string;
  title: string;
  url: string;
  createdAtMs: number;
  status: string;
  imageSetup?: CreativeSetup | null;
  videoSetup?: VideoSetup | null;
};

export function StudioPreview({
  organizationId,
  role,
  jobId,
  onSettled,
  kind,
  briefId,
  assets,
  videos,
  children,
  summary,
  referenceUrl,
  reuse,
}: {
  organizationId: number;
  role: string;
  jobId?: number | null;
  onSettled: () => void;
  kind: "image" | "video";
  briefId?: number;
  assets: LibraryAsset[];
  videos: Array<{
    id: string;
    status: string;
    assetKey: string | null;
    setup: VideoSetup;
    createdAtMs: number;
  }>;
  children: ReactNode;
  summary: ReactNode;
  referenceUrl?: string;
  reuse: (trial: {
    imageSetup?: CreativeSetup | null;
    videoSetup?: VideoSetup | null;
  }) => void;
}) {
  const [selected, setSelected] = useState<Trial | null>(null);
  const [previewingHistory, setPreviewingHistory] = useState(false);
  useEffect(() => setPreviewingHistory(false), [jobId]);
  const showGeneration = !!jobId && !previewingHistory;
  const [all, setAll] = useState(false);
  const history = trpc.creativeBuilder.studioHistory.useQuery(
    { organizationId, briefId: all ? undefined : briefId },
    { enabled: kind === "image", refetchOnWindowFocus: true }
  );
  const utils = trpc.useUtils();
  const approve = trpc.assetLibrary.approveAndAdd.useMutation();
  const review = trpc.assetLibrary.review.useMutation();
  const submit = trpc.assetLibrary.submit.useMutation();
  const [actionError, setActionError] = useState("");
  const [generationError, setGenerationError] = useState("");
  const settled = useRef<number | null>(null);
  const job = trpc.creativeBuilder.studioJob.useQuery(
    { organizationId, jobId: jobId ?? 1 },
    { enabled: !!jobId, refetchInterval: jobId ? 3000 : false }
  );
  useEffect(() => {
    if (!jobId) return;
    setGenerationError("");
    const result = job.data;
    if (
      !result ||
      result.id !== jobId ||
      settled.current === jobId ||
      !["completed", "failed"].includes(result.status)
    )
      return;
    settled.current = jobId;
    const first = result.variants.find(item => item.url);
    if (first?.url)
      setSelected({ ...first, key: `creative:${first.id}`, url: first.url });
    if (result.status === "failed")
      setGenerationError(
        result.errorMessage ||
          "Generation could not finish. Any completed images are saved as drafts."
      );
    void history.refetch();
    onSettled();
  }, [jobId, job.data, onSettled]);
  const selectedAsset = assets.find(asset => asset.key === selected?.key);
  const working = approve.isPending || review.isPending || submit.isPending;
  const canApprove =
    selectedAsset &&
    (canSubmitAsset(selectedAsset.state)
      ? mayApproveAndAdd(role)
      : selectedAsset.state === "needs_review" && mayReviewAssets(role));
  async function approveSelected() {
    if (!selectedAsset) return;
    setActionError("");
    const input = {
      organizationId,
      key: selectedAsset.key,
      revision: selectedAsset.revision,
    };
    try {
      if (canApprove) {
        if (selectedAsset.state === "needs_review")
          await review.mutateAsync({
            ...input,
            decision: "approved",
            note: "Approved in Creative Studio.",
          });
        else await approve.mutateAsync(input);
      } else await submit.mutateAsync(input);
      await Promise.all([
        utils.assetLibrary.studioList.invalidate(),
        utils.assetLibrary.list.invalidate(),
      ]);
    } catch (error) {
      setActionError(
        error instanceof Error
          ? error.message
          : "Could not update approval. Please retry."
      );
    }
  }
  const trials: Trial[] =
    kind === "image"
      ? (history.data ?? []).flatMap(item =>
          item.url
            ? [
                {
                  ...item,
                  key: "creative:" + item.id,
                  url: item.url,
                  imageSetup: item.setup,
                },
              ]
            : []
        )
      : videos
          .flatMap(item => {
            const asset = assets.find(a => a.key === item.assetKey);
            const setup = videoSetupSchema.safeParse(item.setup);
            return asset?.mediaType === "video" && item.status === "completed"
              ? [
                  {
                    key: asset.key,
                    title: item.setup.title,
                    url: asset.url,
                    createdAtMs: item.createdAtMs,
                    status: item.status,
                    videoSetup: setup.success ? setup.data : null,
                  },
                ]
              : [];
          })
          .slice(0, 24);
  return (
    <div className="cfg-stage">
      <div className="cfg-preview-gallery">
        {generationError && (
          <p role="alert" className="cfg-problems">
            {generationError}
          </p>
        )}
        {showGeneration ? (
          <StudioGeneration
            key={jobId}
            status={job.data?.id === jobId ? job.data.status : undefined}
            referenceUrl={referenceUrl}
            reconnecting={!!job.error}
            completed={
              job.data?.id === jobId
                ? job.data.variants.filter(item => item.url).length
                : 0
            }
          />
        ) : selected ? (
          <div className="cfg-result-preview">
            {kind === "image" ? (
              <img src={selected.url} alt={selected.title} />
            ) : (
              <video
                key={selected.key}
                src={selected.url}
                controls
                preload="metadata"
              />
            )}
          </div>
        ) : (
          children
        )}
        {(trials.length > 0 || selected) && (
          <>
            <div className="cfg-trials-heading">
              <strong>
                {kind === "image" && briefId && !all
                  ? "Versions of this creative"
                  : "Recent creations"}
              </strong>
              {kind === "image" && briefId && (
                <button
                  type="button"
                  onClick={() => {
                    setAll(!all);
                    setSelected(null);
                  }}
                >
                  {all ? "This creative" : "All recent"}
                </button>
              )}
              {kind === "image" && (
                <button
                  type="button"
                  aria-label="Refresh previous versions"
                  disabled={history.isFetching}
                  onClick={() => history.refetch()}
                >
                  <RefreshCw size={14} />
                </button>
              )}
            </div>
            <div
              className="cfg-trials"
              aria-label="Previous generated versions"
            >
              <button
                type="button"
                aria-pressed={!selected}
                className="cfg-trial cfg-trial-current"
                onClick={() => {
                  setSelected(null);
                  setPreviewingHistory(false);
                }}
              >
                <ImagePlus size={22} />
                <span>Current setup</span>
              </button>
              {trials.map(item => (
                <button
                  type="button"
                  key={item.key}
                  className="cfg-trial"
                  aria-label={"Preview " + item.title}
                  aria-pressed={selected?.key === item.key}
                  onClick={() => {
                    setSelected(item);
                    setPreviewingHistory(true);
                  }}
                  title={
                    item.title +
                    " · " +
                    new Date(item.createdAtMs).toLocaleString()
                  }
                >
                  {kind === "image" ? (
                    <img src={item.url} alt="" loading="lazy" />
                  ) : (
                    <span className="cfg-trial-video">
                      <video
                        src={item.url + "#t=0.1"}
                        muted
                        preload="metadata"
                      />
                      <Film size={16} />
                    </span>
                  )}
                  <span>{item.title}</span>
                  <small>
                    {new Date(item.createdAtMs).toLocaleDateString()}
                  </small>
                </button>
              ))}
            </div>
          </>
        )}
        {history.error && kind === "image" ? (
          <p className="cfg-help">
            Previous images could not load.{" "}
            <button type="button" onClick={() => void history.refetch()}>
              Try again
            </button>
          </p>
        ) : (
          !trials.length &&
          !jobId && (
            <p className="cfg-help">
              {history.isLoading && kind === "image"
                ? "Loading previous images…"
                : "Your generated versions will appear here."}
            </p>
          )
        )}
        <div className="cfg-history-footer">
          {jobId && previewingHistory && (
            <button type="button" onClick={() => setPreviewingHistory(false)}>
              View generation in progress
            </button>
          )}
          {kind === "image" && briefId && !all && !trials.length && (
            <button type="button" onClick={() => setAll(true)}>
              Browse previous creations
            </button>
          )}
          <Link href="/app/creatives/drafts" className="cfg-history-link">
            View all creative work →
          </Link>
        </div>
      </div>
      <div className="cfg-build">
        {summary}
        {selected && !showGeneration && (
          <div className="cfg-result-details">
            <strong>{selected.title}</strong>
            <small>
              Generated {new Date(selected.createdAtMs).toLocaleString()} ·{" "}
              {selectedAsset
                ? workflowLabel(selectedAsset.state)
                : "Saved draft"}
            </small>
            <div className="cfg-result-actions">
              <button
                type="button"
                className="cfg-primary"
                disabled={
                  working ||
                  !selectedAsset ||
                  selectedAsset.state === "approved" ||
                  (!canApprove && !canSubmitAsset(selectedAsset.state))
                }
                onClick={() => void approveSelected()}
              >
                {selectedAsset?.state === "approved"
                  ? "Approved"
                  : working
                    ? "Saving…"
                    : canApprove
                      ? "Approve"
                      : "Submit for approval"}
              </button>
              <Link
                className="cfg-secondary"
                href={`/app/activate/studio?asset=${encodeURIComponent(selected.key)}`}
              >
                Activate / Publish
              </Link>
            </div>
            <p className="cfg-help">
              {selectedAsset?.state === "approved"
                ? "Approved in Asset Library. Approval does not publish your creative."
                : "Saved automatically in Asset Library → Drafts. Approval is optional until you are ready."}{" "}
              Continue in Activation Studio when ready.
            </p>
            {actionError && <p role="alert">{actionError}</p>}
            <div className="cfg-result-secondary">
              <Link
                href={
                  selectedAsset && selectedAsset.state !== "draft"
                    ? libraryAssetLink(selected.key, selectedAsset.state)
                    : `/app/library?view=drafts&asset=${encodeURIComponent(selected.key)}`
                }
              >
                View in Asset Library
              </Link>
              <button
                type="button"
                disabled={!selected.imageSetup && !selected.videoSetup}
                onClick={() => {
                  reuse(selected);
                  setSelected(null);
                }}
              >
                Use these settings as a new draft
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
