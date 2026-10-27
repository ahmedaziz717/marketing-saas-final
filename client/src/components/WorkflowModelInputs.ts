import type { WorkflowGraph, WorkflowNode } from "@shared/creativeWorkflow";
import type { ModelInputSelection } from "@shared/modelInputCompatibility";
import { parseWorkflowMediaSelection } from "@shared/workflowInputs";
import { workflowFieldValue } from "@shared/workflowStudio";

/** UI-only evidence: an unresolved binding is unknown, not one image or an empty input. */
export function workflowTargetInputState(
  graph: WorkflowGraph,
  target: WorkflowNode,
  values?: Record<string, string>
): ModelInputSelection {
  const sum = (items: (number | null)[]): number | null =>
    items.some(n => n === null)
      ? null
      : items.reduce<number>((a, n) => a + n!, 0);
  function sourceCount(
    id: string,
    kind: "image" | "video" | "audio",
    seen = new Set<string>(),
    minimum = false
  ): number | null {
    if (seen.has(id)) return minimum ? 0 : null;
    const node = graph.nodes.find(n => n.id === id);
    if (!node) return minimum ? 0 : null;
    const next = new Set(seen).add(id);
    const field = node.config.field;
    if (field) {
      if (values === undefined && !field.locked) return minimum ? 0 : null;
      const condition = field.visibleWhen;
      const parent =
        condition && graph.nodes.find(n => n.id === condition.fieldId);
      if (condition && values === undefined && !parent?.config.field?.locked)
        return minimum ? 0 : null;
      if (
        condition &&
        (!parent ||
          workflowFieldValue(parent, values ?? {}) !== condition.equals)
      )
        return 0;
      if (field.kind === "product" || field.kind === "asset") {
        if (kind !== "image") return 0;
        const raw = workflowFieldValue(node, values ?? {});
        if (!raw) return 0;
        const selection = parseWorkflowMediaSelection(raw, field.kind);
        if (!selection) return minimum ? 0 : null;
        // Legacy product IDs resolve their hero on the server; do not pretend they are empty.
        return (
          selection.imageKeys?.length ??
          (selection.imageKey ? 1 : minimum ? 0 : null)
        );
      }
      return 0;
    }
    if (node.type === "image")
      return kind === "image" ? (node.config.imageKey ? 1 : 0) : 0;
    if (node.type === "generate_image")
      return kind === "image" ? (minimum ? 0 : null) : 0;
    if (node.type === "generate_video")
      return kind === "video" ? (minimum ? 0 : null) : 0;
    if (
      ["app_input", "app_output", "review", "wait", "output"].includes(
        node.type
      )
    ) {
      const own =
        kind === "image"
          ? (node.config.imageKeys?.length ?? (node.config.imageKey ? 1 : 0))
          : 0;
      return sum([
        own,
        ...graph.edges
          .filter(e => e.target === id)
          .map(e => sourceCount(e.source, kind, next, minimum)),
      ]);
    }
    // Text-producing nodes do not create seed media; unfamiliar dynamic nodes remain unknown.
    if (["text", "assistant"].includes(node.type)) return 0;
    return minimum ? 0 : null;
  }
  const count = (kind: "image" | "video" | "audio", minimum = false) =>
    sum(
      graph.edges
        .filter(e => e.target === target.id && e.port === kind)
        .map(e => sourceCount(e.source, kind, new Set(), minimum))
    );
  const video = count("video");
  const images = count("image");
  const minimumImages = count("image", true) ?? 0;
  return {
    images,
    ...(images === null && minimumImages > 0 ? { minimumImages } : {}),
    hasVideo: target.config.sourceVideoKey
      ? true
      : video === null
        ? null
        : video > 0,
    audio: count("audio"),
  };
}

/** A single App model selector may control several generation steps. Check each independently. */
export function workflowModelInputStates(
  graph: WorkflowGraph,
  selectorId: string,
  values?: Record<string, string>
): ModelInputSelection[] {
  return graph.edges
    .filter(e => e.source === selectorId && e.port === "model")
    .flatMap(e => {
      const target = graph.nodes.find(n => n.id === e.target);
      return target ? [workflowTargetInputState(graph, target, values)] : [];
    });
}
