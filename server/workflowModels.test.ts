import { expect, it, vi } from "vitest";
import {
  newWorkflowNode,
  workflowGraphProblem,
  type WorkflowGraph,
} from "../shared/creativeWorkflow";
import { appFieldSchema, fieldValueProblem } from "../shared/workflowInputs";
import {
  workflowModelFieldDefaults,
  workflowModelFieldProblem,
  workflowModelCompatibility,
} from "../shared/workflowModels";
import {
  DEFAULT_IMAGE_MODEL,
  DEFAULT_VIDEO_MODEL,
  generationModels,
  modelDefaults,
} from "../shared/modelCatalog";
const state = vi.hoisted(() => ({ resolve: vi.fn() }));
vi.mock("./lib/modelCatalog", () => ({
  resolveModel: (...args: unknown[]) => state.resolve(...args),
}));
import { resolveWorkflowInputs } from "./lib/workflowInputs";
const alternative = "openai:gpt-image-2.5-flare";
function graph(): WorkflowGraph {
  const target = newWorkflowNode("generate_image", "render");
  target.config.text = "A product photo";
  target.config.modelOptions = { quality: "high" };
  const field = newWorkflowNode("app_input", "models");
  field.config.field = appFieldSchema.parse(workflowModelFieldDefaults(target));
  return {
    nodes: [field, target],
    edges: [
      { id: "model-edge", source: "models", target: "render", port: "model" },
    ],
  };
}
it("starts with one allowed model and preserves its authored options", () => {
  const g = graph(),
    f = g.nodes[0].config.field!;
  expect(f.allowedModelIds).toEqual([DEFAULT_IMAGE_MODEL]);
  expect(f.defaultValue).toBe(DEFAULT_IMAGE_MODEL);
  expect(f.modelSettings?.[DEFAULT_IMAGE_MODEL]).toEqual({ quality: "high" });
  expect(f.multiple).toBe(false);
  expect(fieldValueProblem(f, alternative)).toMatch(/allowed/);
  expect(fieldValueProblem(f, JSON.stringify([DEFAULT_IMAGE_MODEL]))).toMatch(
    /one model/
  );
  expect(
    fieldValueProblem({ ...f, defaultValue: alternative }, DEFAULT_IMAGE_MODEL)
  ).toMatch(/default/);
  expect(
    fieldValueProblem({ ...f, multiple: true }, DEFAULT_IMAGE_MODEL)
  ).toMatch(/exactly one/);
});
it("applies only a designer-allowed selection with that model's own settings", async () => {
  state.resolve.mockImplementation(async (_db, id) => ({ id }));
  const g = graph(),
    field = g.nodes[0];
  field.config.field!.allowedModelIds!.push(alternative);
  field.config.field!.modelSettings![alternative] = { quality: "low" };
  field.config.fieldValue = alternative;
  const result = await resolveWorkflowInputs({} as any, 1, g);
  expect(result.nodes[1].config).toMatchObject({
    modelId: alternative,
    modelOptions: { quality: "low" },
  });
  expect(result.nodes[0].config.text).toBe("");
  expect(g.nodes[1].config.modelId).toBeUndefined();
  field.config.fieldValue = DEFAULT_VIDEO_MODEL;
  await expect(resolveWorkflowInputs({} as any, 1, g)).rejects.toThrow(
    /allowed/
  );
});
it("uses the default for locked or conditionally hidden model inputs", async () => {
  state.resolve.mockImplementation(async (_db, id) => ({ id }));
  for (const patch of [
    { locked: true },
    { visibleWhen: { fieldId: "absent", equals: "yes" } },
  ]) {
    const g = graph();
    Object.assign(g.nodes[0].config.field!, patch);
    g.nodes[0].config.fieldValue = "tampered";
    expect(
      (await resolveWorkflowInputs({} as any, 1, g)).nodes[1].config.modelId
    ).toBe(DEFAULT_IMAGE_MODEL);
  }
});
it("rejects disabled provider models and mismatched ports or step types", async () => {
  state.resolve.mockRejectedValue(new Error("This model is unavailable"));
  await expect(resolveWorkflowInputs({} as any, 1, graph())).rejects.toThrow(
    /unavailable/
  );
  const g = graph();
  g.edges[0].port = "text";
  expect(workflowGraphProblem(g)).toMatch(/Model input/);
  g.edges[0].port = "model";
  g.nodes[1].type = "assistant";
  expect(workflowGraphProblem(g)).toMatch(/matching/);
  g.nodes[1].type = "generate_image";
  g.edges.push({ ...g.edges[0], id: "duplicate" });
  expect(workflowGraphProblem(g)).toMatch(/Too many inputs/);
});
it("checks every allowed video model's source requirements before publishing", () => {
  const sourceRequired = generationModels.find(
    m =>
      m.kind === "video" &&
      m.inputSchema.required?.includes("video_url") &&
      !m.inputSchema.required.some(k =>
        ["image_url", "image_urls", "first_frame_url"].includes(k)
      )
  )!;
  const target = newWorkflowNode("generate_video", "render");
  target.config.modelId = sourceRequired.id;
  target.config.modelOptions = modelDefaults(sourceRequired);
  const field = newWorkflowNode("app_input", "models");
  field.config.field = appFieldSchema.parse(workflowModelFieldDefaults(target));
  const g: WorkflowGraph = {
    nodes: [field, target],
    edges: [{ id: "e", source: "models", target: "render", port: "model" }],
  };
  expect(workflowModelFieldProblem(g, field)).toBeNull();
  expect(workflowModelCompatibility(g, target, sourceRequired.id)).toMatch(
    /source video/
  );
  target.config.sourceVideoKey = "asset:1";
  expect(workflowModelCompatibility(g, target, sourceRequired.id)).toBeNull();
});
