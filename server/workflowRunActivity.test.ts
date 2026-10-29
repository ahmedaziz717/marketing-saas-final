import { expect, it } from "vitest";
import { newWorkflowNode, type WorkflowStep } from "../shared/creativeWorkflow";
import {
  workflowRunActivity,
  workflowRunOccupiesSlot,
  workflowRunStatusLabel,
} from "../shared/workflowRunActivity";

const graph = {
  nodes: [
    newWorkflowNode("review", "review"),
    newWorkflowNode("output", "out"),
  ],
  edges: [{ id: "edge", source: "review", target: "out", port: "result" }],
};
const run = (step: WorkflowStep, status = "running") => ({
  status,
  graph,
  steps: { review: step, out: { status: "pending" as const } },
});

it.each([
  { status: "waiting", waitingFor: "approval" },
  {
    status: "waiting",
    waitingFor: "paused_history",
    historyJobId: "paused-job",
  },
] as WorkflowStep[])(
  "releases a slot only for a recorded blocking wait: %j",
  step => {
    expect(workflowRunOccupiesSlot(run(step))).toBe(false);
    expect(workflowRunStatusLabel(run(step))).toMatch(
      /approval|paused history/
    );
  }
);

it.each([
  { status: "pending" },
  { status: "running" },
  { status: "waiting", videoJobId: "provider-job" },
  { status: "waiting", waitingFor: "approval", videoJobId: "provider-job" },
  { status: "waiting", historyJobId: "active-import" },
  { status: "waiting", classificationCursor: "more" },
  { status: "waiting", retryAttempts: 1, wakeAtMs: Date.now() + 60000 },
  { status: "waiting", waitingReason: "Approve this item" },
  { status: "waiting", waitingFor: "approval", approvedByUserId: 1 },
  { status: "waiting", waitingFor: "approval", approvedCredits: 0 },
] as WorkflowStep[])(
  "keeps queued, provider and resumed work inside the limit: %j",
  step => {
    expect(workflowRunOccupiesSlot(run(step))).toBe(true);
  }
);

it("uses the current unfinished step, not an old completed wait", () => {
  const value = run({ status: "completed", waitingFor: "approval" });
  expect(workflowRunActivity(value)).toBe("running");
  value.steps.review = { status: "waiting", waitingFor: "approval" };
  expect(workflowRunActivity(value)).toBe("awaiting_approval");
  expect(workflowRunActivity({ ...value, status: "queued" })).toBe("queued");
  for (const status of ["completed", "stopped", "failed"])
    expect(workflowRunOccupiesSlot({ ...value, status })).toBe(false);
});
