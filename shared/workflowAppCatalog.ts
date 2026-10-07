import {
  newWorkflowNode,
  workflowGraphProblem,
  workflowNodes,
  type WorkflowFamily,
  type WorkflowGraph,
  type WorkflowNodeType,
} from "./creativeWorkflow";

/** Built-in Apps use the same executable steps, pricing and approvals as the editor. */
export type BuiltinWorkflowApp = {
  id: string;
  name: string;
  family: WorkflowFamily;
  nodeType?: WorkflowNodeType;
  unavailable?: string;
};
export const builtinWorkflowApps: BuiltinWorkflowApp[] = [
  {
    id: "image-creator",
    name: "Image creator",
    family: "create",
    nodeType: "generate_image",
  },
  {
    id: "product-video",
    name: "Product video",
    family: "create",
    nodeType: "generate_video",
  },
  {
    id: "prompt-writer",
    name: "AI prompt writer",
    family: "create",
    nodeType: "assistant",
  },
  {
    id: "ad-builder",
    name: "Ad builder",
    family: "create",
    nodeType: "meta_ad",
  },
  {
    id: "social-composer",
    name: "Social composer",
    family: "create",
    nodeType: "facebook_post",
  },
  {
    id: "creator-video",
    name: "Creator video",
    family: "create",
    unavailable: "Drafts only; workflow generation is not available yet",
  },
  {
    id: "campaign-planner",
    name: "Campaign planner",
    family: "create",
    unavailable: "Available in Create; workflow execution is not available yet",
  },
  {
    id: "email-builder",
    name: "Email builder",
    family: "create",
    unavailable: "Coming soon",
  },
  {
    id: "landing-pages",
    name: "Landing pages",
    family: "create",
    unavailable: "Coming soon",
  },
  {
    id: "blog",
    name: "Blog & insights",
    family: "create",
    unavailable: "Coming soon",
  },
  {
    id: "publication-delivery",
    name: "Publish or schedule content",
    family: "activate",
    nodeType: "deliver_publication",
  },
  {
    id: "meta-activation",
    name: "Activate an existing Meta ad",
    family: "activate",
    nodeType: "meta_activate",
  },
  {
    id: "meta-report",
    name: "Meta Ads report",
    family: "measure",
    nodeType: "meta_report",
  },
  {
    id: "facebook-report",
    name: "Facebook performance report",
    family: "measure",
    nodeType: "facebook_report",
  },
  {
    id: "compare",
    name: "Compare reporting periods",
    family: "measure",
    nodeType: "compare_metrics",
  },
  {
    id: "objective",
    name: "Evaluate an objective",
    family: "optimize",
    nodeType: "optimize_metric",
  },
  {
    id: "creative-direction",
    name: "Evidence → creative direction",
    family: "optimize",
    nodeType: "optimize_copy",
  },
];

/** Switching Apps is one undoable edit. Preserve only compatible connections. */
export function selectWorkflowApp(
  graph: WorkflowGraph,
  nodeId: string,
  selection: string
) {
  const current = graph.nodes.find(n => n.id === nodeId);
  if (!current) throw new Error("Choose a workflow step first.");
  const builtin = builtinWorkflowApps.find(
    a => selection === `builtin:${a.id}`
  );
  if (selection.startsWith("builtin:") && !builtin?.nodeType)
    throw new Error(builtin?.unavailable ?? "This App is unavailable.");
  const node = newWorkflowNode(
    builtin?.nodeType ?? "app",
    current.id,
    current.x,
    current.y
  );
  node.title = builtin?.name ?? workflowNodes.app.name;
  if (builtin) node.config.builtinAppId = builtin.id;
  else if (selection) node.config.appVersionId = selection;
  const next: WorkflowGraph = {
    nodes: graph.nodes.map(n => (n.id === nodeId ? node : n)),
    edges: [],
  };
  let removed = 0;
  for (const original of graph.edges) {
    const edge = { ...original };
    if (edge.target === nodeId) {
      const source = next.nodes.find(n => n.id === edge.source)!;
      const output = workflowNodes[source.type].output;
      const ports = workflowNodes[node.type].inputs;
      const port =
        ports.find(
          p =>
            p.id === edge.port &&
            (p.type === output || p.type === "any" || output === "any")
        ) ??
        ports.find(p => p.type === output) ??
        ports.find(p => p.type === "any");
      if (!port) {
        removed++;
        continue;
      }
      edge.port = port.id;
    }
    if (workflowGraphProblem({ ...next, edges: [...next.edges, edge] })) {
      removed++;
      continue;
    }
    next.edges.push(edge);
  }
  return { graph: next, removed };
}
