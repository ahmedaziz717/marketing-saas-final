// @vitest-environment jsdom
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
    workflows: {
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
import {
  newWorkflowNode,
  workflowTemplate,
  type WorkflowGraph,
} from "@shared/creativeWorkflow";
function Harness({ initial }: { initial: WorkflowGraph }) {
  const [graph, setGraph] = useState(initial);
  return (
    <>
      <output data-testid="graph">{JSON.stringify(graph)}</output>
      <WorkflowCanvas
        graph={graph}
        onChange={setGraph}
        organizationId={1}
        role="owner"
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
  fireEvent.change(screen.getByLabelText("Aspect ratio"), {
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
  fireEvent.change(screen.getByRole("textbox", { name: "Search steps" }), {
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
  fireEvent.change(screen.getByLabelText("Mood"), {
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
  expect(screen.getByRole("option", { name: "Image creator" })).toBeTruthy();
  expect(screen.getByRole("option", { name: /Custom review/ })).toBeTruthy();
  expect(
    (screen.getByRole("option", { name: /Creator video/ }) as HTMLOptionElement)
      .disabled
  ).toBe(true);
  fireEvent.change(screen.getByLabelText("App"), {
    target: { value: "builtin:image-creator" },
  });
  expect(graph().nodes[0].type).toBe("generate_image");
  expect(graph().nodes[0].config.builtinAppId).toBe("image-creator");
  expect(screen.getByLabelText("Aspect ratio")).toBeTruthy();
  fireEvent.change(screen.getByLabelText("Aspect ratio"), {
    target: { value: "9:16" },
  });
  expect(graph().nodes[0].config.ratio).toBe("9:16");
  fireEvent.change(screen.getByLabelText("App"), {
    target: { value: "00000000-0000-4000-8000-000000000001" },
  });
  expect(graph().nodes[0].type).toBe("app");
  expect(graph().nodes[0].config.appVersionId).toBe(
    "00000000-0000-4000-8000-000000000001"
  );
  expect(graph().nodes[0].config.builtinAppId).toBeUndefined();
});
