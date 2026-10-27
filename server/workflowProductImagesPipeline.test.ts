import { beforeEach, expect, it, vi } from "vitest";
const api = vi.hoisted(() => ({ read: vi.fn() }));
vi.mock("./lib/videoCatalog", () => ({ readVideoCatalogImage: api.read }));
vi.mock("./lib/optimizationWorkflow", () => ({
  optimizationStep: async () => null,
}));
import { executeWorkflowBusinessStep } from "./lib/workflowBusinessSteps";
import {
  newWorkflowNode,
  workflowNodeSchema,
  workflowNodeImageKeys,
} from "../shared/creativeWorkflow";
beforeEach(() => {
  api.read.mockReset().mockImplementation(async (_db, org, key) => ({
    choice: { url: `/media/${org}/${key}` },
  }));
});
it.each([1, 8, 9, 10])(
  "passes %i ordered product views without duplicating the legacy first image",
  async count => {
    const node = newWorkflowNode("app_input", "product");
    const keys = Array.from(
      { length: count },
      (_, i) => `product_image:${i + 1}`
    );
    node.config.imageKey = keys[0];
    node.config.imageKeys = keys;
    expect(workflowNodeImageKeys(workflowNodeSchema.parse(node))).toEqual(keys);
    const run = {
      organizationId: 3,
      steps: {},
      references: keys.map(key => ({
        key,
        name: key,
        fingerprint: `hash-${key}`,
      })),
    } as any;
    const result = await executeWorkflowBusinessStep({} as any, run, node, []);
    expect(
      result?.outputs?.map(v => (v.type === "image" ? v.key : null))
    ).toEqual(keys);
    expect(api.read).toHaveBeenCalledTimes(count);
    expect(api.read.mock.calls.every(call => call[1] === 3)).toBe(true);
  }
);
it("preserves legacy single-image inputs and fails closed on missing references", async () => {
  const node = newWorkflowNode("app_input", "product");
  node.config.imageKey = "product_image:9";
  expect(workflowNodeImageKeys(node)).toEqual(["product_image:9"]);
  await expect(
    executeWorkflowBusinessStep(
      {} as any,
      { organizationId: 3, steps: {}, references: [] } as any,
      node,
      []
    )
  ).rejects.toThrow(/selected product image/);
});
it("rejects oversized, duplicate and external references at the graph boundary", () => {
  const node = newWorkflowNode("app_input", "product");
  for (const keys of [
    Array.from({ length: 11 }, (_, i) => `product_image:${i + 1}`),
    ["product_image:1", "product_image:1"],
    ["https://foreign.test/photo"],
    ["product_image:2147483648"],
  ]) {
    node.config.imageKeys = keys;
    expect(workflowNodeSchema.safeParse(node).success).toBe(false);
  }
});
it.each(["facebook_post", "meta_ad"] as const)(
  "rejects multiple images before publication save in %s",
  async type => {
    const node = newWorkflowNode(type, "publish");
    const where = vi
      .fn()
      .mockResolvedValueOnce([{ id: 7 }])
      .mockResolvedValueOnce([]);
    const db = { select: () => ({ from: () => ({ where }) }) } as any;
    const run = {
      id: "run",
      organizationId: 3,
      actorUserId: 7,
      steps: { publish: { status: "pending" } },
    } as any;
    await expect(
      executeWorkflowBusinessStep(
        db,
        run,
        node,
        [1, 2].map(id => ({
          type: "image",
          key: `product_image:${id}`,
          url: `/media/${id}`,
          name: `View ${id}`,
          fingerprint: `hash${id}`,
        }))
      )
    ).rejects.toThrow("Choose one image for this publication step");
    expect(api.read).not.toHaveBeenCalled();
  }
);

it("does not treat unrelated node settings as source images or replace a legacy image node with App views", () => {
  const text = newWorkflowNode("text", "text");
  text.config.imageKey = "asset:1";
  text.config.imageKeys = ["product_image:2"];
  expect(workflowNodeImageKeys(text)).toEqual([]);
  const image = newWorkflowNode("image", "image");
  image.config.imageKey = "asset:1";
  image.config.imageKeys = ["product_image:2"];
  expect(workflowNodeImageKeys(image)).toEqual(["asset:1"]);
});
