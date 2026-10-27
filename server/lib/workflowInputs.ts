import { resolveWorkflowMedia } from "./workflowMedia";
import { getConnection } from "./channelConnections";
import { getWorkflowConnection } from "./workflowConnections";
import { TRPCError } from "@trpc/server";
import type { WorkflowGraph } from "../../shared/creativeWorkflow";
import {
  parsePerformanceInput,
  fieldValueProblem,
  fieldPrompt,
} from "../../shared/workflowInputs";
import type { LibraryDatabase } from "./assetLibrary";
import {
  applyWorkflowModel,
  workflowModelFieldProblem,
  workflowModelCompatibility,
} from "../../shared/workflowModels";
import { resolveModel } from "./modelCatalog";
import { resolveWorkflowTextModel } from "./workflowModels";

/** Resolve declared inputs server-side, using only workspace-owned catalog facts. */
export async function resolveWorkflowInputs(
  db: LibraryDatabase,
  organizationId: number,
  original: WorkflowGraph
): Promise<WorkflowGraph> {
  const graph = structuredClone(original);
  const values = new Map(
    graph.nodes.map(n => [
      n.id,
      n.config.field?.locked
        ? n.config.field.defaultValue
        : (n.config.fieldValue ?? n.config.field?.defaultValue ?? ""),
    ])
  );
  for (const n of graph.nodes) {
    const f = n.config.field;
    if (!["app_input", "image"].includes(n.type) || !f) continue;
    // A nested optimizer receives typed evidence from its caller, not a standalone form.
    if (
      f.kind === "performance_data" &&
      graph.edges.some(e => e.target === n.id)
    ) {
      delete n.config.performanceRequest;
      continue;
    }
    const condition = f.visibleWhen;
    const hidden =
      condition && values.get(condition.fieldId) !== condition.equals;
    const value = hidden
      ? f.kind === "model"
        ? f.defaultValue
        : ""
      : (values.get(n.id) ?? "");
    if (f.kind === "model") {
      const problem =
        workflowModelFieldProblem(graph, n) || fieldValueProblem(f, value);
      if (problem)
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `${n.title}: ${problem}`,
        });
      const routeId =
        f.modelKind === "text"
          ? await resolveWorkflowTextModel(db, value)
          : (await resolveModel(db, value, f.modelKind!)).id;
      n.config.text = "";
      n.config.imageKey = null;
      delete n.config.imageKeys;
      n.config.fieldValue = value;
      for (const edge of graph.edges.filter(e => e.source === n.id)) {
        const target = graph.nodes.find(t => t.id === edge.target)!;
        const compatibility = workflowModelCompatibility(
          graph,
          target,
          routeId,
          f.modelSettings?.[value]
        );
        if (compatibility)
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: `${n.title}: ${compatibility}`,
          });
        applyWorkflowModel(target, f, value, routeId);
      }
      continue;
    }
    if (!hidden) {
      const problem = fieldValueProblem(f, value);
      if (problem)
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `${n.title}: ${problem}`,
        });
    }
    if (f.kind === "connection") {
      const channel = f.connectionChannel ?? "facebook";
      n.config.text = "";
      n.config.imageKey = null;
      delete n.config.imageKeys;
      delete n.config.connectionId;
      const destinations = graph.edges.filter(e => e.source === n.id);
      for (const edge of destinations) {
        const target = graph.nodes.find(t => t.id === edge.target)!;
        if (
          edge.port !== "destination" ||
          !(channel === "google_ads"
            ? ["google_history", "google_report", "google_inventory"].includes(
                target.type
              )
            : target.type ===
              (channel === "facebook" ? "facebook_post" : "meta_ad"))
        )
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: `${n.title}: connect this field to a matching channel step's account input.`,
          });
        delete target.config.connectionId;
      }
      if (!value) continue;
      const connection = await getWorkflowConnection(
        db,
        organizationId,
        value,
        channel
      );
      if (connection.status !== "connected")
        throw new TRPCError({
          code: "BAD_REQUEST",
          message:
            "Reconnect the selected destination before running this workflow.",
        });
      n.config.connectionId = value;
      for (const edge of destinations)
        graph.nodes.find(t => t.id === edge.target)!.config.connectionId =
          value;
      continue;
    }
    if (f.kind === "performance_data") {
      const selected = parsePerformanceInput(value);
      if (!selected)
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Choose a connected Meta ad account and a valid date range.",
        });
      const connection = await getConnection(
        db,
        organizationId,
        selected.connectionId,
        "meta_ads"
      );
      if (connection.status !== "connected")
        throw new TRPCError({
          code: "BAD_REQUEST",
          message:
            "Reconnect the selected Meta ad account before running this workflow.",
        });
      n.config.performanceRequest = selected;
      n.config.inputType = "data";
      continue;
    }
    n.config.text = "";
    n.config.imageKey = null;
    delete n.config.imageKeys;
    if (!value) {
      // An optional or hidden image contributes no value, not a missing-image error.
      if (n.type === "image") n.type = "app_input";
      continue;
    }
    let text = fieldPrompt(f, value);
    if (f.kind === "asset" || f.kind === "product") {
      const resolved = await resolveWorkflowMedia(db, organizationId, f, value);
      n.config.imageKey = resolved.imageKey;
      n.config.imageKeys = resolved.imageKeys;
      // Legacy image nodes may declare a product field; an App input can emit
      // every selected view while the old image executor is deliberately scalar.
      if (
        n.type === "image" &&
        f.kind === "product" &&
        resolved.imageKeys?.length
      )
        n.type = "app_input";
      text = resolved.text;
    }
    n.config.text = text ? `${n.title}: ${text}` : "";
    for (const e of graph.edges.filter(e => e.source === n.id)) {
      const target = graph.nodes.find(t => t.id === e.target);
      if (target?.type === "meta_ad" && f.kind === "headline")
        target.config.headline = value;
      if (
        target &&
        ["meta_ad", "facebook_post"].includes(target.type) &&
        f.kind === "url"
      )
        target.config.destinationUrl = value;
    }
    // A single selected format controls connected generation settings, not only the prompt.
    if (f.kind === "size" && !f.multiple)
      for (const e of graph.edges.filter(e => e.source === n.id)) {
        const target = graph.nodes.find(t => t.id === e.target);
        if (
          target &&
          ["generate_image", "generate_video"].includes(target.type)
        )
          target.config.ratio = value;
      }
  }
  return graph;
}
