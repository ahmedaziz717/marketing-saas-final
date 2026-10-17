// @vitest-environment jsdom
import { useState } from "react";
import { fireEvent, render, screen, cleanup } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { newWorkflowNode, type WorkflowGraph } from "@shared/creativeWorkflow";
vi.mock("@/lib/trpc", () => ({
  trpc: {
    catalog: { overview: { useQuery: () => ({ data: { products: [] } }) } },
    assetLibrary: { studioList: { useQuery: () => ({ data: [] }) } },
    workflows: {
      mediaChoices: {
        useQuery: () => ({
          data: {
            products: [],
            assets: [],
            pageIds: [],
            nextOffset: null,
            role: "owner",
          },
        }),
      },
      assistInput: {
        useMutation: () => ({ mutateAsync: vi.fn(), isPending: false }),
      },
    },
  },
}));
import { WorkflowFormEditor } from "./WorkflowFormEditor";
afterEach(cleanup);
it("adds a reusable field, connects it, and previews the same default", () => {
  function Harness() {
    const [g, setG] = useState<WorkflowGraph>({
      nodes: [newWorkflowNode("assistant", "writer")],
      edges: [],
    });
    const [preview, setPreview] = useState(false);
    return (
      <>
        <button onClick={() => setPreview(!preview)}>Toggle preview</button>
        <WorkflowFormEditor
          graph={g}
          onChange={setG}
          organizationId={1}
          preview={preview}
        />
        <output data-testid="graph">{JSON.stringify(g)}</output>
      </>
    );
  }
  render(<Harness />);
  fireEvent.click(screen.getByRole("button", { name: "+ Add field" }));
  fireEvent.click(screen.getByLabelText("AI prompt writer"));
  const g = JSON.parse(screen.getByTestId("graph").textContent!);
  expect(g.nodes[1].config.field.kind).toBe("theme");
  expect(g.edges[0].port).toBe("text");
  fireEvent.click(
    screen.getByRole("button", { name: "Select Product Spotlight" })
  );
  fireEvent.click(screen.getByRole("button", { name: "Toggle preview" }));
  expect(
    screen
      .getByRole("button", { name: "Select Product Spotlight" })
      .getAttribute("aria-pressed")
  ).toBe("true");
  expect(
    screen
      .getByRole("img", { name: "Product Spotlight visual inspiration" })
      .getAttribute("src")
  ).toBe("/studio-art/spotlight.webp");
  expect(
    screen.getByText("This preview does not run the workflow or spend credits.")
  ).toBeTruthy();
});

it("publishes the same authored grouping in the Studio preview while preserving defaults", () => {
  function Harness() {
    const [g, setG] = useState<WorkflowGraph>({ nodes: [], edges: [] });
    const [preview, setPreview] = useState(false);
    return (
      <>
        <button onClick={() => setPreview(!preview)}>Toggle preview</button>
        <WorkflowFormEditor
          graph={g}
          onChange={setG}
          organizationId={1}
          preview={preview}
          appName="Campaign helper"
        />
        <output data-testid="graph">{JSON.stringify(g)}</output>
      </>
    );
  }
  render(<Harness />);
  fireEvent.click(screen.getByRole("button", { name: "+ Add field" }));
  fireEvent.change(screen.getByLabelText("Studio section"), {
    target: { value: "setup" },
  });
  fireEvent.change(screen.getByLabelText("Category tab"), {
    target: { value: "Campaign context" },
  });
  const graph = JSON.parse(screen.getByTestId("graph").textContent!);
  expect(graph.nodes[0].config.field.studio).toEqual({
    section: "setup",
    category: "Campaign context",
  });
  fireEvent.click(screen.getByRole("button", { name: "Toggle preview" }));
  expect(screen.getByRole("heading", { name: "Campaign helper" })).toBeTruthy();
  expect(
    screen
      .getByRole("button", { name: "Campaign context" })
      .getAttribute("aria-pressed")
  ).toBe("true");
  expect(
    screen
      .getByRole("button", { name: /^Setup Context/ })
      .getAttribute("aria-current")
  ).toBe("step");
  expect(
    screen.queryByRole("button", { name: /^Direction Audience/ })
  ).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Review inputs" }));
  expect(
    (
      screen.getByRole("button", {
        name: "Review credits & run",
      }) as HTMLButtonElement
    ).disabled
  ).toBe(true);
});

it("stores image sources and content policy on the workflow field and previews its controls", () => {
  function Harness() {
    const [graph, setGraph] = useState<WorkflowGraph>({ nodes: [], edges: [] });
    const [preview, setPreview] = useState(false);
    return (
      <>
        <button onClick={() => setPreview(!preview)}>Toggle preview</button>
        <WorkflowFormEditor
          graph={graph}
          onChange={setGraph}
          organizationId={1}
          preview={preview}
        />
        <output data-testid="graph">{JSON.stringify(graph)}</output>
      </>
    );
  }
  render(<Harness />);
  fireEvent.change(screen.getByLabelText("New field type"), {
    target: { value: "asset" },
  });
  fireEvent.click(screen.getByRole("button", { name: "+ Add field" }));
  fireEvent.click(screen.getByLabelText("Offer image upload"));
  fireEvent.click(screen.getByLabelText("Allow product images"));
  fireEvent.change(screen.getByLabelText("Price"), {
    target: { value: "never" },
  });
  const field = JSON.parse(screen.getByTestId("graph").textContent!).nodes[0]
    .config.field;
  expect(field.media).toMatchObject({
    allowUpload: true,
    approvedAssets: true,
    productImages: false,
    price: "never",
  });
  fireEvent.click(screen.getByRole("button", { name: "Toggle preview" }));
  expect(screen.queryByRole("button", { name: "Product images" })).toBeNull();
  expect(screen.getByRole("button", { name: "Upload image" })).toHaveProperty(
    "disabled",
    true
  );
});

it("connects a product field's image and content to the selected generation unit", () => {
  function Harness() {
    const [graph, setGraph] = useState<WorkflowGraph>({
      nodes: [newWorkflowNode("generate_image", "render")],
      edges: [],
    });
    return (
      <>
        <WorkflowFormEditor
          graph={graph}
          onChange={setGraph}
          organizationId={1}
        />
        <output data-testid="graph">{JSON.stringify(graph)}</output>
      </>
    );
  }
  render(<Harness />);
  fireEvent.change(screen.getByLabelText("New field type"), {
    target: { value: "product" },
  });
  fireEvent.click(screen.getByRole("button", { name: "+ Add field" }));
  fireEvent.click(screen.getByLabelText("Generate image"));
  expect(
    JSON.parse(screen.getByTestId("graph").textContent!)
      .edges.map((e: any) => e.port)
      .sort()
  ).toEqual(["image", "text"]);
});
