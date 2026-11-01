import type {
  WorkflowGraph,
  WorkflowSteps,
  WorkflowValue,
} from "./creativeWorkflow";

/** Show completed declared outputs while another branch is waiting for approval. */
export function availableWorkflowResults(run?: {
  graph: WorkflowGraph;
  steps: WorkflowSteps;
}): WorkflowValue[] {
  if (!run) return [];
  const values = run.graph.nodes
    .filter(n => n.type === "output")
    .flatMap(
      n =>
        run.steps[n.id]?.outputs ??
        run.graph.edges
          .filter(e => e.target === n.id)
          .flatMap(e =>
            ["completed", "reused"].includes(run.steps[e.source]?.status)
              ? (run.steps[e.source]?.outputs ?? [])
              : []
          )
    );
  const contexts = new Set(
    values.flatMap(v => (v.type === "image" && v.context ? [v.context] : []))
  );
  const seen = new Set<string>();
  return values.filter(v => {
    if (v.type === "text" && contexts.has(v.text)) return false;
    const key = JSON.stringify(v);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
