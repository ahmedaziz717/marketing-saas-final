import { useId } from "react";
import { Check, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { canReviewAsset, canSubmitAsset, type AssetState } from "@shared/assetLibrary";

type ReviewDecision = "approved" | "changes_requested" | "rejected";
export type AssetReviewActionsProps = {
  state: AssetState;
  canCreate: boolean;
  canReview: boolean;
  busy: boolean;
  note: string;
  onNoteChange: (note: string) => void;
  onSubmit: () => void;
  onReview: (decision: ReviewDecision) => void;
  onComment: () => void;
  onUploadVersion: () => void;
};

export function AssetReviewActions({ state, canCreate, canReview, busy, note, onNoteChange, onSubmit, onReview, onComment, onUploadVersion }: AssetReviewActionsProps) {
  const id = useId();
  const helpId = `${id}-review-help`;
  const roleId = `${id}-review-role`;
  const noteId = `${id}-review-note`;
  const needsSubmission = canSubmitAsset(state);
  const approvalAllowed = canReview && canReviewAsset(state, "approved");
  const changesAllowed = canReview && canReviewAsset(state, "changes_requested");
  const help = state === "approved"
    ? "This version is approved. A post or ad still needs its own publishing approval."
    : state === "needs_review"
      ? "Submitted for review. A reviewer can now approve this version or request changes."
      : canCreate
        ? state === "draft"
          ? "This asset is a draft. Submit it for review first; approval becomes available after submission."
          : "This version was returned. Address the feedback, then submit it for review again."
        : "An owner, administrator, or creator must submit this version for review before it can be approved.";

  return <section aria-label="Asset review actions" className="min-w-0 space-y-4">
    <div className="rounded-xl border bg-muted/40 p-4">
      <h3 className="text-sm font-semibold">Review & approval</h3>
      <p id={helpId} className="mt-2 text-sm leading-6 text-muted-foreground" aria-live="polite">{help}</p>
      <div className="mt-4 grid gap-3">
        {canCreate && needsSubmission && <Button type="button" className="w-full" disabled={busy} aria-describedby={helpId} onClick={onSubmit}>Submit for review</Button>}
        {canReview && <Button type="button" className="w-full" variant={approvalAllowed ? "default" : "outline"} disabled={busy || !approvalAllowed} aria-describedby={helpId} onClick={() => onReview("approved")}><Check className="mr-2 h-4 w-4" />{state === "approved" ? "Approved" : "Approve"}</Button>}
      </div>
      {!canReview && <p id={roleId} className="mt-3 text-xs leading-5 text-muted-foreground">Only workspace owners, administrators, and reviewers can approve assets. Your role can add comments{canCreate ? " and submit drafts for review" : ""}.</p>}
    </div>
    <div>
      <Label htmlFor={noteId}>Review note</Label>
      <textarea id={noteId} className="mt-2 min-h-24 w-full rounded-xl border bg-background p-3 text-sm" value={note} onChange={event => onNoteChange(event.target.value)} maxLength={3000} disabled={busy} placeholder="Add feedback or describe the changes needed..." />
      {changesAllowed && <p className="mt-1 text-xs text-muted-foreground">A note is required when requesting changes.</p>}
    </div>
    {changesAllowed && <div className="grid gap-2 sm:grid-cols-2">
      <Button type="button" className="min-w-0" variant="outline" disabled={busy || !note.trim()} onClick={() => onReview("changes_requested")}>Request changes</Button>
      <Button type="button" className="min-w-0" variant="outline" disabled={busy} onClick={() => onReview("rejected")}>Reject</Button>
    </div>}
    <Button type="button" size="sm" variant="ghost" disabled={busy || !note.trim()} onClick={onComment}>Add comment</Button>
    {canCreate && <div className="border-t pt-4">
      <Button type="button" className="w-full" variant="outline" disabled={busy} onClick={onUploadVersion}><Upload className="mr-2 h-4 w-4" />Upload a new version</Button>
      <p className="mt-2 text-xs leading-5 text-muted-foreground">A new upload is a separate draft. It does not replace this version or its approval.</p>
    </div>}
  </section>;
}
