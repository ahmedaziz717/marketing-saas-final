import { beforeAll, expect, it, vi } from "vitest";
import { generateKeyPair, exportJWK, SignJWT } from "jose";
const state = vi.hoisted(() => ({
  jwks: { keys: [] as any[] },
  discover: vi.fn(),
  propose: vi.fn(),
}));
vi.mock("jose", async original => {
  const jose = await original<typeof import("jose")>();
  return {
    ...jose,
    createRemoteJWKSet: () => jose.createLocalJWKSet(state.jwks),
  };
});
vi.mock("./lib/workflowAuthoring", () => ({
  workflowAuthoring: () => ({
    discover: state.discover,
    propose: state.propose,
    read: vi.fn(),
    preview: vi.fn(),
    apply: vi.fn(),
  }),
}));
import { createAuthoringMcp } from "./mcp/workflowAuthoring";
let key: CryptoKey;
beforeAll(async () => {
  const pair = await generateKeyPair("RS256");
  key = pair.privateKey;
  state.jwks.keys = [{ ...(await exportJWK(pair.publicKey)), kid: "test" }];
});
const config = {
  resource: "https://author.example/mcp",
  issuer: "https://issuer.example",
  jwksUrl: "https://issuer.example/jwks",
  allowedOrigins: ["https://chatgpt.com"],
  resolveUserId: async (_issuer: string, sub: string) =>
    sub === "linked" ? 42 : null,
};
async function token(overrides: Record<string, unknown> = {}) {
  return new SignJWT({ scope: "workflows:read workflows:draft", ...overrides })
    .setProtectedHeader({ alg: "RS256", kid: "test" })
    .setIssuer(
      typeof overrides.iss === "string" ? overrides.iss : config.issuer
    )
    .setAudience(
      typeof overrides.aud === "string" ? overrides.aud : config.resource
    )
    .setSubject(typeof overrides.sub === "string" ? overrides.sub : "linked")
    .setIssuedAt()
    .setExpirationTime(typeof overrides.exp === "number" ? overrides.exp : "5m")
    .sign(key);
}
function request(
  accessToken?: string,
  body: unknown = { jsonrpc: "2.0", id: 1, method: "tools/list" },
  headers = {}
) {
  return new Request(config.resource, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      accept: "application/json, text/event-stream",
      "mcp-protocol-version": "2025-11-25",
      ...(accessToken ? { authorization: `Bearer ${accessToken}` } : {}),
      ...headers,
    },
    body: JSON.stringify(body),
  });
}
async function message(response: Response) {
  const text = await response.text();
  return JSON.parse(
    text.startsWith("event:")
      ? text
          .split("\n")
          .find(line => line.startsWith("data: "))!
          .slice(6)
      : text
  );
}
it("fails closed when unconfigured and challenges unauthenticated requests", async () => {
  expect((await createAuthoringMcp().fetch(request())).status).toBe(503);
  const adapter = createAuthoringMcp(config),
    response = await adapter.fetch(request());
  expect(response.status).toBe(401);
  expect(response.headers.get("www-authenticate")).toContain(
    "oauth-protected-resource/mcp"
  );
  await adapter.close();
});
it("rejects wrong issuer/audience, expired tokens, missing scopes and unlinked subjects", async () => {
  const adapter = createAuthoringMcp(config);
  for (const claims of [
    { iss: "https://evil.example" },
    { aud: "another-service" },
    { exp: 1 },
    { sub: "unlinked" },
  ])
    expect((await adapter.fetch(request(await token(claims)))).status).toBe(
      401
    );
  expect(
    (await adapter.fetch(request(await token({ scope: "unrelated" })))).status
  ).toBe(403);
  expect(state.discover).not.toHaveBeenCalled();
  await adapter.close();
});
it("rejects unexpected origins and hosts before authentication", async () => {
  const adapter = createAuthoringMcp(config);
  expect(
    (
      await adapter.fetch(
        request(undefined, {}, { origin: "https://evil.example" })
      )
    ).status
  ).toBe(403);
  expect(
    (await adapter.fetch(request(undefined, {}, { host: "evil.example" })))
      .status
  ).toBe(403);
  await adapter.close();
});
it("serves SDK tool discovery over Streamable HTTP with only draft capabilities", async () => {
  const adapter = createAuthoringMcp(config);
  const response = await adapter.fetch(request(await token()));
  expect(response.status).toBe(200);
  const body = await message(response);
  expect(body.result.tools.map((t: any) => t.name)).toEqual([
    "discover_workflow_blocks",
    "read_workflow_draft",
    "read_pinned_workflow_app",
    "propose_workflow_changes",
    "preview_workflow_proposal",
    "apply_reviewed_workflow_draft",
  ]);
  expect(body.result.tools[5].annotations).toMatchObject({
    readOnlyHint: false,
    destructiveHint: true,
  });
  await adapter.close();
});
it("uses the shared service and enforces write scopes per tool", async () => {
  const adapter = createAuthoringMcp(config);
  state.discover.mockResolvedValue({ drafts: [] });
  const accessToken = await token({ scope: "workflows:read" });
  const response = await adapter.fetch(
    request(accessToken, {
      jsonrpc: "2.0",
      id: 2,
      method: "tools/call",
      params: {
        name: "discover_workflow_blocks",
        arguments: { organizationId: 7 },
      },
    })
  );
  expect((await message(response)).result.isError).not.toBe(true);
  expect(state.discover).toHaveBeenCalledWith({ organizationId: 7 });
  const denied = await adapter.fetch(
    request(accessToken, {
      jsonrpc: "2.0",
      id: 3,
      method: "tools/call",
      params: {
        name: "propose_workflow_changes",
        arguments: {
          organizationId: 7,
          requestId: "11111111-1111-4111-8111-111111111111",
          proposal: {
            summary: "Rename",
            changes: [{ op: "rename", name: "Name" }],
          },
        },
      },
    })
  );
  expect((await message(denied)).result.isError).toBe(true);
  expect(state.propose).not.toHaveBeenCalled();
  await adapter.close();
});
