import {
  newWorkflowNode,
  workflowSignature,
  type WorkflowGraph,
} from "./creativeWorkflow";
import { appFieldSchema } from "./workflowInputs";

/** Display-only comparison: ignore run inputs and JSON object key ordering.
 * Execution/cache signatures remain strict and keep the actual run inputs.
 */
export function workflowDraftSignature(graph: WorkflowGraph, id: string) {
  const normalized = {
    ...graph,
    nodes: graph.nodes.map(n =>
      n.config.field?.kind === "performance_data"
        ? {
            ...n,
            config: {
              ...n.config,
              performanceRequest: undefined,
              fieldValue: undefined,
            },
          }
        : n
    ),
  };
  return JSON.stringify(
    JSON.parse(workflowSignature(normalized, id)),
    (_key, value) =>
      value && typeof value === "object" && !Array.isArray(value)
        ? Object.fromEntries(
            Object.entries(value).sort(([a], [b]) => a.localeCompare(b))
          )
        : value
  );
}

export const performanceField = () =>
  appFieldSchema.parse({
    kind: "performance_data",
    required: true,
    help: "Choose a connected Meta ad account and dates when running. Connect this field to Fetch live Meta performance; the field supplies the selection and the fetch step reads Meta.",
  });

/** Read adapter for legacy drafts. Never mutates stored graphs or pinned versions. */
export function withPerformanceInputs(
  original: WorkflowGraph,
  explicitFetch = true
): WorkflowGraph {
  const graph = structuredClone(original);
  for (const node of graph.nodes.slice()) {
    if (
      node.type !== "app_input" ||
      graph.edges.some(e => e.target === node.id)
    )
      continue;
    const outgoing = graph.edges.filter(e => e.source === node.id);
    const schedulingEdges = outgoing.filter(e =>
      graph.nodes.some(
        n =>
          n.id === e.target &&
          n.type === "optimize_dimension" &&
          n.config.optimizer?.kind === "weekday_time"
      )
    );
    if (
      !node.config.field &&
      node.config.inputType === "data" &&
      schedulingEdges.length
    ) {
      node.title = "Account & date range";
      node.config.field = performanceField();
    }
    // Pinned Apps keep their original executable contract; only draft reads expose the new step.
    if (
      !explicitFetch ||
      node.config.field?.kind !== "performance_data" ||
      !schedulingEdges.length ||
      graph.nodes.length >= 40 ||
      graph.edges.length >= 100
    )
      continue;
    if (node.title === "Performance data") node.title = "Account & date range";
    const unique = (base: string, ids: string[]) => {
      let value = base.slice(0, 70),
        i = 0;
      while (ids.includes(value)) value = `${base.slice(0, 70)}_${++i}`;
      return value;
    };
    const fetch = newWorkflowNode(
      "meta_performance",
      unique(
        `fetch_${node.id}`,
        graph.nodes.map(n => n.id)
      ),
      Math.min(10000, node.x + 340),
      node.y
    );
    fetch.config.metaPerformance = { includeHourly: true };
    const edgeIds = new Set(schedulingEdges.map(e => e.id));
    graph.edges = graph.edges.map(e =>
      edgeIds.has(e.id) ? { ...e, source: fetch.id } : e
    );
    graph.edges.push({
      id: unique(
        `request_${node.id}`,
        graph.edges.map(e => e.id)
      ),
      source: node.id,
      target: fetch.id,
      port: "request",
    });
    // Make room in the familiar left-to-right layout, preserving node IDs and custom titles.
    for (const n of graph.nodes)
      if (n.id !== node.id && n.x > node.x) n.x = Math.min(10000, n.x + 340);
    graph.nodes.push(fetch);
  }
  return graph;
}

/** Uses exactly the same public nodes and ports available in the step library. */
export function schedulingWorkflowTemplate(): WorkflowGraph {
  const input = newWorkflowNode("app_input", "evidence", 40, 80);
  input.title = "Account & date range";
  input.config.inputType = "data";
  input.config.field = performanceField();
  const fetch = newWorkflowNode("meta_performance", "fetch", 380, 80);
  fetch.config.metaPerformance = { includeHourly: true };
  const analysis = newWorkflowNode("optimize_dimension", "engine", 720, 80);
  analysis.title = "Analyze scheduling";
  analysis.config.optimizer = {
    kind: "weekday_time",
    channel: "meta_ads",
    mode: "analyze",
    brief: "",
  };
  const result = newWorkflowNode("output", "result", 1060, 80);
  result.title = "Scheduling report";
  return {
    nodes: [input, fetch, analysis, result],
    edges: [
      { id: "request", source: input.id, target: fetch.id, port: "request" },
      {
        id: "evidence",
        source: fetch.id,
        target: analysis.id,
        port: "evidence",
      },
      { id: "report", source: analysis.id, target: result.id, port: "result" },
    ],
  };
}
