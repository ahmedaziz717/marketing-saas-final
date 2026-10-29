import { expect, it } from "vitest";
import { newWorkflowNode } from "@shared/creativeWorkflow";
import { appFieldSchema } from "@shared/workflowInputs";
import {
  workflowTargetInputState,
  workflowModelInputStates,
} from "./WorkflowModelInputs";
function fixture() {
  const product = newWorkflowNode("app_input", "product");
  product.config.field = appFieldSchema.parse({ kind: "product" });
  const model = newWorkflowNode("app_input", "model");
  const video = newWorkflowNode("generate_video", "video");
  return {
    nodes: [product, model, video],
    edges: [
      { id: "a", source: "product", target: "video", port: "image" },
      { id: "m", source: "model", target: "video", port: "model" },
    ],
  };
}
it.each([1, 2, 6, 10])(
  "expands %s selected product views instead of counting the binding once",
  count => {
    const graph = fixture();
    const values = {
      product: JSON.stringify({
        productId: 1,
        imageKeys: Array.from(
          { length: count },
          (_, i) => `product_image:${i + 1}`
        ),
      }),
    };
    expect(workflowTargetInputState(graph, graph.nodes[2], values)).toEqual({
      images: count,
      hasVideo: false,
      audio: 0,
    });
    expect(workflowModelInputStates(graph, "model", values)[0].images).toBe(
      count
    );
    graph.edges.push({
      id: "duplicate",
      source: "product",
      target: "video",
      port: "image",
    });
    expect(workflowTargetInputState(graph, graph.nodes[2], values).images).toBe(
      count * 2
    );
  }
);
it("distinguishes authoring unknowns, runtime empty fields, and legacy automatic hero resolution", () => {
  const graph = fixture();
  expect(workflowTargetInputState(graph, graph.nodes[2]).images).toBeNull();
  expect(workflowTargetInputState(graph, graph.nodes[2], {}).images).toBe(0);
  expect(
    workflowTargetInputState(graph, graph.nodes[2], { product: "42" }).images
  ).toBeNull();
});
it("tracks static video input and preserves unknown generated outputs", () => {
  const graph = fixture();
  graph.nodes[2].config.sourceVideoKey = "asset:9";
  expect(workflowTargetInputState(graph, graph.nodes[2], {}).hasVideo).toBe(
    true
  );
  graph.nodes[2].config.sourceVideoKey = null;
  const image = newWorkflowNode("generate_image", "dynamic");
  graph.nodes.push(image);
  graph.edges.push({
    id: "d",
    source: "dynamic",
    target: "video",
    port: "image",
  });
  expect(workflowTargetInputState(graph, graph.nodes[2], {}).images).toBeNull();
});
it("checks every target of a model selector independently", () => {
  const graph = fixture();
  const second = newWorkflowNode("generate_video", "second");
  second.config.sourceVideoKey = "asset:9";
  graph.nodes.push(second);
  graph.edges.push({
    id: "m2",
    source: "model",
    target: "second",
    port: "model",
  });
  expect(workflowModelInputStates(graph, "model", {})).toEqual([
    { images: 0, hasVideo: false, audio: 0 },
    { images: 0, hasVideo: true, audio: 0 },
  ]);
});

it("does not infer hidden zero from an unresolved authoring visibility condition", () => {
  const graph = fixture();
  const parent = newWorkflowNode("app_input", "switch");
  parent.config.field = appFieldSchema.parse({
    kind: "choice",
    defaultValue: "no",
  });
  graph.nodes.push(parent);
  graph.nodes[0].config.field = appFieldSchema.parse({
    kind: "product",
    locked: true,
    defaultValue: JSON.stringify({
      productId: 1,
      imageKeys: ["product_image:1"],
    }),
    visibleWhen: { fieldId: "switch", equals: "yes" },
  });
  expect(workflowTargetInputState(graph, graph.nodes[2]).images).toBeNull();
  expect(
    workflowTargetInputState(graph, graph.nodes[2], { switch: "no" }).images
  ).toBe(0);
  expect(
    workflowTargetInputState(graph, graph.nodes[2], { switch: "yes" }).images
  ).toBe(1);
});

it("retains a known lower bound when another image binding is dynamic", () => {
  const graph = fixture();
  const generated = newWorkflowNode("generate_image", "dynamic");
  graph.nodes.push(generated);
  graph.edges.push({
    id: "d",
    source: "dynamic",
    target: "video",
    port: "image",
  });
  const state = workflowTargetInputState(graph, graph.nodes[2], {
    product: JSON.stringify({
      productId: 1,
      imageKeys: Array.from({ length: 6 }, (_, i) => `product_image:${i + 1}`),
    }),
  });
  expect(state.images).toBeNull();
  expect(state.minimumImages).toBe(6);
});
