import { resolveWorkflowInputs } from "./workflowInputs";
import {
  generationModel,
  modelVideoMode,
  requiresVideo,
} from "../../shared/modelCatalog";
import { and, desc, eq } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import {
  creativeWorkflows,
  creativeWorkflowRuns,
} from "../../drizzle/workflowSchema";
import { providerRates } from "../../drizzle/platformSchema";
import { defaultVideoSetup, type VideoSetup } from "../../shared/videoCreation";
import {
  isGenerationNode,
  workflowAncestors,
  workflowNodes,
  workflowOrder,
  workflowRunProblem,
  workflowSignature,
  type WorkflowGraph,
  type WorkflowNode,
  type WorkflowSteps,
  type WorkflowValue,
} from "../../shared/creativeWorkflow";
import {
  libraryDatabase,
  readLibraryAsset,
  type LibraryDatabase,
  type LibraryTransaction,
} from "./assetLibrary";
import { resolveVideoReferences, validateVideoReferences } from "./videoJobs";
import { videoQuote, videoRate } from "./videoPricing";
import { REQUIRED_IMAGE_MODEL_ID, REQUIRED_TEXT_MODEL_ID } from "./models";
import { imageModelQuote } from "./modelCatalog";
import { workflowImageSize } from "../../shared/imageActionEstimate";
import { effectiveRate } from "./creditPricing";
import {
  resolveWorkflowApps,
  validateWorkflowConnections,
} from "./workflowApps";
import { estimatedActionCredits } from "../../shared/aiCredits";

export type CreativeWorkflowRun = typeof creativeWorkflowRuns.$inferSelect;
export function publicWorkflowRun(run: CreativeWorkflowRun) {
  return {
    id: run.id,
    workflowId: run.workflowId,
    appVersionId: run.appVersionId,
    graph: run.graph,
    steps: run.steps,
    status: run.status,
    stopRequested: !!run.stopRequested,
    error: run.error,
    creditsByNode: run.creditsByNode,
    createdAtMs: run.createdAtMs,
    updatedAtMs: run.updatedAtMs,
  };
}
export async function getWorkflow(
  db: LibraryDatabase | LibraryTransaction,
  organizationId: number,
  id: string
) {
  const [row] = await db
    .select()
    .from(creativeWorkflows)
    .where(
      and(
        eq(creativeWorkflows.id, id),
        eq(creativeWorkflows.organizationId, organizationId),
        eq(creativeWorkflows.archived, 0)
      )
    );
  if (!row)
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "Workflow not found in this workspace.",
    });
  return row;
}
export function workflowVideoSetup(
  node: WorkflowNode,
  text: string,
  imageKeys: string[],
  sourceVideoKey?: string | null
): VideoSetup {
  return {
    ...defaultVideoSetup,
    modelId: node.config.modelId,
    modelOptions: node.config.modelOptions,
    mode: modelVideoMode(generationModel(node.config.modelId || "")),
    sourceVideoKey: sourceVideoKey ?? node.config.sourceVideoKey ?? null,
    sound: Boolean(
      node.config.modelOptions?.generate_audio ??
        node.config.modelOptions?.sound ??
        true
    ),
    title: node.title,
    prompt: text,
    imageKeys,
    duration: node.config.duration,
    resolution: node.config.resolution,
    aspectRatio:
      !node.config.modelId && node.config.ratio === "4:5"
        ? "9:16"
        : node.config.ratio,
    direction: node.config.direction,
  };
}
export async function workflowNodeCredits(
  db: LibraryDatabase,
  node: WorkflowNode,
  organizationId?: number,
  input: WorkflowValue[] = []
) {
  if (node.type === "generate_video") {
    const source = input.find(v => v.type === "video");
    const key =
      source && source.type === "video"
        ? source.key
        : node.config.sourceVideoKey;
    const setup = workflowVideoSetup(node, "Workflow prompt", [], key);
    const refs =
      key && organizationId
        ? await resolveVideoReferences(db, organizationId, {
            ...defaultVideoSetup,
            mode: "edit",
            prompt: "Workflow source",
            sourceVideoKey: key,
          })
        : [];
    const model = generationModel(node.config.modelId || "");
    if (!key && model && requiresVideo(model)) {
      setup.sourceVideoKey = "asset:1";
      refs.push({
        key: "asset:1",
        storageKey: "",
        fingerprint: "",
        name: "Estimated upstream video",
        mimeType: "video/mp4",
        durationSeconds: node.config.duration,
        width: 1280,
        height: 720,
      });
    }
    return videoQuote(setup, refs, await videoRate(db, setup)).credits;
  }
  if (!isGenerationNode(node.type)) return 0;
  if (node.type === "generate_image")
    return (
      await imageModelQuote(
        db,
        node.config.modelId,
        node.config.modelOptions,
        workflowImageSize(node.config.ratio)
      )
    ).credits;
  const kind = "text",
    model = REQUIRED_TEXT_MODEL_ID;
  return estimatedActionCredits(await effectiveRate(db, "openai", model, kind));
}
export async function workflowImageReferences(
  db: LibraryDatabase,
  organizationId: number,
  keys: string[]
) {
  return resolveVideoReferences(db, organizationId, {
    ...defaultVideoSetup,
    prompt: "Workflow image reference",
    imageKeys: Array.from(new Set(keys)),
    mode: "create",
  });
}
export async function validateWorkflowValues(
  db: LibraryDatabase,
  organizationId: number,
  values: WorkflowValue[]
) {
  for (const value of values) {
    if (value.type !== "image" && value.type !== "video") continue;
    const current =
      value.type === "image"
        ? (await workflowImageReferences(db, organizationId, [value.key]))[0]
        : await readLibraryAsset(db, organizationId, value.key);
    if (
      current.fingerprint !== value.fingerprint ||
      ("state" in current &&
        ["rejected", "changes_requested"].includes(current.state))
    )
      throw new TRPCError({
        code: "CONFLICT",
        message:
          "An input changed or has review feedback. Select it again and rerun its step.",
      });
  }
}
export async function prepareWorkflowRun(
  db: LibraryDatabase,
  organizationId: number,
  workflowId: string,
  graph: WorkflowGraph,
  target?: string
) {
  graph = await resolveWorkflowApps(db, organizationId, graph);
  graph = await resolveWorkflowInputs(db, organizationId, graph);
  if (target && !graph.nodes.some(n => n.id === target))
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Choose a step in this workflow.",
    });
  const selected = target
    ? workflowAncestors(graph, target)
    : new Set(graph.nodes.map(n => n.id));
  const problem = workflowRunProblem(graph, selected);
  if (problem) throw new TRPCError({ code: "BAD_REQUEST", message: problem });
  await validateWorkflowConnections(db, organizationId, {
    ...graph,
    nodes: graph.nodes.filter(n => selected.has(n.id)),
  });
  // Capture source fingerprints before considering cached upstream results.
  const references: Awaited<ReturnType<typeof workflowImageReferences>> = [];
  for (const node of graph.nodes.filter(
    n => selected.has(n.id) && n.type === "image"
  )) {
    references.push(
      ...(await workflowImageReferences(db, organizationId, [
        node.config.imageKey!,
      ]))
    );
  }
  for (const node of graph.nodes.filter(
    n => selected.has(n.id) && n.config.sourceVideoKey
  )) {
    references.push(
      ...(await resolveVideoReferences(db, organizationId, {
        ...defaultVideoSetup,
        mode: "edit",
        prompt: "Workflow source",
        sourceVideoKey: node.config.sourceVideoKey!,
      }))
    );
  }
  await validateVideoReferences(db, { organizationId, references });
  const previous = target
    ? await db
        .select()
        .from(creativeWorkflowRuns)
        .where(
          and(
            eq(creativeWorkflowRuns.workflowId, workflowId),
            eq(creativeWorkflowRuns.organizationId, organizationId)
          )
        )
        .orderBy(desc(creativeWorkflowRuns.createdAtMs))
        .limit(30)
    : [];
  const steps: WorkflowSteps = {},
    creditsByNode: Record<string, number> = {};
  for (const id of workflowOrder(graph).filter(id => selected.has(id))) {
    const node = graph.nodes.find(n => n.id === id)!;
    if (target && id !== target && isGenerationNode(node.type)) {
      const ancestors = workflowAncestors(graph, id);
      if (
        graph.nodes.some(
          n =>
            ancestors.has(n.id) &&
            [
              "meta_report",
              "facebook_report",
              "review",
              "wait",
              "facebook_post",
              "meta_ad",
              "deliver_publication",
              "meta_activate",
            ].includes(n.type)
        )
      )
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: `Use Run all so “${node.title}” uses fresh evidence and approvals.`,
        });
      const sourceKeys = graph.nodes
        .filter(n => ancestors.has(n.id))
        .flatMap(n =>
          [
            n.type === "image" ? n.config.imageKey : null,
            n.config.sourceVideoKey,
          ].filter(Boolean)
        );
      const prior = previous.find(
        run =>
          ["completed", "reused"].includes(run.steps[id]?.status) &&
          workflowSignature(run.graph, id) === workflowSignature(graph, id) &&
          sourceKeys.every(
            key =>
              run.references.find(r => r.key === key)?.fingerprint ===
              references.find(r => r.key === key)?.fingerprint
          )
      );
      const outputs = prior?.steps[id]?.outputs;
      if (!outputs?.length)
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: `Run “${node.title}” first, or use Run all to generate its inputs.`,
        });
      await validateWorkflowValues(db, organizationId, outputs);
      steps[id] = { status: "reused", outputs };
      creditsByNode[id] = 0;
    } else {
      steps[id] = { status: "pending" };
      creditsByNode[id] = await workflowNodeCredits(
        db,
        node,
        organizationId,
        workflowInputs(graph, steps, node)
      );
    }
  }
  return {
    graph,
    steps,
    creditsByNode,
    references,
    credits: Object.values(creditsByNode).reduce((a, b) => a + b, 0),
  };
}
export function workflowInputs(
  graph: WorkflowGraph,
  steps: WorkflowSteps,
  node: WorkflowNode,
  port?: string
) {
  return graph.edges
    .filter(e => e.target === node.id && (!port || e.port === port))
    .flatMap(e => {
      const type = workflowNodes[node.type].inputs.find(
        p => p.id === e.port
      )?.type;
      return (steps[e.source]?.outputs ?? []).filter(
        value => type === "any" || value.type === type
      );
    });
}
export { libraryDatabase };
