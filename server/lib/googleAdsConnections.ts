import { createHash, randomBytes, randomUUID } from "node:crypto";
import { and, eq, gt, lt, sql } from "drizzle-orm";
import { parse } from "cookie";
import type { Express, Response } from "express";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import {
  channelConnections,
  channelOAuthSessions,
  type ChannelConnection,
} from "../../drizzle/channelSchema";
import {
  googleAccountSchema,
  type GoogleAdsAccount,
} from "../../shared/googleAds";
import { authenticateRequest } from "../auth/supabase";
import { requireOrganizationRole } from "./access";
import { appendActivity, withOrganizationTransaction } from "./activity";
import {
  libraryDatabase,
  type LibraryDatabase,
  type LibraryTransaction,
} from "./assetLibrary";
import { decryptToken, encryptToken } from "./secureToken";
import {
  GOOGLE_ADS_SCOPE,
  GOOGLE_CALLBACK_PATH,
  GoogleAdsError,
  discoverGoogleAccounts,
  exchangeGoogleCode,
  googleConfig,
  googleGrantSchema,
  googleOAuthConfigured,
  refreshGoogleGrant,
  verifyGoogleAccount,
  type GoogleGrant,
} from "./googleAdsApi";

const target = "/app/settings/integrations";
const cookieName = "evokeloop_google_state";
const ttl = 10 * 60 * 1000;
const hash = (text: string) => createHash("sha256").update(text).digest("hex");
const stateSchema = z.object({
  stage: z.literal("authorization"),
  verifier: z.string().min(43),
  clientId: z.string(),
});
const selectionSchema = z.object({
  stage: z.literal("selection"),
  grant: googleGrantSchema,
  accounts: z.array(googleAccountSchema),
  warnings: z.array(z.string()),
});
const selectionExpired = () =>
  new TRPCError({
    code: "PRECONDITION_FAILED",
    message:
      "Account selection expired or belongs to another workspace. Connect with Google again.",
  });

export async function beginGoogleOAuth(
  db: LibraryDatabase,
  organizationId: number,
  userId: number,
  res: Response
) {
  await requireOrganizationRole(userId, organizationId, ["owner", "admin"]);
  if (!googleOAuthConfigured())
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message: "Google Ads connection setup is not complete. Contact support.",
    });
  const { clientId, callbackUrl } = googleConfig();
  const state = randomBytes(32).toString("hex");
  const verifier = randomBytes(32).toString("base64url");
  await db
    .delete(channelOAuthSessions)
    .where(
      and(
        eq(channelOAuthSessions.purpose, "google_ads"),
        lt(channelOAuthSessions.expiresAtMs, Date.now())
      )
    );
  await db.insert(channelOAuthSessions).values({
    id: randomUUID(),
    organizationId,
    userId,
    purpose: "google_ads",
    stateHash: hash(state),
    credentials: encryptToken(
      JSON.stringify({ stage: "authorization", verifier, clientId })
    ),
    createdAtMs: Date.now(),
    expiresAtMs: Date.now() + ttl,
  });
  res.cookie(cookieName, state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: GOOGLE_CALLBACK_PATH,
    maxAge: ttl,
  });
  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  Object.entries({
    client_id: clientId,
    redirect_uri: callbackUrl,
    response_type: "code",
    scope: GOOGLE_ADS_SCOPE,
    access_type: "offline",
    prompt: "consent select_account",
    state,
    code_challenge: createHash("sha256").update(verifier).digest("base64url"),
    code_challenge_method: "S256",
  }).forEach(([key, value]) => url.searchParams.set(key, value));
  return { url: url.toString() };
}

export function registerGoogleAdsOAuth(app: Express) {
  app.get(GOOGLE_CALLBACK_PATH, async (req, res) => {
    res.set({
      "Cache-Control": "private, no-store",
      "Referrer-Policy": "no-referrer",
    });
    try {
      const user = await authenticateRequest(req, res);
      if (!user)
        return void res.redirect("/login?next=" + encodeURIComponent(target));
      const state = typeof req.query.state === "string" ? req.query.state : "";
      const cookie = parse(req.headers.cookie ?? "")[cookieName];
      res.clearCookie(cookieName, { path: GOOGLE_CALLBACK_PATH });
      if (!/^[a-f0-9]{64}$/.test(state) || state !== cookie)
        return void res.redirect(target + "?googleError=state");
      const db = await libraryDatabase();
      const [session] = await db
        .delete(channelOAuthSessions)
        .where(
          and(
            eq(channelOAuthSessions.purpose, "google_ads"),
            eq(channelOAuthSessions.stateHash, hash(state)),
            eq(channelOAuthSessions.userId, user.id),
            gt(channelOAuthSessions.expiresAtMs, Date.now())
          )
        )
        .returning();
      if (!session?.credentials)
        return void res.redirect(target + "?googleError=expired");
      await requireOrganizationRole(user.id, session.organizationId, [
        "owner",
        "admin",
      ]);
      if (req.query.error)
        return void res.redirect(target + "?googleError=declined");
      const code = typeof req.query.code === "string" ? req.query.code : "";
      if (!code || code.length > 4096) throw new GoogleAdsError("connection");
      const pending = stateSchema.parse(
        JSON.parse(decryptToken(session.credentials))
      );
      if (pending.clientId !== googleConfig().clientId)
        throw new GoogleAdsError("expired");
      const grant = await exchangeGoogleCode(code, pending.verifier);
      const discovery = await discoverGoogleAccounts(grant.accessToken);
      const id = randomUUID();
      await db
        .insert(channelOAuthSessions)
        .values({
          id,
          organizationId: session.organizationId,
          userId: user.id,
          purpose: "google_ads",
          credentials: encryptToken(
            JSON.stringify({ stage: "selection", grant, ...discovery })
          ),
          createdAtMs: Date.now(),
          expiresAtMs: Date.now() + ttl,
        });
      // Only an opaque, user-bound selection ID reaches the browser.
      res.redirect(target + "?googleSelection=" + encodeURIComponent(id));
    } catch (error) {
      res.redirect(
        target +
          "?googleError=" +
          (error instanceof GoogleAdsError ? error.reason : "connection")
      );
    }
  });
}

async function readSelection(
  db: LibraryDatabase,
  organizationId: number,
  userId: number,
  id: string
) {
  await requireOrganizationRole(userId, organizationId, ["owner", "admin"]);
  const [row] = await db
    .select()
    .from(channelOAuthSessions)
    .where(
      and(
        eq(channelOAuthSessions.id, id),
        eq(channelOAuthSessions.purpose, "google_ads"),
        eq(channelOAuthSessions.organizationId, organizationId),
        eq(channelOAuthSessions.userId, userId),
        gt(channelOAuthSessions.expiresAtMs, Date.now())
      )
    )
    .limit(1);
  if (!row?.credentials || row.stateHash) throw selectionExpired();
  const parsed = selectionSchema.safeParse(
    JSON.parse(decryptToken(row.credentials))
  );
  if (!parsed.success || parsed.data.grant.clientId !== googleConfig().clientId)
    throw selectionExpired();
  return { row, ...parsed.data };
}
export async function googleSelection(
  db: LibraryDatabase,
  organizationId: number,
  userId: number,
  id: string
) {
  const { accounts, warnings } = await readSelection(
    db,
    organizationId,
    userId,
    id
  );
  return { accounts, warnings };
}
export async function cancelGoogleSelection(
  db: LibraryDatabase,
  organizationId: number,
  userId: number,
  id: string
) {
  await requireOrganizationRole(userId, organizationId, ["owner", "admin"]);
  await db
    .delete(channelOAuthSessions)
    .where(
      and(
        eq(channelOAuthSessions.id, id),
        eq(channelOAuthSessions.purpose, "google_ads"),
        eq(channelOAuthSessions.organizationId, organizationId),
        eq(channelOAuthSessions.userId, userId)
      )
    );
  return { success: true };
}
function accountDetails(account: GoogleAdsAccount, grant: GoogleGrant) {
  return {
    permissions: [GOOGLE_ADS_SCOPE],
    tasks: [],
    capabilities: ["read" as const],
    warnings: [],
    currency: account.currency,
    timezone: account.timezone,
    google: {
      loginCustomerId: account.loginCustomerId,
      testAccount: account.testAccount,
      refreshExpiresAtMs: grant.refreshExpiresAtMs,
    },
  };
}
export async function connectGoogleAccounts(
  db: LibraryDatabase,
  input: {
    organizationId: number;
    userId: number;
    discoveryId: string;
    accountIds: string[];
  }
) {
  const selection = await readSelection(
    db,
    input.organizationId,
    input.userId,
    input.discoveryId
  );
  const chosen = Array.from(new Set(input.accountIds)).map(id => {
    const account = selection.accounts.find(a => a.id === id);
    if (!account)
      throw new TRPCError({
        code: "FORBIDDEN",
        message: "That Google Ads account was not granted to this connection.",
      });
    return account;
  });
  if (!chosen.length || chosen.length > 25)
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Choose between 1 and 25 Google Ads accounts.",
    });
  const grant =
    selection.grant.expiresAtMs <= Date.now() + 60000
      ? await refreshGoogleGrant(selection.grant)
      : selection.grant;
  const verified: GoogleAdsAccount[] = [];
  for (let i = 0; i < chosen.length; i += 4)
    verified.push(
      ...(await Promise.all(
        chosen
          .slice(i, i + 4)
          .map(a => verifyGoogleAccount(grant.accessToken, a))
      ))
    );
  await requireOrganizationRole(input.userId, input.organizationId, [
    "owner",
    "admin",
  ]);
  return withOrganizationTransaction(db, input.organizationId, async tx => {
    const consumed = await tx
      .delete(channelOAuthSessions)
      .where(
        and(
          eq(channelOAuthSessions.id, selection.row.id),
          eq(channelOAuthSessions.purpose, "google_ads"),
          eq(channelOAuthSessions.organizationId, input.organizationId),
          eq(channelOAuthSessions.userId, input.userId),
          gt(channelOAuthSessions.expiresAtMs, Date.now())
        )
      )
      .returning({ id: channelOAuthSessions.id });
    if (!consumed.length) throw selectionExpired();
    const connected: Array<{ id: string; name: string }> = [];
    for (const account of verified) {
      const [previous] = await tx
        .select()
        .from(channelConnections)
        .where(
          and(
            eq(channelConnections.organizationId, input.organizationId),
            eq(channelConnections.channel, "google_ads"),
            eq(channelConnections.accountId, account.id)
          )
        )
        .limit(1);
      const id = previous?.id ?? randomUUID();
      const values = {
        name: account.name,
        status: "connected" as const,
        credentials: encryptToken(JSON.stringify(grant)),
        details: accountDetails(account, grant),
        version: (previous?.version ?? 0) + 1,
        connectedByUserId: input.userId,
        verifiedAtMs: Date.now(),
        updatedAtMs: Date.now(),
      };
      if (previous)
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
            channel: "google_ads",
            accountId: account.id,
            ...values,
          });
      await appendActivity(
        {
          organizationId: input.organizationId,
          actorUserId: input.userId,
          action: "channel.connected",
          entityType: "channel_connection",
          entityId: id,
          payload: {
            channel: "google_ads",
            accountId: account.id,
            capabilities: ["read"],
          },
        },
        tx
      );
      connected.push({ id, name: account.name });
    }
    return { accounts: connected };
  });
}

export function safeGoogleConnection(c: ChannelConnection) {
  const { credentials: _, ...safe } = c;
  return {
    ...safe,
    needsReconnect:
      c.status === "error" ||
      !!(
        c.details.google?.refreshExpiresAtMs &&
        c.details.google.refreshExpiresAtMs <= Date.now()
      ),
  };
}
async function getGoogleConnection(
  db: LibraryDatabase | LibraryTransaction,
  organizationId: number,
  id: string
) {
  const [connection] = await db
    .select()
    .from(channelConnections)
    .where(
      and(
        eq(channelConnections.id, id),
        eq(channelConnections.organizationId, organizationId),
        eq(channelConnections.channel, "google_ads")
      )
    )
    .limit(1);
  if (!connection)
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "Google Ads connection not found in this workspace.",
    });
  return connection;
}

// Called on demand; refreshes do not require another consent screen. Optimistic
// version checks stop an in-flight refresh from reviving a disconnected account
// or overwriting credentials installed by a simultaneous reconnect.
async function googleConnectionGrant(
  db: LibraryDatabase,
  organizationId: number,
  id: string,
  force = false
) {
  for (let attempt = 0; attempt < 2; attempt++) {
    const c = await getGoogleConnection(db, organizationId, id);
    if (c.status === "disconnected" || !c.credentials)
      throw new GoogleAdsError("expired");
    let grant = googleGrantSchema.parse(
      JSON.parse(decryptToken(c.credentials))
    );
    try {
      if (
        grant.clientId !== googleConfig().clientId ||
        (grant.refreshExpiresAtMs && grant.refreshExpiresAtMs <= Date.now())
      )
        throw new GoogleAdsError("expired");
      if (!force && grant.expiresAtMs > Date.now() + 60000)
        return { connection: c, grant };
      grant = await refreshGoogleGrant(grant);
    } catch (error) {
      if (
        error instanceof GoogleAdsError &&
        ["expired", "scope", "offline"].includes(error.reason)
      )
        await db
          .update(channelConnections)
          .set({
            status: "error",
            credentials: null,
            details: {
              ...c.details,
              warnings: [
                "Google access expired or was revoked. Reconnect this account.",
              ],
            },
            version: c.version + 1,
            updatedAtMs: Date.now(),
          })
          .where(
            and(
              eq(channelConnections.id, c.id),
              eq(channelConnections.organizationId, organizationId),
              eq(channelConnections.version, c.version)
            )
          );
      throw error;
    }
    const [updated] = await db
      .update(channelConnections)
      .set({
        credentials: encryptToken(JSON.stringify(grant)),
        details: {
          ...c.details,
          google: {
            ...c.details.google!,
            refreshExpiresAtMs: grant.refreshExpiresAtMs,
          },
        },
        version: c.version + 1,
        updatedAtMs: Date.now(),
      })
      .where(
        and(
          eq(channelConnections.id, c.id),
          eq(channelConnections.organizationId, organizationId),
          eq(channelConnections.version, c.version)
        )
      )
      .returning();
    if (updated) return { connection: updated, grant };
  }
  throw new TRPCError({
    code: "CONFLICT",
    message: "This Google connection changed. Please try again.",
  });
}
export async function verifyGoogleConnection(
  db: LibraryDatabase,
  organizationId: number,
  userId: number,
  id: string
) {
  await requireOrganizationRole(userId, organizationId, ["owner", "admin"]);
  let access = await googleConnectionGrant(db, organizationId, id);
  let account: GoogleAdsAccount;
  try {
    account = await verifyGoogleAccount(access.grant.accessToken, {
      id: access.connection.accountId,
      loginCustomerId: access.connection.details.google?.loginCustomerId,
    });
  } catch (error) {
    if (!(error instanceof GoogleAdsError) || error.reason !== "expired")
      throw error;
    access = await googleConnectionGrant(db, organizationId, id, true);
    account = await verifyGoogleAccount(access.grant.accessToken, {
      id: access.connection.accountId,
      loginCustomerId: access.connection.details.google?.loginCustomerId,
    });
  }
  const c = access.connection;
  const updated = await db
    .update(channelConnections)
    .set({
      name: account.name,
      status: "connected",
      details: accountDetails(account, access.grant),
      verifiedAtMs: Date.now(),
      updatedAtMs: Date.now(),
      version: c.version + 1,
    })
    .where(
      and(
        eq(channelConnections.id, c.id),
        eq(channelConnections.organizationId, organizationId),
        eq(channelConnections.version, c.version)
      )
    )
    .returning({ id: channelConnections.id });
  if (!updated.length)
    throw new TRPCError({
      code: "CONFLICT",
      message: "This connection changed during verification. Please try again.",
    });
  return { success: true, message: "Google Ads account access verified." };
}
/** Internal reads use the current workspace connection and retry expired access once. */
export async function withGoogleAdsAccess<T>(
  db: LibraryDatabase,
  organizationId: number,
  id: string,
  read: (connection: ChannelConnection, accessToken: string) => Promise<T>
): Promise<T> {
  let access = await googleConnectionGrant(db, organizationId, id);
  try {
    return await read(access.connection, access.grant.accessToken);
  } catch (error) {
    if (!(error instanceof GoogleAdsError) || error.reason !== "expired")
      throw error;
    access = await googleConnectionGrant(db, organizationId, id, true);
    return read(access.connection, access.grant.accessToken);
  }
}
export async function disconnectGoogleAccount(
  db: LibraryDatabase,
  organizationId: number,
  userId: number,
  id: string
) {
  await requireOrganizationRole(userId, organizationId, ["owner", "admin"]);
  return withOrganizationTransaction(db, organizationId, async tx => {
    const c = await getGoogleConnection(tx, organizationId, id);
    await tx
      .update(channelConnections)
      .set({
        status: "disconnected",
        credentials: null,
        version: sql`${channelConnections.version} + 1`,
        updatedAtMs: Date.now(),
      })
      .where(
        and(
          eq(channelConnections.id, c.id),
          eq(channelConnections.organizationId, organizationId)
        )
      );
    await appendActivity(
      {
        organizationId,
        actorUserId: userId,
        action: "channel.disconnected",
        entityType: "channel_connection",
        entityId: c.id,
        payload: { channel: "google_ads", accountId: c.accountId },
      },
      tx
    );
    // Google revocation invalidates the grant across a Cloud project, including
    // other intentionally connected accounts/workspaces. Unlink only this account.
    return { success: true };
  });
}
