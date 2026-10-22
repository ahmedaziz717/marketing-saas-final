import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { useWorkspace } from "@/hooks/useWorkspace";
import { Button } from "@/components/ui/button";
import type { LibraryAsset } from "@shared/assetLibrary";

export function GoogleVideoTransfer({
  organizationId,
  connectionId,
  asset,
  onUse,
}: {
  organizationId: number;
  connectionId: string;
  asset: LibraryAsset;
  onUse: (videoId: string) => void;
}) {
  const { membership } = useWorkspace();
  const [confirmed, setConfirmed] = useState(false);
  const [generated, setGenerated] = useState(asset.origin === "generated");
  const input = {
    organizationId,
    connectionId,
    key: asset.key,
    revision: asset.revision,
  };
  const upload = trpc.googleAds.campaigns.uploadVideo.useMutation();
  const status = trpc.googleAds.campaigns.videoUploadStatus.useQuery(input, {
    refetchInterval: query =>
      ["STARTING", "PROCESSING"].includes(query.state.data?.state ?? "")
        ? 5000
        : false,
  });
  const state = status.data ?? upload.data;
  const permitted = ["owner", "admin", "publisher"].includes(
    membership?.role ?? ""
  );
  return (
    <section className="google-video-transfer">
      <h3>{asset.name}</h3>
      <video src={asset.url} controls preload="metadata" />
      {state?.state === "PROCESSED" && state.videoId ? (
        <Button onClick={() => onUse(state.videoId!)}>
          Add video to this draft
        </Button>
      ) : state && (state.state !== "FAILED" || state.resource) ? (
        <>
          <p role="status">
            {state.state === "PROCESSING"
              ? "Google is processing this video. You can return to this library video to resume."
              : state.message || "Upload awaiting confirmation."}
          </p>
          <Button variant="outline" onClick={() => void status.refetch()}>
            Check processing status
          </Button>
        </>
      ) : (
        <>
          <p>
            Upload this approved video to the selected Google Ads account’s
            video library. It will be unlisted on YouTube. Adding it to a
            campaign happens after your final review.
          </p>
          <label>
            <input
              type="checkbox"
              checked={generated}
              disabled={upload.isPending}
              onChange={e => setGenerated(e.target.checked)}
            />
            This video contains AI-generated content
          </label>
          <label>
            <input
              type="checkbox"
              checked={confirmed}
              disabled={upload.isPending}
              onChange={e => setConfirmed(e.target.checked)}
            />
            I approve uploading this video to Google as unlisted
          </label>
          <Button
            disabled={
              !permitted ||
              !confirmed ||
              upload.isPending ||
              status.isLoading ||
              !!status.error
            }
            onClick={async () => {
              try {
                await upload.mutateAsync({
                  ...input,
                  generated,
                  confirm: true,
                });
                setConfirmed(false);
                await status.refetch();
              } catch {
                // The mutation error is displayed below; do not retry an upload automatically.
              }
            }}
          >
            {upload.isPending
              ? "Uploading to Google…"
              : "Upload video to Google"}
          </Button>
          {!permitted && (
            <p>
              A publisher, administrator or owner can upload approved videos to
              Google.
            </p>
          )}
        </>
      )}
      {(status.error || upload.error || state?.state === "FAILED") && (
        <p role="alert">
          {status.error?.message || upload.error?.message || state?.message}
        </p>
      )}
    </section>
  );
}
