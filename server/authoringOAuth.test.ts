import { afterAll, beforeAll, expect, it, vi } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { readFileSync, readdirSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { createServer, request as nodeRequest, type Server } from "node:http";
import express from "express";
import { eq } from "drizzle-orm";
const state = vi.hoisted(() => ({ db: null as any, llm: vi.fn() }));
vi.mock("./db", () => ({ getDb: async () => state.db }));
vi.mock("./auth/supabase", () => ({ authenticateRequest: async () => null }));
vi.mock("./_core/llm", () => ({
  invokeLLM: state.llm,
  listLLMModels: vi.fn(),
}));
import {
  users,
  organizations,
  organizationMemberships,
  activityEvents,
} from "../drizzle/schema";
import {
  authoringOAuthGrants,
  authoringOAuthRequests,
  creativeWorkflows,
} from "../drizzle/workflowSchema";
import {
  authoringOAuth,
  authoringOAuthConfig,
  connectionGuard,
  opaqueHash,
  pkceChallenge,
  validateAuthorization,
} from "./mcp/authoringOAuth";
import { registerAuthoringMcp } from "./mcp/authoringRoutes";
import { workflowAuthoring } from "./lib/workflowAuthoring";
const config = {
  origin: "https://author.example",
  resource: "https://author.example/mcp/authoring",
  clientId: "approved-public-client",
  redirectUris: ["https://chatgpt.com/connector_platform_oauth_redirect"],
};
const oauth = authoringOAuth(config),
  verifier = "v".repeat(43);
let engine: PGlite,
  server: Server,
  address: string,
  userId: number,
  outsiderId: number,
  organizationId: number,
  otherOrg: number;
beforeAll(async () => {
  engine = new PGlite();
  for (const file of readdirSync("drizzle/postgres")
    .filter(f => f.endsWith(".sql"))
    .sort())
    await engine.exec(readFileSync(`drizzle/postgres/${file}`, "utf8"));
  state.db = drizzle(engine);
  const people = await state.db
    .insert(users)
    .values([{ openId: "oauth-author" }, { openId: "oauth-other" }])
    .returning();
  userId = people[0].id;
  outsiderId = people[1].id;
  const rows = await state.db
    .insert(organizations)
    .values(
      ["oauth-one", "oauth-two"].map(slug => ({
        slug,
        name: slug,
        createdByUserId: userId,
        createdAtMs: Date.now(),
      }))
    )
    .returning();
  organizationId = rows[0].id;
  otherOrg = rows[1].id;
  await state.db.insert(organizationMemberships).values(
    [organizationId, otherOrg].map(id => ({
      organizationId: id,
      userId,
      role: "owner",
      status: "active",
      createdAtMs: Date.now(),
    }))
  );
  const app = express();
  registerAuthoringMcp(app, config, async req =>
    req.headers["x-test-user"] === String(userId)
      ? people[0]
      : req.headers["x-test-user"] === String(outsiderId)
        ? people[1]
        : null
  );
  server = createServer(app);
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  address = `http://127.0.0.1:${(server.address() as any).port}`;
}, 30000);
afterAll(async () => {
  await new Promise<void>(resolve => server?.close(() => resolve()));
  await engine?.close();
});
const authorization = (scope = "workflows:read workflows:draft") => ({
  response_type: "code",
  client_id: config.clientId,
  redirect_uri: config.redirectUris[0],
  resource: config.resource,
  scope,
  state: "client-state",
  code_challenge_method: "S256",
  code_challenge: pkceChallenge(verifier),
});
async function grant(scope?: string) {
  const request = await oauth.begin(userId, authorization(scope));
  const redirect = new URL(
    await oauth.consent(userId, request.nonce, organizationId)
  );
  const input = {
    grant_type: "authorization_code",
    code: redirect.searchParams.get("code")!,
    client_id: config.clientId,
    redirect_uri: config.redirectUris[0],
    resource: config.resource,
    code_verifier: verifier,
  };
  return { request, redirect, input, result: await oauth.exchange(input) };
}
async function http(path: string, init: RequestInit = {}, signedIn = true) {
  return new Promise<Response>((resolve, reject) => {
    const req = nodeRequest(
      address + path,
      {
        method: init.method || "GET",
        headers: {
          host: "author.example",
          ...(signedIn ? { "x-test-user": String(userId) } : {}),
          ...(init.headers as Record<string, string>),
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
    if (init.body) req.write(String(init.body));
    req.end();
  });
}
const form = (
  body: Record<string, string>,
  origin = config.origin
): RequestInit => ({
  method: "POST",
  headers: { "content-type": "application/x-www-form-urlencoded", origin },
  body: new URLSearchParams(body),
});
async function call(token: string, name: string, args: unknown) {
  const res = await http(
    "/mcp/authoring",
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "application/json, text/event-stream",
        authorization: `Bearer ${token}`,
        "mcp-protocol-version": "2025-11-25",
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "tools/call",
        params: { name, arguments: args },
      }),
    },
    false
  );
  const text = await res.text();
  return {
    status: res.status,
    body:
      res.status === 200
        ? JSON.parse(
            text.startsWith("event:")
              ? text
                  .split("\n")
                  .find(l => l.startsWith("data: "))!
                  .slice(6)
              : text
          )
        : text,
  };
}
it("fails closed until explicit configuration and rejects unsafe URLs", () => {
  expect(authoringOAuthConfig({})).toBeUndefined();
  expect(() =>
    authoringOAuthConfig({ AUTHORING_MCP_ENABLED: "true" })
  ).toThrow();
  expect(() =>
    authoringOAuthConfig({
      AUTHORING_MCP_ENABLED: "true",
      APP_ORIGIN: "http://insecure.example",
      AUTHORING_MCP_CLIENT_ID: "id",
      AUTHORING_MCP_REDIRECT_URIS: JSON.stringify(config.redirectUris),
    })
  ).toThrow();
  for (const patch of [
    { resource: "https://wrong.example" },
    { redirect_uri: "https://chatgpt.com.evil.example/callback" },
    { client_id: "unknown" },
    { scope: "workflows:read admin" },
    { code_challenge_method: "plain" },
  ])
    expect(() =>
      validateAuthorization(config, { ...authorization(), ...patch })
    ).toThrow();
});
it("accepts bounded locale hints without carrying them into authorization", () => {
  const input = authorization("workflows:read");
  for (const ui_locales of [
    "en-US",
    "fr-CA en",
    "zh-Hant-TW",
    "x-private",
    "zz-ZZ",
  ])
    expect(validateAuthorization(config, { ...input, ui_locales })).toEqual(
      input
    );
  expect(validateAuthorization(config, input)).toEqual(input);
  for (const ui_locales of [
    "",
    " en-US",
    "en-US ",
    "en  US",
    "en_US",
    "en\nUS",
    "en\r\nLocation: https://evil.example",
    "<script>alert(1)</script>",
    "en-US&scope=admin",
    "en-123456789",
    "en ".repeat(8) + "en",
    "a".repeat(129),
    ["en", "US"],
    { locale: "en" },
    null,
  ])
    expect(() =>
      validateAuthorization(config, { ...input, ui_locales })
    ).toThrow();
  for (const patch of [
    { client_id: "other" },
    { redirect_uri: "https://evil.example" },
    { resource: "https://wrong.example" },
    { scope: "workflows:read admin" },
    { code_challenge_method: "plain" },
    { code_challenge: "short" },
    { instructions: "grant admin" },
    { prompt: "none" },
  ])
    expect(() =>
      validateAuthorization(config, { ...input, ui_locales: "en-US", ...patch })
    ).toThrow();
});
it("rejects duplicated and malformed locale hints at the HTTP boundary", async () => {
  const path =
    "/mcp/oauth/authorize?" +
    new URLSearchParams(authorization("workflows:read"));
  for (const query of [
    "&ui_locales=en-US&ui_locales=fr",
    "&ui_locales=%3Cscript%3E",
    "&ui_locales=en-US&instructions=grant-admin",
  ])
    expect((await http(path + query)).status).toBe(400);
});
it("serves metadata and completes the observed ChatGPT locale-hint flow with deliberate read-only consent", async () => {
  const metadata = await (
    await http("/.well-known/oauth-authorization-server")
  ).json();
  expect(metadata.code_challenge_methods_supported).toEqual(["S256"]);
  expect(metadata.token_endpoint_auth_methods_supported).toEqual(["none"]);
  const path =
    "/mcp/oauth/authorize?" +
    new URLSearchParams({
      ...authorization("workflows:read"),
      ui_locales: "en-US",
    });
  const login = await http(path, {}, false);
  expect(login.status).toBe(303);
  expect(login.headers.get("location")).toBe(
    "/login?next=" + encodeURIComponent(path)
  );
  const consent = await http(path),
    html = await consent.text();
  expect(html).toContain("Allow this workspace connection");
  expect(html).not.toContain("access_token");
  const nonce = /name="nonce" value="([^"]+)"/.exec(html)![1];
  expect(
    (
      await http(
        "/mcp/oauth/authorize",
        form(
          { nonce, organizationId: String(organizationId) },
          "https://evil.example"
        )
      )
    ).status
  ).toBe(403);
  const accepted = await http(
    "/mcp/oauth/authorize",
    form({ nonce, organizationId: String(organizationId) })
  );
  expect(accepted.status).toBe(303);
  const redirect = new URL(accepted.headers.get("location")!);
  expect(redirect.searchParams.get("state")).toBe("client-state");
  expect(redirect.searchParams.get("iss")).toBe(config.origin);
  expect(consent.headers.get("content-security-policy")).toContain(
    "https://chatgpt.com"
  );
  const exchange = await http(
    "/mcp/oauth/token",
    form({
      grant_type: "authorization_code",
      code: redirect.searchParams.get("code")!,
      client_id: config.clientId,
      redirect_uri: config.redirectUris[0],
      resource: config.resource,
      code_verifier: verifier,
    }),
    false
  );
  expect(exchange.status).toBe(200);
  expect(exchange.headers.get("cache-control")).toContain("no-store");
  const issued = await exchange.json();
  expect(issued.scope).toBe("workflows:read");
  expect(issued.expires_in).toBe(1800);
  expect(issued.refresh_token).toBeUndefined();
  const context = await call(
    issued.access_token,
    "read_authoring_connection",
    {}
  );
  expect(JSON.parse(context.body.result.content[0].text).organizationId).toBe(
    organizationId
  );

  expect(
    (
      await http(
        "/mcp/oauth/authorize",
        form({ nonce, organizationId: String(organizationId) })
      )
    ).status
  ).toBe(400);
});
it("binds consent to its signed-in owner and permitted workspace", async () => {
  const pending = await oauth.begin(userId, authorization());
  await expect(
    oauth.consent(outsiderId, pending.nonce, organizationId)
  ).rejects.toThrow();
  const noMembership = await oauth.begin(outsiderId, authorization());
  await expect(
    oauth.consent(outsiderId, noMembership.nonce, organizationId)
  ).rejects.toThrow();
});
it("binds single-use codes to PKCE, client, callback and resource and stores only hashes", async () => {
  const pending = await oauth.begin(userId, authorization());
  const redirect = new URL(
    await oauth.consent(userId, pending.nonce, organizationId)
  );
  const input = {
    grant_type: "authorization_code",
    code: redirect.searchParams.get("code")!,
    client_id: config.clientId,
    redirect_uri: config.redirectUris[0],
    resource: config.resource,
    code_verifier: verifier,
  };
  for (const patch of [
    { code_verifier: "x".repeat(43) },
    { client_id: "other" },
    { redirect_uri: "https://evil.example" },
    { resource: "https://wrong.example" },
  ])
    await expect(oauth.exchange({ ...input, ...patch })).rejects.toThrow();
  const result = await oauth.exchange(input);
  await expect(oauth.exchange(input)).rejects.toThrow();
  const [row] = await state.db
    .select()
    .from(authoringOAuthGrants)
    .where(eq(authoringOAuthGrants.tokenHash, opaqueHash(result.access_token)));
  expect(row).toBeTruthy();
  expect(JSON.stringify(row)).not.toContain(result.access_token);
  const [request] = await state.db
    .select()
    .from(authoringOAuthRequests)
    .where(eq(authoringOAuthRequests.idHash, opaqueHash(pending.nonce)));
  expect(JSON.stringify(request)).not.toContain(input.code);
  expect(JSON.stringify(request)).not.toContain(pending.nonce);
  expect((await oauth.verify(result.access_token))?.organizationId).toBe(
    organizationId
  );
});
it("restricts MCP actions to the granted workspace even when the user belongs to both", async () => {
  const { result } = await grant();
  expect(
    (
      await call(result.access_token, "discover_workflow_blocks", {
        organizationId,
      })
    ).body.result.isError
  ).not.toBe(true);
  expect(
    (
      await call(result.access_token, "discover_workflow_blocks", {
        organizationId: otherOrg,
      })
    ).body.result.isError
  ).toBe(true);
  const readOnly = await grant("workflows:read");
  expect(
    (
      await call(readOnly.result.access_token, "propose_workflow_changes", {
        organizationId,
        requestId: randomUUID(),
        proposal: {
          summary: "Rename",
          changes: [{ op: "rename", name: "Name" }],
        },
      })
    ).body.result.isError
  ).toBe(true);
});
it("rechecks grant revocation and membership inside domain operations", async () => {
  const { result } = await grant();
  const identity = (await oauth.verify(result.access_token))!;
  const service = workflowAuthoring(
    userId,
    connectionGuard(userId, identity.connectionId, config.resource)
  );
  await oauth.revoke(userId, identity.connectionId);
  expect(await oauth.verify(result.access_token)).toBeNull();
  await expect(service.discover({ organizationId })).rejects.toThrow();
  const fresh = await grant();
  await state.db
    .update(organizationMemberships)
    .set({ status: "suspended" })
    .where(eq(organizationMemberships.organizationId, organizationId));
  try {
    expect(
      (
        await call(fresh.result.access_token, "discover_workflow_blocks", {
          organizationId,
        })
      ).body.result.isError
    ).toBe(true);
  } finally {
    await state.db
      .update(organizationMemberships)
      .set({ status: "active" })
      .where(eq(organizationMemberships.organizationId, organizationId));
  }
});
it("requires in-app review and a same-origin apply POST and keeps retries idempotent", async () => {
  const { result } = await grant();
  const proposed = await call(result.access_token, "propose_workflow_changes", {
    organizationId,
    requestId: randomUUID(),
    proposal: {
      summary: "Name",
      changes: [{ op: "rename", name: "Reviewed MCP draft" }],
    },
  });
  const proposal = JSON.parse(proposed.body.result.content[0].text);
  const input = {
    organizationId,
    proposalId: proposal.proposalId,
    reviewedHash: proposal.hash,
    requestId: randomUUID(),
  };
  const response = await call(
    result.access_token,
    "apply_reviewed_workflow_draft",
    input
  );
  const approval = JSON.parse(response.body.result.content[0].text);
  expect(approval.approvalRequired).toBe(true);
  expect(await state.db.select().from(creativeWorkflows)).toHaveLength(0);
  const url = new URL(approval.reviewUrl);
  const page = await http(url.pathname + url.search);
  expect(await page.text()).toContain("Apply this reviewed proposal to draft");
  expect(await state.db.select().from(creativeWorkflows)).toHaveLength(0);
  const fields = Object.fromEntries(url.searchParams);
  expect(
    (await http("/mcp/review", form(fields, "https://evil.example"))).status
  ).toBe(403);
  expect((await http("/mcp/review", form(fields))).status).toBe(200);
  expect((await http("/mcp/review", form(fields))).status).toBe(200);
  expect(await state.db.select().from(creativeWorkflows)).toHaveLength(1);
  expect(state.llm).not.toHaveBeenCalled();
  const logs = await state.db.select().from(activityEvents);
  expect(
    logs.some((r: any) => r.action === "authoring.connection_granted")
  ).toBe(true);
  expect(JSON.stringify(logs)).not.toContain(result.access_token);
});
it("denies expired codes/tokens, wrong host, oversized bodies and unconfigured servers", async () => {
  const { result } = await grant();
  await state.db
    .update(authoringOAuthGrants)
    .set({ expiresAtMs: 1 })
    .where(eq(authoringOAuthGrants.tokenHash, opaqueHash(result.access_token)));
  expect(await oauth.verify(result.access_token)).toBeNull();
  expect(
    (
      await call(result.access_token, "discover_workflow_blocks", {
        organizationId,
      })
    ).status
  ).toBe(401);
  expect(
    (
      await http("/.well-known/oauth-authorization-server", {
        headers: { host: "evil.example" },
      })
    ).status
  ).toBe(403);
  expect(
    (
      await http("/mcp/authoring", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "x".repeat(270_000),
      })
    ).status
  ).toBe(413);
  const pending = await oauth.begin(userId, authorization());
  await state.db
    .update(authoringOAuthRequests)
    .set({ expiresAtMs: 1 })
    .where(eq(authoringOAuthRequests.idHash, opaqueHash(pending.nonce)));
  await expect(
    oauth.consent(userId, pending.nonce, organizationId)
  ).rejects.toThrow();
});

it("denies authorization with an issuer-bound error and cannot reuse its nonce", async () => {
  const pending = await oauth.begin(userId, authorization());
  const redirect = new URL(await oauth.deny(userId, pending.nonce));
  expect(redirect.searchParams.get("error")).toBe("access_denied");
  expect(redirect.searchParams.get("iss")).toBe(config.origin);
  await expect(
    oauth.consent(userId, pending.nonce, organizationId)
  ).rejects.toThrow();
});
it("consumes a code exactly once across concurrent exchanges", async () => {
  const pending = await oauth.begin(userId, authorization());
  const redirect = new URL(
    await oauth.consent(userId, pending.nonce, organizationId)
  );
  const input = {
    grant_type: "authorization_code",
    code: redirect.searchParams.get("code")!,
    client_id: config.clientId,
    redirect_uri: config.redirectUris[0],
    resource: config.resource,
    code_verifier: verifier,
  };
  const outcomes = await Promise.allSettled([
    oauth.exchange(input),
    oauth.exchange(input),
  ]);
  expect(outcomes.filter(o => o.status === "fulfilled")).toHaveLength(1);
  expect(outcomes.filter(o => o.status === "rejected")).toHaveLength(1);
});
it("keeps review owner-bound and refuses apply after revocation or concurrent draft edits", async () => {
  const issued = await grant(),
    identity = (await oauth.verify(issued.result.access_token))!;
  const service = workflowAuthoring(userId);
  const first = await service.propose({
    organizationId,
    requestId: randomUUID(),
    proposal: {
      summary: "Review",
      changes: [{ op: "rename", name: "Review race" }],
    },
  });
  const input = {
    organizationId: String(organizationId),
    proposalId: first.proposalId,
    reviewedHash: first.hash,
    requestId: randomUUID(),
    connectionId: identity.connectionId,
  };
  const query = new URLSearchParams(input).toString();
  expect(
    (
      await http("/mcp/review?" + query, {
        headers: { "x-test-user": String(outsiderId) },
      })
    ).status
  ).toBe(400);
  await oauth.revoke(userId, identity.connectionId);
  expect((await http("/mcp/review", form(input))).status).toBe(400);
  const secondGrant = await grant(),
    secondIdentity = (await oauth.verify(secondGrant.result.access_token))!;
  const saved = await service.apply({
    organizationId,
    proposalId: first.proposalId,
    reviewedHash: first.hash,
    requestId: randomUUID(),
  });
  const edit = await service.propose({
    organizationId,
    requestId: randomUUID(),
    target: saved,
    proposal: {
      summary: "Rename",
      changes: [{ op: "rename", name: "Pending rename" }],
    },
  });
  await state.db
    .update(creativeWorkflows)
    .set({ name: "Concurrent human edit", revision: 2 })
    .where(eq(creativeWorkflows.id, saved.id));
  expect(
    (
      await http(
        "/mcp/review",
        form({
          organizationId: String(organizationId),
          proposalId: edit.proposalId,
          reviewedHash: edit.hash,
          requestId: randomUUID(),
          connectionId: secondIdentity.connectionId,
        })
      )
    ).status
  ).toBe(400);
  expect((await service.read({ organizationId, id: saved.id })).name).toBe(
    "Concurrent human edit"
  );
  const context = await call(
    secondGrant.result.access_token,
    "read_authoring_connection",
    {}
  );
  expect(JSON.parse(context.body.result.content[0].text).organizationId).toBe(
    organizationId
  );
  const receipt = await call(
    secondGrant.result.access_token,
    "read_workflow_proposal_status",
    { organizationId, proposalId: first.proposalId }
  );
  expect(JSON.parse(receipt.body.result.content[0].text)).toMatchObject({
    state: "applied",
    result: saved,
  });
});

it("mounts only a fail-closed response when MCP is disabled", () => {
  vi.stubEnv("AUTHORING_MCP_ENABLED", "false");
  try {
    let handler: any;
    const app = {
      all: vi.fn((_paths, fn) => {
        handler = fn;
      }),
    };
    registerAuthoringMcp(app as any);
    const response: any = {
      status: vi.fn(() => response),
      set: vi.fn(() => response),
      json: vi.fn(),
    };
    handler({}, response);
    expect(response.status).toHaveBeenCalledWith(503);
    expect(app.all).toHaveBeenCalledTimes(1);
  } finally {
    vi.unstubAllEnvs();
  }
});

it("negotiates initialize and discovery across supported client protocols", async () => {
  const issued = await grant("workflows:read");
  for (const protocolVersion of [
    "2024-11-05",
    "2025-03-26",
    "2025-06-18",
    "2025-11-25",
  ]) {
    for (const method of ["initialize", "tools/list"]) {
      const response = await http(
        "/mcp/authoring",
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            accept: "application/json, text/event-stream",
            authorization: `Bearer ${issued.result.access_token}`,
            ...(method === "initialize"
              ? {}
              : { "mcp-protocol-version": protocolVersion }),
          },
          body: JSON.stringify({
            jsonrpc: "2.0",
            id: 20,
            method,
            ...(method === "initialize"
              ? {
                  params: {
                    protocolVersion,
                    capabilities: {},
                    clientInfo: { name: "openai-mcp", version: "1.0.0" },
                  },
                }
              : {}),
          }),
        },
        false
      );
      const body = await response.text();
      expect(response.status, `${protocolVersion} ${method}: ${body}`).toBe(
        200
      );
      expect(body).toContain(
        method === "initialize" ? protocolVersion : "read_authoring_connection"
      );
    }
  }
});

it("preserves modern MCP method and tool-name headers through the Express bridge", async () => {
  const issued = await grant("workflows:read");
  const meta = {
    "io.modelcontextprotocol/protocolVersion": "2026-07-28",
    "io.modelcontextprotocol/clientInfo": {
      name: "openai-mcp",
      version: "1.0.0",
    },
    "io.modelcontextprotocol/clientCapabilities": {},
  };
  for (const method of ["tools/list", "tools/call"]) {
    const response = await http(
      "/mcp/authoring",
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          accept: "application/json, text/event-stream",
          authorization: `Bearer ${issued.result.access_token}`,
          "mcp-protocol-version": "2026-07-28",
          "mcp-method": method,
          ...(method === "tools/call"
            ? { "mcp-name": "read_authoring_connection" }
            : {}),
        },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 30,
          method,
          params: {
            _meta: meta,
            ...(method === "tools/call"
              ? { name: "read_authoring_connection", arguments: {} }
              : {}),
          },
        }),
      },
      false
    );
    const body = await response.text();
    expect(response.status, body).toBe(200);
    expect(body).toContain(
      method === "tools/list"
        ? "read_authoring_connection"
        : String(organizationId)
    );
  }
});

it("keeps modern header validation and read-only authorization enforced", async () => {
  const issued = await grant("workflows:read");
  const meta = {
    "io.modelcontextprotocol/protocolVersion": "2026-07-28",
    "io.modelcontextprotocol/clientInfo": {
      name: "openai-mcp",
      version: "1.0.0",
    },
    "io.modelcontextprotocol/clientCapabilities": {},
  };
  const headers: Record<string, string> = {
    "content-type": "application/json",
    accept: "application/json, text/event-stream",
    authorization: `Bearer ${issued.result.access_token}`,
    "mcp-protocol-version": "2026-07-28",
    "mcp-method": "tools/call",
    "mcp-name": "read_authoring_connection",
  };
  const body = JSON.stringify({
    jsonrpc: "2.0",
    id: 31,
    method: "tools/call",
    params: { _meta: meta, name: "read_authoring_connection", arguments: {} },
  });
  for (const invalid of [
    { ...headers, "mcp-method": "tools/list" },
    { ...headers, "mcp-name": "another_tool" },
    Object.fromEntries(
      Object.entries(headers).filter(([key]) => key !== "mcp-method")
    ),
    Object.fromEntries(
      Object.entries(headers).filter(([key]) => key !== "mcp-name")
    ),
  ]) {
    const response = await http(
      "/mcp/authoring",
      { method: "POST", headers: invalid, body },
      false
    );
    expect(response.status).toBe(400);
    expect(await response.text()).toContain('"code":-32020');
  }
  const unauthenticated = await http(
    "/mcp/authoring",
    {
      method: "POST",
      headers: { ...headers, authorization: "Bearer invalid" },
      body,
    },
    false
  );
  expect(unauthenticated.status).toBe(401);
  const discover = await http(
    "/mcp/authoring",
    {
      method: "POST",
      headers: { ...headers, "mcp-method": "server/discover", "mcp-name": "" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 32,
        method: "server/discover",
        params: { _meta: meta },
      }),
    },
    false
  );
  const discoveryBody = await discover.text();
  expect(discover.status, discoveryBody).toBe(200);
  expect(discoveryBody).toContain("evokeloop-draft-authoring");
});
