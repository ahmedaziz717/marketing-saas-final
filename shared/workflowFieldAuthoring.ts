import { newWorkflowNode, type WorkflowGraph } from "./creativeWorkflow";
import {
  appFieldSchema,
  inputLabels,
  systemInputChoices,
  type AppField,
} from "./workflowInputs";
import { workflowModelKind } from "./workflowModelCatalog";
import { workflowModelFieldDefaults } from "./workflowModels";
import { performanceField } from "./workflowPerformanceInputs";

/** The canvas and App form author the same field contract and model binding. */
export function addWorkflowField(
  graph: WorkflowGraph,
  kind: AppField["kind"],
  position: { x: number; y: number },
  ids: { node: string; edge: string }
) {
  if (graph.nodes.length >= 40)
    throw new Error("Keep each workflow to 40 steps or fewer.");
  const target =
    kind === "model"
      ? graph.nodes.find(
          node =>
            workflowModelKind(node.type) &&
            !graph.edges.some(e => e.target === node.id && e.port === "model")
        )
      : undefined;
  if (target && graph.edges.length >= 100)
    throw new Error("Keep each workflow to 100 connections or fewer.");
  const node = newWorkflowNode("app_input", ids.node, position.x, position.y);
  node.title = inputLabels[kind];
  node.config.field =
    kind === "performance_data"
      ? performanceField()
      : appFieldSchema.parse({
          kind,
          source: systemInputChoices(kind).length ? "system" : "custom",
          ...(kind === "model" ? workflowModelFieldDefaults(target) : {}),
        });
  if (kind === "performance_data") node.config.inputType = "data";
  return {
    node,
    graph: {
      ...graph,
      nodes: [...graph.nodes, node],
      edges: target
        ? [
            ...graph.edges,
            { id: ids.edge, source: node.id, target: target.id, port: "model" },
          ]
        : graph.edges,
    },
  };
}
