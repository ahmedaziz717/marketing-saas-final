// @vitest-environment jsdom
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { newWorkflowNode, type WorkflowSteps } from "@shared/creativeWorkflow";
import { WorkflowRunProgress } from "./WorkflowRunProgress";

const now = Date.parse("2026-10-16T19:45:00Z");
function fixture() {
  const classify = newWorkflowNode("classify_history", "classify");
  classify.title = "Classify imported ads";
  const evidence = newWorkflowNode("analyze_history", "evidence");
  evidence.title = "Measure selected evidence";
  return {
    id: "run",
    status: "running",
    createdAtMs: now - 480_000,
    updatedAtMs: now,
    graph: {
      nodes: [classify, evidence],
      edges: [
        {
          id: "edge",
          source: "classify",
          target: "evidence",
          port: "evidence" as const,
        },
      ],
    },
    steps: {
      classify: {
        status: "waiting",
        progress: {
          completed: 7400,
          total: 16835,
          unit: "ads",
          updatedAtMs: now,
        },
      },
      evidence: { status: "pending" },
    } as WorkflowSteps,
  };
}
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(now);
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

it("shows saved batch counts and advances elapsed time without inventing completed work", () => {
  const run = fixture();
  const { rerender } = render(<WorkflowRunProgress run={run} />);
  expect(
    screen.getByRole("heading", { name: "Analysis in progress" })
  ).toBeTruthy();
  expect(screen.getByText("7,400 of 16,835 ads classified")).toBeTruthy();
  expect(screen.getByText("8m 00s")).toBeTruthy();
  expect(
    screen
      .getByRole("progressbar", { name: "Ads classified" })
      .getAttribute("aria-valuenow")
  ).toBe("7400");
  act(() => vi.advanceTimersByTime(30_000));
  expect(screen.getByText("8m 30s")).toBeTruthy();
  expect(screen.getByRole("progressbar").getAttribute("aria-valuenow")).toBe(
    "7400"
  );
  run.steps.classify.progress!.completed = 7500;
  run.updatedAtMs = now + 30_000;
  rerender(<WorkflowRunProgress run={run} />);
  expect(screen.getByText("7,500 of 16,835 ads classified")).toBeTruthy();
});

it("flags a stale heartbeat and lets the user check without creating another run", () => {
  const refresh = vi.fn();
  const { container } = render(
    <WorkflowRunProgress run={fixture()} onRefresh={refresh} />
  );
  act(() => vi.advanceTimersByTime(95_000));
  expect(
    screen.getByRole("heading", { name: "Waiting for a run update" })
  ).toBeTruthy();
  expect(screen.getByText(/No run update for 1m 35s/)).toBeTruthy();
  expect(container.querySelector(".is-spinning")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Check now" }));
  expect(refresh).toHaveBeenCalledOnce();
});

it("separates a lost live connection from an active worker with a slow batch", () => {
  const run = fixture();
  run.steps.classify.progress!.updatedAtMs = now - 240_000;
  const { rerender } = render(<WorkflowRunProgress run={run} />);
  expect(screen.getByText(/The worker is responding/)).toBeTruthy();
  rerender(<WorkflowRunProgress run={run} refreshError />);
  expect(
    screen.getByRole("heading", { name: "Reconnecting to live progress" })
  ).toBeTruthy();
  expect(screen.getByText(/The last saved progress is shown/)).toBeTruthy();
});

it("does not report approval waits as a stuck or actively processing run", () => {
  const run = fixture();
  run.updatedAtMs = now - 600_000;
  run.steps.classify = {
    status: "waiting",
    waitingFor: "approval",
    waitingReason: "Review your evidence.",
  };
  const { container } = render(<WorkflowRunProgress run={run} />);
  expect(
    screen.getByRole("heading", { name: "Waiting for your approval" })
  ).toBeTruthy();
  expect(container.querySelector(".is-spinning")).toBeNull();
  expect(screen.queryByText(/continues in the background/)).toBeNull();
});

it("keeps the final duration fixed and removes running indicators after completion", () => {
  const run = fixture();
  run.status = "completed";
  run.steps = {
    classify: { status: "completed" },
    evidence: { status: "completed" },
  };
  const { container } = render(<WorkflowRunProgress run={run} />);
  expect(
    screen.getByRole("heading", { name: "Analysis complete" })
  ).toBeTruthy();
  expect(screen.getByText("2 of 2 steps complete")).toBeTruthy();
  act(() => vi.advanceTimersByTime(60_000));
  expect(screen.getByText("8m 00s")).toBeTruthy();
  expect(container.querySelector(".is-spinning")).toBeNull();
  expect(screen.queryByRole("progressbar")).toBeNull();
});
