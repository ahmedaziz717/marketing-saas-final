// @vitest-environment jsdom
import { expect, it } from "vitest";
import { workflowProductReferenceBudget } from "./WorkflowAppStudio";
import { newWorkflowNode } from "@shared/creativeWorkflow";
import { appFieldSchema } from "@shared/workflowInputs";
const seedance = "higgsfield:bytedance/seedance-2.5/reference-to-video";
const eight = "higgsfield:higgsfield/genjutsu/motion-transfer/v1.0";
function fixture(model = seedance) {
  const product = newWorkflowNode("app_input", "product");
  product.config.field = appFieldSchema.parse({
    kind: "product",
    multiple: false,
    maxSelections: 1,
  });
  const video = newWorkflowNode("generate_video", "video");
  video.config.modelId = model;
  return {
    nodes: [product, video],
    edges: [{ id: "a", source: "product", target: "video", port: "image" }],
  };
}
it("keeps the legacy one-SKU published contract while allowing ten selected views", () => {
  expect(
    workflowProductReferenceBudget(fixture(), {}, "product")
  ).toMatchObject({ limit: 10, reserved: 0 });
  expect(fixture().nodes[0].config.field).toMatchObject({
    multiple: false,
    maxSelections: 1,
  });
});
it("reserves other references from the actual provider total before the product cap", () => {
  const graph = fixture();
  const logo = newWorkflowNode("image", "logo");
  logo.config.imageKey = "asset:90";
  graph.nodes.push(logo);
  graph.edges.push({ id: "b", source: "logo", target: "video", port: "image" });
  expect(workflowProductReferenceBudget(graph, {}, "product")).toMatchObject({
    limit: 10,
    reserved: 1,
  });
  graph.nodes[1].config.modelId = eight;
  expect(workflowProductReferenceBudget(graph, {}, "product")).toMatchObject({
    limit: 7,
    reserved: 1,
  });
});
it("uses selected model and traces pass-through nodes without treating text as images", () => {
  const graph = fixture();
  const selector = newWorkflowNode("app_input", "model");
  selector.config.field = appFieldSchema.parse({
    kind: "model",
    defaultValue: seedance,
  });
  graph.nodes.push(selector);
  graph.edges.push({
    id: "m",
    source: "model",
    target: "video",
    port: "model",
  });
  expect(
    workflowProductReferenceBudget(graph, { model: eight }, "product")
  ).toMatchObject({ limit: 8 });
  const review = newWorkflowNode("review", "review");
  graph.nodes.push(review);
  graph.edges[0].target = "review";
  graph.edges.push({
    id: "r",
    source: "review",
    target: "video",
    port: "image",
  });
  expect(
    workflowProductReferenceBudget(graph, { model: eight }, "product")
  ).toMatchObject({ limit: 8 });
});

it("counts repeated paths exactly as runtime rather than silently deduplicating slots", () => {
  const graph = fixture(eight);
  const logo = newWorkflowNode("image", "logo");
  logo.config.imageKey = "asset:90";
  graph.nodes.push(logo);
  graph.edges.push(
    { id: "b", source: "logo", target: "video", port: "image" },
    { id: "c", source: "logo", target: "video", port: "image" }
  );
  expect(workflowProductReferenceBudget(graph, {}, "product")).toMatchObject({
    limit: 6,
    reserved: 2,
  });
  graph.edges.push({
    id: "d",
    source: "product",
    target: "video",
    port: "image",
  });
  expect(workflowProductReferenceBudget(graph, {}, "product")).toMatchObject({
    limit: 3,
    reserved: 2,
  });
});
