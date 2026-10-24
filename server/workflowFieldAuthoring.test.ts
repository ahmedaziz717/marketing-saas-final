import { expect, it } from "vitest";
import {
  newWorkflowNode,
  type WorkflowGraph,
} from "../shared/creativeWorkflow";
import { addWorkflowField } from "../shared/workflowFieldAuthoring";
import {
  workflowModelFieldDefaults,
  workflowModelFieldProblem,
} from "../shared/workflowModels";

const position = { x: 120, y: 180 };
const ids = { node: "field", edge: "binding" };

it.each(["assistant", "generate_image", "generate_video"] as const)(
  "preserves the %s model contract when either editor adds a field",
  type => {
    const target = newWorkflowNode(type, "target");
    const original: WorkflowGraph = { nodes: [target], edges: [] };
    const before = structuredClone(original);
    const added = addWorkflowField(original, "model", position, ids);
    expect(original).toEqual(before);
    expect(added.node.config.field).toMatchObject(
      workflowModelFieldDefaults(target)
    );
    expect(added.node.config.field?.allowedModelIds).toHaveLength(1);
    expect(added.graph.edges).toEqual([
      { id: "binding", source: "field", target: "target", port: "model" },
    ]);
    expect(workflowModelFieldProblem(added.graph, added.node)).toBeNull();
  }
);

it("keeps existing model bindings and binds the next free generation step", () => {
  const image = newWorkflowNode("generate_image", "image");
  image.config.modelId = "openai:gpt-image-2.5-flare";
  image.config.modelOptions = { quality: "high" };
  const video = newWorkflowNode("generate_video", "video");
  const first = addWorkflowField(
    { nodes: [image, video], edges: [] },
    "model",
    position,
    ids
  );
  const second = addWorkflowField(first.graph, "model", position, {
    node: "second",
    edge: "second-binding",
  });
  expect(second.graph.edges[0]).toEqual(first.graph.edges[0]);
  expect(second.graph.edges[1].target).toBe("video");
  expect(second.node.config.field?.modelKind).toBe("video");
  expect(
    first.node.config.field?.modelSettings?.[image.config.modelId]
  ).toEqual({ quality: "high" });
  const third = addWorkflowField(second.graph, "model", position, {
    node: "third",
    edge: "unused",
  });
  expect(third.graph.edges).toEqual(second.graph.edges);
  expect(workflowModelFieldProblem(third.graph, third.node)).toContain(
    "choose a generation step"
  );
});

it("enforces node and automatic-binding limits without mutating saved work", () => {
  const full: WorkflowGraph = {
    nodes: Array.from({ length: 40 }, (_, i) =>
      newWorkflowNode("text", `node-${i}`)
    ),
    edges: [],
  };
  expect(() => addWorkflowField(full, "theme", position, ids)).toThrow(
    "40 steps"
  );
  expect(full.nodes).toHaveLength(40);
  const graph: WorkflowGraph = {
    nodes: [
      ...Array.from({ length: 10 }, (_, i) =>
        newWorkflowNode("text", `source-${i}`)
      ),
      ...Array.from({ length: 10 }, (_, i) =>
        newWorkflowNode("combine", `target-${i}`)
      ),
      newWorkflowNode("generate_image", "render"),
    ],
    edges: Array.from({ length: 100 }, (_, i) => ({
      id: `edge-${i}`,
      source: `source-${i % 10}`,
      target: `target-${Math.floor(i / 10)}`,
      port: "text",
    })),
  };
  expect(() => addWorkflowField(graph, "model", position, ids)).toThrow(
    "100 connections"
  );
  expect(
    addWorkflowField(graph, "theme", position, ids).graph.edges
  ).toHaveLength(100);
  expect(graph.nodes).toHaveLength(21);
});
