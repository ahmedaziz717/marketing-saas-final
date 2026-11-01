import { expect, it } from "vitest";
import {
  optimizationStudioGraph,
  defaultOptimizationSettings,
  readOptimizationStudio,
} from "../shared/optimizationStudio";
import {
  experimentSchema,
  optimizationStudioSchema,
} from "../shared/optimizationStudioSchema";
import {
  workflowGraphSchema,
  workflowGraphProblem,
  workflowRunProblem,
} from "../shared/creativeWorkflow";
import { availableWorkflowResults } from "../shared/workflowResults";
const connectionId = "00000000-0000-4000-8000-000000000099";
const studio = optimizationStudioSchema.parse({
  version: 1,
  objective: "Improve purchase efficiency",
});
it("persists settings in executable steps and reconstructs them after schema parsing", () => {
  for (const refreshHistory of [false, true]) {
    const settings = {
      ...defaultOptimizationSettings(),
      connectionId,
      refreshHistory,
    };
    const graph = workflowGraphSchema.parse(
      optimizationStudioGraph(settings, studio)
    );
    expect(workflowGraphProblem(graph)).toBeNull();
    expect(workflowRunProblem(graph)).toBeNull();
    expect(readOptimizationStudio(graph)).toEqual({ settings, studio });
    expect(
      graph.nodes
        .filter(n => n.type === "optimize_dimension")
        .every(n => n.config.optimizer?.mode === "analyze")
    ).toBe(true);
  }
});
it("preserves advanced workflow edits by refusing to rebuild them in the Studio", () => {
  const graph = optimizationStudioGraph(
    { ...defaultOptimizationSettings(), connectionId },
    studio
  );
  graph.nodes[0].x += 30;
  expect(readOptimizationStudio(graph)).not.toBeNull();
  graph.nodes.find(
    n => n.type === "optimize_dimension"
  )!.config.optimizer!.mode = "analyze_generate";
  expect(readOptimizationStudio(graph)).toBeNull();
  expect(() =>
    optimizationStudioGraph(
      { ...defaultOptimizationSettings(), focus: [] },
      studio
    )
  ).toThrow(/one to three/);
});
it("requires explicit test design before readiness and results before conclusion", () => {
  const plan = experimentSchema.parse({
    id: connectionId,
    title: "Headline test",
  });
  expect(experimentSchema.safeParse({ ...plan, status: "ready" }).success).toBe(
    false
  );
  const ready = {
    ...plan,
    hypothesis: "A clearer benefit improves CTR",
    control: "Current headline",
    variant: "Benefit headline",
    decisionRule: "Predeclare sample and minimum effect; stop at spend limit",
  };
  expect(
    experimentSchema.safeParse({ ...ready, status: "ready" }).success
  ).toBe(true);
  expect(
    experimentSchema.safeParse({ ...ready, status: "concluded" }).success
  ).toBe(false);
  expect(
    experimentSchema.safeParse({
      ...ready,
      status: "concluded",
      outcome: "Not enough purchases",
      decision: "inconclusive",
    }).success
  ).toBe(true);
});
it("shows completed result branches while another is waiting without duplicating image context", () => {
  const graph = optimizationStudioGraph(
    { ...defaultOptimizationSettings(), connectionId },
    studio
  );
  const value = {
    type: "data" as const,
    name: "Headline evidence",
    data: { kind: "headline" },
  };
  const output = availableWorkflowResults({
    graph,
    steps: {
      optimize_headline: { status: "completed", outputs: [value] },
      optimize_primary_text: { status: "waiting", outputs: [] },
      results: { status: "pending" },
    },
  });
  expect(output).toEqual([value]);
});
