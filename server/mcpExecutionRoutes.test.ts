import express from "express";
import { afterAll, beforeAll, beforeEach, expect, it, vi } from "vitest";
import { request as nodeRequest, type Server } from "node:http";
const state = vi.hoisted(() => ({ review: vi.fn(), approve: vi.fn() }));
vi.mock("./lib/mcpWorkflowExecution", async original => ({
  ...(await original<typeof import("./lib/mcpWorkflowExecution")>()),
  reviewMcpWorkflowExecution: state.review,
  approveMcpWorkflowExecution: state.approve,
}));
vi.mock("./mcp/authoringOAuth", () => ({
  authoringOAuth: () => ({ verify: async () => null }),
  authoringOAuthConfig: () => undefined,
  connectionGuard: () => async () => {},
  mcpScopes: ["workflows:read", "workflows:execute"],
  validateAuthorization: vi.fn(),
}));
import { registerAuthoringMcp } from "./mcp/authoringRoutes";
let server: Server, origin: string;
const requestId = "11111111-1111-4111-8111-111111111111";
const plan = {
  requestId,
  workflowId: "22222222-2222-4222-8222-222222222222",
  revision: 2,
  hash: "a".repeat(64),
  credits: 8,
  maxCredits: 10,
  expiresAt: Date.now() + 600000,
  nodes: [{ title: "<script>untrusted</script>", type: "generate_image" }],
  reviewConfig: {
    nodes: [
      {
        title: "<script>untrusted</script>",
        type: "generate_image",
        config: {
          text: "Exact product prompt",
          modelId: "test-image-model",
          imageKey: "product_image:123",
        },
      },
    ],
    edges: [],
  },
};
beforeAll(async () => {
  const app = express();
  registerAuthoringMcp(
    app,
    {
      origin: "https://author.example",
      resource: "https://author.example/mcp/authoring",
      clientId: "test",
      redirectUris: ["https://chatgpt.com/callback"],
    },
    async req =>
      req.headers["x-test-user"] === "yes" ? ({ id: 42 } as any) : null
  );
  server = app.listen(0, "127.0.0.1");
  await new Promise<void>(resolve => server.once("listening", resolve));
  origin = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
});
afterAll(async () => {
  server.closeAllConnections();
  await new Promise<void>(resolve => server.close(() => resolve()));
});
beforeEach(() => {
  vi.clearAllMocks();
  state.review.mockResolvedValue(plan);
  state.approve.mockResolvedValue({ approved: true });
});
function request(
  method = "GET",
  headers: Record<string, string> = {},
  body?: Record<string, string>
) {
  return new Promise<Response>((resolve, reject) => {
    const req = nodeRequest(
      `${origin}/mcp/run-review${method === "GET" ? `?organizationId=3&requestId=${requestId}` : ""}`,
      {
        method,
        headers: {
          host: "author.example",
          "x-test-user": "yes",
          ...(method === "POST"
            ? {
                "content-type": "application/x-www-form-urlencoded",
                origin: "https://author.example",
              }
            : {}),
          ...headers,
        },
      },
      res => {
        const chunks: Buffer[] = [];
        res.on("data", chunk => chunks.push(chunk));
        res.on("end", () =>
          resolve(
            new Response(Buffer.concat(chunks), {
              status: res.statusCode,
              headers: res.headers as Record<string, string>,
            })
          )
        );
      }
    );
    req.on("error", reject);
    req.end(body ? new URLSearchParams(body).toString() : undefined);
  });
}
const approval = () => ({
  organizationId: "3",
  requestId,
  hash: plan.hash,
  maxCredits: "10",
});
it("renders exact budget for signed-in user, escapes untrusted labels, and never approves on GET", async () => {
  const response = await request();
  const html = await response.text();
  expect(response.status).toBe(200);
  expect(html).toContain("8 credits");
  expect(html).toContain("10 credits");
  expect(html).toContain("&lt;script&gt;");
  expect(html).not.toContain("<script>");
  expect(html).toContain("Exact product prompt");
  expect(html).toContain("test-image-model");
  expect(html).toContain("product_image:123");
  expect(response.headers.get("cache-control")).toContain("no-store");
  expect(response.headers.get("content-security-policy")).toContain(
    "frame-ancestors 'none'"
  );
  expect(state.review).toHaveBeenCalledWith(42, {
    organizationId: 3,
    requestId,
  });
  expect(state.approve).not.toHaveBeenCalled();
});
it("rejects cross-origin and unsigned approvals before the approval service", async () => {
  expect(
    (await request("POST", { origin: "https://evil.example" }, approval()))
      .status
  ).toBe(403);
  expect(
    (await request("POST", { "x-test-user": "no" }, approval())).status
  ).toBe(401);
  expect(state.approve).not.toHaveBeenCalled();
});
it("accepts only the explicit form schema and delegates exact budget validation", async () => {
  expect(
    (await request("POST", {}, { ...approval(), publish: "true" })).status
  ).toBe(400);
  expect(state.approve).not.toHaveBeenCalled();
  expect((await request("POST", {}, approval())).status).toBe(200);
  expect(state.approve).toHaveBeenCalledWith(42, {
    organizationId: 3,
    requestId,
    hash: plan.hash,
    maxCredits: 10,
  });
  state.approve.mockRejectedValueOnce(new Error("budget changed"));
  expect(
    (await request("POST", {}, { ...approval(), maxCredits: "11" })).status
  ).toBe(400);
});
