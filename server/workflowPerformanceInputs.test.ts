import { expect, it, vi, beforeEach } from "vitest";
import { newWorkflowNode } from "../shared/creativeWorkflow";
import { withPerformanceInputs } from "../shared/workflowPerformanceInputs";
import {
  fieldValueProblem,
  parsePerformanceInput,
} from "../shared/workflowInputs";
const connection = vi.hoisted(() => vi.fn());
vi.mock("./lib/channelConnections", () => ({ getConnection: connection }));
import { resolveWorkflowInputs } from "./lib/workflowInputs";
const cid = "00000000-0000-4000-8000-000000000099";
function graph() {
  const input = newWorkflowNode("app_input", "evidence");
  input.config.inputType = "data";
  const engine = newWorkflowNode("optimize_dimension", "engine");
  engine.config.optimizer = {
    kind: "weekday_time",
    channel: "meta_ads",
    mode: "analyze",
    brief: "",
  };
  return {
    nodes: [input, engine],
    edges: [
      { id: "in", source: "evidence", target: "engine", port: "evidence" },
    ],
  };
}
const value = JSON.stringify({
  connectionId: cid,
  range: { since: "2026-09-01", until: "2026-09-30" },
});
beforeEach(() => {
  connection.mockReset();
  connection.mockResolvedValue({ status: "connected" });
});
it("exposes legacy optimizer requirements without changing processing or mutating the saved graph", () => {
  const original = graph(),
    ready = withPerformanceInputs(original);
  expect(ready.nodes[0].config.field?.kind).toBe("performance_data");
  expect(ready.nodes[0].config.field?.required).toBe(true);
  expect(original.nodes[0].config.field).toBeUndefined();
  expect(ready.nodes[1]).toEqual(original.nodes[1]);
  expect(withPerformanceInputs(ready)).toEqual(ready);
});
it("rejects empty, invalid, reversed and over-one-year form inputs before execution", async () => {
  const ready = withPerformanceInputs(graph()),
    f = ready.nodes[0].config.field!;
  for (const bad of [
    "",
    "hello",
    "{}",
    JSON.stringify({
      connectionId: cid,
      range: { since: "2026-09-30", until: "2026-09-01" },
    }),
    JSON.stringify({
      connectionId: cid,
      range: { since: "2026-01-01", until: "2027-01-02" },
    }),
  ]) {
    expect(fieldValueProblem(f, bad)).not.toBeNull();
  }
  expect(fieldValueProblem(f, value)).toBeNull();
  await expect(resolveWorkflowInputs({} as any, 12, ready)).rejects.toThrow(
    /account.*date range/
  );
  expect(connection).not.toHaveBeenCalled();
});
it("binds actual account and dates to a live read without creating an import step", async () => {
  const ready = withPerformanceInputs(graph());
  ready.nodes[0].config.fieldValue = value;
  const resolved = await resolveWorkflowInputs({} as any, 12, ready);
  expect(connection).toHaveBeenCalledWith({}, 12, cid, "meta_ads");
  expect(resolved.nodes[0].type).toBe("app_input");
  expect(resolved.nodes[0].config.performanceRequest?.range).toEqual(
    parsePerformanceInput(value)?.range
  );
  expect(resolved.nodes[0].config.performanceRequest?.connectionId).toBe(cid);
  expect(resolved.nodes.some(n => n.type === "meta_history")).toBe(false);
  expect(ready.nodes[0].type).toBe("app_input");
});
it("preserves nested evidence without prompting for or replacing caller data", async () => {
  const ready = withPerformanceInputs(graph());
  ready.nodes.push(newWorkflowNode("analyze_history", "caller"));
  ready.edges.push({
    id: "call",
    source: "caller",
    target: "evidence",
    port: "context",
  });
  const resolved = await resolveWorkflowInputs({} as any, 12, ready);
  expect(resolved.nodes[0].type).toBe("app_input");
  expect(resolved.nodes[0].config.inputType).toBe("data");
  expect(connection).not.toHaveBeenCalled();
});
it("rejects unavailable tenant connections and disconnected accounts", async () => {
  const ready = withPerformanceInputs(graph());
  ready.nodes[0].config.fieldValue = value;
  connection.mockRejectedValueOnce(
    new Error("Connection not found in this workspace.")
  );
  await expect(resolveWorkflowInputs({} as any, 12, ready)).rejects.toThrow(
    /workspace/
  );
  connection.mockResolvedValueOnce({ status: "disconnected" });
  await expect(resolveWorkflowInputs({} as any, 12, ready)).rejects.toThrow(
    /Reconnect/
  );
});

it("inserts a visible fetch exactly once, retains IDs and leaves pinned versions unchanged", () => {
  const original = graph();
  const ready = withPerformanceInputs(original);
  const fetch = ready.nodes.find(n => n.type === "meta_performance")!;
  expect(fetch).toBeDefined();
  expect(ready.edges).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        source: "evidence",
        target: fetch.id,
        port: "request",
      }),
      expect.objectContaining({
        source: fetch.id,
        target: "engine",
        port: "evidence",
      }),
    ])
  );
  expect(withPerformanceInputs(ready)).toEqual(ready);
  expect(original.nodes).toHaveLength(2);
  const pinned = withPerformanceInputs(original, false);
  expect(pinned.nodes).toHaveLength(2);
  expect(pinned.edges).toEqual(original.edges);
});
