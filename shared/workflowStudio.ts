import type { WorkflowGraph, WorkflowNode } from "./creativeWorkflow";

export const workflowStudioSections = [
  { id: "setup", title: "Setup", subtitle: "Context & destination" },
  { id: "direction", title: "Direction", subtitle: "Audience & style" },
  { id: "content", title: "Content", subtitle: "Brief, copy & assets" },
] as const;
export type WorkflowStudioSection =
  (typeof workflowStudioSections)[number]["id"];

export function workflowAppFields(graph: WorkflowGraph) {
  return graph.nodes.filter(n =>
    ["text", "image", "app_input"].includes(n.type)
  );
}

/** Old published versions receive sensible groups without changing their snapshot. */
export function workflowFieldPlacement(node: WorkflowNode) {
  const kind =
    node.config.field?.kind ?? (node.type === "image" ? "asset" : "text");
  const section: WorkflowStudioSection =
    node.config.field?.studio?.section ??
    ([
      "performance_data",
      "product",
      "channel",
      "connection",
      "url",
      "number",
      "model",
    ].includes(kind)
      ? "setup"
      : [
            "theme",
            "art_style",
            "style_influence",
            "audience",
            "voice",
            "language",
            "choice",
          ].includes(kind)
        ? "direction"
        : "content");
  const category =
    node.config.field?.studio?.category?.trim() ||
    ({
      performance_data: "Account & dates",
      connection: "Destination",
      product: "Product",
      channel: "Destination",
      url: "Destination",
      number: "Settings",
      model: "Models",
      theme: "Theme",
      art_style: "Visual style",
      style_influence: "Visual style",
      audience: "Audience",
      voice: "Voice",
      language: "Language",
      asset: "Assets",
      size: "Format",
      text: "Brief",
      headline: "Copy",
      subheadline: "Copy",
      description: "Copy",
      caption: "Copy",
      cta: "Copy",
      choice: node.title,
    }[kind] ??
      node.title);
  return {
    section,
    category,
    page: `${section}/${category.toLowerCase()}`,
  };
}

export function workflowFieldValue(
  node: WorkflowNode,
  values: Record<string, string>
) {
  const field = node.config.field;
  return field?.locked
    ? field.defaultValue
    : (values[node.id] ??
        field?.defaultValue ??
        (node.type === "image" ? node.config.imageKey : node.config.text) ??
        "");
}

export function workflowVisibleFields(
  graph: WorkflowGraph,
  values: Record<string, string>
) {
  const fields = workflowAppFields(graph);
  return fields.filter(n => {
    const condition = n.config.field?.visibleWhen;
    if (!condition) return true;
    const parent = fields.find(x => x.id === condition.fieldId);
    return !!parent && workflowFieldValue(parent, values) === condition.equals;
  });
}

export function workflowStudioGroups(
  graph: WorkflowGraph,
  values: Record<string, string>
) {
  const fields = workflowVisibleFields(graph, values);
  return workflowStudioSections
    .map(section => {
      const categories: {
        id: string;
        title: string;
        fields: WorkflowNode[];
      }[] = [];
      for (const node of fields) {
        const placement = workflowFieldPlacement(node);
        if (placement.section !== section.id) continue;
        let category = categories.find(c => c.id === placement.page);
        if (!category) {
          category = {
            id: placement.page,
            title: placement.category,
            fields: [],
          };
          categories.push(category);
        }
        category.fields.push(node);
      }
      return { ...section, categories };
    })
    .filter(section => section.categories.length);
}
