import type { WorkflowGraph, WorkflowNode } from "./creativeWorkflow";
import {
  generationModel,
  modelDefaults,
  modelOptionsProblem,
  referenceCapacity,
  requiresVideo,
  type ModelOptions,
} from "./modelCatalog";
import {
  defaultWorkflowModel,
  workflowModel,
  workflowModelKind,
} from "./workflowModelCatalog";
import { fieldValueProblem, type AppField } from "./workflowInputs";

export function workflowModelFieldProblem(
  graph: WorkflowGraph,
  node: WorkflowNode
) {
  const field = node.config.field;
  if (field?.kind !== "model") return null;
  const problem = fieldValueProblem(field, field.defaultValue);
  if (problem) return `${node.title}: ${problem}`;
  const edges = graph.edges.filter(e => e.source === node.id);
  if (!edges.length) return `${node.title}: choose a generation step.`;
  if (graph.edges.some(e => e.target === node.id))
    return "Model selectors use the App form, not incoming content.";
  for (const edge of edges) {
    const target = graph.nodes.find(n => n.id === edge.target);
    if (
      !target ||
      edge.port !== "model" ||
      workflowModelKind(target.type) !== field.modelKind
    )
      return `${node.title}: connect to a matching generation step's Model input.`;
  }
  return null;
}

/** Check every offered choice against the step's native input requirements. */
export function workflowModelCompatibility(
  graph: WorkflowGraph,
  target: WorkflowNode,
  id: string,
  options?: ModelOptions
) {
  const model = workflowModel(id);
  if (!model || model.kind !== workflowModelKind(target.type))
    return "Choose a compatible model.";
  if (model.kind === "text") return null;
  const media = generationModel(id)!;
  const problem = modelOptionsProblem(media, options ?? modelDefaults(media));
  if (problem) return `${media.name}: ${problem}`;
  const images = graph.edges.filter(
    e => e.target === target.id && e.port === "image"
  ).length;
  const video =
    !!target.config.sourceVideoKey ||
    graph.edges.some(e => e.target === target.id && e.port === "video");
  if (images > referenceCapacity(media))
    return `${media.name} accepts up to ${referenceCapacity(media)} image references.`;
  if (
    !images &&
    (media.inputSchema.required ?? []).some(k =>
      ["image_url", "image_urls", "first_frame_url"].includes(k)
    )
  )
    return `${media.name} needs a connected reference image.`;
  if (requiresVideo(media) && !video)
    return `${media.name} needs a source video.`;
  if (
    video &&
    !media.inputSchema.properties.video_url &&
    !media.inputSchema.properties.video_urls
  )
    return `${media.name} does not accept source video.`;
  return null;
}

export function currentWorkflowModel(node: WorkflowNode) {
  return (
    node.config.modelId ||
    defaultWorkflowModel(workflowModelKind(node.type) ?? "image")
  );
}

/** One initial choice; preserve the author's settings for that choice. */
export function workflowModelFieldDefaults(
  node: WorkflowNode
): Partial<AppField> {
  const id = currentWorkflowModel(node);
  const media = generationModel(id);
  const legacyOptions = media
    ? (Object.fromEntries(
        [
          ["duration", node.config.duration],
          ["resolution", node.config.resolution],
          ["aspect_ratio", node.config.ratio],
        ].filter(
          ([key, value]) =>
            value != null && !!media.inputSchema.properties[String(key)]
        )
      ) as ModelOptions)
    : {};
  return {
    kind: "model",
    modelKind: workflowModelKind(node.type),
    required: true,
    source: "curated",
    multiple: false,
    maxSelections: 1,
    ai: false,
    allowedModelIds: [id],
    defaultValue: id,
    modelSettings: media
      ? {
          [id]: {
            ...modelDefaults(media),
            ...legacyOptions,
            ...node.config.modelOptions,
          },
        }
      : {},
  };
}

export function applyWorkflowModel(
  target: WorkflowNode,
  field: AppField,
  selected: string,
  routeId = selected
) {
  const model = generationModel(routeId);
  target.config.modelId = routeId;
  if (!model) {
    delete target.config.modelOptions;
    return;
  }
  const options = field.modelSettings?.[selected] ?? modelDefaults(model);
  target.config.modelOptions = { ...options };
  if (options.duration != null)
    target.config.duration = Number(options.duration);
  if (options.resolution != null)
    target.config.resolution = String(options.resolution);
  if (options.aspect_ratio != null)
    target.config.ratio = String(options.aspect_ratio);
}
