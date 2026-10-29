import { expect, it } from "vitest";
import {
  newWorkflowNode,
  workflowGraphSchema,
} from "../shared/creativeWorkflow";
import { appFieldSchema } from "../shared/workflowInputs";
import {
  workflowFieldPlacement,
  workflowFieldValue,
  workflowStudioGroups,
} from "../shared/workflowStudio";
function field(id: string, kind: "text" | "caption" | "voice" | "channel") {
  const n = newWorkflowNode("app_input", id);
  n.title = id;
  n.config.field = appFieldSchema.parse({ kind });
  return n;
}
it("groups older App snapshots without mutation and keeps graph order inside each category", () => {
  const nodes = [
    field("caption", "caption"),
    field("voice", "voice"),
    field("channel", "channel"),
    field("second-caption", "caption"),
  ];
  const graph = { nodes, edges: [] };
  const original = JSON.stringify(graph);
  const groups = workflowStudioGroups(graph, {});
  expect(groups.map(s => s.id)).toEqual(["setup", "direction", "content"]);
  expect(groups[2].categories[0].fields.map(n => n.id)).toEqual([
    "caption",
    "second-caption",
  ]);
  expect(JSON.stringify(graph)).toBe(original);
});
it("persists authored section/category metadata through the graph schema and merges matching category names", () => {
  const first = field("first", "text"),
    second = field("second", "caption");
  first.config.field!.studio = {
    section: "setup",
    category: " Campaign brief ",
  };
  second.config.field!.studio = {
    section: "setup",
    category: "campaign brief",
  };
  const graph = workflowGraphSchema.parse({
    nodes: [first, second],
    edges: [],
  });
  expect(graph.nodes[0].config.field?.studio).toEqual({
    section: "setup",
    category: "Campaign brief",
  });
  const groups = workflowStudioGroups(graph, {});
  expect(groups).toHaveLength(1);
  expect(groups[0].categories).toHaveLength(1);
  expect(groups[0].categories[0].fields).toHaveLength(2);
});
it("uses locked defaults for visibility and removes empty conditional categories", () => {
  const parent = field("parent", "channel"),
    conditional = field("conditional", "caption");
  parent.config.field!.locked = true;
  parent.config.field!.defaultValue = "organic";
  conditional.config.field!.visibleWhen = { fieldId: "parent", equals: "paid" };
  const graph = { nodes: [parent, conditional], edges: [] };
  expect(workflowFieldValue(parent, { parent: "paid" })).toBe("organic");
  expect(
    workflowStudioGroups(graph, { parent: "paid" }).map(s => s.id)
  ).toEqual(["setup"]);
  parent.config.field!.locked = false;
  expect(
    workflowStudioGroups(graph, { parent: "paid" }).map(s => s.id)
  ).toEqual(["setup", "content"]);
});
it("falls back from empty category names and supports legacy source nodes", () => {
  const n = field("brief", "text");
  n.config.field!.studio = { category: "   " };
  expect(workflowFieldPlacement(n).category).toBe("Brief");
  expect(
    workflowFieldPlacement(newWorkflowNode("image", "legacy")).category
  ).toBe("Assets");
  expect(
    appFieldSchema.safeParse({ kind: "text", studio: { section: "results" } })
      .success
  ).toBe(false);
});
