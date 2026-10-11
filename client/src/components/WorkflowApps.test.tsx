// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { WorkflowValue } from "@shared/creativeWorkflow";
import { copyEvidenceWorkflowTemplate } from "@shared/workflowPerformanceInputs";

const api = vi.hoisted(() => ({
  app: undefined as any,
  runs: [] as any[],
  run: vi.fn(),
}));
vi.mock("./WorkflowAutomationControls", () => ({
  WorkflowAutomationControls: () => null,
}));
vi.mock("./WorkflowInputControl", () => ({
  WorkflowInputControl: () => <div>Account and date form</div>,
}));
vi.mock("./WorkflowRunReview", () => ({ WorkflowRunReview: () => null }));
vi.mock("@/lib/trpc", () => ({
  trpc: {
    workflows: {
      getApp: { useQuery: () => ({ data: api.app }) },
      get: { useQuery: () => ({ data: { runs: api.runs } }) },
      quote: { useMutation: () => ({ mutateAsync: vi.fn() }) },
      run: { useMutation: () => ({ mutateAsync: api.run }) },
      stop: { useMutation: () => ({ mutateAsync: vi.fn() }) },
    },
    assetLibrary: { studioList: { useQuery: () => ({ data: [] }) } },
  },
}));
import { WorkflowAppRunner } from "./WorkflowApps";

function savedRun(outputs: WorkflowValue[]) {
  return {
    id: "saved-run",
    appVersionId: "app-v1",
    graph: api.app.graph,
    steps: { report: { status: "completed", outputs } },
    status: "completed",
    stopRequested: false,
  };
}
function openApp() {
  return render(
    <WorkflowAppRunner
      id="app-v1"
      organizationId={1}
      role="owner"
      onBack={vi.fn()}
    />
  );
}
beforeEach(() => {
  vi.clearAllMocks();
  api.app = {
    id: "app-v1",
    workflowId: "workflow-1",
    workflowRevision: 1,
    version: 1,
    family: "optimize",
    name: "Copy analysis",
    description: "Compare copy styles",
    graph: copyEvidenceWorkflowTemplate(),
  };
  api.runs = [];
});
afterEach(cleanup);

it("renders a completed published copy report as evidence tables without rerunning or dumping its JSON", () => {
  const data = {
    source: "live_meta_copy_analysis",
    schemaVersion: 1,
    summary: "Observed differences are available for review.",
    settings: {
      objective: "cpa",
      minimumImpressions: 1000,
      minimumPurchases: 5,
    },
    evidence: {
      accountName: "Selected Meta account",
      range: { since: "2026-10-01", until: "2026-10-07" },
      timezone: "America/Los_Angeles",
      currency: "USD",
      coverage: {
        inspectedAds: 1,
        insightsReturned: 1,
        truncated: false,
        missingCreativeAds: 0,
      },
      ads: [
        {
          id: "ad-1",
          name: "Source ad",
          campaignId: "campaign-1",
          adsetId: "adset-1",
          creativeId: "creative-1",
          copy: {
            headline: ["Shop now for PCs"],
            primary_text: [],
            description: [],
          },
          metrics: { spend: 100, purchases: 5, purchaseValue: 500, roas: 5 },
        },
      ],
      attribution: "Account attribution",
      purchaseAction: "purchase",
      warnings: [],
      fetchedAtMs: 1791720000000,
    },
    fields: [
      {
        field: "headline",
        observedLeader: null,
        comparedAds: 1,
        excludedAds: 0,
        groups: [
          {
            label: "direct",
            eligible: true,
            adCount: 1,
            spend: 100,
            impressions: 1000,
            clicks: 50,
            ctr: 5,
            purchases: 5,
            purchaseValue: 500,
            cpa: 20,
            roas: 5,
            sourceAdIds: ["ad-1"],
          },
        ],
        classifications: [
          { adId: "ad-1", label: "direct", evidence: ["Matched Shop now"] },
        ],
      },
    ],
    limitations: ["Not an A/B test"],
    confidence: null,
  };
  // A newer run of another App version must not replace this version's saved result.
  api.runs = [
    {
      ...savedRun([{ type: "text", text: "Other version result" }]),
      appVersionId: "app-v2",
    },
    savedRun([{ type: "data", name: "Copy report", data }]),
  ];
  const { container } = openApp();
  expect(
    screen.getByRole("heading", { name: "Copy evidence report" })
  ).toBeTruthy();
  expect(
    screen.getByText(/Selected Meta account · 2026-10-01 to 2026-10-07/)
  ).toBeTruthy();
  expect(
    within(screen.getByRole("table")).getByRole("columnheader", { name: "CPA" })
  ).toBeTruthy();
  expect(screen.getByText("Shop now for PCs")).toBeTruthy();
  expect(screen.getByText(/Not estimable/)).toBeTruthy();
  expect(screen.queryByText("Other version result")).toBeNull();
  expect(container.querySelector(".wf-app-results pre")).toBeNull();
  expect(container.querySelector(".wf-app-run-layout-report")).toBeTruthy();
  expect(api.run).not.toHaveBeenCalled();
});

it("preserves the formatted optimizer report for existing published Apps", () => {
  api.runs = [
    savedRun([
      {
        type: "data",
        name: "Optimization report",
        data: {
          schemaVersion: 1,
          kind: "headline",
          channel: "meta_ads",
          decision: "insufficient_evidence",
          confidence: null,
          observations: ["More comparable ads are needed."],
          sourceAdIds: [],
          dimensions: [],
          suggestedTests: [],
          generationBrief: "",
          caveats: [],
          requiresHumanApproval: true,
        },
      },
    ]),
  ];
  const { container } = openApp();
  expect(screen.getByText("More comparable ads are needed.")).toBeTruthy();
  expect(screen.getByText(/Confidence not estimable/)).toBeTruthy();
  expect(container.querySelector(".wf-app-results pre")).toBeNull();
});

it("keeps ordinary text, media, publication links and custom data outputs available", () => {
  api.runs = [
    savedRun([
      { type: "text", text: "Generated copy" },
      {
        type: "image",
        key: "image-1",
        fingerprint: "image-fingerprint",
        url: "https://example.com/image.png",
        name: "Generated image",
      },
      {
        type: "video",
        key: "video-1",
        fingerprint: "video-fingerprint",
        url: "https://example.com/video.mp4",
        name: "Generated video",
      },
      {
        type: "publication",
        id: "publication-1",
        revision: 1,
        fingerprint: "publication-fingerprint",
        channel: "facebook",
        name: "Draft post",
      },
      { type: "data", name: "Custom result", data: { customMetric: 7 } },
    ]),
  ];
  const { container } = openApp();
  expect(screen.getByText("Generated copy")).toBeTruthy();
  expect(
    screen.getByRole("img", { name: "Generated image" }).getAttribute("src")
  ).toBe("https://example.com/image.png");
  expect(container.querySelector("video")?.getAttribute("src")).toBe(
    "https://example.com/video.mp4"
  );
  expect(
    screen.getByRole("link", { name: "Draft post →" }).getAttribute("href")
  ).toBe("/app/publishing?publication=publication-1");
  expect(screen.getByText(/"customMetric": 7/)).toBeTruthy();
  expect(container.querySelector(".wf-app-run-layout-report")).toBeNull();
});
