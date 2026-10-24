// @vitest-environment jsdom
import { changeField } from "@/test/choiceControls";
import { useState } from "react";
import { fireEvent, render, screen, cleanup } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { newWorkflowNode, type WorkflowGraph } from "@shared/creativeWorkflow";
vi.mock("@/lib/trpc", () => ({
  trpc: {
    catalog: { overview: { useQuery: () => ({ data: { products: [] } }) } },
    models: {
      catalog: {
        useQuery: () => ({
          data: [
            {
              id: "openai:gpt-image-2.5-sunburst",
              routeId: "openai:gpt-image-2.5-sunburst",
              name: "GPT Image 2.5 Sunburst",
              kind: "image",
              available: true,
            },
            {
              id: "openai:gpt-image-2.5-flare",
              routeId: "openai:gpt-image-2.5-flare",
              name: "GPT Image 2.5 Flare",
              kind: "image",
              available: true,
            },
            {
              id: "openai:gpt-image-1",
              routeId: "openai:gpt-image-1",
              name: "GPT Image 1",
              kind: "image",
              available: false,
              reason: "Unavailable",
            },
          ],
        }),
      },
      textCatalog: {
        useQuery: () => ({
          data: [
            { id: "gpt-5.5", name: "GPT-5.5", kind: "text", available: true },
          ],
        }),
      },
    },
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
  clickJourney(screen.getByRole("button", { name: "+ Add field" }));
  clickJourney(screen.getByLabelText("AI prompt writer"));
  const g = JSON.parse(screen.getByTestId("graph").textContent!);
  expect(g.nodes[1].config.field.kind).toBe("theme");
  expect(g.edges[0].port).toBe("text");
  clickJourney(
    screen.getByRole("button", { name: "Select Product Spotlight" })
  );
  clickJourney(screen.getByRole("button", { name: "Toggle preview" }));
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
  clickJourney(screen.getByRole("button", { name: "+ Add field" }));
  changeField(screen.getByRole("radiogroup", { name: "Studio section" }), {
    target: { value: "setup" },
  });
  changeField(screen.getByLabelText("Category tab"), {
    target: { value: "Campaign context" },
  });
  const graph = JSON.parse(screen.getByTestId("graph").textContent!);
  expect(graph.nodes[0].config.field.studio).toEqual({
    section: "setup",
    category: "Campaign context",
  });
  clickJourney(screen.getByRole("button", { name: "Toggle preview" }));
  expect(screen.getByRole("heading", { name: "Campaign helper" })).toBeTruthy();
  expect(
    screen
      .getByRole("button", { name: "Open Campaign context category" })
      .getAttribute("aria-current")
  ).toBe("true");
  expect(
    screen
      .getByRole("button", { name: /^Setup Context/ })
      .getAttribute("aria-current")
  ).toBe("step");
  expect(
    screen.queryByRole("button", { name: /^Direction Audience/ })
  ).toBeNull();
  clickJourney(screen.getByRole("button", { name: "Next section" }));
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
  changeField(screen.getByLabelText("New field type"), {
    target: { value: "asset" },
  });
  clickJourney(screen.getByRole("button", { name: "+ Add field" }));
  clickJourney(screen.getByLabelText("Offer image upload"));
  clickJourney(screen.getByLabelText("Allow product images"));
  changeField(screen.getByRole("radiogroup", { name: "Price" }), {
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
  clickJourney(screen.getByRole("button", { name: "Toggle preview" }));
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
  changeField(screen.getByLabelText("New field type"), {
    target: { value: "product" },
  });
  clickJourney(screen.getByRole("button", { name: "+ Add field" }));
  clickJourney(screen.getByLabelText("Generate image"));
  expect(
    JSON.parse(screen.getByTestId("graph").textContent!)
      .edges.map((e: any) => e.port)
      .sort()
  ).toEqual(["image", "text"]);
});

// Business-flow checks accept optional discovery prompts; StudioJourney tests cover the prompt itself.
function clickJourney(element: Element) {
  fireEvent.click(element);
  const keep = screen.queryByRole("button", {
    name: /^(Keep defaults & continue|Continue with current choices)$/,
  });
  if (keep) fireEvent.click(keep);
}

it("adds Model selector in App form with one default, lets the designer allow alternatives, and exposes only those choices", () => {
  function Harness() {
    const [graph, setGraph] = useState<WorkflowGraph>({
      nodes: [newWorkflowNode("generate_image", "render")],
      edges: [],
    });
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
  clickJourney(
      screen.getByRole("radio", { name: "Model selector" })
  );
  clickJourney(screen.getByRole("button", { name: "+ Add field" }));
  let graph = JSON.parse(screen.getByTestId("graph").textContent!);
  expect(graph.edges[0]).toMatchObject({
    source: graph.nodes[1].id,
    target: "render",
    port: "model",
  });
  expect(graph.nodes[1].config.field.allowedModelIds).toEqual([
    "openai:gpt-image-2.5-sunburst",
  ]);
  expect(graph.nodes[1].config.field.defaultValue).toBe(
    "openai:gpt-image-2.5-sunburst"
  );
  expect(screen.getByLabelText("Allow GPT Image 2.5 Sunburst")).toHaveProperty(
    "disabled",
    true
  );
  expect(screen.getByLabelText("Allow GPT Image 1")).toHaveProperty(
    "disabled",
    true
  );
  clickJourney(screen.getByLabelText("Allow GPT Image 2.5 Flare"));
  changeField(screen.getByRole("radiogroup", { name: "Default model" }), {
    target: { value: "openai:gpt-image-2.5-flare" },
  });
  graph = JSON.parse(screen.getByTestId("graph").textContent!);
  expect(graph.nodes[1].config.field.allowedModelIds).toHaveLength(2);
  expect(graph.nodes[1].config.field.defaultValue).toBe(
    "openai:gpt-image-2.5-flare"
  );
  expect(graph.nodes[1].config.field.multiple).toBe(false);
  clickJourney(screen.getByRole("button", { name: "Toggle preview" }));
  expect(
    screen
      .getByRole("radio", { name: "GPT Image 2.5 Flare" })
      .getAttribute("aria-checked")
  ).toBe("true");
  expect(screen.queryByRole("radio", { name: /^GPT Image 1/ })).toBeNull();
  changeField(screen.getByRole("radiogroup", { name: "Model selector" }), {
    target: { value: "openai:gpt-image-2.5-sunburst" },
  });
  expect(
    screen
      .getByRole("radio", { name: "GPT Image 2.5 Sunburst" })
      .getAttribute("aria-checked")
  ).toBe("true");
});
