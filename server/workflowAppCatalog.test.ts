import { expect, it } from "vitest";
import {
  builtinWorkflowApps,
  selectWorkflowApp,
} from "../shared/workflowAppCatalog";
import {
  newWorkflowNode,
  workflowGraphProblem,
  workflowGraphSchema,
  workflowRunProblem,
} from "../shared/creativeWorkflow";
it("maps built-in Apps to real steps and preserves typed inputs and outputs", () => {
  const graph = {
    nodes: [
      newWorkflowNode("text", "brief"),
      newWorkflowNode("image", "photo"),
      newWorkflowNode("app", "app"),
      newWorkflowNode("output", "result"),
    ],
    edges: [
      { id: "a", source: "brief", target: "app", port: "context" },
      { id: "b", source: "photo", target: "app", port: "context" },
      { id: "c", source: "app", target: "result", port: "result" },
    ],
  };
  const selected = selectWorkflowApp(graph, "app", "builtin:image-creator");
  expect(selected.removed).toBe(0);
  expect(selected.graph.edges.map(e => e.port)).toEqual([
    "text",
    "image",
    "result",
  ]);
  expect(workflowGraphProblem(selected.graph)).toBeNull();
  expect(
    workflowGraphSchema.parse(selected.graph).nodes[2].config.builtinAppId
  ).toBe("image-creator");
  for (const app of builtinWorkflowApps.filter(a => a.nodeType)) {
    const result = selectWorkflowApp(
      { nodes: [newWorkflowNode("app", "app")], edges: [] },
      "app",
      `builtin:${app.id}`
    );
    expect(result.graph.nodes[0].type).toBe(app.nodeType);
    expect(workflowGraphProblem(result.graph)).toBeNull();
  }
});
it("keeps normal channel requirements and refuses unavailable Apps", () => {
  const graph = { nodes: [newWorkflowNode("app", "app")], edges: [] };
  const selected = selectWorkflowApp(graph, "app", "builtin:ad-builder");
  expect(workflowRunProblem(selected.graph)).toMatch(/connected account/);
  expect(() =>
    selectWorkflowApp(graph, "app", "builtin:creator-video")
  ).toThrow(/not available/);
  expect(() => selectWorkflowApp(graph, "app", "builtin:unknown")).toThrow(
    /unavailable/
  );
});
it("clears old App configuration and reports incompatible connections on switching", () => {
  const text = newWorkflowNode("text", "text"),
    image = newWorkflowNode("generate_image", "app");
  image.config.modelId = "old-model";
  const next = selectWorkflowApp(
    {
      nodes: [text, image],
      edges: [{ id: "a", source: "text", target: "app", port: "text" }],
    },
    "app",
    "builtin:meta-report"
  );
  expect(next.removed).toBe(1);
  expect(next.graph.edges).toEqual([]);
  expect(next.graph.nodes[1].config.modelId).toBeUndefined();
  expect(workflowGraphProblem(next.graph)).toBeNull();
});
