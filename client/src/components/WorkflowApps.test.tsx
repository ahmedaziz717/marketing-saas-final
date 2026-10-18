// @vitest-environment jsdom
import { changeField } from "@/test/choiceControls";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { WorkflowValue } from "@shared/creativeWorkflow";
import { copyEvidenceWorkflowTemplate } from "@shared/workflowPerformanceInputs";

const api = vi.hoisted(() => ({
  app: undefined as any,
  apps: [] as any[],
  runs: [] as any[],
  run: vi.fn(),
  quote: vi.fn(),
  stop: vi.fn(),
  refresh: vi.fn(),
}));
vi.mock("./WorkflowAutomationControls", () => ({
  WorkflowAutomationControls: () => null,
}));
vi.mock("./WorkflowInputControl", () => ({
  WorkflowInputControl: ({ title, value, onChange, field }: any) => (
    <textarea
      aria-label={title}
      value={value}
      disabled={field.locked}
      onChange={e => onChange(e.target.value)}
    />
  ),
}));
vi.mock("./WorkflowRunReview", () => ({ WorkflowRunReview: () => null }));
vi.mock("@/lib/trpc", () => ({
  trpc: {
    workflows: {
      listApps: { useQuery: () => ({ data: api.apps }) },
      getApp: { useQuery: () => ({ data: api.app }) },
      get: {
        useQuery: () => ({ data: { runs: api.runs }, refetch: api.refresh }),
      },
      quote: { useMutation: () => ({ mutateAsync: api.quote }) },
      run: { useMutation: () => ({ mutateAsync: api.run }) },
      stop: { useMutation: () => ({ mutateAsync: api.stop }) },
    },
    assetLibrary: { studioList: { useQuery: () => ({ data: [] }) } },
  },
}));
import { newWorkflowNode } from "@shared/creativeWorkflow";
import { appFieldSchema } from "@shared/workflowInputs";
import { WorkflowApps, WorkflowAppRunner } from "./WorkflowApps";

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
  api.quote.mockResolvedValue({ credits: 4 });
  api.run.mockResolvedValue({ id: "new-run" });
  api.refresh.mockResolvedValue({});
  api.runs = [];
  api.apps = [];
});
afterEach(cleanup);

it("shows existing typed form Apps in Your Apps, links to their latest version and keeps parent-only components separate", () => {
  const componentGraph = copyEvidenceWorkflowTemplate();
  delete componentGraph.nodes[0].config.field;
  api.apps = [
    { ...api.app, id: "app-v2", version: 2, name: "My copy analysis App" },
    api.app,
    {
      ...api.app,
      id: "component-v1",
      workflowId: "component-workflow",
      name: "Parent evidence component",
      graph: componentGraph,
    },
    {
      ...api.app,
      id: "mixed-v1",
      workflowId: "mixed-workflow",
      name: "Form and parent evidence component",
      graph: {
        ...componentGraph,
        nodes: [
          ...componentGraph.nodes,
          { ...api.app.graph.nodes[0], id: "form-field" },
        ],
      },
    },
  ];
  const { container } = render(
    <WorkflowApps organizationId={1} family="optimize" />
  );
  expect(screen.getByRole("heading", { name: "Your Apps 1" })).toBeTruthy();
  expect(
    screen.getByRole("heading", { name: "My copy analysis App" })
  ).toBeTruthy();
  expect(screen.queryByRole("heading", { name: "Copy analysis" })).toBeNull();
  expect(
    screen.getByRole("link", { name: "Open App" }).getAttribute("href")
  ).toBe("/app/optimize/apps?app=app-v2");
  expect(
    screen.getByRole("link", { name: "Edit workflow" }).getAttribute("href")
  ).toBe("/app/optimize/workflows?workflow=workflow-1");
  const components = within(container.querySelector("details")!);
  expect(components.getByText("Reusable workflow components (2)")).toBeTruthy();
  expect(components.getByText("Parent evidence component · v1")).toBeTruthy();
  expect(
    components.getByText("Form and parent evidence component · v1")
  ).toBeTruthy();
  expect(components.queryByText("My copy analysis App")).toBeNull();
  expect(api.run).not.toHaveBeenCalled();
});

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
  clickJourney(screen.getByRole("button", { name: /^Results Progress/ }));
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
  expect(screen.getByRole("region", { name: "App results" }).hidden).toBe(
    false
  );
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
  clickJourney(screen.getByRole("button", { name: /^Results Progress/ }));
  expect(screen.getByText("More comparable ads are needed.")).toBeTruthy();
  expect(screen.getByText("Insufficient evidence")).toBeTruthy();
  expect(screen.queryByText(/\d+% confidence/)).toBeNull();
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
  clickJourney(screen.getByRole("button", { name: /^Results Progress/ }));
  expect(screen.getByText("Generated copy")).toBeTruthy();
  expect(
    screen.getByRole("img", { name: "Generated image" }).getAttribute("src")
  ).toBe("https://example.com/image.png");
  expect(container.querySelector("video")?.getAttribute("src")).toBe(
    "https://example.com/video.mp4"
  );
  expect(
    screen
      .getByRole("link", { name: "Draft post · Open in Activation Studio →" })
      .getAttribute("href")
  ).toBe(
    "/app/activate/studio?publication=publication-1&section=preview&channel=facebook"
  );
  expect(screen.getByText(/"customMetric": 7/)).toBeTruthy();
  expect(screen.getByRole("region", { name: "App results" }).hidden).toBe(
    false
  );
});

function formApp() {
  const channel = newWorkflowNode("app_input", "channel");
  channel.title = "Destination";
  channel.config.field = appFieldSchema.parse({
    kind: "choice",
    source: "custom",
    defaultValue: "organic",
    locked: true,
    options: [{ id: "organic", label: "Organic" }],
    studio: { section: "setup", category: "Destination" },
  });
  const audience = newWorkflowNode("app_input", "audience");
  audience.title = "Audience";
  audience.config.field = appFieldSchema.parse({
    kind: "audience",
    required: true,
  });
  const copy = newWorkflowNode("app_input", "copy");
  copy.title = "Caption";
  copy.config.field = appFieldSchema.parse({
    kind: "caption",
    defaultValue: "A useful starting point",
  });
  const hidden = newWorkflowNode("app_input", "hidden");
  hidden.title = "Ad budget";
  hidden.config.field = appFieldSchema.parse({
    kind: "number",
    required: true,
    visibleWhen: { fieldId: "channel", equals: "paid" },
  });
  api.app.graph = {
    nodes: [
      channel,
      audience,
      copy,
      hidden,
      newWorkflowNode("output", "report"),
    ],
    edges: [],
  };
}
function reviewApp() {
  clickJourney(screen.getByRole("button", { name: /^Review & run Check/ }));
}
it("validates in the correct Studio category, preserves inputs, and runs the exact reviewed version and credit quote", async () => {
  formApp();
  openApp();
  expect(
    screen
      .getByRole("navigation", { name: "App Studio sections" })
      .querySelectorAll("button")
  ).toHaveLength(5);
  expect(
    (screen.getByLabelText("Destination") as HTMLTextAreaElement).disabled
  ).toBe(true);
  expect(screen.queryByLabelText("Ad budget")).toBeNull();
  reviewApp();
  clickJourney(screen.getByRole("button", { name: "Review credits & run" }));
  expect(screen.getByRole("alert").textContent).toContain("Audience:");
  expect(screen.getByRole("textbox", { name: "Audience" })).toBeTruthy();
  expect(api.quote).not.toHaveBeenCalled();
  changeField(screen.getByLabelText("Audience"), {
    target: { value: "Independent founders" },
  });
  clickJourney(
    screen.getByRole("button", { name: /^Next (category|section)$/ })
  );
  expect(screen.getByRole("textbox", { name: "Caption" })).toBeTruthy();
  changeField(screen.getByLabelText("Caption"), {
    target: { value: "Reviewed caption" },
  });
  clickJourney(screen.getByRole("button", { name: "Previous category" }));
  expect((screen.getByLabelText("Audience") as HTMLTextAreaElement).value).toBe(
    "Independent founders"
  );
  reviewApp();
  expect(
    within(screen.getByRole("region", { name: "Review App inputs" })).getByText(
      "Reviewed caption"
    )
  ).toBeTruthy();
  clickJourney(screen.getByRole("button", { name: "Review credits & run" }));
  await screen.findByRole("button", { name: "Confirm & run App" });
  expect(api.run).not.toHaveBeenCalled();
  const quoted = api.quote.mock.calls[0][0];
  expect(quoted).toMatchObject({
    organizationId: 1,
    id: "workflow-1",
    revision: 1,
    appVersionId: "app-v1",
  });
  expect(quoted.inputs).toContainEqual({ id: "channel", value: "organic" });
  clickJourney(screen.getByRole("button", { name: "Confirm & run App" }));
  await waitFor(() => expect(api.run).toHaveBeenCalledTimes(1));
  expect(api.run.mock.calls[0][0]).toEqual({
    ...quoted,
    quotedCredits: 4,
    requestId: expect.any(String),
  });
  await waitFor(() =>
    expect(screen.getByRole("region", { name: "App results" })).toBeTruthy()
  );
  expect(api.refresh).toHaveBeenCalled();
});
it("invalidates an estimate after an edit and accepts a zero-credit quote", async () => {
  formApp();
  api.app.graph.nodes[1].config.field.defaultValue = "Creators";
  api.quote.mockResolvedValue({ credits: 0 });
  openApp();
  reviewApp();
  clickJourney(screen.getByRole("button", { name: "Review credits & run" }));
  await screen.findByRole("button", { name: "Confirm & run App" });
  clickJourney(screen.getByRole("button", { name: "Edit Content: Copy" }));
  changeField(screen.getByLabelText("Caption"), {
    target: { value: "Changed after estimate" },
  });
  reviewApp();
  expect(
    screen.queryByRole("button", { name: "Confirm & run App" })
  ).toBeNull();
  clickJourney(screen.getByRole("button", { name: "Review credits & run" }));
  clickJourney(
    await screen.findByRole("button", { name: "Confirm & run App" })
  );
  await waitFor(() => expect(api.run).toHaveBeenCalledTimes(1));
  expect(api.run.mock.calls[0][0]).toMatchObject({
    quotedCredits: 0,
    inputs: expect.arrayContaining([
      { id: "copy", value: "Changed after estimate" },
    ]),
  });
});
it("shows run failures without losing reviewed inputs and reuses the request identifier on retry", async () => {
  formApp();
  api.app.graph.nodes[1].config.field.defaultValue = "Creators";
  api.run.mockRejectedValueOnce(new Error("Connection interrupted"));
  openApp();
  reviewApp();
  clickJourney(screen.getByRole("button", { name: "Review credits & run" }));
  clickJourney(
    await screen.findByRole("button", { name: "Confirm & run App" })
  );
  await waitFor(() =>
    expect(screen.getByRole("alert").textContent).toBe("Connection interrupted")
  );
  clickJourney(screen.getByRole("button", { name: "Confirm & run App" }));
  await waitFor(() => expect(api.run).toHaveBeenCalledTimes(2));
  expect(api.run.mock.calls[1][0]).toEqual(api.run.mock.calls[0][0]);
});
it("keeps an active run in Results and exposes stopping without another run", async () => {
  api.runs = [{ ...savedRun([]), status: "running" }];
  openApp();
  reviewApp();
  expect(
    screen.queryByRole("button", { name: "Review credits & run" })
  ).toBeNull();
  clickJourney(screen.getByRole("button", { name: "View run progress" }));
  clickJourney(screen.getByRole("button", { name: "Stop after current step" }));
  await waitFor(() =>
    expect(api.stop).toHaveBeenCalledWith({
      organizationId: 1,
      id: "saved-run",
    })
  );
  expect(api.run).not.toHaveBeenCalled();
});
it("supports legacy text and image inputs without republishing", async () => {
  const text = newWorkflowNode("text", "brief");
  text.title = "Campaign brief";
  text.config.text = "Original brief";
  const image = newWorkflowNode("image", "image");
  image.title = "Reference image";
  api.app.graph = { nodes: [text, image], edges: [] };
  openApp();
  changeField(screen.getByLabelText("Campaign brief"), {
    target: { value: "Updated legacy brief" },
  });
  clickJourney(
    screen.getByRole("button", { name: /^Next (category|section)$/ })
  );
  expect(
    screen.getByRole("radiogroup", { name: "Reference image" })
  ).toBeTruthy();
  reviewApp();
  clickJourney(screen.getByRole("button", { name: "Review credits & run" }));
  await screen.findByRole("button", { name: "Confirm & run App" });
  expect(api.quote.mock.calls[0][0].inputs).toEqual([
    { id: "brief", text: "Updated legacy brief" },
    { id: "image", imageKey: undefined },
  ]);
});
it("resets inputs and credit confirmation when opening another App version", async () => {
  formApp();
  api.app.graph.nodes[1].config.field.defaultValue = "Default audience";
  const rendered = openApp();
  reviewApp();
  clickJourney(screen.getByRole("button", { name: "Review credits & run" }));
  await screen.findByRole("button", { name: "Confirm & run App" });
  rendered.rerender(
    <WorkflowAppRunner
      id="app-v2"
      organizationId={1}
      role="owner"
      onBack={vi.fn()}
    />
  );
  reviewApp();
  expect(
    screen.queryByRole("button", { name: "Confirm & run App" })
  ).toBeNull();
  expect(api.run).not.toHaveBeenCalled();
});

// Business-flow checks accept optional discovery prompts; StudioJourney tests cover the prompt itself.
function clickJourney(element: Element) {
  fireEvent.click(element);
  const keep = screen.queryByRole("button", {
    name: /^(Keep defaults & continue|Continue with current choices)$/,
  });
  if (keep) fireEvent.click(keep);
}
