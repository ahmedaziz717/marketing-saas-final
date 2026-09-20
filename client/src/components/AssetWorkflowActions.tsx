import { useId } from "react";
import { Check, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { canReviewAsset, type AssetState } from "@shared/assetLibrary";
import { isWorkingAsset, mayApproveAndAdd, mayCreateAssets, mayReviewAssets, type AssetSurface } from "@shared/assetWorkflow";

export type AssetWorkflowActionsProps = {
  surface: AssetSurface; state: AssetState; role: string; busy: boolean;
  note: string; onNoteChange: (value: string) => void;
  onSubmit: () => void; onApproveAndAdd: () => void;
  onReview: (decision: "approved" | "changes_requested" | "rejected") => void;
  onComment: () => void; onRevise: () => void; onViewSubmission: () => void;
};

export function AssetWorkflowActions(props: AssetWorkflowActionsProps) {
  const { surface, state, role, busy, note } = props;
  const id = useId();
  const working = isWorkingAsset({ state });
  const canCreate = mayCreateAssets(role);
  const review = surface === "library" && mayReviewAssets(role);
  const canDecide = review && canReviewAsset(state, "approved");
  const canReturn = review && canReviewAsset(state, "changes_requested");
  return <section aria-label={surface === "studio" ? "Studio handoff" : "Library review"} className="min-w-0 space-y-4">
    {surface === "studio" ? <div className="rounded-xl border bg-muted/40 p-4">
      <h3 className="font-semibold">{working ? "Ready to share this version?" : state === "needs_review" ? "Awaiting approval" : "Approved in Asset Library"}</h3>
      <p className="mt-2 text-sm leading-6 text-muted-foreground">{state === "draft" ? "Saved in Content Studio only. Submit this version when it is ready for the library review queue." : working ? "Read the feedback below. Create a revised version or resubmit when the feedback is addressed." : "This is the same submitted version, not a separate copy. Review decisions are made in Asset Library."}</p>
      {working && canCreate && <div className="mt-4 grid gap-3">
        <Button type="button" disabled={busy} onClick={props.onSubmit}><Send className="mr-2 h-4 w-4" />{state === "draft" ? "Submit for approval" : "Resubmit for approval"}</Button>
        {mayApproveAndAdd(role) && <><Button type="button" variant="outline" disabled={busy} onClick={props.onApproveAndAdd}><Check className="mr-2 h-4 w-4" />Approve & add to library</Button><p className="text-xs leading-5 text-muted-foreground">You have approval permission. This shortcut records your approval; it does not publish anything.</p></>}
      </div>}
      {!working && <Button className="mt-4" variant="outline" onClick={props.onViewSubmission}>View {state === "needs_review" ? "submission" : "in library"}</Button>}
    </div> : <div className="rounded-xl border bg-muted/40 p-4">
      <h3 className="font-semibold">{state === "approved" ? "Approved version" : state === "needs_review" ? "Review this submission" : "Returned to Content Studio"}</h3>
      <p className="mt-2 text-sm leading-6 text-muted-foreground">{state === "approved" ? "This version is available for use. Posts and ads still require their own publishing approval." : state === "needs_review" ? review ? "Inspect the asset and copy, then approve or send feedback to its creator." : "Awaiting an authorized reviewer. You can follow the status and add a comment, but cannot approve." : "The decision and feedback are retained here. Revisions and resubmissions belong in Content Studio."}</p>
      {canDecide && <Button className="mt-4 w-full" disabled={busy} onClick={() => props.onReview("approved")}><Check className="mr-2 h-4 w-4" />Approve</Button>}
    </div>}
    <div><Label htmlFor={id}>{surface === "library" ? "Review feedback" : "Notes"}</Label><textarea id={id} value={note} onChange={event => props.onNoteChange(event.target.value)} disabled={busy} maxLength={3000} className="mt-2 min-h-24 w-full rounded-xl border bg-background p-3 text-sm" placeholder="Add a comment about this version..." /></div>
    {canReturn && <div className="grid gap-2 sm:grid-cols-2"><Button variant="outline" disabled={busy || !note.trim()} onClick={() => props.onReview("changes_requested")}>Request changes</Button><Button variant="outline" disabled={busy} onClick={() => props.onReview("rejected")}>Reject</Button><p className="text-xs leading-5 text-muted-foreground sm:col-span-2">Explain what needs changing before requesting a revision.</p></div>}
    <Button variant="ghost" size="sm" disabled={busy || !note.trim()} onClick={props.onComment}>Add comment</Button>
    {canCreate && <div className="border-t pt-4"><Button className="h-auto w-full whitespace-normal py-2" variant="outline" disabled={busy} onClick={props.onRevise}>{surface === "studio" ? "Upload a revised version" : "Create revised version in Studio"}</Button><p className="mt-2 text-xs leading-5 text-muted-foreground">Revisions are separate drafts. This version and its review history are preserved.</p></div>}
  </section>;
}
