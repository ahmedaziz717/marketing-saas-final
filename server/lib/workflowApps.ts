import { withPerformanceInputs } from "../../shared/workflowPerformanceInputs";
import { and, eq } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import {
  creativeWorkflows,
  workflowAppVersions,
} from "../../drizzle/workflowSchema";
import {
  type WorkflowGraph,
  newWorkflowNode,
  workflowGraphSchema,
  workflowNodes,
} from "../../shared/creativeWorkflow";
import type { LibraryDatabase, LibraryTransaction } from "./assetLibrary";
import { getConnection } from "./channelConnections";
import { stableHash } from "./policy";

export async function getWorkflowApp(
  db: LibraryDatabase | LibraryTransaction,
  organizationId: number,
  id: string
) {
  const [row] = await db
    .select({ app: workflowAppVersions })
    .from(workflowAppVersions)
    .innerJoin(
      creativeWorkflows,
      and(
        eq(creativeWorkflows.id, workflowAppVersions.workflowId),
        eq(creativeWorkflows.organizationId, organizationId),
        eq(creativeWorkflows.archived, 0)
      )
    )
    .where(
      and(
        eq(workflowAppVersions.id, id),
        eq(workflowAppVersions.organizationId, organizationId)
      )
    );
  if (!row)
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "This App version is unavailable in this workspace.",
    });
  return { ...row.app, graph: withPerformanceInputs(row.app.graph, false) };
}

/** Expand pinned versions on the server. Clients never submit executable App snapshots. */
export async function resolveWorkflowApps(
  db: LibraryDatabase | LibraryTransaction,
  organizationId: number,
  graph: WorkflowGraph,
  trail: string[] = []
): Promise<WorkflowGraph> {
  let result = expandOptimizers(structuredClone(graph));
  for (const call of graph.nodes.filter(n =>
    ["app", "run_workflow"].includes(n.type)
  )) {
    if (!call.config.appVersionId)
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: `Choose an App for “${call.title}”.`,
      });
    const app = await getWorkflowApp(
      db,
      organizationId,
      call.config.appVersionId
    );
    if (trail.includes(app.id) || trail.length >= 4)
      throw new TRPCError({
        code: "BAD_REQUEST",
        message:
          "Apps can nest up to four levels and cannot invoke themselves recursively.",
      });
    const nested = await resolveWorkflowApps(
      db,
      organizationId,
      workflowGraphSchema.parse(app.graph),
      [...trail, app.id]
    );
    const prefix =
      "a" +
      stableHash({ path: trail, call: call.id, version: app.id }).slice(0, 12) +
      "_";
    const mapped = new Map(
      nested.nodes.map(n => [
        n.id,
        prefix + n.id.slice(0, 30) + "_" + stableHash(n.id).slice(0, 8),
      ])
    );
    const incoming = result.edges.filter(e => e.target === call.id);
    const inputs = nested.nodes.filter(
      n => n.type === "app_input" && !nested.edges.some(e => e.target === n.id)
    );
    if (incoming.length && !inputs.length)
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: `“${app.name}” needs an App input step to receive connected content. Edit its workflow and publish a new version.`,
      });
    const outputs = nested.nodes.filter(n => n.type === "output");
    if (!outputs.length)
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: `“${app.name}” needs an Output step.`,
      });
    result.nodes = result.nodes.map(n =>
      n.id === call.id
        ? {
            ...n,
            type: "app_output" as const,
            title: `${app.name} · v${app.version}`.slice(0, 100),
          }
        : n
    );
    result.nodes.push(
      ...nested.nodes.map(n => ({
        ...n,
        id: mapped.get(n.id)!,
        config: {
          ...n.config,
          field: n.config.field
            ? {
                ...n.config.field,
                visibleWhen: n.config.field.visibleWhen
                  ? {
                      ...n.config.field.visibleWhen,
                      fieldId:
                        mapped.get(n.config.field.visibleWhen.fieldId) ??
                        n.config.field.visibleWhen.fieldId,
                    }
                  : undefined,
              }
            : undefined,
          inputMapping: n.config.inputMapping?.map(m => ({
            ...m,
            sourceNodeId: m.sourceNodeId
              ? (mapped.get(m.sourceNodeId) ?? m.sourceNodeId)
              : undefined,
          })),
        },
        type: n.type === "output" ? ("app_output" as const) : n.type,
        x: call.x + n.x,
        y: call.y + n.y + 400,
      }))
    );
    result.edges = result.edges.filter(e => e.target !== call.id);
    result.edges.push(
      ...nested.edges.map(e => ({
        ...e,
        id: prefix + e.id.slice(-60),
        source: mapped.get(e.source)!,
        target: mapped.get(e.target)!,
      }))
    );
    if (
      call.config.inputMapping?.some(
        m =>
          !inputs.some(i => i.id === m.targetNodeId) ||
          (m.sourceNodeId && !incoming.some(e => e.source === m.sourceNodeId))
      )
    )
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "A workflow input mapping refers to an unavailable input.",
      });
    if (
      new Set(call.config.inputMapping?.map(m => m.targetNodeId)).size !==
      (call.config.inputMapping?.length ?? 0)
    )
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "Each child input can be mapped only once.",
      });
    for (const input of inputs) {
      const mapping = call.config.inputMapping?.find(
        m => m.targetNodeId === input.id
      );
      const mappedNode = result.nodes.find(n => n.id === mapped.get(input.id));
      if (mappedNode && mapping) mappedNode.config.inputType = mapping.type;
      for (const edge of incoming.filter(
        e => !mapping?.sourceNodeId || e.source === mapping.sourceNodeId
      ))
        result.edges.push({
          id: `i${stableHash({ prefix, input: input.id, edge }).slice(0, 24)}`,
          source: edge.source,
          target: mapped.get(input.id)!,
          port: "context",
        });
    }
    for (const output of outputs)
      result.edges.push({
        id: `o${stableHash({ prefix, output: output.id }).slice(0, 24)}`,
        source: mapped.get(output.id)!,
        target: call.id,
        port: "result",
      });
    if (result.nodes.length > 160 || result.edges.length > 400)
      throw new TRPCError({
        code: "BAD_REQUEST",
        message:
          "This composed workflow exceeds the limit of 160 executable steps or 400 connections.",
      });
  }
  return result;
}

export async function validateWorkflowConnections(
  db: LibraryDatabase | LibraryTransaction,
  organizationId: number,
  graph: WorkflowGraph
) {
  for (const node of graph.nodes) {
    const channel = workflowNodes[node.type].channel;
    // Account comes from a typed upstream request, validated again at execution.
    if (node.type === "meta_performance") continue;
    if (!channel) continue;
    if (!node.config.connectionId)
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: `Choose a connected account for “${node.title}”.`,
      });
    const connection = await getConnection(
      db,
      organizationId,
      node.config.connectionId,
      channel
    );
    if (connection.status !== "connected")
      throw new TRPCError({
        code: "PRECONDITION_FAILED",
        message: `Reconnect the account for “${node.title}”.`,
      });
  }
}

/** Analyze + Generate expands into the same quoted generation and approval path as other workflows. */
export function expandOptimizers(graph: WorkflowGraph): WorkflowGraph {
  const result = structuredClone(graph);
  for (const node of graph.nodes.filter(
    n =>
      n.type === "optimize_dimension" &&
      n.config.optimizer?.kind !== "weekday_time" &&
      n.config.optimizer?.mode === "analyze_generate"
  )) {
    const suffix = stableHash(node.id).slice(0, 16),
      analysisId = `oe_${suffix}`,
      copyId = `og_${suffix}`;
    if (result.nodes.some(n => [analysisId, copyId].includes(n.id)))
      throw new Error("Reserved optimizer step identifier collision.");
    const analyzer = {
      ...structuredClone(node),
      id: analysisId,
      config: {
        ...node.config,
        optimizer: { ...node.config.optimizer!, mode: "analyze" as const },
      },
    };
    const copy = newWorkflowNode("optimize_copy", copyId, node.x + 320, node.y);
    copy.config.text = `Generate five ${node.config.optimizer!.kind} test alternatives using the supplied generationBrief, evidence and brand rules. Do not invent winning variants or causal lift. ${node.config.optimizer!.brief}`;
    result.nodes = result.nodes.map(n =>
      n.id === node.id
        ? {
            ...n,
            type: "app_output" as const,
            config: { ...n.config, outputType: undefined },
          }
        : n
    );
    result.nodes.push(analyzer, copy);
    result.edges = result.edges.map(e =>
      e.target === node.id ? { ...e, target: analysisId } : e
    );
    result.edges.push(
      {
        id: `oei_${suffix}`,
        source: analysisId,
        target: copyId,
        port: "evidence",
      },
      {
        id: `oer_${suffix}`,
        source: analysisId,
        target: node.id,
        port: "result",
      },
      { id: `ogr_${suffix}`, source: copyId, target: node.id, port: "result" }
    );
  }
  return result;
}
