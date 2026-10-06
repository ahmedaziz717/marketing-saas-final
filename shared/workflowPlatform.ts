import { localScheduleToUtc, moveDate } from "./channels";
import {
  newWorkflowNode,
  type WorkflowFamily,
  type WorkflowGraph,
  type WorkflowNodeType,
  type WorkflowValue,
} from "./creativeWorkflow";

export const workflowSections: Record<
  WorkflowFamily,
  {
    name: string;
    path: string;
    color: string;
    heading: string;
    description: string;
  }
> = {
  create: {
    name: "Create",
    path: "/app/creatives/workflows",
    color: "violet",
    heading: "Turn ideas into repeatable creative work.",
    description:
      "Connect prompts, images, and video tools. Publish your process as an App.",
  },
  activate: {
    name: "Activate",
    path: "/app/activate/workflows",
    color: "blue",
    heading: "Give your content a path to its audience.",
    description:
      "Use creative Apps, prepare posts and ads, and connect review to delivery.",
  },
  measure: {
    name: "Measure",
    path: "/app/measure/workflows",
    color: "teal",
    heading: "Build a clear picture of performance.",
    description:
      "Collect connected-channel results, compare periods, and reuse your reporting process.",
  },
  optimize: {
    name: "Optimize",
    path: "/app/optimize/workflows",
    color: "amber",
    heading: "Turn evidence into your next decision.",
    description:
      "Evaluate objectives and develop reusable engines for copy, themes, and the next iteration.",
  },
};
export const businessWorkflowTemplates = [
  {
    id: "facebook-delivery",
    family: "activate",
    name: "Facebook post → delivery",
    description:
      "Prepare a post, review its exact content, then publish or schedule it.",
    color: "blue",
    tags: ["Facebook", "Approval", "Delivery"],
  },
  {
    id: "app-meta-ad",
    family: "activate",
    name: "Creative App → Meta ad",
    description:
      "Use a published creative App to prepare an ad under an existing ad set.",
    color: "violet",
    tags: ["App", "Meta Ads", "Approval"],
  },
  {
    id: "activate-ad",
    family: "activate",
    name: "Activate an existing ad",
    description:
      "Review a selected ad and activate it with its existing budget and targeting.",
    color: "amber",
    tags: ["Meta Ads", "Review", "Activate"],
  },
  {
    id: "meta-comparison",
    family: "measure",
    name: "Meta period comparison",
    description:
      "Compare campaign or account results against the preceding reporting period.",
    color: "teal",
    tags: ["Meta Ads", "Dates", "Comparison"],
  },
  {
    id: "facebook-report",
    family: "measure",
    name: "Facebook performance report",
    description:
      "Bring Page metrics and post results into one reusable reporting App.",
    color: "blue",
    tags: ["Facebook", "Insights", "Report"],
  },
  {
    id: "objective-check",
    family: "optimize",
    name: "Performance → objective",
    description:
      "Evaluate a metric against a target, with an explicit evidence threshold.",
    color: "amber",
    tags: ["Evidence", "Target", "Decision"],
  },
  {
    id: "evidence-copy",
    family: "optimize",
    name: "Evidence → creative direction",
    description:
      "Use performance evidence and a brief to propose the next copy or prompt.",
    color: "violet",
    tags: ["App", "Evidence", "Copy"],
  },
] as const;

export function businessWorkflowTemplate(id: string): WorkflowGraph | null {
  const n = (type: WorkflowNodeType, id: string, x: number, y = 120) =>
    newWorkflowNode(type, id, x, y);
  const edge = (source: string, target: string, port: string) => ({
    id: `${source}-${target}-${port}`,
    source,
    target,
    port,
  });
  const output = n("output", "result", 1230);
  if (id === "facebook-delivery") {
    const caption = n("text", "caption", 60);
    caption.config.text = "Write your Facebook post here.";
    return {
      nodes: [
        caption,
        n("facebook_post", "post", 450),
        n("deliver_publication", "delivery", 840),
        output,
      ],
      edges: [
        edge("caption", "post", "text"),
        edge("post", "delivery", "publication"),
        edge("delivery", "result", "result"),
      ],
    };
  }
  if (id === "app-meta-ad")
    return {
      nodes: [
        n("app", "creative", 60),
        n("meta_ad", "ad", 450),
        n("deliver_publication", "delivery", 840),
        output,
      ],
      edges: [
        edge("creative", "ad", "image"),
        edge("creative", "ad", "text"),
        edge("ad", "delivery", "publication"),
        edge("delivery", "result", "result"),
      ],
    };
  if (id === "activate-ad")
    return {
      nodes: [n("meta_activate", "activate", 60), { ...output, x: 450 }],
      edges: [edge("activate", "result", "result")],
    };
  if (id === "meta-comparison") {
    const current = n("meta_report", "current", 60, 60),
      baseline = n("meta_report", "baseline", 60, 470);
    baseline.title = "Previous period";
    baseline.config.previousPeriod = true;
    return {
      nodes: [
        current,
        baseline,
        n("compare_metrics", "compare", 450),
        { ...output, x: 840 },
      ],
      edges: [
        edge("current", "compare", "current"),
        edge("baseline", "compare", "baseline"),
        edge("compare", "result", "result"),
      ],
    };
  }
  if (id === "facebook-report")
    return {
      nodes: [n("facebook_report", "report", 60), { ...output, x: 450 }],
      edges: [edge("report", "result", "result")],
    };
  if (id === "objective-check") {
    const decision = n("optimize_metric", "evaluate", 450);
    decision.config = {
      ...decision.config,
      metric: "roas",
      goal: 2,
      goalDirection: "at_least",
      minimumImpressions: 1000,
      minimumAgeHours: 24,
    };
    return {
      nodes: [n("meta_report", "report", 60), decision, { ...output, x: 840 }],
      edges: [
        edge("report", "evaluate", "evidence"),
        edge("evaluate", "result", "result"),
      ],
    };
  }
  if (id === "evidence-copy") {
    const engine = n("optimize_copy", "copy", 450);
    engine.config.text =
      "Propose a concise creative direction and copy prompt for the next test. Preserve verified brand facts. Separate observed evidence from hypotheses. Do not claim causal lift or change budgets.";
    return {
      nodes: [
        n("app_input", "context", 60, 60),
        n("meta_report", "report", 60, 470),
        engine,
        n("review", "review", 840),
        output,
      ],
      edges: [
        edge("context", "copy", "text"),
        edge("report", "copy", "evidence"),
        edge("copy", "review", "context"),
        edge("review", "result", "result"),
      ],
    };
  }
  return null;
}

export function workflowValueText(value: WorkflowValue) {
  if (value.type === "text") return value.text;
  if (value.type === "data" || value.type === "decision")
    return JSON.stringify(value.data, null, 2);
  if (value.type === "publication") return `${value.name} · ${value.channel}`;
  return value.name;
}

export function compareEvidence(
  current: Record<string, unknown>,
  baseline: Record<string, unknown>
) {
  if (
    current.channel !== baseline.channel ||
    current.accountId !== baseline.accountId ||
    current.campaignId !== baseline.campaignId ||
    current.currency !== baseline.currency ||
    current.timezone !== baseline.timezone ||
    current.attribution !== baseline.attribution
  )
    throw new Error(
      "Compare the same channel, account, campaign, currency, time zone, and attribution setting."
    );
  const a = current.metrics as Record<string, unknown>,
    b = baseline.metrics as Record<string, unknown>;
  if (!a || !b) throw new Error("Connect two performance reports.");
  const comparison = Object.fromEntries(
    Object.keys(a).map(key => {
      const x = typeof a[key] === "number" ? (a[key] as number) : null,
        y = typeof b[key] === "number" ? (b[key] as number) : null;
      return [
        key,
        {
          current: x,
          baseline: y,
          change: x !== null && y !== null ? x - y : null,
          percentChange:
            x !== null && y !== null && y !== 0
              ? ((x - y) / Math.abs(y)) * 100
              : null,
        },
      ];
    })
  );
  return {
    ...current,
    comparison,
    baselineRange: baseline.range,
    baseline: b,
    note: "Observed period differences do not establish causality. Account attribution and conversion delays apply.",
    incomplete: !!current.incomplete || !!baseline.incomplete,
  };
}

export function evaluateEvidence(
  evidence: Record<string, unknown>,
  config: {
    metric?: string;
    goal?: number;
    goalDirection?: string;
    minimumImpressions?: number;
    minimumAgeHours?: number;
  },
  now = Date.now()
) {
  const metric = config.metric ?? "roas",
    metrics = evidence.metrics as Record<string, unknown> | undefined;
  const value = metrics?.[metric],
    impressions = metrics?.impressions;
  const until = (evidence.range as { until?: string } | undefined)?.until;
  // Use the provider account's reporting day, including DST. If midnight is
  // ambiguous/nonexistent or provenance is missing, abstain rather than guess.
  let periodEnd = NaN;
  try {
    if (until && typeof evidence.timezone === "string")
      periodEnd = localScheduleToUtc(
        moveDate(until, 1) + "T00:00",
        evidence.timezone
      );
  } catch {
    /* Unknown reporting boundary remains insufficient evidence. */
  }
  const ageHours = Number.isFinite(periodEnd)
    ? (now - periodEnd) / 3600000
    : -1;
  const reasons: string[] = [];
  if (evidence.incomplete)
    reasons.push(
      "The provider returned incomplete or unavailable measurements."
    );
  if (typeof value !== "number" || !Number.isFinite(value))
    reasons.push("The chosen metric is unavailable.");
  if (config.goal === undefined)
    reasons.push("No objective target was configured.");
  if (
    (config.minimumImpressions ?? 1000) > 0 &&
    (typeof impressions !== "number" ||
      impressions < (config.minimumImpressions ?? 1000))
  )
    reasons.push("The minimum impression threshold has not been met.");
  if (ageHours < (config.minimumAgeHours ?? 24))
    reasons.push(
      "The observation period needs more time for results to mature."
    );
  const met =
    typeof value === "number" &&
    config.goal !== undefined &&
    (config.goalDirection === "at_most"
      ? value <= config.goal
      : value >= config.goal);
  return {
    decision: reasons.length
      ? "insufficient_evidence"
      : met
        ? "retain"
        : "propose_test",
    metric,
    value: typeof value === "number" ? value : null,
    target: config.goal,
    direction: config.goalDirection ?? "at_least",
    evidenceStatus: "observed_pattern",
    reasons,
    recommendation: reasons.length
      ? "Wait for sufficient evidence before changing the creative or delivery."
      : met
        ? "Retain the current approach; the selected target is met."
        : "Propose a controlled creative test for review. This result does not authorize campaign changes.",
    source: {
      channel: evidence.channel,
      accountId: evidence.accountId,
      campaignId: evidence.campaignId,
      range: evidence.range,
      observedAtMs: evidence.observedAtMs,
    },
  };
}
