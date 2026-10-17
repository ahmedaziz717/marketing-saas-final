import { and, eq } from "drizzle-orm";
import {
  creativeWorkflows,
  workflowAppVersions,
} from "../../drizzle/workflowSchema";
import {
  newWorkflowNode,
  workflowGraphProblem,
  type WorkflowGraph,
  type WorkflowNodeType,
} from "../../shared/creativeWorkflow";
import { optimizerKinds, type OptimizerKind } from "../../shared/optimization";
import { optimizerLibrary } from "../../shared/optimizerLibrary";
import { stableHash } from "./policy";
import { withOrganizationTransaction } from "./activity";
import { getConnection } from "./channelConnections";
import { requireOrganizationRole } from "./access";
import { requireOptimization } from "./optimizationFlags";
import type { LibraryDatabase } from "./assetLibrary";
const TEMPLATE_VERSION = 1;
function uuid(key: unknown) {
  const h = stableHash(key);
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-a${h.slice(17, 20)}-${h.slice(20, 32)}`;
}
export function optimizerTemplate(kind: OptimizerKind): WorkflowGraph {
  const input = newWorkflowNode("app_input", "evidence", 0, 0);
  input.config.inputType = "data";
  const engine = newWorkflowNode("optimize_dimension", "engine", 330, 0);
  engine.config.optimizer = {
    kind,
    channel: "meta_ads",
    mode: "analyze",
    brief: "",
  };
  const output = newWorkflowNode("output", "result", 660, 0);
  return {
    nodes: [input, engine, output],
    edges: [
      { id: "input", source: input.id, target: engine.id, port: "evidence" },
      { id: "out", source: engine.id, target: output.id, port: "result" },
    ],
  };
}
export const optimizationAppDefinitions = [
  {
    id: "headline_lab",
    name: "Headline Lab",
    kinds: ["headline", "primary_text", "description"] as OptimizerKind[],
    description:
      "Analyze messaging evidence and design copy tests. Enable Analyze + Generate in your workflow for quoted AI candidates.",
  },
  {
    id: "creative_intelligence",
    name: "Creative Intelligence",
    kinds: [
      "creative_direction",
      "theme",
      "art_style",
      "colors",
      "logo",
      "composition",
    ] as OptimizerKind[],
    description:
      "Understand creative dimensions, reviewed classifications, attribution limits and potential tests.",
  },
  {
    id: "ad_refresh",
    name: "Ad Refresh",
    kinds: [
      "headline",
      "creative_direction",
      "offer",
      "cta",
    ] as OptimizerKind[],
    description:
      "Build an evidence-backed refresh brief before approving production or advertising changes.",
  },
  {
    id: "scheduling_intelligence",
    name: "Scheduling Intelligence",
    kinds: ["weekday_time"] as OptimizerKind[],
    description:
      "Explore account-local weekday and hourly delivery evidence. Missing conversions remain unknown.",
  },
  {
    id: "campaign_optimizer",
    name: "Campaign Optimizer",
    kinds: [
      "audience",
      "budget_bidding",
      "placement",
      "offer",
    ] as OptimizerKind[],
    description:
      "Review campaign test hypotheses with explicit human approval for any spending change.",
  },
];
export function intelligenceAppGraph(
  connectionId: string,
  kinds: OptimizerKind[],
  versions: Record<string, string>,
  grain: "daily" | "placement" | "hourly" = "daily"
): WorkflowGraph {
  const types: [string, WorkflowNodeType][] = [
    ["start", "start_trigger"],
    ["history", "meta_history"],
    ["classify", "classify_history"],
    ["analysis", "analyze_history"],
  ];
  const nodes = types.map(([id, type], i) =>
    newWorkflowNode(type, id, i * 330, 0)
  );
  nodes[0].config.trigger = {
    kind: "manual",
    weekday: 1,
    hour: 9,
    timezone: "UTC",
    event: "history_synced",
  };
  for (const n of nodes.slice(1)) n.config.connectionId = connectionId;
  nodes[3].config.datePreset = "this_year";
  nodes[3].config.analysis = {
    range: {
      since: "2026-01-01",
      until: new Date().toISOString().slice(0, 10),
    },
    grain,
    dimensions:
      grain === "hourly"
        ? ["weekday", "hour"]
        : grain === "placement"
          ? ["placement"]
          : ["messaging_style"],
    filters: [],
    minimumConfidence: 0,
  };
  const edges: WorkflowGraph["edges"] = [
    { id: "s-h", source: "start", target: "history", port: "context" },
    { id: "h-c", source: "history", target: "classify", port: "context" },
    { id: "c-a", source: "classify", target: "analysis", port: "context" },
  ];
  for (const [i, kind] of Array.from(kinds.entries())) {
    const node = newWorkflowNode("run_workflow", `opt_${kind}`, 1320, i * 240);
    node.title = optimizerLibrary[kind].name;
    node.config.appVersionId = versions[kind];
    node.config.inputMapping = [{ targetNodeId: "evidence", type: "data" }];
    node.config.outputType = "data";
    nodes.push(node);
    edges.push({
      id: `a-${kind}`,
      source: "analysis",
      target: node.id,
      port: "context",
    });
  }
  nodes.push(newWorkflowNode("output", "result", 1700, 0));
  for (const kind of kinds)
    edges.push({
      id: `r-${kind}`,
      source: `opt_${kind}`,
      target: "result",
      port: "result",
    });
  return { nodes, edges };
}
export function clxRefreshGraph(
  connectionId: string,
  versions: Record<string, string>
): WorkflowGraph {
  const graph = intelligenceAppGraph(
    connectionId,
    ["headline", "creative_direction", "offer"],
    versions
  );
  graph.nodes = graph.nodes.filter(n => n.id !== "result");
  graph.edges = graph.edges.filter(e => e.target !== "result");
  const copy = newWorkflowNode("optimize_copy", "copy", 1700, 0);
  copy.title = "Generate one reviewed ad-copy candidate";
  copy.config.text =
    "Create ONE factual Meta ad primary-text candidate for CLX Gaming based on the evidence and verified brand information. Do not invent promotions, specifications or performance promises.";
  const image = newWorkflowNode("generate_image", "creative", 2040, 0);
  image.title = "Generate CLX creative candidate";
  image.config.text =
    "Create a CLX Gaming ad creative based on the verified copy and brand kit. Do not invent hardware specifications or price offers.";
  const review = newWorkflowNode("review", "human_review", 2380, 0);
  review.title = "Review creative, copy, evidence and credit usage";
  const ad = newWorkflowNode("meta_ad", "draft_ad", 2720, 0);
  ad.config.connectionId = connectionId;
  ad.title = "Prepare approved refresh variant";
  const delivery = newWorkflowNode("deliver_publication", "delivery", 3060, 0);
  const wait = newWorkflowNode("wait", "observe", 3400, 0);
  wait.config.waitMinutes = 10080;
  const sync = newWorkflowNode("meta_history", "resync", 3740, 0);
  sync.config.connectionId = connectionId;
  sync.config.incremental = true;
  const analyze = newWorkflowNode("analyze_history", "outcomes", 4080, 0);
  analyze.config.connectionId = connectionId;
  analyze.config.measurePublishedOnly = true;
  analyze.title = "Measure only the published refresh ad";
  const feedback = newWorkflowNode("run_workflow", "feedback", 4420, 0);
  feedback.config.appVersionId = versions.headline;
  feedback.config.inputMapping = [{ targetNodeId: "evidence", type: "data" }];
  const output = newWorkflowNode("output", "result", 4760, 0);
  graph.nodes.push(
    copy,
    image,
    review,
    ad,
    delivery,
    wait,
    sync,
    analyze,
    feedback,
    output
  );
  for (const k of ["headline", "creative_direction", "offer"])
    graph.edges.push(
      { id: `copy-${k}`, source: `opt_${k}`, target: "copy", port: "evidence" },
      {
        id: `review-${k}`,
        source: `opt_${k}`,
        target: "human_review",
        port: "context",
      }
    );
  graph.edges.push(
    { id: "copy-img", source: "copy", target: "creative", port: "text" },
    {
      id: "copy-review",
      source: "copy",
      target: "human_review",
      port: "context",
    },
    {
      id: "img-review",
      source: "creative",
      target: "human_review",
      port: "context",
    },
    {
      id: "review-ad-copy",
      source: "human_review",
      target: "draft_ad",
      port: "text",
    },
    {
      id: "review-ad-image",
      source: "human_review",
      target: "draft_ad",
      port: "image",
    },
    {
      id: "ad-delivery",
      source: "draft_ad",
      target: "delivery",
      port: "publication",
    },
    {
      id: "delivery-wait",
      source: "delivery",
      target: "observe",
      port: "context",
    },
    { id: "wait-sync", source: "observe", target: "resync", port: "context" },
    {
      id: "receipt-analysis",
      source: "observe",
      target: "outcomes",
      port: "publication",
    },
    {
      id: "sync-analysis",
      source: "resync",
      target: "outcomes",
      port: "context",
    },
    {
      id: "outcomes-feedback",
      source: "outcomes",
      target: "feedback",
      port: "context",
    },
    {
      id: "feedback-result",
      source: "feedback",
      target: "result",
      port: "result",
    }
  );
  return graph;
}
export async function installOptimizationTemplates(
  db: LibraryDatabase,
  organizationId: number,
  actorUserId: number,
  connectionId: string,
  includeClx = false
) {
  requireOptimization(organizationId);
  await requireOrganizationRole(actorUserId, organizationId, [
    "owner",
    "admin",
    "creator",
  ]);
  const connection = await getConnection(
    db,
    organizationId,
    connectionId,
    "meta_ads"
  );
  if (includeClx && !/clx/i.test(connection.name))
    throw new Error(
      "Select the authorized CLX ad account to install its refresh example."
    );
  return withOrganizationTransaction(db, organizationId, async tx => {
    const installed: {
      name: string;
      workflowId: string;
      appVersionId: string;
    }[] = [];
    const save = async (
      key: string,
      name: string,
      description: string,
      graph: WorkflowGraph
    ) => {
      const problem = workflowGraphProblem(graph);
      if (problem) throw new Error(problem);
      const workflowId = uuid({
          organizationId,
          connectionId,
          key,
          version: TEMPLATE_VERSION,
        }),
        appVersionId = uuid({ workflowId, app: 1 }),
        now = Date.now();
      await tx
        .insert(creativeWorkflows)
        .values({
          id: workflowId,
          organizationId,
          actorUserId,
          name,
          family: "optimize",
          graph,
          createdAtMs: now,
          updatedAtMs: now,
        })
        .onConflictDoNothing();
      await tx
        .insert(workflowAppVersions)
        .values({
          id: appVersionId,
          organizationId,
          workflowId,
          version: 1,
          workflowRevision: 1,
          family: "optimize",
          name,
          description,
          graph,
          actorUserId,
          createdAtMs: now,
        })
        .onConflictDoNothing();
      installed.push({ name, workflowId, appVersionId });
      return appVersionId;
    };
    const versions: Record<string, string> = {};
    for (const kind of optimizerKinds)
      versions[kind] = await save(
        `optimizer_${kind}`,
        optimizerLibrary[kind].name,
        "Reusable typed optimizer. Connect dimension evidence in a parent workflow.",
        optimizerTemplate(kind)
      );
    for (const def of optimizationAppDefinitions)
      await save(
        def.id,
        def.name,
        def.description,
        intelligenceAppGraph(
          connectionId,
          def.kinds,
          versions,
          def.id === "scheduling_intelligence"
            ? "hourly"
            : def.id === "campaign_optimizer"
              ? "placement"
              : "daily"
        )
      );
    if (includeClx)
      await save(
        "clx_refresh",
        "CLX Gaming Meta Ad Refresh",
        "Authorized connected CLX data. Configure the destination/ad set and approve credit estimates before generation. Publication approval is separate; new Meta ads are delivered paused. Edit Start trigger for Monday automation, then publish a new version and explicitly enable it.",
        clxRefreshGraph(connectionId, versions)
      );
    return installed;
  });
}
