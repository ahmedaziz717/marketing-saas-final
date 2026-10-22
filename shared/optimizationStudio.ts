import {
  newWorkflowNode,
  workflowSignature,
  workflowGraphSchema,
  type WorkflowGraph,
} from "./creativeWorkflow";
import { analysisQuerySchema, type OptimizerKind } from "./optimization";
import { optimizerLibrary } from "./optimizerLibrary";
import {
  optimizationStudioSchema,
  type OptimizationStudio,
} from "./optimizationStudioSchema";
import { presetRange } from "./reportDates";

export type OptimizationSettings = {
  channel?: "meta_ads" | "google_ads";
  connectionId: string;
  range: { since: string; until: string };
  focus: OptimizerKind[];
  minimumConfidence: number;
  refreshHistory: boolean;
};
export function defaultOptimizationSettings(): OptimizationSettings {
  return {
    connectionId: "",
    range: presetRange("30", Date.now(), "UTC"),
    focus: ["headline", "primary_text"],
    minimumConfidence: 0.5,
    refreshHistory: false,
  };
}
export function optimizationStudioGraph(
  settings: OptimizationSettings,
  studio: OptimizationStudio
): WorkflowGraph {
  if (
    !settings.focus.length ||
    settings.focus.length > 3 ||
    new Set(settings.focus).size !== settings.focus.length
  )
    throw new Error("Choose one to three different areas to improve.");
  const node = (
    type: Parameters<typeof newWorkflowNode>[0],
    id: string,
    x: number
  ) => newWorkflowNode(type, id, x, 120);
  const start = node("start_trigger", "start", 60);
  const classify = node("classify_history", "classify", 440);
  classify.config.connectionId = settings.connectionId || undefined;
  const analysis = node("analyze_history", "evidence", 820);
  analysis.title = "Measure selected evidence";
  analysis.config.connectionId = settings.connectionId || undefined;
  analysis.config.analysis = analysisQuerySchema.parse({
    range: settings.range,
    dimensions: optimizerLibrary[settings.focus[0]].dimensions.slice(0, 4),
    minimumConfidence: settings.minimumConfidence,
  });
  const engines = settings.focus.map((kind, i) => {
    const engine = node("optimize_dimension", `optimize_${kind}`, 1200);
    engine.y += i * 280;
    engine.title = optimizerLibrary[kind].name;
    engine.config.optimizer = {
      kind,
      channel: settings.channel ?? "meta_ads",
      mode: "analyze",
      brief: studio.objective,
    };
    return engine;
  });
  const output = node("output", "results", 1580);
  output.title = "Recommendations & supporting evidence";
  const edge = (source: string, target: string, port: string) => ({
    id: `${source}-${target}`,
    source,
    target,
    port,
  });
  const graph: WorkflowGraph = {
    optimizationStudio: optimizationStudioSchema.parse(studio),
    nodes: [start, classify, analysis, ...engines, output],
    edges: [
      edge("start", "classify", "context"),
      edge("classify", "evidence", "context"),
      ...engines.flatMap(e => [
        edge("evidence", e.id, "evidence"),
        edge(e.id, "results", "result"),
      ]),
    ],
  };
  if (settings.refreshHistory) {
    const history = node("meta_history", "history", 250);
    history.title =
      settings.channel === "google_ads"
        ? "Fetch Google Ads history"
        : history.title;
    history.config.connectionId = settings.connectionId || undefined;
    history.config.incremental = true;
    graph.nodes.splice(1, 0, history);
    graph.edges[0] = edge("start", "history", "context");
    graph.edges.push(edge("history", "classify", "context"));
  }
  return graph;
}
/** Derive the UI from the executable graph. Advanced edits are never silently overwritten. */
export function readOptimizationStudio(graph: WorkflowGraph) {
  if (!graph.optimizationStudio) return null;
  const analysis = graph.nodes.find(
    n => n.id === "evidence" && n.type === "analyze_history"
  );
  if (!analysis?.config.analysis) return null;
  const focus = graph.nodes
    .filter(n => n.type === "optimize_dimension")
    .map(n => n.config.optimizer?.kind)
    .filter((k): k is OptimizerKind => !!k);
  const settings: OptimizationSettings = {
    channel:
      graph.nodes.find(n => n.type === "optimize_dimension")?.config.optimizer
        ?.channel === "google_ads"
        ? "google_ads"
        : undefined,
    connectionId: analysis.config.connectionId ?? "",
    range: analysis.config.analysis.range,
    minimumConfidence: analysis.config.analysis.minimumConfidence,
    focus,
    refreshHistory: graph.nodes.some(n => n.type === "meta_history"),
  };
  try {
    const expected = optimizationStudioGraph(
      settings,
      graph.optimizationStudio
    );
    if (
      graph.nodes.length !== expected.nodes.length ||
      graph.edges.length !== expected.edges.length ||
      workflowSignature(workflowGraphSchema.parse(graph), "results") !==
        workflowSignature(workflowGraphSchema.parse(expected), "results")
    )
      return null;
    return { settings, studio: graph.optimizationStudio };
  } catch {
    return null;
  }
}
