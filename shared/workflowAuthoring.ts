import { z } from "zod";
import {
  workflowFamilies,
  workflowGraphSchema,
  workflowNodeSchema,
  workflowGraphProblem,
} from "./creativeWorkflow";
import {
  fieldValueProblem,
  fieldChoices,
  isChoiceField,
} from "./workflowInputs";
import {
  workflowModelCompatibility,
  workflowModelFieldProblem,
} from "./workflowModels";

export const authoringScope = z
  .object({ organizationId: z.number().int().positive() })
  .strict();
export const authoringTarget = authoringScope.extend({ id: z.string().uuid() });
export const draftSchema = z
  .object({
    name: z.string().trim().min(1).max(100),
    family: z.enum(workflowFamilies),
    graph: workflowGraphSchema,
  })
  .strict();
export const changeSchema = z.discriminatedUnion("op", [
  z.object({ op: z.literal("rename"), name: draftSchema.shape.name }).strict(),
  z.object({ op: z.literal("put_node"), node: workflowNodeSchema }).strict(),
  z.object({ op: z.literal("remove_node"), id: z.string().max(80) }).strict(),
  z
    .object({
      op: z.literal("put_edge"),
      edge: workflowGraphSchema.shape.edges.element,
    })
    .strict(),
  z.object({ op: z.literal("remove_edge"), id: z.string().max(80) }).strict(),
]);
export const changesSchema = z
  .object({
    summary: z.string().min(1).max(2000),
    changes: z.array(changeSchema).min(1).max(80),
  })
  .strict();
export const proposalInput = authoringScope
  .extend({
    requestId: z.string().uuid(),
    parentProposal: z
      .object({ id: z.string().uuid(), hash: z.string().length(64) })
      .strict()
      .optional(),
    target: z
      .object({ id: z.string().uuid(), revision: z.number().int().positive() })
      .strict()
      .optional(),
    family: z.enum(workflowFamilies).default("create"),
    proposal: changesSchema,
  })
  .strict();
export const chatInput = proposalInput
  .omit({ proposal: true })
  .extend({
    message: z.string().trim().min(1).max(6000),
    history: z
      .array(
        z
          .object({
            role: z.enum(["user", "assistant"]),
            content: z.string().max(6000),
          })
          .strict()
      )
      .max(12)
      .default([]),
  })
  .strict();
export const proposalReference = authoringScope
  .extend({ proposalId: z.string().uuid() })
  .strict();
export const applyInput = proposalReference
  .extend({ requestId: z.string().uuid(), reviewedHash: z.string().length(64) })
  .strict();
export type AuthoringDraft = z.infer<typeof draftSchema>;

/** Only explicit operations change the snapshot. No arbitrary paths, code or execution. */
export function applyAuthoringChanges(
  base: AuthoringDraft,
  proposal: z.infer<typeof changesSchema>
): AuthoringDraft {
  const draft = structuredClone(base);
  for (const change of changesSchema.parse(proposal).changes) {
    switch (change.op) {
      case "rename":
        draft.name = change.name;
        break;
      case "put_node": {
        const index = draft.graph.nodes.findIndex(n => n.id === change.node.id);
        if (index < 0) draft.graph.nodes.push(change.node);
        else draft.graph.nodes[index] = change.node;
        break;
      }
      case "remove_node":
        if (!draft.graph.nodes.some(n => n.id === change.id))
          throw new Error("Step no longer exists.");
        draft.graph.nodes = draft.graph.nodes.filter(n => n.id !== change.id);
        draft.graph.edges = draft.graph.edges.filter(
          e => e.source !== change.id && e.target !== change.id
        );
        break;
      case "put_edge": {
        const index = draft.graph.edges.findIndex(e => e.id === change.edge.id);
        if (index < 0) draft.graph.edges.push(change.edge);
        else draft.graph.edges[index] = change.edge;
        break;
      }
      case "remove_edge":
        if (!draft.graph.edges.some(e => e.id === change.id))
          throw new Error("Connection no longer exists.");
        draft.graph.edges = draft.graph.edges.filter(e => e.id !== change.id);
    }
  }
  return draftSchema.parse(draft);
}

export function authoringProblem(draft: AuthoringDraft): string | null {
  const graph = draft.graph;
  if (graph.nodes.some(n => n.type === "app_output"))
    return "App result steps are runner-managed.";
  const structural = workflowGraphProblem(graph);
  if (structural) return structural;
  for (const node of graph.nodes) {
    const field = node.config.field;
    if (
      field &&
      node.type !== "app_input" &&
      !(node.type === "image" && field.kind === "asset")
    )
      return "Only App inputs can define form fields.";
    if (
      field &&
      isChoiceField(field) &&
      (!fieldChoices(field).length ||
        new Set(fieldChoices(field).map(c => c.id)).size !==
          fieldChoices(field).length)
    )
      return "Form choices must have distinct identifiers and at least one choice.";
    if (
      field?.visibleWhen &&
      (field.visibleWhen.fieldId === node.id ||
        !graph.nodes.some(
          n =>
            n.id === field.visibleWhen!.fieldId &&
            n.config.field &&
            !n.config.field.visibleWhen
        ))
    )
      return "Field visibility must reference an unconditional form field.";
    if (field && (field.defaultValue || field.locked)) {
      const problem = fieldValueProblem(field, field.defaultValue);
      if (problem) return `${node.title}: ${problem}`;
    }
    const model = workflowModelFieldProblem(graph, node);
    if (model) return model;
    if (field?.kind === "model") {
      for (const id of field.allowedModelIds ?? []) {
        for (const edge of graph.edges.filter(e => e.source === node.id)) {
          const target = graph.nodes.find(n => n.id === edge.target)!;
          const problem = workflowModelCompatibility(
            graph,
            target,
            id,
            field.modelSettings?.[id]
          );
          if (problem) return `${node.title}: ${problem}`;
        }
      }
    }
    if (
      node.config.modelId &&
      ["assistant", "generate_image", "generate_video"].includes(node.type)
    ) {
      const problem = workflowModelCompatibility(
        graph,
        node,
        node.config.modelId,
        node.config.modelOptions
      );
      if (problem) return `${node.title}: ${problem}`;
    }
  }
  return null;
}
