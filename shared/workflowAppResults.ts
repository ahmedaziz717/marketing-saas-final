import {
  newWorkflowNode,
  workflowGraphProblem,
  type WorkflowGraph,
} from "./creativeWorkflow";

export function workflowAppResultPlan(graph: WorkflowGraph) {
  const outputs = graph.nodes.filter(n => n.type === "output");
  const sources = outputs.length
    ? graph.nodes.filter(n =>
        graph.edges.some(
          e => e.source === n.id && outputs.some(o => o.id === e.target)
        )
      )
    : graph.nodes.filter(n => !graph.edges.some(e => e.source === n.id));
  const needsOutput = !outputs.length;
  const error =
    workflowGraphProblem(graph) ??
    (!graph.nodes.length
      ? "Add at least one step before publishing an App."
      : null) ??
    (outputs.some(o => !graph.edges.some(e => e.target === o.id))
      ? "Connect a result to each Output step before publishing."
      : null) ??
    (needsOutput && graph.nodes.length >= 40
      ? "This workflow has 40 steps. Replace an unused step with an Output step and connect your results."
      : null) ??
    (needsOutput &&
    (sources.length > 12 || graph.edges.length + sources.length > 100)
      ? "Add Output steps and connect the results you want this App to return."
      : null);
  return { sources, needsOutput, error };
}

export function addWorkflowAppResults(graph: WorkflowGraph): WorkflowGraph {
  const plan = workflowAppResultPlan(graph);
  if (plan.error) throw new Error(plan.error);
  if (!plan.needsOutput) return graph;
  let id = "app_results";
  while (graph.nodes.some(n => n.id === id)) id += "_";
  const output = newWorkflowNode(
    "output",
    id,
    Math.min(10000, Math.max(...plan.sources.map(n => n.x)) + 380),
    plan.sources[0].y
  );
  output.title = "App results";
  const used = new Set(graph.edges.map(e => e.id));
  const edges = plan.sources.map((n, i) => {
    let edgeId = `${id}_${i}`;
    while (used.has(edgeId)) edgeId += "_";
    used.add(edgeId);
    return { id: edgeId, source: n.id, target: id, port: "result" };
  });
  return { nodes: [...graph.nodes, output], edges: [...graph.edges, ...edges] };
}
