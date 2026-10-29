import { eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { afterAll, beforeAll, expect, it, vi } from "vitest";
import {
  users,
  organizations,
  products,
  productImages,
} from "../drizzle/schema";
import {
  creativeWorkflows,
  workflowAppVersions,
} from "../drizzle/workflowSchema";
import {
  newWorkflowNode,
  type WorkflowGraph,
} from "../shared/creativeWorkflow";
import { appFieldSchema } from "../shared/workflowInputs";
import { workflowRunInputSchema } from "../shared/workflowRunInput";
import {
  applyWorkflowRunInputs,
  resolveRunnableWorkflow,
} from "./lib/workflowRunInput";
import { resolveWorkflowInputs } from "./lib/workflowInputs";
import { resolveWorkflowApps } from "./lib/workflowApps";
const state = vi.hoisted(() => ({
  model: vi.fn(async (_db: unknown, id: string) => ({ id })),
}));
vi.mock("./lib/modelCatalog", () => ({ resolveModel: state.model }));
import { DEFAULT_IMAGE_MODEL } from "../shared/modelCatalog";

const engine = new PGlite();
const db = drizzle(engine);
const id = randomUUID(),
  appId = randomUUID(),
  nestedId = randomUUID(),
  nestedAppId = randomUUID();
function typed(id: string, field: Parameters<typeof appFieldSchema.parse>[0]) {
  const node = newWorkflowNode("app_input", id);
  node.config.field = appFieldSchema.parse(field);
  return node;
}
const rootGraph: WorkflowGraph = {
  nodes: [typed("brief", { kind: "text", defaultValue: "Published brief" })],
  edges: [],
};
beforeAll(async () => {
  await migrate(db, { migrationsFolder: "drizzle/postgres" });
  await db.insert(users).values({ id: 1, openId: "runtime-input-owner" });
  await db.insert(organizations).values(
    [1, 2].map(id => ({
      id,
      name: `Input ${id}`,
      slug: `runtime-input-${id}`,
      createdByUserId: 1,
      createdAtMs: 1,
    }))
  );
  await db.insert(creativeWorkflows).values([
    {
      id,
      organizationId: 1,
      actorUserId: 1,
      name: "Newer draft",
      family: "create",
      graph: { nodes: [newWorkflowNode("text", "new")], edges: [] },
      revision: 5,
      createdAtMs: 1,
      updatedAtMs: 1,
    },
    {
      id: nestedId,
      organizationId: 1,
      actorUserId: 1,
      name: "Nested",
      family: "create",
      graph: rootGraph,
      revision: 1,
      createdAtMs: 1,
      updatedAtMs: 1,
    },
  ]);
  await db.insert(workflowAppVersions).values([
    {
      id: appId,
      organizationId: 1,
      workflowId: id,
      workflowRevision: 2,
      version: 1,
      name: "Pinned",
      family: "create",
      graph: rootGraph,
      actorUserId: 1,
      createdAtMs: 1,
    },
    {
      id: nestedAppId,
      organizationId: 1,
      workflowId: nestedId,
      workflowRevision: 1,
      version: 1,
      name: "Nested",
      family: "create",
      graph: {
        nodes: [
          newWorkflowNode("app_input", "one"),
          newWorkflowNode("app_input", "two"),
          newWorkflowNode("output", "result"),
        ],
        edges: [
          { id: "o1", source: "one", target: "result", port: "result" },
          { id: "o2", source: "two", target: "result", port: "result" },
        ],
      },
      actorUserId: 1,
      createdAtMs: 1,
    },
  ]);
  await db.insert(products).values(
    [1, 2, 3, 4].map(productId => ({
      id: productId,
      organizationId: productId === 2 ? 2 : 1,
      name: `Product ${productId}`,
      productUrl: `https://products.example/${productId}`,
      dedupeKey: `runtime-${productId}`,
      status:
        productId === 3
          ? ("pending" as const)
          : productId === 4
            ? ("rejected" as const)
            : ("approved" as const),
      specifications: { Color: "Black" },
      provenance: {},
      createdAtMs: 1,
      updatedAtMs: 1,
    }))
  );
  await db.insert(productImages).values(
    [1, 2].map(productId => ({
      id: productId,
      organizationId: productId,
      productId,
      url: `https://images.example/${productId}.png`,
      sourceUrl: `https://images.example/${productId}.png`,
      storageKey: `org-${productId}/products/${productId}.png`,
      createdAtMs: 1,
    }))
  );
});
afterAll(() => engine.close());
it("expands a legacy image node product field into a multi-view App input", async () => {
  await db
    .insert(productImages)
    .values({
      id: 3,
      organizationId: 1,
      productId: 1,
      url: "https://images.example/alternate.png",
      sourceUrl: "https://images.example/alternate.png",
      storageKey: "org-1/products/alternate.png",
      createdAtMs: 1,
    });
  const node = newWorkflowNode("image", "legacy-product");
  node.config.field = appFieldSchema.parse({ kind: "product" });
  node.config.fieldValue = JSON.stringify({
    productId: 1,
    imageKey: "product_image:1",
    imageKeys: ["product_image:1", "product_image:3"],
  });
  const result = await resolveWorkflowInputs(db as any, 1, {
    nodes: [node],
    edges: [],
  });
  expect(result.nodes[0].type).toBe("app_input");
  expect(result.nodes[0].config.imageKeys).toEqual([
    "product_image:1",
    "product_image:3",
  ]);
  expect(result.nodes[0].config.imageKey).toBe("product_image:1");
});

it("bounds strict input contracts and rejects duplicate IDs, conflicting payloads and unknown fields", () => {
  const base = { organizationId: 1, id, revision: 1 };
  expect(
    workflowRunInputSchema.parse({ ...base, inputs: [{ id: "image" }] }).inputs
  ).toEqual([{ id: "image" }]);
  for (const inputs of [
    [
      { id: "brief", value: "one" },
      { id: "brief", value: "two" },
    ],
    [{ id: "brief", value: "one", text: "two" }],
    [{ id: "brief", value: "one", config: {} }],
    Array.from({ length: 41 }, (_, i) => ({ id: `id${i}`, value: "x" })),
  ])
    expect(workflowRunInputSchema.safeParse({ ...base, inputs }).success).toBe(
      false
    );
});
it("uses pinned App source revision and graph while preserving the legacy run revision", async () => {
  const result = await resolveRunnableWorkflow(db as any, {
    organizationId: 1,
    id,
    appVersionId: appId,
    revision: 5,
    inputs: [{ id: "brief", value: "One-off prompt" }],
  });
  expect(result.revision).toBe(5);
  expect(result.sourceRevision).toBe(2);
  expect(result.graph.nodes[0].config.fieldValue).toBe("One-off prompt");
  expect(rootGraph.nodes[0].config.fieldValue).toBeUndefined();
  const unchanged = await resolveRunnableWorkflow(db as any, {
    organizationId: 1,
    id,
    appVersionId: appId,
    revision: 2,
  });
  expect(unchanged.graph.nodes[0].config.fieldValue).toBeUndefined();
  await expect(
    resolveRunnableWorkflow(db as any, { organizationId: 2, id, revision: 5 })
  ).rejects.toMatchObject({ code: "NOT_FOUND" });
  await expect(
    resolveRunnableWorkflow(db as any, {
      organizationId: 1,
      id,
      appVersionId: nestedAppId,
      revision: 1,
    })
  ).rejects.toMatchObject({ code: "BAD_REQUEST" });
});
it("preserves locked defaults and visibility through the existing resolver, rejecting conflicting overrides", async () => {
  const graph: WorkflowGraph = {
    nodes: [
      typed("choice", { kind: "text", defaultValue: "hide", locked: true }),
      typed("detail", {
        kind: "text",
        required: true,
        visibleWhen: { fieldId: "choice", equals: "show" },
      }),
    ],
    edges: [],
  };
  expect(() =>
    applyWorkflowRunInputs(graph, [{ id: "choice", value: "show" }])
  ).toThrow("locked");
  expect(() =>
    applyWorkflowRunInputs(graph, [{ id: "unknown", value: "x" }])
  ).toThrow("declared");
  const result = await resolveWorkflowInputs(
    db as any,
    1,
    applyWorkflowRunInputs(graph, [
      { id: "choice", value: "hide" },
      { id: "detail", value: "Should not contribute" },
    ])
  );
  expect(result.nodes[1].config.text).toBe("");
  expect(graph.nodes[1].config.fieldValue).toBeUndefined();
});
it("keeps legacy text/image payload compatibility while rejecting wrong payload types", () => {
  const graph: WorkflowGraph = {
    nodes: [newWorkflowNode("text", "copy"), newWorkflowNode("image", "photo")],
    edges: [],
  };
  const result = applyWorkflowRunInputs(graph, [
    { id: "copy", text: "One-off" },
    { id: "photo", imageKey: "product_image:1" },
  ]);
  expect(result.nodes[0].config.text).toBe("One-off");
  expect(result.nodes[1].config.imageKey).toBe("product_image:1");
  expect(() =>
    applyWorkflowRunInputs(graph, [{ id: "copy", imageKey: "asset:1" }])
  ).toThrow("text");
});
it("resolves owned draft facts without approving pending records and rejects foreign/rejected/mismatched references", async () => {
  const graph: WorkflowGraph = {
    nodes: [typed("product", { kind: "product" })],
    edges: [],
  };
  const resolved = await resolveWorkflowInputs(
    db as any,
    1,
    applyWorkflowRunInputs(graph, [{ id: "product", value: "1" }])
  );
  expect(resolved.nodes[0].config.text).toContain("Product 1");
  const pending = await resolveWorkflowInputs(
    db as any,
    1,
    applyWorkflowRunInputs(graph, [{ id: "product", value: "3" }])
  );
  expect(pending.nodes[0].config.text).toContain("Product 3");
  expect(
    (await db.select().from(products).where(eq(products.id, 3)))[0].status
  ).toBe("pending");
  for (const value of [
    "2",
    "4",
    JSON.stringify({ productId: 1, imageKey: "product_image:2" }),
  ])
    await expect(
      resolveWorkflowInputs(
        db as any,
        1,
        applyWorkflowRunInputs(graph, [{ id: "product", value }])
      )
    ).rejects.toThrow();
});
it("uses the same allowed model contract after runtime overrides", async () => {
  const field = typed("model", {
    kind: "model",
    modelKind: "image",
    allowedModelIds: [DEFAULT_IMAGE_MODEL],
    defaultValue: DEFAULT_IMAGE_MODEL,
    modelSettings: { [DEFAULT_IMAGE_MODEL]: { quality: "medium" } },
  });
  const target = newWorkflowNode("generate_image", "render");
  const graph: WorkflowGraph = {
    nodes: [field, target],
    edges: [
      { id: "model-edge", source: "model", target: "render", port: "model" },
    ],
  };
  const resolved = await resolveWorkflowInputs(
    db as any,
    1,
    applyWorkflowRunInputs(graph, [{ id: "model", value: DEFAULT_IMAGE_MODEL }])
  );
  expect(resolved.nodes[1].config.modelId).toBe(DEFAULT_IMAGE_MODEL);
  await expect(
    resolveWorkflowInputs(
      db as any,
      1,
      applyWorkflowRunInputs(graph, [{ id: "model", value: "invented" }])
    )
  ).rejects.toThrow("allowed");
});
it("keeps exact nested multi-input mappings and disallows direct prefixed-child overrides", async () => {
  const left = newWorkflowNode("text", "left"),
    right = newWorkflowNode("text", "right"),
    app = newWorkflowNode("run_workflow", "child");
  app.config.appVersionId = nestedAppId;
  app.config.inputMapping = [
    { targetNodeId: "one", sourceNodeId: "left", type: "text" },
    { targetNodeId: "two", sourceNodeId: "right", type: "text" },
  ];
  const graph: WorkflowGraph = {
    nodes: [left, right, app],
    edges: [
      { id: "left-in", source: "left", target: "child", port: "context" },
      { id: "right-in", source: "right", target: "child", port: "context" },
    ],
  };
  const resolved = await resolveWorkflowApps(
    db as any,
    1,
    applyWorkflowRunInputs(graph, [
      { id: "left", text: "A" },
      { id: "right", text: "B" },
    ])
  );
  const children = resolved.nodes.filter(n => n.type === "app_input");
  expect(children).toHaveLength(2);
  expect(
    resolved.edges
      .filter(e => children.some(n => n.id === e.target))
      .map(e => e.source)
      .sort()
  ).toEqual(["left", "right"]);
  expect(() =>
    applyWorkflowRunInputs(graph, [{ id: children[0].id, text: "bypass" }])
  ).toThrow("declared");
});
