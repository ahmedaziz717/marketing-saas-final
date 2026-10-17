import { expect, it } from "vitest";
import {
  newWorkflowNode,
  workflowGraphProblem,
  workflowGraphSchema,
} from "../shared/creativeWorkflow";
import { optimizerKinds } from "../shared/optimization";
import {
  optimizerTemplate,
  intelligenceAppGraph,
  clxRefreshGraph,
  optimizationAppDefinitions,
} from "./lib/optimizationTemplates";
import {
  nextWeeklyTrigger,
  triggerGraphProblem,
} from "../shared/workflowTriggers";
import { expandOptimizers } from "./lib/workflowApps";
import { optimizeEvidence } from "./lib/optimizerService";
it("validates all optimizer, App and CLX graphs and reuses existing canonical catalogs", () => {
  const versions = Object.fromEntries(
    optimizerKinds.map((k, i) => [
      k,
      `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`,
    ])
  );
  const connectionId = "00000000-0000-4000-8000-000000000099";
  for (const kind of optimizerKinds)
    expect(
      workflowGraphProblem(workflowGraphSchema.parse(optimizerTemplate(kind)))
    ).toBeNull();
  for (const app of optimizationAppDefinitions)
    expect(
      workflowGraphProblem(
        workflowGraphSchema.parse(
          intelligenceAppGraph(connectionId, app.kinds, versions)
        )
      )
    ).toBeNull();
  const clx = workflowGraphSchema.parse(
    clxRefreshGraph(connectionId, versions)
  );
  expect(workflowGraphProblem(clx)).toBeNull();
  expect(clx.nodes.some(n => n.type === "review")).toBe(true);
  expect(clx.nodes.some(n => n.type === "meta_activate")).toBe(false);
  expect(
    clx.nodes.find(n => n.type === "meta_ad")?.config.adSetId
  ).toBeUndefined();
});
it("expands Analyze + Generate into existing metered copy generation", () => {
  const input = newWorkflowNode("app_input", "input"),
    engine = newWorkflowNode("optimize_dimension", "engine"),
    out = newWorkflowNode("output", "out");
  engine.config.optimizer = {
    kind: "headline",
    channel: "meta_ads",
    mode: "analyze_generate",
    brief: "Verified facts only",
  };
  const expanded = expandOptimizers({
    nodes: [input, engine, out],
    edges: [
      { id: "in", source: "input", target: "engine", port: "evidence" },
      { id: "out", source: "engine", target: "out", port: "result" },
    ],
  });
  expect(expanded.nodes.filter(n => n.type === "optimize_copy")).toHaveLength(
    1
  );
  expect(workflowGraphProblem(expanded)).toBeNull();
});
it("schedules Mondays in account timezone across DST without duplicate current slots", () => {
  const config = {
    kind: "scheduled" as const,
    weekday: 1,
    hour: 9,
    timezone: "America/New_York",
    event: "history_synced" as const,
  };
  expect(
    new Date(
      nextWeeklyTrigger(config, Date.parse("2026-03-06T12:00:00Z"))
    ).toISOString()
  ).toBe("2026-03-09T13:00:00.000Z");
  expect(
    new Date(
      nextWeeklyTrigger(config, Date.parse("2026-03-09T13:00:00Z"))
    ).toISOString()
  ).toBe("2026-03-16T13:00:00.000Z");
});
it("abstains for incomplete or unsupported evidence and never authorizes spending", () => {
  const input = {
    schemaVersion: 1,
    kind: "headline",
    channel: "meta_ads",
    brief: "",
    evidence: {
      summary: {
        spend: 20,
        impressions: 10000,
        clicks: 100,
        purchases: 2,
        purchaseValue: 100,
        roas: 5,
        adCount: 4,
        samples: 20,
        evidenceStrength: "directional",
        confidence: 1,
      },
      groups: [],
      coverage: { incomplete: true, truncated: false },
    },
  };
  expect(optimizeEvidence(input).decision).toBe("insufficient_evidence");
  expect(optimizeEvidence({ ...input, channel: "google_ads" }).decision).toBe(
    "unsupported_channel"
  );
  const result = optimizeEvidence({
    ...input,
    evidence: {
      ...input.evidence,
      coverage: { incomplete: false, truncated: false },
    },
  });
  expect(result.decision).toBe("propose_test");
  expect(result.requiresHumanApproval).toBe(true);
  expect(result.confidence).toBeLessThan(1);
});
it("rejects event feedback loops while allowing read-only follow-up and manual delivery", () => {
  const config = {
    kind: "event" as const,
    event: "history_synced" as const,
    weekday: 1,
    hour: 9,
    timezone: "UTC",
  };
  expect(
    triggerGraphProblem(config, {
      nodes: [newWorkflowNode("meta_history", "fetch")],
      edges: [],
    })
  ).toContain("event loop");
  expect(
    triggerGraphProblem(config, {
      nodes: [newWorkflowNode("analyze_history", "analyze")],
      edges: [],
    })
  ).toBeNull();
  const delivery = {
    nodes: [newWorkflowNode("deliver_publication", "deliver")],
    edges: [],
  };
  expect(
    triggerGraphProblem({ ...config, event: "publication_delivered" }, delivery)
  ).toContain("event loop");
  expect(
    triggerGraphProblem({ ...config, kind: "manual" }, delivery)
  ).toBeNull();
});
