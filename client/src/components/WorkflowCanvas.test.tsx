// @vitest-environment jsdom
import { changeField, allChoiceLabels } from "@/test/choiceControls";
import { useState } from "react";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
const api = vi.hoisted(() => ({ error: vi.fn(), run: vi.fn() }));
vi.mock("sonner", () => ({
  toast: { error: api.error, success: vi.fn(), info: vi.fn() },
}));
vi.mock("./AssetUploadDialog", () => ({ AssetUploadDialog: () => null }));
vi.mock("@/lib/trpc", () => ({
  trpc: {
    catalog: { overview: { useQuery: () => ({ data: { products: [] } }) } },
    workflows: {
      assistInput: {
        useMutation: () => ({ mutateAsync: vi.fn(), isPending: false }),
      },
      listApps: {
        useQuery: () => ({
          data: [
            {
              id: "00000000-0000-4000-8000-000000000001",
              name: "Custom review",
              family: "create",
              version: 1,
            },
          ],
        }),
      },
    },
    channels: {
      connections: { useQuery: () => ({ data: { items: [] } }) },
      adObjects: { useQuery: () => ({}) },
    },
    models: {
      nodeQuote: { useQuery: () => ({ data: { credits: 40 } }) },
      catalog: { useQuery: () => ({ data: [] }) },
    },
    assetLibrary: {
      studioList: { useQuery: () => ({ data: [], refetch: vi.fn() }) },
    },
    video: { catalogImages: { useQuery: () => ({ data: { items: [] } }) } },
  },
}));
import { WorkflowCanvas } from "./WorkflowCanvas";
import { copyEvidenceWorkflowTemplate } from "@shared/workflowPerformanceInputs";
import {
  newWorkflowNode,
  workflowTemplate,
  type WorkflowGraph,
  type WorkflowFamily,
  workflowGraphProblem,
} from "@shared/creativeWorkflow";
function Harness({
  initial,
  family = "create",
}: {
  initial: WorkflowGraph;
  family?: WorkflowFamily;
}) {
  const [graph, setGraph] = useState(initial);
  return (
    <>
      <output data-testid="graph">{JSON.stringify(graph)}</output>
      <WorkflowCanvas
        graph={graph}
        onChange={setGraph}
        organizationId={1}
        role="owner"
        family={family}
        connectedChannels={["meta_ads"]}
        busy={false}
        onRunNode={api.run}
      />
    </>
  );
}
const graph = () =>
  JSON.parse(screen.getByTestId("graph").textContent!) as WorkflowGraph;
afterEach(cleanup);
beforeEach(() => {
  vi.clearAllMocks();
});
it("exposes copy-evidence wiring, source requirements and editable purchase comparison rules", () => {
  render(
    <Harness initial={copyEvidenceWorkflowTemplate()} family="optimize" />
  );
  expect(
    screen.getByText("How to build this copy-analysis workflow")
  ).toBeTruthy();
  fireEvent.click(
    screen.getByRole("button", { name: "Settings for Compare copy styles" })
  );
  expect(
    screen.getByText(/Account totals and weekday\/hour reports/)
  ).toBeTruthy();
  changeField(
    screen.getByRole("radiogroup", { name: "Comparison objective" }),
    {
      target: { value: "roas" },
    }
  );
  changeField(screen.getByLabelText("Minimum purchases per value"), {
    target: { value: "8" },
  });
  fireEvent.click(screen.getByLabelText("Emotional tone"));
  const settings = graph().nodes.find(n => n.id === "compare_copy")?.config
    .copyComparison;
  expect(settings).toMatchObject({ objective: "roas", minimumPurchases: 8 });
  expect(settings?.dimensions).not.toContain("emotional_tone");
});
it("connects typed ports, rejects incompatible connections, and supports undo", () => {
  render(
    <Harness
      initial={{
        nodes: [
          newWorkflowNode("text", "text"),
          newWorkflowNode("generate_image", "image"),
        ],
        edges: [],
      }}
    />
  );
  fireEvent.click(
    screen.getByRole("button", { name: "Connect output from Text" })
  );
  fireEvent.click(
    screen.getByRole("button", { name: "Connect prompt to Generate image" })
  );
  expect(graph().edges).toHaveLength(1);
  fireEvent.click(
    screen.getByRole("button", { name: "Connect output from Text" })
  );
  fireEvent.click(
    screen.getByRole("button", { name: "Connect references to Generate image" })
  );
  expect(api.error).toHaveBeenCalled();
  expect(graph().edges).toHaveLength(1);
  fireEvent.click(screen.getByRole("button", { name: "Undo" }));
  expect(graph().edges).toHaveLength(0);
  fireEvent.click(screen.getByRole("button", { name: "Redo" }));
  expect(graph().edges).toHaveLength(1);
});
it("updates node settings, runs one step, and removes connected edges on deletion", () => {
  render(<Harness initial={workflowTemplate("image-edit")} />);
  fireEvent.click(
    screen.getByRole("button", { name: "Settings for Generate image" })
  );
  changeField(screen.getByRole("radiogroup", { name: "Aspect ratio" }), {
    target: { value: "9:16" },
  });
  expect(graph().nodes.find(n => n.id === "image")!.config.ratio).toBe("9:16");
  fireEvent.click(screen.getByRole("button", { name: "Run Generate image" }));
  expect(api.run).toHaveBeenCalledWith("image");
  fireEvent.click(screen.getByRole("button", { name: /^Delete$/ }));
  expect(graph().nodes.some(n => n.id === "image")).toBe(false);
  expect(graph().edges).toHaveLength(0);
});
it("adds searchable steps and exposes compact optional creative direction", () => {
  render(<Harness initial={{ nodes: [], edges: [] }} />);
  changeField(screen.getByRole("textbox", { name: "Search steps" }), {
    target: { value: "Generate image" },
  });
  const library = screen.getByRole("complementary");
  fireEvent.click(
    within(library).getByRole("button", { name: /Generate image Create/ })
  );
  expect(graph().nodes[0].type).toBe("generate_image");
  fireEvent.click(screen.getByText("Creative direction"));
  fireEvent.click(
    screen.getByRole("checkbox", { name: "Apply a theme and style" })
  );
  expect(graph().nodes[0].config.direction?.theme).toBe("spotlight");
  changeField(screen.getByRole("radiogroup", { name: "Mood" }), {
    target: { value: "premium" },
  });
  expect(graph().nodes[0].config.direction?.mood).toBe("premium");
});

it("offers built-in and custom Apps and configures executable built-ins", () => {
  render(
    <Harness initial={{ nodes: [newWorkflowNode("app", "app")], edges: [] }} />
  );
  fireEvent.click(
    screen.getByRole("button", { name: "Settings for Run an App" })
  );
  allChoiceLabels(screen.getByRole("radiogroup", { name: "App" }));
  expect(screen.getByRole("radio", { name: "Image creator" })).toBeTruthy();
  expect(screen.getByRole("radio", { name: /Custom review/ })).toBeTruthy();
  expect(
    (screen.getByRole("radio", { name: /Creator video/ }) as HTMLOptionElement)
      .disabled
  ).toBe(true);
  changeField(screen.getByRole("radiogroup", { name: "App" }), {
    target: { value: "builtin:image-creator" },
  });
  expect(graph().nodes[0].type).toBe("generate_image");
  expect(graph().nodes[0].config.builtinAppId).toBe("image-creator");
  expect(screen.getByRole("radiogroup", { name: "Aspect ratio" })).toBeTruthy();
  changeField(screen.getByRole("radiogroup", { name: "Aspect ratio" }), {
    target: { value: "9:16" },
  });
  expect(graph().nodes[0].config.ratio).toBe("9:16");
  changeField(screen.getByRole("radiogroup", { name: "App" }), {
    target: { value: "00000000-0000-4000-8000-000000000001" },
  });
  expect(graph().nodes[0].type).toBe("app");
  expect(graph().nodes[0].config.appVersionId).toBe(
    "00000000-0000-4000-8000-000000000001"
  );
  expect(graph().nodes[0].config.builtinAppId).toBeUndefined();
});

it("adds and configures an App field directly on the workflow canvas", () => {
  render(<Harness initial={{ nodes: [], edges: [] }} />);
  fireEvent.click(screen.getByRole("button", { name: "Fields" }));
  changeField(screen.getByRole("textbox", { name: "Search steps" }), {
    target: { value: "theme" },
  });
  fireEvent.click(screen.getByRole("button", { name: /Theme System choices/ }));
  expect(graph().nodes[0].config.field?.kind).toBe("theme");
  expect(screen.getByText("Field settings")).toBeTruthy();
  expect(screen.queryByText("Open App form")).toBeNull();
  fireEvent.click(screen.getByRole("checkbox", { name: "Required" }));
  fireEvent.click(
    screen.getByRole("button", { name: "Select Product Spotlight" })
  );
  expect(graph().nodes[0].config.field).toMatchObject({
    required: true,
    defaultValue: "spotlight",
  });
  fireEvent.click(screen.getByRole("button", { name: "Undo" }));
  expect(graph().nodes[0].config.field?.defaultValue).toBe("");
});

it("builds scheduling from public fields and steps, exposes working settings and typed connections", () => {
  render(<Harness family="optimize" initial={{ nodes: [], edges: [] }} />);
  expect(
    screen.getByText("How to build this scheduling workflow")
  ).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Fields" }));
  changeField(screen.getByRole("textbox", { name: "Search steps" }), {
    target: { value: "Account & date range" },
  });
  fireEvent.click(
    screen.getByRole("button", { name: /Account & date range Defaults/ })
  );
  expect(graph().nodes[0].config.field?.required).toBe(true);
  expect(graph().nodes[0].config.inputType).toBe("data");
  fireEvent.click(screen.getByRole("button", { name: "Add step" }));
  fireEvent.click(screen.getByRole("button", { name: "Steps" }));
  changeField(screen.getByRole("textbox", { name: "Search steps" }), {
    target: { value: "Fetch live Meta" },
  });
  fireEvent.click(
    screen.getByRole("button", {
      name: /Fetch live Meta performance Read fresh/,
    })
  );
  expect(
    screen.getByRole("radiogroup", { name: "Performance to fetch" })
  ).toBeTruthy();
  changeField(
    screen.getByRole("radiogroup", { name: "Performance to fetch" }),
    {
      target: { value: "daily" },
    }
  );
  expect(graph().nodes[1].config.metaPerformance?.includeHourly).toBe(false);
  fireEvent.click(screen.getByRole("button", { name: "Add step" }));
  changeField(screen.getByRole("textbox", { name: "Search steps" }), {
    target: { value: "Optimization engine" },
  });
  fireEvent.click(
    screen.getByRole("button", { name: /Optimization engine Reusable/ })
  );
  changeField(screen.getByRole("radiogroup", { name: "Optimizer" }), {
    target: { value: "weekday_time" },
  });
  expect(screen.queryByLabelText("Verified brief")).toBeNull();
  expect(screen.queryByLabelText("Mode")).toBeNull();
  changeField(screen.getByLabelText("Comparison"), {
    target: { value: "weekday" },
  });
  changeField(screen.getByLabelText("Probability required to propose a test"), {
    target: { value: "0.9" },
  });
  expect(graph().nodes[2].config.optimizer?.scheduling).toMatchObject({
    comparison: "weekday",
    testProbability: 0.9,
  });
  fireEvent.click(
    screen.getByRole("button", {
      name: "Connect output from Account & date range",
    })
  );
  fireEvent.click(
    screen.getByRole("button", {
      name: "Connect account & dates to Fetch live Meta performance",
    })
  );
  fireEvent.click(
    screen.getByRole("button", {
      name: "Connect output from Fetch live Meta performance",
    })
  );
  fireEvent.click(
    screen.getByRole("button", {
      name: "Connect evidence to Optimization engine",
    })
  );
  fireEvent.click(screen.getByRole("button", { name: "Add step" }));
  changeField(screen.getByRole("textbox", { name: "Search steps" }), {
    target: { value: "Collect and preview" },
  });
  fireEvent.click(
    screen.getByRole("button", { name: /Output Collect and preview/ })
  );
  fireEvent.click(
    screen.getByRole("button", {
      name: "Connect output from Optimization engine",
    })
  );
  fireEvent.click(
    screen.getByRole("button", { name: "Connect results to Output" })
  );
  expect(graph().edges).toHaveLength(3);
  expect(workflowGraphProblem(graph())).toBeNull();
  expect(api.error).not.toHaveBeenCalled();
});
