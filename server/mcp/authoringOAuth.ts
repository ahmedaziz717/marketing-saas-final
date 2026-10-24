import { createHash, randomBytes, randomUUID } from "node:crypto";
import { and, desc, eq, lt } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { getDb } from "../db";
import { organizationMemberships, organizations } from "../../drizzle/schema";
import {
  authoringOAuthGrants as grants,
  authoringOAuthRequests as requests,
} from "../../drizzle/workflowSchema";
import { appendActivity, withOrganizationTransaction } from "../lib/activity";
import { membershipAuthorization } from "../lib/access";
import { workflowRoles } from "../../shared/creativeWorkflow";
import { workflowAuthoring } from "../lib/workflowAuthoring";

export const mcpScopes = ["workflows:read", "workflows:draft"] as const;
export const opaqueHash = (value: string) =>
  createHash("sha256").update(value).digest("hex");
export const pkceChallenge = (value: string) =>
  createHash("sha256").update(value).digest("base64url");
const secret = () => randomBytes(32).toString("base64url");
const denied = () => {
  throw new TRPCError({
    code: "FORBIDDEN",
    message: "Authoring connection unavailable or revoked.",
  });
};
type Tx = Parameters<NonNullable<Parameters<typeof workflowAuthoring>[1]>>[0];
export type OAuthConfig = {
  origin: string;
  resource: string;
  clientId: string;
  redirectUris: string[];
};
export function authoringOAuthConfig(
  env = process.env
): OAuthConfig | undefined {
  if (env.AUTHORING_MCP_ENABLED !== "true") return;
  const origin = new URL(env.APP_ORIGIN || "");
  const clientId = z
    .string()
    .min(1)
    .max(200)
    .parse(env.AUTHORING_MCP_CLIENT_ID);
  const redirects = z
    .array(z.string().url())
    .min(1)
    .max(5)
    .parse(JSON.parse(env.AUTHORING_MCP_REDIRECT_URIS || "[]"));
  for (const url of [origin.href, ...redirects]) {
    const u = new URL(url);
    if (u.protocol !== "https:" || u.username || u.password || u.hash)
      throw new Error("MCP configuration requires exact HTTPS URLs.");
  }
  if (origin.pathname !== "/" || origin.search)
    throw new Error("APP_ORIGIN must be an origin.");
  return {
    origin: origin.origin,
    resource: origin.origin + "/mcp/authoring",
    clientId,
    redirectUris: redirects,
  };
}
const authorizeSchema = z
  .object({
    response_type: z.literal("code"),
    client_id: z.string().max(200),
    redirect_uri: z.string().max(2048),
    resource: z.string().max(2048),
    scope: z.string().max(100),
    state: z.string().min(1).max(1024),
    code_challenge_method: z.literal("S256"),
    code_challenge: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
  })
  .strict();
export function validateAuthorization(config: OAuthConfig, raw: unknown) {
  const input = authorizeSchema.parse(raw),
    scopes = input.scope.split(" ");
  if (
    input.client_id !== config.clientId ||
    !config.redirectUris.includes(input.redirect_uri) ||
    input.resource !== config.resource ||
    !scopes.includes("workflows:read") ||
    scopes.some(s => !(mcpScopes as readonly string[]).includes(s)) ||
    new Set(scopes).size !== scopes.length
  )
    throw new Error("Invalid authorization request");
  return input;
}
async function database() {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  return db;
}
async function membership(tx: Tx, userId: number, organizationId: number) {
  const [row] = await tx
    .select()
    .from(organizationMemberships)
    .where(
      and(
        eq(organizationMemberships.userId, userId),
        eq(organizationMemberships.organizationId, organizationId)
      )
    )
    .for("share");
  if (
    !membershipAuthorization({
      membership: row,
      userId,
      organizationId,
      allowedRoles: [...workflowRoles],
    }).allowed
  )
    denied();
}
export function connectionGuard(
  userId: number,
  connectionId: string,
  resource: string,
  write = false
) {
  return async (tx: Tx, organizationId: number) => {
    const [row] = await tx
      .select()
      .from(grants)
      .where(
        and(
          eq(grants.id, connectionId),
          eq(grants.userId, userId),
          eq(grants.organizationId, organizationId)
        )
      )
      .for("share");
    if (
      !row ||
      row.revokedAtMs ||
      row.expiresAtMs <= Date.now() ||
      row.resource !== resource ||
      !row.scope.split(" ").includes("workflows:read") ||
      (write && !row.scope.split(" ").includes("workflows:draft"))
    )
      denied();
  };
}
export function authoringOAuth(config: OAuthConfig) {
  return {
    async workspaces(userId: number) {
      const db = await database();
      return db
        .select({
          id: organizations.id,
          name: organizations.name,
          role: organizationMemberships.role,
        })
        .from(organizationMemberships)
        .innerJoin(
          organizations,
          eq(organizations.id, organizationMemberships.organizationId)
        )
        .where(
          and(
            eq(organizationMemberships.userId, userId),
            eq(organizationMemberships.status, "active")
          )
        )
        .then(rows =>
          rows.filter(row =>
            (workflowRoles as readonly string[]).includes(row.role)
          )
        );
    },
    async begin(userId: number, raw: unknown) {
      const input = validateAuthorization(config, raw),
        nonce = secret();
      const db = await database();
      // Expired authorization handshakes have no audit value; grants are audited separately.
      await db
        .delete(requests)
        .where(
          and(
            eq(requests.userId, userId),
            lt(requests.expiresAtMs, Date.now() - 86400_000)
          )
        );
      await db
        .insert(requests)
        .values({
          idHash: opaqueHash(nonce),
          userId,
          clientId: input.client_id,
          redirectUri: input.redirect_uri,
          resource: input.resource,
          scope: input.scope,
          state: input.state,
          challenge: input.code_challenge,
          expiresAtMs: Date.now() + 5 * 60_000,
        });
      return { nonce, scope: input.scope };
    },
    async consent(userId: number, nonce: string, organizationId: number) {
      return withOrganizationTransaction(
        await database(),
        organizationId,
        async tx => {
          await membership(tx, userId, organizationId);
          const [request] = await tx
            .select()
            .from(requests)
            .where(eq(requests.idHash, opaqueHash(nonce)))
            .for("update");
          if (
            !request ||
            request.userId !== userId ||
            request.expiresAtMs <= Date.now() ||
            request.codeHash ||
            request.consumedAtMs ||
            request.resource !== config.resource ||
            request.clientId !== config.clientId ||
            !config.redirectUris.includes(request.redirectUri)
          )
            return denied();
          const code = secret();
          await tx
            .update(requests)
            .set({ codeHash: opaqueHash(code), organizationId })
            .where(eq(requests.idHash, request.idHash));
          await appendActivity(
            {
              organizationId,
              actorUserId: userId,
              entityType: "authoring_connection",
              entityId: request.idHash,
              action: "authoring.connection_consented",
              payload: { clientId: request.clientId, scope: request.scope },
            },
            tx
          );
          const redirect = new URL(request.redirectUri);
          redirect.searchParams.set("code", code);
          redirect.searchParams.set("state", request.state);
          redirect.searchParams.set("iss", config.origin);
          return redirect.href;
        }
      );
    },
    async deny(userId: number, nonce: string) {
      return (await database()).transaction(async tx => {
        const [request] = await tx
          .select()
          .from(requests)
          .where(eq(requests.idHash, opaqueHash(nonce)))
          .for("update");
        if (
          !request ||
          request.userId !== userId ||
          request.expiresAtMs <= Date.now() ||
          request.consumedAtMs ||
          request.codeHash ||
          request.clientId !== config.clientId ||
          !config.redirectUris.includes(request.redirectUri)
        )
          return denied();
        await tx
          .update(requests)
          .set({ consumedAtMs: Date.now() })
          .where(eq(requests.idHash, request.idHash));
        const redirect = new URL(request.redirectUri);
        redirect.searchParams.set("error", "access_denied");
        redirect.searchParams.set("state", request.state);
        redirect.searchParams.set("iss", config.origin);
        return redirect.href;
      });
    },
    async exchange(raw: unknown) {
      const input = z
        .object({
          grant_type: z.literal("authorization_code"),
          code: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
          client_id: z.string(),
          redirect_uri: z.string(),
          resource: z.string(),
          code_verifier: z.string().regex(/^[A-Za-z0-9._~-]{43,128}$/),
        })
        .strict()
        .parse(raw);
      const db = await database();
      // Find the workspace first, then take locks in the same order as authoring/revoke.
      const [candidate] = await db
        .select()
        .from(requests)
        .where(eq(requests.codeHash, opaqueHash(input.code)));
      if (!candidate?.organizationId) return denied();
      return withOrganizationTransaction(
        db,
        candidate.organizationId,
        async tx => {
          const [request] = await tx
            .select()
            .from(requests)
            .where(eq(requests.idHash, candidate.idHash))
            .for("update");
          if (
            !request ||
            request.consumedAtMs ||
            request.expiresAtMs <= Date.now() ||
            request.clientId !== input.client_id ||
            request.clientId !== config.clientId ||
            request.redirectUri !== input.redirect_uri ||
            !config.redirectUris.includes(input.redirect_uri) ||
            input.resource !== config.resource ||
            request.resource !== input.resource ||
            request.challenge !== pkceChallenge(input.code_verifier)
          )
            return denied();
          await membership(tx, request.userId, candidate.organizationId!);
          const token = secret(),
            now = Date.now(),
            id = randomUUID();
          await tx
            .update(requests)
            .set({ consumedAtMs: now })
            .where(eq(requests.idHash, request.idHash));
          await tx
            .insert(grants)
            .values({
              id,
              userId: request.userId,
              organizationId: candidate.organizationId!,
              clientId: request.clientId,
              scope: request.scope,
              resource: request.resource,
              tokenHash: opaqueHash(token),
              createdAtMs: now,
              expiresAtMs: now + 30 * 60_000,
            });
          await appendActivity(
            {
              organizationId: candidate.organizationId!,
              actorUserId: request.userId,
              entityType: "authoring_connection",
              entityId: id,
              action: "authoring.connection_granted",
              payload: {
                clientId: request.clientId,
                scope: request.scope,
                expiresAtMs: now + 30 * 60_000,
              },
            },
            tx
          );
          return {
            access_token: token,
            token_type: "Bearer",
            expires_in: 1800,
            scope: request.scope,
          };
        }
      );
    },
    async verify(token: string) {
      if (!/^[A-Za-z0-9_-]{43}$/.test(token)) return null;
      const db = await database();
      const [row] = await db
        .select()
        .from(grants)
        .where(eq(grants.tokenHash, opaqueHash(token)));
      if (
        !row ||
        row.revokedAtMs ||
        row.expiresAtMs <= Date.now() ||
        row.resource !== config.resource ||
        row.clientId !== config.clientId
      )
        return null;
      return {
        userId: row.userId,
        organizationId: row.organizationId,
        connectionId: row.id,
        scopes: row.scope.split(" "),
        clientId: row.clientId,
        expiresAt: Math.floor(row.expiresAtMs / 1000),
      };
    },
    async connections(userId: number) {
      return (await database())
        .select({
          id: grants.id,
          organizationId: grants.organizationId,
          scope: grants.scope,
          expiresAtMs: grants.expiresAtMs,
          revokedAtMs: grants.revokedAtMs,
        })
        .from(grants)
        .where(eq(grants.userId, userId))
        .orderBy(desc(grants.createdAtMs))
        .limit(100);
    },
    async revoke(userId: number, id: string) {
      const db = await database();
      const [row] = await db
        .select()
        .from(grants)
        .where(and(eq(grants.id, id), eq(grants.userId, userId)));
      if (!row) return;
      // A removed member can still revoke their own connection.
      await withOrganizationTransaction(db, row.organizationId, async tx => {
        await tx
          .update(grants)
          .set({ revokedAtMs: Date.now() })
          .where(and(eq(grants.id, id), eq(grants.userId, userId)));
        await appendActivity(
          {
            organizationId: row.organizationId,
            actorUserId: userId,
            entityType: "authoring_connection",
            entityId: id,
            action: "authoring.connection_revoked",
          },
          tx
        );
      });
    },
  };
}
