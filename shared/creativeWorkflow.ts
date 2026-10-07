import { z } from "zod";
import { appFieldSchema } from "./workflowInputs";
import { rangeSchema, timezoneSchema, linkSchema } from "./channels";
export const workflowFamilies = [
  "create",
  "activate",
  "measure",
  "optimize",
] as const;
export type WorkflowFamily = (typeof workflowFamilies)[number];
export const workflowRoles = [
  "owner",
  "admin",
  "creator",
  "publisher",
] as const;
import {
  generationModel,
  modelOptionsSchema,
  referenceCapacity,
  requiresVideo,
} from "./modelCatalog";
import { videoDirectionSchema, defaultVideoDirection } from "./videoCreation";

export const workflowNodeTypes = [
  "text",
  "image",
  "assistant",
  "combine",
  "generate_image",
  "generate_video",
  "output",
  "app_input",
  "app",
  "app_output",
  "review",
  "wait",
  "facebook_post",
  "meta_ad",
  "deliver_publication",
  "meta_activate",
  "meta_report",
  "facebook_report",
  "compare_metrics",
  "optimize_metric",
  "optimize_copy",
] as const;
export type WorkflowNodeType = (typeof workflowNodeTypes)[number];
export type WorkflowPortType =
  | "text"
  | "image"
  | "video"
  | "data"
  | "publication"
  | "decision"
  | "any";
export const workflowNodes: Record<
  WorkflowNodeType,
  {
    name: string;
    description: string;
    group: string;
    family?: WorkflowFamily;
    channel?: "facebook" | "meta_ads";
    hidden?: boolean;
    output: WorkflowPortType;
    inputs: {
      id: string;
      name: string;
      type: WorkflowPortType;
      multiple?: boolean;
    }[];
  }
> = {
  text: {
    name: "Text",
    description: "A brief, prompt, or reusable instructions.",
    group: "Inputs",
    output: "text",
    inputs: [],
  },
  image: {
    name: "Image",
    description: "A product photo, library asset, or upload.",
    group: "Inputs",
    output: "image",
    inputs: [],
  },
  assistant: {
    name: "AI prompt writer",
    description: "Write or refine text using your brief and images.",
    group: "Generate",
    output: "text",
    inputs: [
      { id: "text", name: "Brief", type: "text", multiple: true },
      { id: "image", name: "Images", type: "image", multiple: true },
    ],
  },
  combine: {
    name: "Combine text",
    description: "Join prompts and brand instructions in order.",
    group: "Utilities",
    output: "text",
    inputs: [{ id: "text", name: "Text", type: "text", multiple: true }],
  },
  generate_image: {
    name: "Generate image",
    description: "Create an image or transform a reference photo.",
    group: "Generate",
    output: "image",
    inputs: [
      { id: "text", name: "Prompt", type: "text", multiple: true },
      { id: "image", name: "References", type: "image", multiple: true },
    ],
  },
  generate_video: {
    name: "Generate video",
    description: "Create, edit, or extend video with your chosen model.",
    group: "Generate",
    output: "video",
    inputs: [
      { id: "text", name: "Prompt", type: "text", multiple: true },
      { id: "image", name: "References", type: "image", multiple: true },
      { id: "video", name: "Source video", type: "video", multiple: false },
    ],
  },
  output: {
    name: "Output",
    description: "Collect and preview finished results.",
    group: "Utilities",
    output: "any",
    inputs: [{ id: "result", name: "Results", type: "any", multiple: true }],
  },
  app_input: {
    name: "App input",
    description: "Receive content from the workflow using this App.",
    group: "Inputs",
    output: "any",
    inputs: [{ id: "context", name: "Content", type: "any", multiple: true }],
  },
  app: {
    name: "Run an App",
    description:
      "Use a built-in tool or a published workspace App from any section.",
    group: "Apps",
    output: "any",
    inputs: [{ id: "context", name: "Content", type: "any", multiple: true }],
  },
  app_output: {
    name: "App result",
    description: "Collect the result of a versioned App.",
    group: "Apps",
    hidden: true,
    output: "any",
    inputs: [{ id: "result", name: "Results", type: "any", multiple: true }],
  },
  review: {
    name: "Human review",
    description: "Pause for an authorized person to review the exact inputs.",
    group: "Control",
    output: "any",
    inputs: [{ id: "context", name: "Review", type: "any", multiple: true }],
  },
  wait: {
    name: "Wait",
    description: "Resume after a configured observation or waiting period.",
    group: "Control",
    output: "any",
    inputs: [{ id: "context", name: "Content", type: "any", multiple: true }],
  },
  facebook_post: {
    name: "Create Facebook post",
    description: "Prepare text or an image post for publication approval.",
    group: "Facebook",
    family: "activate",
    channel: "facebook",
    output: "publication",
    inputs: [
      { id: "text", name: "Caption", type: "text", multiple: true },
      { id: "image", name: "Image", type: "image" },
    ],
  },
  meta_ad: {
    name: "Create Meta ad",
    description: "Prepare an image ad under an existing campaign and ad set.",
    group: "Meta Ads",
    family: "activate",
    channel: "meta_ads",
    output: "publication",
    inputs: [
      { id: "text", name: "Ad copy", type: "text", multiple: true },
      { id: "image", name: "Image", type: "image" },
    ],
  },
  deliver_publication: {
    name: "Publish or schedule",
    description:
      "Wait for publication approval, then deliver at the chosen time. New Meta ads are paused.",
    group: "Delivery",
    family: "activate",
    output: "publication",
    inputs: [{ id: "publication", name: "Publication", type: "publication" }],
  },
  meta_activate: {
    name: "Activate existing Meta ad",
    description:
      "Review and activate a selected ad using its existing ad-set budget and targeting.",
    group: "Meta Ads",
    family: "activate",
    channel: "meta_ads",
    output: "data",
    inputs: [],
  },
  meta_report: {
    name: "Meta Ads performance",
    description:
      "Fetch account or campaign performance for a selected reporting period.",
    group: "Meta Ads",
    family: "measure",
    channel: "meta_ads",
    output: "data",
    inputs: [],
  },
  facebook_report: {
    name: "Facebook performance",
    description:
      "Fetch Page insights and recent post results with their reporting context.",
    group: "Facebook",
    family: "measure",
    channel: "facebook",
    output: "data",
    inputs: [],
  },
  compare_metrics: {
    name: "Compare results",
    description:
      "Compare compatible measurements against a baseline, preserving missing values.",
    group: "Analysis",
    family: "measure",
    output: "data",
    inputs: [
      { id: "current", name: "Current", type: "data" },
      { id: "baseline", name: "Baseline", type: "data" },
    ],
  },
  optimize_metric: {
    name: "Evaluate objective",
    description:
      "Compare a chosen metric with a target and abstain when evidence is insufficient.",
    group: "Engines",
    family: "optimize",
    output: "decision",
    inputs: [{ id: "evidence", name: "Evidence", type: "data" }],
  },
  optimize_copy: {
    name: "Improve copy from evidence",
    description:
      "Propose copy or prompt improvements grounded in supplied results and brand rules.",
    group: "Engines",
    family: "optimize",
    output: "text",
    inputs: [
      { id: "text", name: "Brief", type: "text", multiple: true },
      { id: "evidence", name: "Evidence", type: "any", multiple: true },
      { id: "image", name: "Images", type: "image", multiple: true },
    ],
  },
};
const id = z
  .string()
  .regex(/^[a-zA-Z0-9_-]{1,80}$/)
  .refine(
    value => !["__proto__", "constructor", "prototype"].includes(value),
    "Invalid step identifier"
  );
export const workflowNodeSchema = z.object({
  id,
  type: z.enum(workflowNodeTypes),
  title: z.string().max(100),
  x: z.number().min(-10000).max(10000),
  y: z.number().min(-10000).max(10000),
  config: z.object({
    field: appFieldSchema.optional(),
    fieldValue: z.string().max(10000).optional(),
    appVersionId: z.string().uuid().optional(),
    builtinAppId: z.string().max(80).optional(),
    connectionId: z.string().uuid().optional(),
    campaignId: z.string().regex(/^\d*$/).max(100).optional(),
    adSetId: z.string().regex(/^\d*$/).max(100).optional(),
    adId: z.string().regex(/^\d*$/).max(100).optional(),
    headline: z.string().max(200).optional(),
    destinationUrl: linkSchema.optional(),
    scheduledAtMs: z.number().int().safe().positive().nullable().optional(),
    timezone: timezoneSchema.optional(),
    waitMinutes: z.number().int().min(1).max(43200).optional(),
    datePreset: z
      .enum([
        "today",
        "yesterday",
        "7",
        "14",
        "30",
        "90",
        "this_month",
        "last_month",
        "this_year",
        "last_year",
        "365",
        "custom",
      ])
      .optional(),
    range: rangeSchema.optional(),
    previousPeriod: z.boolean().optional(),
    metric: z
      .enum([
        "roas",
        "spend",
        "clicks",
        "linkClicks",
        "impressions",
        "purchases",
        "purchaseValue",
        "leads",
        "registrations",
        "trials",
        "subscriptions",
        "page_post_engagements",
        "page_media_view",
      ])
      .optional(),
    goal: z.number().finite().min(0).max(1000000000).optional(),
    goalDirection: z.enum(["at_least", "at_most"]).optional(),
    minimumImpressions: z.number().int().min(0).max(1000000000).optional(),
    minimumAgeHours: z.number().int().min(0).max(8760).optional(),
    modelId: z.string().max(240).optional(),
    sourceVideoKey: z
      .string()
      .regex(/^(asset|creative):[1-9][0-9]*$/)
      .nullable()
      .optional(),
    modelOptions: modelOptionsSchema.optional(),
    text: z.string().max(10000).default(""),
    imageKey: z
      .string()
      .regex(/^(asset|creative|product_image):[1-9][0-9]*$/)
      .nullable()
      .default(null),
    ratio: z.string().max(20).default("1:1"),
    duration: z.number().int().min(1).max(120).default(5),
    resolution: z.string().max(20).default("720p"),
    useBrand: z.boolean().default(true),
    direction: videoDirectionSchema.nullable().default(null),
  }),
});
export const workflowGraphSchema = z.object({
  nodes: z.array(workflowNodeSchema).max(40),
  edges: z
    .array(z.object({ id, source: id, target: id, port: z.string().max(30) }))
    .max(100),
});
export type WorkflowGraph = z.infer<typeof workflowGraphSchema>;
export type WorkflowNode = WorkflowGraph["nodes"][number];
export type WorkflowEdge = WorkflowGraph["edges"][number];
export type WorkflowValue =
  | { type: "data" | "decision"; name: string; data: Record<string, unknown> }
  | {
      type: "publication";
      id: string;
      revision: number;
      name: string;
      channel: "facebook" | "meta_ads";
      fingerprint: string;
    }
  | { type: "text"; text: string }
  | {
      type: "image" | "video";
      key: string;
      url: string;
      name: string;
      fingerprint: string;
    };
export type WorkflowStep = {
  status: "pending" | "running" | "waiting" | "completed" | "failed" | "reused";
  outputs?: WorkflowValue[];
  error?: string;
  videoJobId?: string;
  waitingReason?: string;
  wakeAtMs?: number;
  approvedByUserId?: number;
  approvedAtMs?: number;
  reviewHash?: string;
  publicationId?: string;
  reviewData?: {
    before: Record<string, unknown> | null;
    params: Record<string, string>;
    warnings: string[];
    ticket: string;
    change: Record<string, unknown>;
  };

  startedAtMs?: number;
  finishedAtMs?: number;
};
export type WorkflowSteps = Record<string, WorkflowStep>;
export const isGenerationNode = (type: WorkflowNodeType) =>
  ["assistant", "generate_image", "generate_video", "optimize_copy"].includes(
    type
  );
export function newWorkflowNode(
  type: WorkflowNodeType,
  id: string,
  x = 80,
  y = 80
): WorkflowNode {
  return workflowNodeSchema.parse({
    id,
    type,
    title: workflowNodes[type].name,
    x,
    y,
    config: {
      text:
        type === "assistant"
          ? "Write a concise creative prompt based on the brief and reference image. Describe the composition, lighting, and motion where relevant. Preserve the subject’s identity and factual details."
          : "",
    },
  });
}
export function workflowOrder(graph: WorkflowGraph): string[] {
  const order: string[] = [],
    visiting = new Set<string>(),
    visited = new Set<string>();
  const visit = (id: string) => {
    if (visiting.has(id)) throw new Error("Connections cannot form a loop.");
    if (visited.has(id)) return;
    visiting.add(id);
    for (const edge of graph.edges.filter(e => e.target === id))
      visit(edge.source);
    visiting.delete(id);
    visited.add(id);
    order.push(id);
  };
  graph.nodes.forEach(n => visit(n.id));
  return order;
}
export function workflowGraphProblem(graph: WorkflowGraph): string | null {
  const nodes = new Map(graph.nodes.map(n => [n.id, n]));
  if (nodes.size !== graph.nodes.length) return "Each step needs a unique ID.";
  const connections = new Set<string>(),
    ids = new Set<string>();
  for (const edge of graph.edges) {
    const source = nodes.get(edge.source),
      target = nodes.get(edge.target);
    if (!source || !target || source.id === target.id)
      return "Choose two different steps for a connection.";
    const port = workflowNodes[target.type].inputs.find(
      p => p.id === edge.port
    );
    if (
      !port ||
      source.type === "output" ||
      (port.type !== "any" &&
        workflowNodes[source.type].output !== "any" &&
        workflowNodes[source.type].output !== port.type)
    )
      return "Connect matching content types, or use an App output with compatible content.";
    const key = `${edge.source}:${edge.target}:${edge.port}`;
    if (connections.has(key) || ids.has(edge.id))
      return "This connection already exists.";
    connections.add(key);
    ids.add(edge.id);
    if (
      graph.edges.filter(e => e.target === target.id && e.port === edge.port)
        .length > (!port.multiple ? 1 : port.type === "image" ? 9 : 12)
    )
      return "Too many inputs for this step.";
  }
  try {
    workflowOrder(graph);
  } catch (error) {
    return (error as Error).message;
  }
  return null;
}
export function workflowAncestors(
  graph: WorkflowGraph,
  nodeId: string
): Set<string> {
  const result = new Set<string>();
  const visit = (id: string) => {
    if (result.has(id)) return;
    result.add(id);
    graph.edges.filter(e => e.target === id).forEach(e => visit(e.source));
  };
  visit(nodeId);
  return result;
}
/** Positions and labels do not change the meaning of an output. Connection order does. */
export function workflowSignature(graph: WorkflowGraph, nodeId: string) {
  const ancestors = workflowAncestors(graph, nodeId);
  return JSON.stringify({
    nodes: graph.nodes
      .filter(n => ancestors.has(n.id))
      .map(n => ({ id: n.id, type: n.type, config: n.config }))
      .sort((a, b) => a.id.localeCompare(b.id)),
    edges: graph.edges
      .filter(e => ancestors.has(e.target))
      .map(({ source, target, port }) => ({ source, target, port })),
  });
}
export function workflowRunProblem(
  graph: WorkflowGraph,
  selected?: Set<string>
) {
  const structural = workflowGraphProblem(graph);
  if (structural) return structural;
  if (!graph.nodes.length) return "Add a step to your workflow first.";
  for (const node of graph.nodes.filter(n => !selected || selected.has(n.id))) {
    const model = node.config.modelId
      ? generationModel(node.config.modelId)
      : undefined;
    if (
      ["generate_image", "generate_video"].includes(node.type) &&
      node.config.modelId
    ) {
      if (!model || `generate_${model.kind}` !== node.type)
        return `Choose a compatible model for “${node.title}”.`;
      const images = graph.edges.filter(
        e => e.target === node.id && e.port === "image"
      ).length;
      const video =
        !!node.config.sourceVideoKey ||
        graph.edges.some(e => e.target === node.id && e.port === "video");
      if (images > referenceCapacity(model))
        return `${model.name} supports ${referenceCapacity(model)} reference images. Remove extra connections from “${node.title}” or choose another model.`;
      if (
        !images &&
        (model.inputSchema.required ?? []).some(k =>
          ["image_url", "image_urls", "first_frame_url"].includes(k)
        )
      )
        return `Connect a reference image to “${node.title}”.`;
      if (requiresVideo(model) && !video)
        return `Choose or connect a source video for “${node.title}”.`;
      if (
        video &&
        !model.inputSchema.properties.video_url &&
        !model.inputSchema.properties.video_urls
      )
        return `${model.name} does not accept a source video. Choose another model for “${node.title}”.`;
    }
    if (node.type === "app" && !node.config.appVersionId)
      return `Choose a published App for “${node.title}”.`;
    if (workflowNodes[node.type].channel && !node.config.connectionId)
      return `Choose a connected account for “${node.title}”.`;
    if (
      node.type === "meta_ad" &&
      (!node.config.adSetId ||
        !node.config.destinationUrl ||
        !graph.edges.some(e => e.target === node.id && e.port === "image"))
    )
      return `Choose an ad set, destination URL, and image for “${node.title}”.`;
    if (node.type === "meta_activate" && !node.config.adId)
      return `Choose an existing ad for “${node.title}”.`;
    if (
      ["meta_report", "facebook_report"].includes(node.type) &&
      node.config.datePreset === "custom" &&
      !node.config.range
    )
      return `Choose a date range for “${node.title}”.`;
    if (
      [
        "review",
        "deliver_publication",
        "optimize_metric",
        "compare_metrics",
      ].includes(node.type) &&
      workflowNodes[node.type].inputs.some(
        p => !graph.edges.some(e => e.target === node.id && e.port === p.id)
      )
    )
      return `Connect all inputs to “${node.title}”.`;
    if (node.type === "optimize_metric" && node.config.goal === undefined)
      return `Set a target for “${node.title}”.`;
    if (
      node.type === "facebook_post" &&
      !node.config.text.trim() &&
      !graph.edges.some(e => e.target === node.id)
    )
      return `Connect content or write a caption for “${node.title}”.`;
    if (node.type === "text" && !node.config.text.trim())
      return `Add text to “${node.title}”.`;
    if (node.type === "image" && !node.config.imageKey)
      return `Choose an image for “${node.title}”.`;
    if (
      ["assistant", "generate_image", "generate_video"].includes(node.type) &&
      (!model || !!model.inputSchema.properties.prompt) &&
      !node.config.text.trim() &&
      !graph.edges.some(e => e.target === node.id && e.port === "text")
    )
      return `Add a prompt or connect text to “${node.title}”.`;
    if (
      ["combine", "output"].includes(node.type) &&
      !graph.edges.some(e => e.target === node.id)
    )
      return `Connect an input to “${node.title}”.`;
    if (
      node.type === "generate_video" &&
      !node.config.modelId &&
      node.config.ratio === "4:5"
    )
      return "Video supports square, portrait 9:16, or landscape 16:9. Choose one in the video step.";
  }
  return null;
}
export const WORKFLOW_TEMPLATES = [
  {
    id: "photo-video",
    name: "Product photo → video",
    description:
      "Turn a product photo and a brief into a motion prompt, then a video.",
    color: "violet",
    tags: ["Image", "AI prompt", "Video"],
  },
  {
    id: "image-edit",
    name: "Reimagine an image",
    description:
      "Change the scene, lighting, or style while keeping your subject recognizable.",
    color: "blue",
    tags: ["Image", "Prompt", "Image edit"],
  },
  {
    id: "idea-video",
    name: "Idea → image → video",
    description: "Build a still from your idea, then bring the result to life.",
    color: "amber",
    tags: ["Text", "Image", "Video"],
  },
  {
    id: "variations",
    name: "Explore two directions",
    description:
      "Branch one image into two visual treatments and compare the results.",
    color: "rose",
    tags: ["Branch", "Two images", "Compare"],
  },
] as const;
export function workflowTemplate(id: string): WorkflowGraph {
  const n = (
    type: WorkflowNodeType,
    id: string,
    x: number,
    y: number,
    text = ""
  ) => {
    const node = newWorkflowNode(type, id, x, y);
    if (text) node.config.text = text;
    return node;
  };
  const edge = (
    source: string,
    target: string,
    port: string
  ): WorkflowEdge => ({
    id: `${source}-${target}-${port}`,
    source,
    target,
    port,
  });
  if (id === "image-edit")
    return {
      nodes: [
        n("image", "photo", 60, 390),
        n(
          "text",
          "brief",
          60,
          70,
          "Place the subject in a beautifully lit studio. Preserve its shape, colors, and all product details. Use a soft neutral backdrop and realistic shadows."
        ),
        n("generate_image", "image", 440, 180),
        n("output", "output", 820, 180),
      ],
      edges: [
        edge("photo", "image", "image"),
        edge("brief", "image", "text"),
        edge("image", "output", "result"),
      ],
    };
  if (id === "idea-video")
    return {
      nodes: [
        n(
          "text",
          "brief",
          60,
          100,
          "A cinematic close-up of a small glass terrarium on a sunlit desk, gentle morning light, soft background, delicate plants."
        ),
        n("generate_image", "image", 420, 100),
        n(
          "generate_video",
          "video",
          800,
          100,
          "Slow camera push-in. Gentle movement of the leaves and shifting sunlight. Preserve the composition and subject."
        ),
        n("output", "output", 1180, 100),
      ],
      edges: [
        edge("brief", "image", "text"),
        edge("image", "video", "image"),
        edge("video", "output", "result"),
      ],
    };
  if (id === "variations")
    return {
      nodes: [
        n("image", "photo", 60, 260),
        n(
          "generate_image",
          "warm",
          440,
          50,
          "Create a warm, sunlit lifestyle setting around this subject. Preserve the product exactly."
        ),
        n(
          "generate_image",
          "premium",
          440,
          480,
          "Create a premium dark studio setting around this subject, with controlled rim lighting. Preserve the product exactly."
        ),
        n("output", "output", 850, 260),
      ],
      edges: [
        edge("photo", "warm", "image"),
        edge("photo", "premium", "image"),
        edge("warm", "output", "result"),
        edge("premium", "output", "result"),
      ],
    };
  if (id === "photo-video")
    return {
      nodes: [
        n(
          "text",
          "brief",
          60,
          50,
          "Create a five-second product showcase. Keep the product unchanged. Use a slow camera orbit with subtle studio lighting."
        ),
        n("image", "photo", 60, 390),
        n("assistant", "prompt", 430, 80),
        n("generate_video", "video", 810, 180),
        n("output", "output", 1190, 180),
      ],
      edges: [
        edge("brief", "prompt", "text"),
        edge("photo", "prompt", "image"),
        edge("prompt", "video", "text"),
        edge("photo", "video", "image"),
        edge("video", "output", "result"),
      ],
    };
  return { nodes: [], edges: [] };
}
export { defaultVideoDirection };
