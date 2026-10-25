import express, {
  type Express,
  type Request,
  type Response,
  type RequestHandler,
} from "express";
import { rateLimit } from "express-rate-limit";
import { z } from "zod";
import { authenticateRequest } from "../auth/supabase";
import {
  authoringOAuth,
  authoringOAuthConfig,
  connectionGuard,
  mcpScopes,
  validateAuthorization,
} from "./authoringOAuth";
import { createAuthoringMcp } from "./workflowAuthoring";
import { workflowAuthoring } from "../lib/workflowAuthoring";
import { applyInput } from "../../shared/workflowAuthoring";
import {
  executionReferenceInput,
  executionApprovalInput,
  reviewMcpWorkflowExecution,
  approveMcpWorkflowExecution,
} from "../lib/mcpWorkflowExecution";

const escape = (value: unknown) =>
  String(value).replace(
    /[&<>"']/g,
    c =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!
  );
function page(
  res: Response,
  title: string,
  body: string,
  formRedirectOrigins: string[] = []
) {
  res.set({
    "Content-Security-Policy": `default-src 'none'; style-src 'unsafe-inline'; form-action 'self' ${formRedirectOrigins.join(" ")}; frame-ancestors 'none'; base-uri 'none'`,
    "Referrer-Policy": "strict-origin",
    "X-Content-Type-Options": "nosniff",
  });
  res
    .type("html")
    .send(
      `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escape(title)} — EvokeLoop</title><style>body{font:16px system-ui;color:#14292e;background:#f5f8f8;max-width:800px;margin:40px auto;padding:24px}main{background:white;padding:24px;border:1px solid #cadcde;border-radius:12px}pre{white-space:pre-wrap;overflow-wrap:anywhere;font-size:12px}button,select{padding:12px;margin:12px 0}button{background:#007f82;color:white;border:0;border-radius:6px}a{color:#007f82}</style></head><body><main><h1>${escape(title)}</h1>${body}</main></body></html>`
    );
}
const hidden = (name: string, value: unknown) =>
  `<input type="hidden" name="${escape(name)}" value="${escape(value)}">`;
const paths = [
  "/mcp/authoring",
  "/mcp/oauth/authorize",
  "/mcp/oauth/token",
  "/mcp/connections",
  "/mcp/review",
  "/mcp/run-review",
  "/.well-known/oauth-authorization-server",
  "/.well-known/oauth-protected-resource/mcp/authoring",
];

/** Register before general body parsing/site redirects. Disabled unless explicitly configured. */
export function registerAuthoringMcp(
  app: Express,
  config = authoringOAuthConfig(),
  authenticate = authenticateRequest
) {
  if (!config) {
    app.all(paths, (_req, res) => {
      res
        .status(503)
        .set("Cache-Control", "no-store")
        .json({ error: "Authoring connection is not configured" });
    });
    return;
  }
  const oauth = authoringOAuth(config);
  const adapter = createAuthoringMcp({
    resource: config.resource,
    issuer: config.origin,
    allowedOrigins: [config.origin, "https://chatgpt.com"],
    verifyAccessToken: oauth.verify,
    authorizeConnection: identity =>
      connectionGuard(
        identity.userId,
        identity.connectionId!,
        config.resource,
        identity.scopes.includes("workflows:draft")
      ),
    authorizeDraftSave: identity =>
      connectionGuard(
        identity.userId,
        identity.connectionId!,
        config.resource,
        "workflows:save"
      ),
    authorizeCapability: (identity, scope) =>
      connectionGuard(
        identity.userId,
        identity.connectionId!,
        config.resource,
        scope
      ),
    async requestDraftReview(identity, input) {
      const service = workflowAuthoring(
        identity.userId,
        connectionGuard(
          identity.userId,
          identity.connectionId!,
          config.resource,
          true
        )
      );
      const result = await service.preview({
        organizationId: input.organizationId,
        proposalId: input.proposalId,
      });
      if (result.hash !== input.reviewedHash)
        throw new Error("Proposal identity mismatch");
      const url = new URL("/mcp/review", config.origin);
      for (const [key, value] of Object.entries({
        ...input,
        connectionId: identity.connectionId!,
      }))
        url.searchParams.set(key, String(value));
      return {
        approvalRequired: true,
        reviewUrl: url.href,
        message:
          "Open this EvokeLoop page, sign in as the connected user, review the complete proposal and explicitly apply it. No draft has been changed by this tool call.",
      };
    },
  });
  const host: RequestHandler = (req, res, next) => {
    res.set({
      "Cache-Control": "private, no-store",
      Pragma: "no-cache",
      "X-Robots-Tag": "noindex, nofollow",
    });
    if (
      req.headers.host !== new URL(config.origin).host ||
      (process.env.NODE_ENV === "production" && !req.secure)
    )
      return void res.status(403).send("Forbidden host");
    next();
  };
  const sameOrigin: RequestHandler = (req, res, next) => {
    if (req.headers.origin !== config.origin)
      return void res.status(403).send("Forbidden origin");
    next();
  };
  const limit = rateLimit({
    windowMs: 60_000,
    limit: 60,
    standardHeaders: "draft-8",
    legacyHeaders: false,
  });
  const consentLimit = rateLimit({
    windowMs: 15 * 60_000,
    limit: 30,
    standardHeaders: "draft-8",
    legacyHeaders: false,
  });
  app.use(paths, host, limit);
  const form = express.urlencoded({ extended: false, limit: "8kb" });
  function safe(
    action: (req: Request, res: Response) => Promise<void>
  ): RequestHandler {
    return (req, res) => {
      void action(req, res).catch(() => {
        if (!res.headersSent)
          res.status(400).json({
            error: "invalid_request",
            error_description:
              "Request expired, invalid, or no longer authorized. Start again.",
          });
      });
    };
  }
  async function signedIn(req: Request, res: Response) {
    const user = await authenticate(req, res);
    if (!user)
      res.redirect(303, "/login?next=" + encodeURIComponent(req.originalUrl));
    return user;
  }
  app.get("/.well-known/oauth-authorization-server", (_req, res) =>
    res.json({
      issuer: config.origin,
      authorization_endpoint: config.origin + "/mcp/oauth/authorize",
      token_endpoint: config.origin + "/mcp/oauth/token",
      response_types_supported: ["code"],
      grant_types_supported: ["authorization_code", "refresh_token"],
      token_endpoint_auth_methods_supported: ["none"],
      code_challenge_methods_supported: ["S256"],
      scopes_supported: mcpScopes,
      authorization_response_iss_parameter_supported: true,
    })
  );
  app.get(
    "/.well-known/oauth-protected-resource/mcp/authoring",
    safe(async (req, res) => {
      const response = await adapter.fetch(
        new globalThis.Request(config.origin + req.originalUrl, {
          headers: { host: req.headers.host! },
        })
      );
      res
        .status(response.status)
        .type("json")
        .send(await response.text());
    })
  );
  app.get(
    "/mcp/oauth/authorize",
    consentLimit,
    safe(async (req, res) => {
      const validated = validateAuthorization(config, req.query); // Never redirect an unvalidated OAuth request.
      const user = await signedIn(req, res);
      if (!user) return;
      const workspaces = await oauth.workspaces(user.id, validated.scope);
      if (!workspaces.length) {
        res.status(403).send("No workspace permits authoring.");
        return;
      }
      const request = await oauth.begin(user.id, req.query);
      page(
        res,
        "Connect workflow authoring",
        `<p>Signed in as ${escape(user.email || user.name || "your EvokeLoop account")}</p><p>Client: ${escape(config.clientId)}</p><p>Access tokens expire after 30 minutes. Ongoing access renews automatically until revoked or 30 days pass without a successful renewal. It can read drafts and App contracts${request.scope.includes("workflows:draft") ? ", propose changes and request draft review" : ""}. ${request.scope.split(" ").includes("workflows:save") ? "It can directly create and update workflow/App authoring drafts without a separate in-app apply confirmation." : "Applying requires a separate confirmation on EvokeLoop."} ${request.scope.split(" ").includes("workflows:execute") ? "It can request content-only generation runs, spending only the exact separately approved per-run budget. It cannot delete, publish, activate schedules or post." : "It cannot delete, run, publish, activate schedules, post or spend generation credits."}</p>${request.scope.split(" ").includes("creatives:generate_video") ? "<p>It can prepare video generation from stored workspace media, only with workflows:execute and a separate exact run and credit-budget approval. Video outputs remain pending; publishing and schedules are excluded.</p>" : ""}${request.scope.split(" ").includes("catalog:read") ? "<p>It can read workspace catalog product facts, image references, and category context.</p>" : ""}${request.scope.split(" ").includes("brand:read") ? "<p>It can read workspace Brand Kit guidance and editable prompt defaults.</p>" : ""}${request.scope.split(" ").includes("creatives:draft") ? "<p>It can read and save local creative and video setup drafts.</p>" : ""}${request.scope.split(" ").includes("campaigns:draft") ? "<p>It can read and save local Google campaign and unscheduled publication drafts, including local destination account IDs and names, without provider mutation or activation.</p>" : ""}${request.scope.split(" ").includes("brand:configure") ? "<p>Workspace owners and administrators can change shared prompt defaults, affecting future work. This permission is not limited to drafts.</p>" : ""}${request.scope.split(" ").includes("catalog:configure") ? "<p>Workspace owners and administrators can change category mappings, product category overrides and shared category guidance, affecting future work. This permission is not limited to drafts.</p>" : ""}<form method="post">${hidden("nonce", request.nonce)}<label>Workspace <select name="organizationId">${workspaces.map(w => `<option value="${w.id}">${escape(w.name)}</option>`).join("")}</select></label><p>Requested permissions: ${escape(request.scope)}</p><label>Duration <select name="duration"><option value="session">30 minutes only</option><option value="ongoing">Ongoing, revocable (30-day inactivity limit)</option></select></label><button name="decision" value="allow">Allow this workspace connection</button> <button name="decision" value="deny">Deny</button></form><p><a href="/app">Cancel</a> · <a href="/mcp/connections">Manage connections</a></p>`,
        config.redirectUris.map(uri => new URL(uri).origin)
      );
    })
  );
  app.post(
    "/mcp/oauth/authorize",
    consentLimit,
    sameOrigin,
    form,
    safe(async (req, res) => {
      const user = await authenticate(req, res);
      if (!user) {
        res.status(401).send("Sign in again.");
        return;
      }
      const input = z
        .object({
          nonce: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
          organizationId: z.coerce.number().int().positive(),
          decision: z.enum(["allow", "deny"]).default("allow"),
          duration: z.enum(["session", "ongoing"]).default("session"),
        })
        .strict()
        .parse(req.body);
      res.redirect(
        303,
        input.decision === "deny"
          ? await oauth.deny(user.id, input.nonce)
          : await oauth.consent(
              user.id,
              input.nonce,
              input.organizationId,
              input.duration === "ongoing"
            )
      );
    })
  );
  app.post(
    "/mcp/oauth/token",
    consentLimit,
    form,
    safe(async (req, res) => {
      try {
        res.json(await oauth.exchange(req.body));
      } catch {
        res.status(400).json({ error: "invalid_grant" });
      }
    })
  );
  app.get(
    "/mcp/connections",
    safe(async (req, res) => {
      const user = await signedIn(req, res);
      if (!user) return;
      const rows = await oauth.connections(user.id);
      page(
        res,
        "Authoring connections",
        rows
          .map(
            row =>
              `<section><p>Workspace ${row.organizationId} · ${escape(row.scope)} · ${row.revokedAtMs ? "Revoked" : (row.refreshExpiresAtMs ?? row.expiresAtMs) <= Date.now() ? "Expired" : (row.refreshExpiresAtMs ? "Ongoing; renewal expires " : "Expires ") + escape(new Date(row.refreshExpiresAtMs ?? row.expiresAtMs).toISOString())}</p>${!row.revokedAtMs && (row.refreshExpiresAtMs ?? row.expiresAtMs) > Date.now() ? `<form method="post">${hidden("id", row.id)}<button>Revoke connection</button></form>` : ""}</section>`
          )
          .join("") || "<p>No connections.</p>"
      );
    })
  );
  app.post(
    "/mcp/connections",
    sameOrigin,
    form,
    safe(async (req, res) => {
      const user = await authenticate(req, res);
      if (!user) {
        res.status(401).end();
        return;
      }
      await oauth.revoke(user.id, z.string().uuid().parse(req.body.id));
      res.redirect(303, "/mcp/connections");
    })
  );
  const reviewSchema = applyInput.extend({
    organizationId: z.coerce.number().int().positive(),
    connectionId: z.string().uuid(),
  });
  app.get(
    "/mcp/review",
    safe(async (req, res) => {
      const input = reviewSchema.parse(req.query),
        user = await signedIn(req, res);
      if (!user) return;
      const service = workflowAuthoring(
        user.id,
        connectionGuard(user.id, input.connectionId, config.resource, true)
      );
      const proposal = await service.preview({
        organizationId: input.organizationId,
        proposalId: input.proposalId,
      });
      if (proposal.hash !== input.reviewedHash)
        throw new Error("Proposal identity mismatch");
      page(
        res,
        "Review workflow draft",
        `<p>Review the complete proposed configuration below. Applying saves only a draft. It does not execute or publish.</p><pre>${escape(JSON.stringify({ draft: proposal.draft, preview: proposal.preview, latestChanges: proposal.proposal }, null, 2))}</pre><form method="post">${Object.entries(
          input
        )
          .map(([k, v]) => hidden(k, v))
          .join(
            ""
          )}<button>Apply this reviewed proposal to draft</button></form><a href="/app">Cancel</a>`
      );
    })
  );
  app.post(
    "/mcp/review",
    sameOrigin,
    form,
    safe(async (req, res) => {
      const user = await authenticate(req, res);
      if (!user) {
        res.status(401).end();
        return;
      }
      const { connectionId, ...input } = reviewSchema.parse(req.body);
      const result = await workflowAuthoring(
        user.id,
        connectionGuard(user.id, connectionId, config.resource, true)
      ).apply(input);
      page(
        res,
        "Draft saved",
        `<p>Saved revision ${result.revision}. Publishing and execution require separate actions.</p><a href="/app">Return to EvokeLoop</a>`
      );
    })
  );
  const runReviewQuery = executionReferenceInput.extend({
    organizationId: z.coerce.number().int().positive(),
  });
  app.get(
    "/mcp/run-review",
    consentLimit,
    safe(async (req, res) => {
      const input = runReviewQuery.parse(req.query);
      const user = await signedIn(req, res);
      if (!user) return;
      const plan = await reviewMcpWorkflowExecution(user.id, input);
      page(
        res,
        "Approve content generation budget",
        `<p>This authorizes one content-only run in workspace ${input.organizationId}. Estimated charge: <strong>${plan.credits} credits</strong>. Maximum authorized: <strong>${plan.maxCredits} credits</strong>. It cannot publish, activate schedules or change external campaigns.</p><p>Workflow ${escape(plan.workflowId)}, revision ${plan.revision}. Approval expires ${escape(new Date(plan.expiresAt).toISOString())}.</p><pre>${escape(JSON.stringify(plan.reviewConfig, null, 2))}</pre><form method="post">${Object.entries(
          { ...input, hash: plan.hash, maxCredits: plan.maxCredits }
        )
          .map(([k, v]) => hidden(k, v))
          .join(
            ""
          )}<button>Approve this run and credit budget</button></form><a href="/app">Cancel</a>`
      );
    })
  );
  app.post(
    "/mcp/run-review",
    consentLimit,
    sameOrigin,
    form,
    safe(async (req, res) => {
      const user = await authenticate(req, res);
      if (!user) {
        res.status(401).end();
        return;
      }
      const input = executionApprovalInput
        .extend({
          organizationId: z.coerce.number().int().positive(),
          maxCredits: z.coerce.number().int().min(0).max(10000),
        })
        .parse(req.body);
      await approveMcpWorkflowExecution(user.id, input);
      page(
        res,
        "Run budget approved",
        '<p>The exact content-generation request is approved. Return to ChatGPT to queue it. This approval does not publish or enable a schedule.</p><a href="/app">Return to EvokeLoop</a>'
      );
    })
  );
  app.post(
    "/mcp/authoring",
    express.raw({ type: "application/json", limit: "256kb" }),
    safe(async (req, res) => {
      if (!Buffer.isBuffer(req.body)) {
        res.status(415).end();
        return;
      }
      const headers = new Headers();
      for (const name of [
        "host",
        "origin",
        "authorization",
        "accept",
        "content-type",
        "mcp-protocol-version",
        // Modern MCP validates these against the JSON-RPC method/tool name.
        // Forward the client's values unchanged; never synthesize missing headers.
        "mcp-method",
        "mcp-name",
        "mcp-session-id",
      ]) {
        const value = req.headers[name];
        if (typeof value === "string") headers.set(name, value);
      }
      const response = await adapter.fetch(
        new globalThis.Request(config.resource, {
          method: "POST",
          headers,
          body: new Uint8Array(req.body),
        })
      );
      res.status(response.status);
      response.headers.forEach((value, key) => res.setHeader(key, value));
      res.send(Buffer.from(await response.arrayBuffer()));
    })
  );
  app.all(paths, (_req, res) => {
    res.status(405).end();
  });
}
