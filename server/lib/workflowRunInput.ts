import { TRPCError } from "@trpc/server";
import type { WorkflowGraph } from "../../shared/creativeWorkflow";
import {
  workflowRunOverridesSchema,
  type WorkflowRunInput,
} from "../../shared/workflowRunInput";
import type { LibraryDatabase, LibraryTransaction } from "./assetLibrary";
import { getWorkflow } from "./creativeWorkflows";
import { getWorkflowApp } from "./workflowApps";

function invalid(message: string): never {
  throw new TRPCError({ code: "BAD_REQUEST", message });
}

/** Runtime input values only. This never edits the saved workflow or App version.
 * Typed visibility/default/media/model resolution remains in resolveWorkflowInputs;
 * nested parameter mapping remains in resolveWorkflowApps. */
export function applyWorkflowRunInputs(
  graph: WorkflowGraph,
  raw: unknown = []
) {
  const inputs = workflowRunOverridesSchema.parse(raw);
  const result = structuredClone(graph);
  for (const field of inputs) {
    const node = result.nodes.find(n => n.id === field.id);
    if (!node || !["text", "image", "app_input"].includes(node.type))
      invalid("Only declared App inputs can be changed.");
    if (node.config.field) {
      if (
        field.text !== undefined ||
        (field.imageKey !== undefined && node.type !== "image")
      )
        invalid("Use the declared field value for this input.");
      const value = field.value ?? field.imageKey;
      if (node.config.field.locked) {
        if (
          value !== undefined &&
          value !== (node.config.field.defaultValue ?? "")
        )
          invalid(
            `The input "${node.title}" is locked to its authored default.`
          );
      } else if (value !== undefined) node.config.fieldValue = value;
      continue;
    }
    if (node.type === "image") {
      if (field.value !== undefined || field.text !== undefined)
        invalid("Use an image key for this legacy image input.");
      if (field.imageKey !== undefined) node.config.imageKey = field.imageKey;
    } else {
      if (field.value !== undefined || field.imageKey !== undefined)
        invalid("Use text for this legacy text input.");
      if (field.text !== undefined) node.config.text = field.text;
    }
  }
  return result;
}

export async function resolveRunnableWorkflow(
  db: LibraryDatabase | LibraryTransaction,
  input: WorkflowRunInput
) {
  const workflow = await getWorkflow(db, input.organizationId, input.id);
  const app = input.appVersionId
    ? await getWorkflowApp(db, input.organizationId, input.appVersionId)
    : null;
  if (app && app.workflowId !== workflow.id)
    invalid("Choose the matching workflow for this App.");
  return {
    ...workflow,
    graph: applyWorkflowRunInputs(
      app?.graph ?? workflow.graph,
      input.inputs ?? []
    ),
    // Legacy App runners pass the current draft revision while pinning an older
    // immutable App. Preserve that contract; expose authored identity separately.
    revision: app ? input.revision : workflow.revision,
    sourceRevision: app?.workflowRevision ?? workflow.revision,
  };
}
