import type { WorkflowGraph, WorkflowValue } from "./creativeWorkflow";
import { appFieldSchema } from "./workflowInputs";

/** Upgrade legacy image inputs in memory. Saving/publishing persists the same field entity. */
export function withWorkflowMediaFields(
  original: WorkflowGraph
): WorkflowGraph {
  return {
    ...original,
    nodes: original.nodes.map(n =>
      n.type === "image" && !n.config.field
        ? {
            ...n,
            config: {
              ...n.config,
              field: appFieldSchema.parse({
                kind: "asset",
                required: true,
                defaultValue: n.config.imageKey ?? "",
              }),
            },
          }
        : n
    ),
  };
}

/** Image-associated content survives image ports and nested App boundaries. */
export function workflowContentText(input: WorkflowValue[]) {
  return Array.from(
    new Set(
      input.flatMap(v =>
        v.type === "text"
          ? [v.text]
          : v.type === "image" && v.context
            ? [v.context]
            : []
      )
    )
  );
}
