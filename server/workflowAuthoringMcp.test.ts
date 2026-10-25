import { beforeAll, expect, it, vi } from "vitest";
import { generateKeyPair, exportJWK, SignJWT } from "jose";
const state = vi.hoisted(() => ({
  jwks: { keys: [] as any[] },
  discover: vi.fn(),
  propose: vi.fn(),
  save: vi.fn(),
  catalog: vi.fn(),
  brand: vi.fn(),
  prepare: vi.fn(),
  execute: vi.fn(),
}));
vi.mock("./lib/mcpWorkflowExecution", async original => ({
  ...(await original<typeof import("./lib/mcpWorkflowExecution")>()),
  mcpWorkflowExecution: () => ({
    prepare: state.prepare,
    execute: state.execute,
    status: vi.fn(),
    stop: vi.fn(),
  }),
}));
vi.mock("./lib/mcpDraftSave", async original => ({
  ...(await original<typeof import("./lib/mcpDraftSave")>()),
  saveMcpDraft: state.save,
}));
vi.mock("./lib/mcpWorkspaceRead", async original => ({
  ...(await original<typeof import("./lib/mcpWorkspaceRead")>()),
  mcpWorkspaceRead: () => ({ catalog: state.catalog, brand: state.brand }),
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
    proposalStatus: vi.fn(),
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
    "read_authoring_connection",
    "discover_workflow_blocks",
    "read_workflow_draft",
    "read_pinned_workflow_app",
    "propose_workflow_changes",
    "preview_workflow_proposal",
    "read_workflow_proposal_status",
    "apply_reviewed_workflow_draft",
    "save_workflow_draft",
    "read_catalog_products",
    "read_brand_kit",
    "save_publication_draft",
    "save_creative_setup_draft",
    "save_google_campaign_draft",
    "read_prompt_defaults",
    "read_category_settings",
    "save_prompt_default",
    "save_category_settings",
    "assign_product_category",
    "prepare_content_run",
    "prepare_video_content_run",
    "execute_approved_content_run",
    "read_content_run",
    "stop_content_run",
    "save_video_setup_draft",
    "read_creative_setup_drafts",
    "read_video_setup_drafts",
    "read_google_campaign_drafts",
    "read_publication_drafts",
    "read_draft_destination_accounts",
  ]);
  expect(body.result.tools[7].annotations).toMatchObject({
    readOnlyHint: false,
    destructiveHint: true,
  });
  expect(body.result.tools[7]._meta.securitySchemes[0].scopes).toEqual([
    "workflows:read",
    "workflows:draft",
  ]);
  expect(
    body.result.tools.some((t: any) =>
      /^(delete|publish|approve|activate|schedule)_/.test(t.name)
    )
  ).toBe(false);
  const metadata = await adapter.fetch(
    new Request(
      "https://author.example/.well-known/oauth-protected-resource/mcp"
    )
  );
  expect((await metadata.json()).scopes_supported).toEqual(["workflows:read"]);
  await adapter.close();
});
it("requires separately granted capabilities and fails closed without live capability guards", async () => {
  const guard = vi.fn(async () => {});
  const adapter = createAuthoringMcp({
    ...config,
    authorizeDraftSave: () => guard,
    authorizeCapability: () => guard,
  });
  const cases = [
    {
      name: "save_workflow_draft",
      scope: "workflows:save",
      fn: state.save,
      arguments: {
        organizationId: 7,
        requestId: "22222222-2222-4222-8222-222222222222",
        proposal: {
          summary: "Rename",
          changes: [{ op: "rename", name: "Draft" }],
        },
      },
    },
    {
      name: "read_catalog_products",
      scope: "catalog:read",
      fn: state.catalog,
      arguments: { organizationId: 7 },
    },
    {
      name: "read_brand_kit",
      scope: "brand:read",
      fn: state.brand,
      arguments: { organizationId: 7 },
    },
  ];
  for (const item of cases) {
    item.fn.mockResolvedValue({ ok: true });
    const call = {
      jsonrpc: "2.0",
      id: 8,
      method: "tools/call",
      params: { name: item.name, arguments: item.arguments },
    };
    const denied = await message(
      await adapter.fetch(request(await token(), call))
    );
    expect(denied.result.isError).toBe(true);
    expect(denied.result._meta["mcp/www_authenticate"][0]).toContain(
      `workflows:read ${item.scope}`
    );
    expect(item.fn).not.toHaveBeenCalled();
    const allowed = await message(
      await adapter.fetch(
        request(await token({ scope: `workflows:read ${item.scope}` }), call)
      )
    );
    expect(allowed.result.isError).not.toBe(true);
    expect(item.fn).toHaveBeenCalledTimes(1);
  }
  await adapter.close();
  const unconfigured = createAuthoringMcp(config);
  const result = await message(
    await unconfigured.fetch(
      request(await token({ scope: "workflows:read workflows:save" }), {
        jsonrpc: "2.0",
        id: 9,
        method: "tools/call",
        params: { name: cases[0].name, arguments: cases[0].arguments },
      })
    )
  );
  expect(result.result.isError).toBe(true);
  expect(state.save).toHaveBeenCalledTimes(1);
  await unconfigured.close();
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
  const deniedBody = await message(denied);
  expect(deniedBody.result.isError).toBe(true);
  expect(deniedBody.result._meta["mcp/www_authenticate"][0]).toContain(
    'scope="workflows:read workflows:draft"'
  );
  expect(state.propose).not.toHaveBeenCalled();
  await adapter.close();
});
it("returns a same-origin budget review link without leaking private review context or approving execution", async () => {
  const adapter = createAuthoringMcp({
    ...config,
    verifyAccessToken: async () => ({
      userId: 42,
      organizationId: 7,
      connectionId: "11111111-1111-4111-8111-111111111111",
      clientId: "test",
      scopes: ["workflows:read", "workflows:execute"],
    }),
  });
  state.prepare.mockResolvedValue({
    hash: "a".repeat(64),
    credits: 8,
    maxCredits: 10,
    reviewConfig: { brand: "PRIVATE_REVIEW_CONTEXT" },
  });
  const response = await message(
    await adapter.fetch(
      request("test", {
        jsonrpc: "2.0",
        id: 20,
        method: "tools/call",
        params: {
          name: "prepare_content_run",
          arguments: {
            organizationId: 7,
            id: "22222222-2222-4222-8222-222222222222",
            revision: 1,
            requestId: "33333333-3333-4333-8333-333333333333",
            maxCredits: 10,
          },
        },
      })
    )
  );
  expect(response.result.isError).not.toBe(true);
  const content = response.result.content[0].text;
  expect(content).toContain("/mcp/run-review");
  expect(content).not.toContain("PRIVATE_REVIEW_CONTEXT");
  expect(state.execute).not.toHaveBeenCalled();
  const listed = await message(await adapter.fetch(request("test")));
  expect(
    listed.result.tools.find((t: any) => t.name === "prepare_content_run")
      .annotations.openWorldHint
  ).toBe(true);
  expect(
    listed.result.tools.find(
      (t: any) => t.name === "execute_approved_content_run"
    ).annotations.openWorldHint
  ).toBe(true);
  expect(
    listed.result.tools.some((t: any) => t.name === "approve_content_run")
  ).toBe(false);
  await adapter.close();
});

it("requires every advertised video permission, preserves old grants and forwards bounded runtime inputs", async () => {
  const required = [
    "workflows:read",
    "workflows:execute",
    "creatives:generate_video",
  ];
  let scopes = ["workflows:read", "workflows:draft"];
  const adapter = createAuthoringMcp({
    ...config,
    verifyAccessToken: async () => ({
      userId: 42,
      organizationId: 7,
      connectionId: "11111111-1111-4111-8111-111111111111",
      clientId: "test",
      scopes,
    }),
  });
  state.prepare.mockClear();
  state.execute.mockClear();
  state.prepare.mockResolvedValue({
    hash: "b".repeat(64),
    credits: 20,
    maxCredits: 25,
    reviewConfig: { private: "PRIVATE_VIDEO_INPUT" },
  });
  const listed = await message(await adapter.fetch(request("test")));
  const tool = listed.result.tools.find(
    (t: any) => t.name === "prepare_video_content_run"
  );
  expect(tool._meta.securitySchemes).toEqual([
    { type: "oauth2", scopes: required },
  ]);
  expect(tool.annotations).toMatchObject({
    readOnlyHint: false,
    openWorldHint: true,
  });
  const input = {
    organizationId: 7,
    id: "22222222-2222-4222-8222-222222222222",
    revision: 1,
    requestId: "33333333-3333-4333-8333-333333333333",
    maxCredits: 25,
    inputs: [
      { id: "photo", imageKey: "product_image:732" },
      { id: "brief", text: "Video draft" },
    ],
  };
  const call = {
    jsonrpc: "2.0",
    id: 25,
    method: "tools/call",
    params: { name: "prepare_video_content_run", arguments: input },
  };
  for (const insufficient of [
    ["workflows:read", "workflows:draft"],
    ["workflows:read", "workflows:execute"],
    ["workflows:read", "creatives:generate_video"],
  ]) {
    scopes = insufficient;
    const denied = await message(await adapter.fetch(request("test", call)));
    expect(denied.result.isError).toBe(true);
    expect(denied.result._meta["mcp/www_authenticate"][0]).toContain(
      `scope="${required.join(" ")}"`
    );
    expect(state.prepare).not.toHaveBeenCalled();
  }
  scopes = required.slice(1);
  expect((await adapter.fetch(request("test", call))).status).toBe(403);
  scopes = required;
  const allowed = await message(await adapter.fetch(request("test", call)));
  expect(allowed.result.isError).not.toBe(true);
  expect(state.prepare).toHaveBeenCalledTimes(1);
  expect(state.prepare).toHaveBeenCalledWith(input);
  const result = JSON.parse(allowed.result.content[0].text);
  expect(new URL(result.reviewUrl).origin).toBe(
    new URL(config.resource).origin
  );
  expect(allowed.result.content[0].text).not.toContain("PRIVATE_VIDEO_INPUT");
  expect(state.execute).not.toHaveBeenCalled();
  await adapter.close();
});
it("accepts exactly the advertised write scopes and rejects draft-only grants", async () => {
  const adapter = createAuthoringMcp(config);
  const listed = await message(await adapter.fetch(request(await token())));
  const scopes = listed.result.tools.find(
    (t: any) => t.name === "propose_workflow_changes"
  )._meta.securitySchemes[0].scopes;
  state.propose.mockResolvedValue({ proposalId: "stored" });
  const body = {
    jsonrpc: "2.0",
    id: 5,
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
  };
  const response = await adapter.fetch(
    request(await token({ scope: scopes.join(" ") }), body)
  );
  expect((await message(response)).result.isError).not.toBe(true);
  expect(
    (
      await adapter.fetch(
        request(await token({ scope: "workflows:draft" }), body)
      )
    ).status
  ).toBe(403);
  await adapter.close();
});
