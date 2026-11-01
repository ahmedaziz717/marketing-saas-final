import { expect, it } from "vitest";
import {
  addWorkflowAppResults,
  workflowAppResultPlan,
} from "../shared/workflowAppResults";
import {
  newWorkflowNode,
  workflowGraphProblem,
  workflowGraphSchema,
  workflowTemplate,
} from "../shared/creativeWorkflow";
it("connects final results without running or changing upstream steps", () => {
  const base = workflowTemplate("image-edit");
  const graph = {
    nodes: base.nodes.filter(n => n.type !== "output"),
    edges: base.edges.filter(e => e.target !== "output"),
  };
  graph.edges = graph.edges.filter(e =>
    graph.nodes.some(n => n.id === e.target)
  );
  const result = addWorkflowAppResults(graph);
  expect(result.nodes.slice(0, -1)).toEqual(graph.nodes);
  expect(result.edges.at(-1)?.source).toBe("image");
  expect(result.nodes.at(-1)?.type).toBe("output");
  expect(workflowGraphProblem(result)).toBeNull();
  expect(addWorkflowAppResults(result)).toBe(result);
  expect(workflowGraphSchema.parse(result)).toEqual(result);
});
it("collects all branches and preserves deliberately selected outputs", () => {
  const graph = {
    nodes: [
      newWorkflowNode("text", "app_results"),
      newWorkflowNode("text", "other"),
    ],
    edges: [],
  };
  const result = addWorkflowAppResults(graph);
  expect(result.nodes.at(-1)?.id).toBe("app_results_");
  expect(result.edges.map(e => e.source)).toEqual(["app_results", "other"]);
  expect(workflowAppResultPlan(result).sources.map(n => n.id)).toEqual([
    "app_results",
    "other",
  ]);
});
it("explains empty, disconnected and full workflows before publishing", () => {
  expect(workflowAppResultPlan({ nodes: [], edges: [] }).error).toMatch(
    /at least one/
  );
  expect(
    workflowAppResultPlan({
      nodes: [newWorkflowNode("output", "out")],
      edges: [],
    }).error
  ).toMatch(/Connect a result/);
  const graph = {
    nodes: Array.from({ length: 40 }, (_, i) =>
      newWorkflowNode("text", `n${i}`)
    ),
    edges: [],
  };
  expect(() => addWorkflowAppResults(graph)).toThrow(/40 steps/);
});
