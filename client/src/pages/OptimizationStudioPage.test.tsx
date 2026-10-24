vi.mock("@/_core/hooks/useAuth", () => ({
  useAuth: () => ({ user: { id: 10 } }),
}));
// @vitest-environment jsdom
import { changeField } from "@/test/choiceControls";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { Router } from "wouter";
import { memoryLocation } from "wouter/memory-location";
import {
  optimizationStudioGraph,
  defaultOptimizationSettings,
} from "@shared/optimizationStudio";
import { optimizationStudioSchema } from "@shared/optimizationStudioSchema";
import { workflowGraphSchema } from "@shared/creativeWorkflow";
const cid = "00000000-0000-4000-8000-000000000099";
const wid = "00000000-0000-4000-8000-000000000098";
const rid = "00000000-0000-4000-8000-000000000097";
const state = vi.hoisted(() => ({
  detail: undefined as any,
  save: vi.fn(),
  run: vi.fn(),
  quote: vi.fn(),
  enabled: true,
}));
vi.mock("@/hooks/useWorkspace", () => ({
  useWorkspace: () => ({ organizationId: 1, membership: { role: "owner" } }),
}));
vi.mock("@/components/WorkspaceGate", () => ({
  WorkspaceGate: ({ children }: any) => children,
}));
vi.mock("@/components/configurator/studioNavigation", () => ({
  useStudioNavigation: () => ({ current: null }),
  scrollStudioChoices: () => {},
}));
vi.mock("@/components/WorkflowRunReview", () => ({
  WorkflowRunReview: () => null,
}));
vi.mock("@/lib/trpc", () => ({
  trpc: {
    optimization: {
      availability: { useQuery: () => ({ data: { enabled: state.enabled } }) },
      progress: { useQuery: () => ({ data: null }) },
    },
    googleAds: {
      connections: {
        useQuery: () => ({
          data: {
            items: [
              {
                id: "00000000-0000-4000-8000-000000000077",
                name: "Google Example",
                channel: "google_ads",
                status: "connected",
                details: { timezone: "UTC" },
              },
            ],
          },
        }),
      },
    },
    channels: {
      accountImage: { useQuery: () => ({ data: {} }) },
      connections: {
        useQuery: () => ({
          data: {
            items: [
              {
                id: "00000000-0000-4000-8000-000000000099",
                name: "Example Ads",
                channel: "meta_ads",
                status: "connected",
                details: { timezone: "UTC" },
              },
            ],
          },
        }),
      },
    },
    workflows: {
      list: {
        useQuery: () => ({
          data: state.detail ? [state.detail] : [],
          refetch: vi.fn(),
        }),
      },
      get: { useQuery: () => ({ data: state.detail, refetch: vi.fn() }) },
      getRun: { useQuery: () => ({ data: undefined }) },
      save: { useMutation: () => ({ mutateAsync: state.save }) },
      run: { useMutation: () => ({ mutateAsync: state.run }) },
      quote: { useMutation: () => ({ mutateAsync: state.quote }) },
      stop: { useMutation: () => ({ mutateAsync: vi.fn() }) },
    },
  },
}));
import OptimizationStudioPage from "./OptimizationStudioPage";
function open(id = "") {
  const location = memoryLocation({
    path: `/app/optimize/studio${id ? `?id=${id}` : ""}`,
  });
  return render(
    <Router hook={location.hook} searchHook={location.searchHook}>
      <OptimizationStudioPage />
    </Router>
  );
}
beforeEach(() => {
  localStorage.clear();
  state.detail = undefined;
  state.enabled = true;
  state.save.mockReset().mockImplementation(async input => {
    const item = {
      ...input,
      id: input.id ?? wid,
      revision: (input.revision ?? 0) + 1,
      graph: workflowGraphSchema.parse(input.graph),
      runs: state.detail?.runs ?? [],
    };
    state.detail = item;
    return item;
  });
  state.quote.mockReset().mockResolvedValue({ credits: 0 });
  state.run.mockReset().mockImplementation(async () => {
    state.detail.runs = [
      {
        id: rid,
        workflowId: wid,
        status: "queued",
        graph: state.detail.graph,
        steps: {},
        createdAtMs: Date.now(),
      },
    ];
    return { id: rid };
  });
});
afterEach(cleanup);
it("uses five sections, saves the executable settings, then quotes and starts one analysis", async () => {
  open();
  expect(
    screen
      .getByRole("navigation", { name: "Optimization Studio sections" })
      .querySelectorAll("button")
  ).toHaveLength(5);
  changeField(screen.getByLabelText("Plan title"), {
    target: { value: "Purchase efficiency" },
  });
  changeField(screen.getByLabelText("Goal & context"), {
    target: { value: "Find the next headline to test" },
  });
  clickJourney(screen.getByRole("button", { name: /^Evidence Account/ }));
  changeField(screen.getByLabelText("Advertising account"), {
    target: { value: cid },
  });
  clickJourney(screen.getByRole("button", { name: /^Review & run Confirm/ }));
  clickJourney(screen.getByRole("button", { name: "Save & run analysis" }));
  await waitFor(() => expect(state.run).toHaveBeenCalledOnce());
  expect(state.save).toHaveBeenCalledOnce();
  const graph = state.save.mock.calls[0][0].graph;
  expect(
    graph.nodes.find((n: any) => n.type === "analyze_history").config
      .connectionId
  ).toBe(cid);
  expect(
    graph.nodes
      .filter((n: any) => n.type === "optimize_dimension")
      .every(
        (n: any) =>
          n.config.optimizer.brief === "Find the next headline to test"
      )
  ).toBe(true);
  await waitFor(() =>
    expect(
      screen.getByRole("heading", { name: "Your next opportunities" })
    ).toBeTruthy()
  );
});
it("reopens saved plans, links an exploratory experiment to its source, and preserves run settings", async () => {
  const graph = optimizationStudioGraph(
    { ...defaultOptimizationSettings(), connectionId: cid },
    optimizationStudioSchema.parse({ version: 1, objective: "Original goal" })
  );
  const data = {
    schemaVersion: 1,
    kind: "headline",
    channel: "meta_ads",
    decision: "insufficient_evidence",
    confidence: 0,
    observations: ["No imported coverage"],
    sourceAdIds: [],
    dimensions: ["messaging_style"],
    suggestedTests: ["Test one headline"],
    generationBrief: "",
    caveats: ["Import more evidence"],
    requiresHumanApproval: true,
  };
  state.detail = {
    id: wid,
    name: "Saved plan",
    revision: 3,
    graph,
    runs: [
      {
        id: rid,
        graph: structuredClone(graph),
        status: "completed",
        steps: {
          results: {
            status: "completed",
            outputs: [{ type: "data", name: "Headline", data }],
          },
        },
        createdAtMs: 1,
      },
    ],
  };
  open(wid);
  await waitFor(() =>
    expect(
      (screen.getByLabelText("Plan title") as HTMLInputElement).value
    ).toBe("Saved plan")
  );
  clickJourney(
    screen.getByRole("button", { name: /^Recommendations Findings/ })
  );
  clickJourney(screen.getByRole("button", { name: "Plan exploratory test" }));
  changeField(screen.getByLabelText("Hypothesis"), {
    target: { value: "A clearer benefit increases engagement" },
  });
  clickJourney(screen.getByRole("button", { name: "Save experiment plans" }));
  await waitFor(() => expect(state.save).toHaveBeenCalledOnce());
  expect(
    state.save.mock.calls[0][0].graph.optimizationStudio.experiments[0]
  ).toMatchObject({
    source: { runId: rid, kind: "headline" },
    hypothesis: "A clearer benefit increases engagement",
    status: "draft",
  });
  expect(state.detail.runs[0].graph.optimizationStudio.experiments).toEqual([]);
});
it("does not run paid generation or overwrite advanced processing edits", async () => {
  const graph = optimizationStudioGraph(
    { ...defaultOptimizationSettings(), connectionId: cid },
    optimizationStudioSchema.parse({ version: 1, objective: "Test" })
  );
  graph.nodes.find(
    n => n.type === "optimize_dimension"
  )!.config.optimizer!.mode = "analyze_generate";
  state.detail = { id: wid, name: "Customized", revision: 1, graph, runs: [] };
  open(wid);
  await waitFor(() =>
    expect(
      screen.getByRole("heading", { name: "Open this plan in Workflows" })
    ).toBeTruthy()
  );
  expect(screen.queryByRole("button", { name: "Save plan" })).toBeNull();
  expect(state.run).not.toHaveBeenCalled();
});

// Business-flow checks accept optional discovery prompts; StudioJourney tests cover the prompt itself.
function clickJourney(element: Element) {
  fireEvent.click(element);
  const keep = screen.queryByRole("button", {
    name: /^(Keep defaults & continue|Continue with current choices)$/,
  });
  if (keep) fireEvent.click(keep);
}
