import { createHash, randomBytes, randomUUID } from "node:crypto";
import { and, eq, gt, inArray, lt, sql } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import type { Express, Response } from "express";
import { parse } from "cookie";
import {
  channelConnections,
  channelOAuthSessions,
  publications,
  type ChannelConnection,
} from "../../drizzle/channelSchema";
import type { Channel, ConnectionDetails } from "../../shared/channels";
import { authenticateRequest } from "../auth/supabase";
import {
  libraryDatabase,
  type LibraryDatabase,
  type LibraryTransaction,
} from "./assetLibrary";
import { requireOrganizationRole } from "./access";
import { appendActivity, withOrganizationTransaction } from "./activity";
import { encryptToken, decryptToken } from "./secureToken";
import {
  discoverMeta,
  graphRequest,
  safeDiscovery,
  remoteId,
  GRAPH_VERSION,
} from "./channelGraph";
const hash = (v: string) => createHash("sha256").update(v).digest("hex");
export const oauthConfigured = () =>
  !!(
    process.env.META_APP_ID &&
    process.env.META_APP_SECRET &&
    process.env.APP_ORIGIN
  );
export const callbackUrl = () =>
  new URL("/api/channels/meta/callback", process.env.APP_ORIGIN).toString();
export function safeConnection(c: ChannelConnection) {
  const { credentials: _, ...safe } = c;
  return {
    ...safe,
    expired: !!c.details.expiresAtMs && c.details.expiresAtMs <= Date.now(),
  };
}
export async function getConnection(
  db: LibraryDatabase | LibraryTransaction,
  organizationId: number,
  id: string,
  channel?: Channel
) {
  const row = (
    await db
      .select()
      .from(channelConnections)
      .where(
        and(
          eq(channelConnections.id, id),
          eq(channelConnections.organizationId, organizationId)
        )
      )
      .limit(1)
  )[0];
  if (!row || (channel && row.channel !== channel))
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "Connection not found in this workspace.",
    });
  return row;
}
export function connectionToken(c: ChannelConnection) {
  if (c.status !== "connected" || !c.credentials)
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message: "Reconnect this account before continuing.",
    });
  if (c.details.expiresAtMs && c.details.expiresAtMs <= Date.now())
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message: "This connection has expired. Reconnect the account.",
    });
  return decryptToken(c.credentials);
}
export async function beginMetaOAuth(
  db: LibraryDatabase,
  organizationId: number,
  userId: number,
  purpose: Channel,
  res: Response
) {
  if (!oauthConfigured())
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message:
        "Meta login needs server configuration: META_APP_ID, META_APP_SECRET and the callback URL in the Meta app dashboard.",
    });
  const state = randomBytes(32).toString("hex");
  await db
    .delete(channelOAuthSessions)
    .where(lt(channelOAuthSessions.expiresAtMs, Date.now()));
  await db
    .insert(channelOAuthSessions)
    .values({
      id: randomUUID(),
      organizationId,
      userId,
      purpose,
      stateHash: hash(state),
      expiresAtMs: Date.now() + 600000,
      createdAtMs: Date.now(),
    });
  res.cookie("frame_meta_state", state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/api/channels/meta/callback",
    maxAge: 600000,
  });
  const url = new URL(`https://www.facebook.com/${GRAPH_VERSION}/dialog/oauth`);
  const scope =
    purpose === "facebook"
      ? "pages_show_list,pages_read_engagement,pages_manage_posts,read_insights"
      : "pages_show_list,pages_read_engagement,pages_manage_ads,ads_read,ads_management";
  Object.entries({
    client_id: process.env.META_APP_ID!,
    redirect_uri: callbackUrl(),
    state,
    scope,
    response_type: "code",
  }).forEach(([k, v]) => url.searchParams.set(k, v));
  if (process.env.META_LOGIN_CONFIG_ID)
    url.searchParams.set("config_id", process.env.META_LOGIN_CONFIG_ID);
  return { url: url.toString() };
}
export async function createDiscovery(
  db: LibraryDatabase,
  organizationId: number,
  userId: number,
  purpose: Channel,
  token: string
) {
  const discovery = await discoverMeta(token, purpose);
  const id = randomUUID();
  await db
    .delete(channelOAuthSessions)
    .where(lt(channelOAuthSessions.expiresAtMs, Date.now()));
  await db
    .insert(channelOAuthSessions)
    .values({
      id,
      organizationId,
      userId,
      purpose,
      credentials: encryptToken(token),
      expiresAtMs: Date.now() + 600000,
      createdAtMs: Date.now(),
    });
  return { id, purpose, ...safeDiscovery(discovery) };
}
export async function readDiscovery(
  db: LibraryDatabase,
  organizationId: number,
  userId: number,
  id: string
) {
  const row = (
    await db
      .select()
      .from(channelOAuthSessions)
      .where(
        and(
          eq(channelOAuthSessions.id, id),
          eq(channelOAuthSessions.organizationId, organizationId),
          eq(channelOAuthSessions.userId, userId),
          gt(channelOAuthSessions.expiresAtMs, Date.now())
        )
      )
      .limit(1)
  )[0];
  if (!row?.credentials)
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message: "Account selection expired. Connect again.",
    });
  const token = decryptToken(row.credentials);
  return { row, token, discovery: await discoverMeta(token, row.purpose) };
}
export async function connectChoice(
  db: LibraryDatabase,
  input: {
    organizationId: number;
    userId: number;
    discoveryId: string;
    accountId: string;
    pageId?: string;
  }
) {
  const {
    row,
    token,
    discovery: d,
  } = await readDiscovery(
    db,
    input.organizationId,
    input.userId,
    input.discoveryId
  );
  const granted = new Set(d.granted);
  const details: ConnectionDetails = {
    permissions: d.granted,
    tasks: [],
    capabilities: [],
    warnings: [...d.warnings],
    expiresAtMs: d.expiresAtMs,
  };
  let name: string, accountId: string, selectedToken: string;
  if (row.purpose === "facebook") {
    const page = d.pages.find(p => p.id === input.accountId);
    if (!page?.access_token)
      throw new TRPCError({
        code: "FORBIDDEN",
        message: "That Page was not granted to this connection.",
      });
    const verified = await graphRequest<{ id: string; name: string }>(
      remoteId(page.id),
      page.access_token,
      { fields: "id,name" }
    );
    if (verified.id !== page.id)
      throw new Error("Page identity did not match.");
    name = verified.name;
    accountId = page.id;
    selectedToken = page.access_token;
    details.tasks = page.tasks ?? [];
    if (granted.has("pages_read_engagement")) details.capabilities.push("read");
    if (
      granted.has("pages_manage_posts") &&
      granted.has("pages_read_engagement") &&
      details.tasks.some(t =>
        [
          "CREATE_CONTENT",
          "MANAGE",
          "PROFILE_PLUS_CREATE_CONTENT",
          "PROFILE_PLUS_FULL_CONTROL",
          "PROFILE_PLUS_MANAGE",
        ].includes(t)
      )
    )
      details.capabilities.push("publish");
    if (granted.has("read_insights") && granted.has("pages_read_engagement"))
      details.capabilities.push("insights");
  } else {
    const account = d.accounts.find(
      a => (a.account_id || a.id.replace(/^act_/, "")) === input.accountId
    );
    const page = d.pages.find(p => p.id === input.pageId);
    if (!account || !page)
      throw new TRPCError({
        code: "FORBIDDEN",
        message: "Select an ad account and Page granted to this connection.",
      });
    const verified = await graphRequest<{
      account_id: string;
      name: string;
      currency: string;
      timezone_name: string;
      account_status: number;
    }>(`act_${remoteId(input.accountId)}`, token, {
      fields: "account_id,name,currency,timezone_name,account_status",
    });
    if (verified.account_id !== input.accountId)
      throw new Error("Ad account identity did not match.");
    name = verified.name;
    accountId = verified.account_id;
    selectedToken = token;
    details.pageId = page.id;
    details.pageName = page.name;
    details.tasks = page.tasks ?? [];
    details.currency = verified.currency;
    details.timezone = verified.timezone_name;
    if (granted.has("ads_read") || granted.has("ads_management"))
      details.capabilities.push("read", "insights");
    if (
      granted.has("ads_management") &&
      granted.has("pages_manage_ads") &&
      verified.account_status === 1 &&
      details.tasks.some(t =>
        [
          "ADVERTISE",
          "MANAGE",
          "PROFILE_PLUS_ADVERTISE",
          "PROFILE_PLUS_FULL_CONTROL",
          "PROFILE_PLUS_MANAGE",
        ].includes(t)
      )
    )
      details.capabilities.push("publish");
    if (verified.account_status !== 1)
      details.warnings.push(
        "The advertising account is not active. Resolve its status in Meta."
      );
  }
  if (!details.capabilities.includes("read"))
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Required read access was not granted.",
    });
  if (!details.capabilities.includes("publish"))
    details.warnings.push(
      "Publishing is unavailable. Reconnect with the required permissions and Page tasks."
    );
  if (!details.capabilities.includes("insights"))
    details.warnings.push(
      "Insights permission was not granted. Reporting will be limited."
    );
  return withOrganizationTransaction(db, input.organizationId, async tx => {
    const liveSession = (
      await tx
        .delete(channelOAuthSessions)
        .where(
          and(
            eq(channelOAuthSessions.id, row.id),
            gt(channelOAuthSessions.expiresAtMs, Date.now())
          )
        )
        .returning()
    )[0];
    if (!liveSession)
      throw new TRPCError({
        code: "CONFLICT",
        message:
          "This account selection was already used or expired. Reconnect.",
      });
    const existing = (
      await tx
        .select()
        .from(channelConnections)
        .where(
          and(
            eq(channelConnections.organizationId, input.organizationId),
            eq(channelConnections.channel, row.purpose),
            eq(channelConnections.accountId, accountId)
          )
        )
        .limit(1)
    )[0];
    if (existing) {
      const inflight = await tx
        .select({ id: publications.id })
        .from(publications)
        .where(
          and(
            eq(publications.organizationId, input.organizationId),
            eq(publications.connectionId, existing.id),
            eq(publications.state, "publishing")
          )
        )
        .limit(1);
      if (inflight.length)
        throw new TRPCError({
          code: "CONFLICT",
          message:
            "A delivery is in progress. Wait for its result before reconnecting.",
        });
    }
    const id = existing?.id ?? randomUUID(),
      now = Date.now();
    const values = {
      name,
      status: "connected" as const,
      credentials: encryptToken(selectedToken),
      details,
      version: (existing?.version ?? 0) + 1,
      connectedByUserId: input.userId,
      verifiedAtMs: now,
      updatedAtMs: now,
    };
    if (existing)
      await tx
        .update(channelConnections)
        .set(values)
        .where(eq(channelConnections.id, id));
    else
      await tx
        .insert(channelConnections)
        .values({
          id,
          organizationId: input.organizationId,
          channel: row.purpose,
          accountId,
          ...values,
        });
    // Reconnection changes the destination authorization; reapprove queued content.
    await tx
      .update(publications)
      .set({
        state: "changes_requested",
        approvalHash: null,
        error:
          "The destination was reconnected. Review this publication again.",
        revision: sql`${publications.revision} + 1`,
        updatedAtMs: now,
      })
      .where(
        and(
          eq(publications.organizationId, input.organizationId),
          eq(publications.connectionId, id),
          inArray(publications.state, ["approved", "scheduled"])
        )
      );
    await appendActivity(
      {
        organizationId: input.organizationId,
        actorUserId: input.userId,
        action: "channel.connected",
        entityType: "channel_connection",
        entityId: id,
        payload: {
          channel: row.purpose,
          accountId,
          capabilities: details.capabilities,
        },
      },
      tx
    );
    return { id, name };
  });
}
export function registerChannelOAuth(app: Express) {
  console.info("Channel readiness", {
    metaOAuthConfigured: oauthConfigured(),
    liveSocialEnabled: process.env.LIVE_SOCIAL_ACTIONS_ENABLED === "true",
    liveAdsEnabled: process.env.LIVE_AD_ACTIONS_ENABLED === "true",
  });
  app.get("/api/channels/meta/callback", async (req, res) => {
    const target = "/app/settings/integrations";
    res.set({
      "Cache-Control": "private, no-store",
      "Referrer-Policy": "no-referrer",
    });
    try {
      const user = await authenticateRequest(req, res);
      if (!user)
        return void res.redirect("/login?next=" + encodeURIComponent(target));
      const state = typeof req.query.state === "string" ? req.query.state : "";
      const cookie = parse(req.headers.cookie ?? "").frame_meta_state;
      res.clearCookie("frame_meta_state", {
        path: "/api/channels/meta/callback",
      });
      if (!/^[a-f0-9]{64}$/.test(state) || state !== cookie)
        return void res.redirect(target + "?metaError=state");
      const db = await libraryDatabase();
      const [session] = await db
        .delete(channelOAuthSessions)
        .where(
          and(
            eq(channelOAuthSessions.stateHash, hash(state)),
            eq(channelOAuthSessions.userId, user.id),
            gt(channelOAuthSessions.expiresAtMs, Date.now())
          )
        )
        .returning();
      if (!session) return void res.redirect(target + "?metaError=expired");
      await requireOrganizationRole(user.id, session.organizationId, [
        "owner",
        "admin",
      ]);
      if (req.query.error)
        return void res.redirect(target + "?metaError=declined");
      const code = typeof req.query.code === "string" ? req.query.code : "";
      if (!code || code.length > 4096)
        return void res.redirect(target + "?metaError=code");
      const first = await graphRequest<{ access_token: string }>(
        "oauth/access_token",
        "",
        {
          client_id: process.env.META_APP_ID!,
          client_secret: process.env.META_APP_SECRET!,
          redirect_uri: callbackUrl(),
          code,
        }
      );
      const long = await graphRequest<{ access_token: string }>(
        "oauth/access_token",
        "",
        {
          grant_type: "fb_exchange_token",
          client_id: process.env.META_APP_ID!,
          client_secret: process.env.META_APP_SECRET!,
          fb_exchange_token: first.access_token,
        }
      );
      const selection = await createDiscovery(
        db,
        session.organizationId,
        user.id,
        session.purpose,
        long.access_token
      );
      res.redirect(
        target + "?metaSelection=" + encodeURIComponent(selection.id)
      );
    } catch {
      res.redirect(target + "?metaError=connection");
    }
  });
}
