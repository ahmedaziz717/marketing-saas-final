import { and, eq } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import {
  creativeWorkflows,
  workflowAppVersions,
} from "../../drizzle/workflowSchema";
import {
  type WorkflowGraph,
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
  return row.app;
}

/** Expand pinned versions on the server. Clients never submit executable App snapshots. */
export async function resolveWorkflowApps(
  db: LibraryDatabase | LibraryTransaction,
  organizationId: number,
  graph: WorkflowGraph,
  trail: string[] = []
): Promise<WorkflowGraph> {
  let result = structuredClone(graph);
  for (const call of graph.nodes.filter(n => n.type === "app")) {
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
    for (const input of inputs)
      for (const edge of incoming)
        result.edges.push({
          id: `i${stableHash({ prefix, input: input.id, edge }).slice(0, 24)}`,
          source: edge.source,
          target: mapped.get(input.id)!,
          port: "context",
        });
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
