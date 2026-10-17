import { useState } from "react";
import { Link } from "wouter";
import { ImageOff, Loader2 } from "lucide-react";
import { canSubmitAsset, type LibraryAsset } from "@shared/assetLibrary";
import {
  libraryAssetLink,
  mayApproveAndAdd,
  mayReviewAssets,
  workflowLabel,
} from "@shared/assetWorkflow";
import { StudioCard } from "./StudioCard";

export function StudioLogos({
  assets,
  role,
  selectedId,
  search,
  loading,
  loadError,
  onChange,
  onAction,
}: {
  assets: LibraryAsset[];
  role: string;
  selectedId: number | null;
  search: string;
  loading?: boolean;
  loadError?: string;
  onChange: (id: number | null) => void;
  onAction: (
    asset: LibraryAsset,
    action: "approve" | "submit"
  ) => Promise<void>;
}) {
  const [working, setWorking] = useState<string | null>(null);
  const [error, setError] = useState("");
  const logos = assets.filter(
    asset =>
      asset.sourceType === "logo" &&
      asset.mediaType === "image" &&
      asset.key.startsWith("asset:")
  );
  const visible = logos.filter(asset =>
    asset.name.toLowerCase().includes(search.toLowerCase())
  );

  async function act(asset: LibraryAsset, action: "approve" | "submit") {
    setWorking(asset.key);
    setError("");
    try {
      await onAction(asset, action);
      if (action === "approve") onChange(Number(asset.key.split(":")[1]));
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "Could not update this logo. Please try again."
      );
    } finally {
      setWorking(null);
    }
  }

  return (
    <section aria-label="Brand logo choices">
      <p className="cfg-help">
        Choose a saved logo or keep your creative logo-free. Logos awaiting
        approval stay visible here.
      </p>
      {loading && <p role="status">Loading saved logos…</p>}
      {(loadError || error) && (
        <p role="alert" className="cfg-help">
          {loadError || error}
        </p>
      )}
      <div className="cfg-card-grid">
        <StudioCard
          title="No logo"
          description="Keep the composition free of an embedded logo."
          media={
            <div className="cfg-logo-empty">
              <ImageOff size={42} aria-hidden="true" />
            </div>
          }
          selected={selectedId === null}
          disabled={!!working}
          onSelect={() => onChange(null)}
        />
        {visible.map(asset => {
          const id = Number(asset.key.split(":")[1]);
          const approved = asset.state === "approved";
          const canApprove = canSubmitAsset(asset.state)
            ? mayApproveAndAdd(role)
            : asset.state === "needs_review" && mayReviewAssets(role);
          return (
            <StudioCard
              key={asset.key}
              title={asset.name}
              image={asset.url}
              contain
              description={
                approved
                  ? "Approved brand logo"
                  : "Saved logo · approval needed before use"
              }
              badge={workflowLabel(asset.state)}
              selected={selectedId === id}
              disabled={!approved || !!working}
              onSelect={() => onChange(id)}
            >
              {!approved && (
                <div className="cfg-logo-actions">
                  {canApprove ? (
                    <button
                      className="cfg-primary"
                      disabled={!!working}
                      onClick={() => void act(asset, "approve")}
                    >
                      {working === asset.key && (
                        <Loader2 size={14} className="animate-spin" />
                      )}
                      Approve & use logo
                    </button>
                  ) : canSubmitAsset(asset.state) &&
                    ["creator", "owner", "admin"].includes(role) ? (
                    <button
                      className="cfg-secondary"
                      disabled={!!working}
                      onClick={() => void act(asset, "submit")}
                    >
                      Submit for review
                    </button>
                  ) : (
                    <span className="cfg-help">
                      Waiting for a workspace owner or reviewer to approve.
                    </span>
                  )}
                  {asset.state !== "draft" && (
                    <Link href={libraryAssetLink(asset.key, asset.state)}>
                      View review details
                    </Link>
                  )}
                </div>
              )}
            </StudioCard>
          );
        })}
      </div>
      {!loading && !loadError && !logos.length && (
        <p className="cfg-help">
          No saved logos yet. Add one in your Brand Kit.
        </p>
      )}
      {!!logos.length && !visible.length && (
        <p className="cfg-help">No logos match your search.</p>
      )}
    </section>
  );
}
