import {
  workflowOrder,
  type WorkflowGraph,
  type WorkflowSteps,
} from "./creativeWorkflow";

type Run = { status: string; graph: WorkflowGraph; steps: WorkflowSteps };

// Waiting is not always idle: provider jobs, retries and classification batches
// still occupy a slot. Only server-recorded human/paused-dependency waits release it.
export function workflowRunActivity(run: Run): string {
  if (run.status !== "running") return run.status;
  if (Object.values(run.steps).some(step => step.status === "running"))
    return "running";
  const id = workflowOrder(run.graph).find(
    id => !["completed", "reused"].includes(run.steps[id]?.status ?? "pending")
  );
  const step = id ? run.steps[id] : undefined;
  if (step?.status !== "waiting" || step.videoJobId) return "running";
  if (step.waitingFor === "paused_history") return "paused_history";
  if (
    step.waitingFor === "approval" &&
    !step.approvedByUserId &&
    step.approvedCredits === undefined
  )
    return "awaiting_approval";
  return "running";
}

export function workflowRunOccupiesSlot(run: Run): boolean {
  return ["queued", "running"].includes(workflowRunActivity(run));
}

export function workflowRunStatusLabel(run: Run): string {
  const activity = workflowRunActivity(run);
  return (
    (
      {
        queued: "Queued",
        running: "Running",
        awaiting_approval: "Awaiting approval",
        paused_history: "Waiting for paused history import",
        completed: "Complete",
        failed: "Needs attention",
        stopped: "Stopped",
      } as Record<string, string>
    )[activity] ?? activity
  );
}
