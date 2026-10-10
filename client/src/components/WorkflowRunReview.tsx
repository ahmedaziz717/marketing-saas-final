import { WorkflowSpendApproval } from "./WorkflowAutomationControls";
import { useState } from "react";
import { Link } from "wouter";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { Button } from "./ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "./ui/dialog";
import { workflowValueText } from "@shared/workflowPlatform";
import type { WorkflowGraph, WorkflowSteps } from "@shared/creativeWorkflow";

export function WorkflowRunReview({
  organizationId,
  run,
  onRefresh,
  role,
}: {
  organizationId: number;
  run?: {
    id: string;
    graph: WorkflowGraph;
    steps: WorkflowSteps;
    status: string;
    stopRequested: boolean;
  };
  onRefresh: () => unknown;
  role: string;
}) {
  const [reviewId, setReviewId] = useState<string | null>(null);
  const mutation = trpc.workflows.reviewStep.useMutation();
  if (!run || !["queued", "running"].includes(run.status) || run.stopRequested)
    return null;
  const waiting = Object.entries(run.steps).filter(
    ([, step]) => step.status === "waiting"
  );
  if (!waiting.length) return null;
  const node = run.graph.nodes.find(n => n.id === reviewId),
    step = reviewId ? run.steps[reviewId] : undefined;
  const canReview = ["owner", "admin", "publisher"].includes(role);
  const decide = async (approve: boolean, refresh = false) => {
    if (!reviewId) return;
    try {
      const result = await mutation.mutateAsync({
        organizationId,
        id: run.id,
        nodeId: reviewId,
        approve,
        refresh,
        confirmActivation:
          approve && node?.type === "meta_activate" && !refresh,
      });
      await onRefresh();
      if (!result.refreshed) setReviewId(null);
      toast.success(
        result.refreshed
          ? "Review updated"
          : approve
            ? "Step approved"
            : "Run stopped at review"
      );
    } catch (e) {
      toast.error((e as Error).message);
    }
  };
  return (
    <>
      <div className="wf-attention-list">
        {waiting.map(([id, step]) => (
          <div className="wf-attention" key={id}>
            <div>
              <strong>{run.graph.nodes.find(n => n.id === id)?.title}</strong>
              <p>{step.waitingReason ?? "Waiting for the next result."}</p>
            </div>
            {step.approvalRequiredCredits ? (
              <WorkflowSpendApproval
                organizationId={organizationId}
                runId={run.id}
                nodeId={id}
                onRefresh={onRefresh}
              />
            ) : step.publicationId ? (
              <Link
                href={`/app/publishing?publication=${step.publicationId}`}
                target="_blank"
                rel="noopener noreferrer"
              >
                Review publication ↗
              </Link>
            ) : step.reviewHash || step.reviewData ? (
              <Button
                variant="outline"
                size="sm"
                disabled={!canReview}
                onClick={() => setReviewId(id)}
              >
                Review step
              </Button>
            ) : step.outputs?.some(v => v.type === "image") ? (
              <Link
                href="/app/library?view=needs_review"
                target="_blank"
                rel="noopener noreferrer"
              >
                Review asset ↗
              </Link>
            ) : null}
          </div>
        ))}
      </div>
      <Dialog
        open={!!reviewId}
        onOpenChange={open => !open && !mutation.isPending && setReviewId(null)}
      >
        <DialogContent className="max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {node?.type === "meta_activate"
                ? "Review ad activation"
                : `Review ${node?.title ?? "step"}`}
            </DialogTitle>
            <DialogDescription>
              {node?.type === "meta_activate"
                ? "Activating this ad can begin spending under its existing campaign and ad-set settings."
                : "Approval applies to the exact inputs shown below."}
            </DialogDescription>
          </DialogHeader>
          {step?.outputs?.map((value, i) => (
            <div key={i}>
              {value.type === "image" ? (
                <img
                  className="max-h-64 rounded-lg object-contain"
                  src={value.url}
                  alt={value.name}
                />
              ) : value.type === "video" ? (
                <video controls className="max-h-64" src={value.url} />
              ) : (
                <pre className="wf-evidence">{workflowValueText(value)}</pre>
              )}
            </div>
          ))}
          {step?.reviewData && (
            <>
              <dl className="wf-review-facts">
                <dt>Ad</dt>
                <dd>{String(step.reviewData.before?.name ?? "")}</dd>
                <dt>Ad ID</dt>
                <dd>{String(step.reviewData.before?.id ?? "")}</dd>
                <dt>Current status</dt>
                <dd>{String(step.reviewData.before?.status ?? "")}</dd>
                <dt>Requested status</dt>
                <dd>Active</dd>
              </dl>
              {step.reviewData.warnings.map(w => (
                <p className="wf-setting-help" key={w}>
                  {w}
                </p>
              ))}
              <Button
                variant="outline"
                disabled={mutation.isPending}
                onClick={() => decide(true, true)}
              >
                Refresh review
              </Button>
            </>
          )}
          <div className="flex justify-end gap-2">
            <Button
              variant="outline"
              disabled={mutation.isPending}
              onClick={() => decide(false)}
            >
              Reject
            </Button>
            <Button disabled={mutation.isPending} onClick={() => decide(true)}>
              {node?.type === "meta_activate"
                ? "Confirm and activate ad"
                : "Approve and continue"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
