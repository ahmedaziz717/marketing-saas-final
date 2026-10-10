import type { WorkflowGraph } from "./creativeWorkflow";
import { appFieldSchema } from "./workflowInputs";

/** Upgrade the form contract of legacy reusable optimizers without altering pinned processing nodes. */
export function withPerformanceInputs(original: WorkflowGraph): WorkflowGraph {
  return {
    ...original,
    nodes: original.nodes.map(node => {
      if (
        node.type !== "app_input" ||
        node.config.field ||
        node.config.inputType !== "data" ||
        original.edges.some(e => e.target === node.id) ||
        !original.edges.some(
          e =>
            e.source === node.id &&
            original.nodes.some(
              n =>
                n.id === e.target &&
                n.type === "optimize_dimension" &&
                n.config.optimizer?.kind === "weekday_time"
            )
        )
      )
        return node;
      return {
        ...node,
        title: "Performance data",
        config: {
          ...node.config,
          field: appFieldSchema.parse({
            kind: "performance_data",
            required: true,
            help: "Select the Meta ad account and dates to analyze. Fetches fresh daily and hourly performance directly from Meta for this run. Does not start or resume the historical import. When called by another workflow, connected evidence supplies this input.",
          }),
        },
      };
    }),
  };
}
