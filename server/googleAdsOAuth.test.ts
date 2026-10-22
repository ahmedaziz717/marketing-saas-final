import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { get as httpGet } from "node:http";
import express from "express";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { and, eq } from "drizzle-orm";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
const fixture = vi.hoisted(() => ({
  db: null as any,
  user: null as any,
  exchange: vi.fn(),
  discover: vi.fn(),
  verify: vi.fn(),
  refresh: vi.fn(),
}));
vi.mock("./db", () => ({
  getDb: async () => fixture.db,
  closeDb: async () => {},
}));
vi.mock("./auth/supabase", async original => ({
  ...(await original<typeof import("./auth/supabase")>()),
  authenticateRequest: async () => fixture.user,
}));
vi.mock("./lib/googleAdsApi", async original => ({
  ...(await original<typeof import("./lib/googleAdsApi")>()),
  exchangeGoogleCode: (...args: any[]) => fixture.exchange(...args),
  discoverGoogleAccounts: (...args: any[]) => fixture.discover(...args),
  verifyGoogleAccount: (...args: any[]) => fixture.verify(...args),
  refreshGoogleGrant: (...args: any[]) => fixture.refresh(...args),
}));
import {
  users,
  organizations,
  organizationMemberships,
  activityEvents,
} from "../drizzle/schema";
import {
  channelConnections,
  channelOAuthSessions,
} from "../drizzle/channelSchema";
import {
  beginGoogleOAuth,
  cancelGoogleSelection,
  connectGoogleAccounts,
  disconnectGoogleAccount,
  googleSelection,
  registerGoogleAdsOAuth,
  safeGoogleConnection,
  verifyGoogleConnection,
  withGoogleAdsAccess,
} from "./lib/googleAdsConnections";
import { GOOGLE_ADS_SCOPE, GoogleAdsError } from "./lib/googleAdsApi";
import {
  connectionToken,
  getConnection,
  readDiscovery,
} from "./lib/channelConnections";
import { encryptToken, decryptToken } from "./lib/secureToken";
import { channelSchema } from "../shared/channels";
import { googleAdsRouter } from "./routers/googleAds";

const accounts = [
  {
    id: "2222222222",
    name: "CLX test account",
    currency: "USD",
    timezone: "America/New_York",
    testAccount: false,
    loginCustomerId: "1111111111",
  },
  {
    id: "3333333333",
    name: "Second account",
    currency: "USD",
    timezone: "America/Chicago",
    testAccount: true,
  },
];
const grant = () => ({
  provider: "google_ads",
  clientId: "web-client",
  accessToken: "private-access",
  refreshToken: "private-refresh",
  expiresAtMs: Date.now() + 3600000,
  scope: GOOGLE_ADS_SCOPE,
});
let engine: PGlite,
  owner: any,
  other: any,
  viewer: any,
  org: number,
  org2: number,
  server: ReturnType<ReturnType<typeof express>["listen"]>,
  origin = "";
beforeAll(async () => {
  vi.stubEnv("INTEGRATION_TOKEN_ENCRYPTION_SECRET", "test-google-encryption");
  vi.stubEnv("GOOGLE_ADS_CLIENT_ID", "web-client");
  vi.stubEnv("GOOGLE_ADS_CLIENT_SECRET", "private-client");
  vi.stubEnv("APP_ORIGIN", "https://app.example.test");
  engine = new PGlite();
  for (const file of readdirSync("drizzle/postgres")
    .filter(f => f.endsWith(".sql"))
    .sort())
    await engine.exec(readFileSync("drizzle/postgres/" + file, "utf8"));
  fixture.db = drizzle(engine);
  [owner, other, viewer] = await fixture.db
    .insert(users)
    .values([
      { openId: "google-owner", name: "Owner" },
      { openId: "google-other", name: "Other admin" },
      { openId: "google-viewer", name: "Viewer" },
    ])
    .returning();
  const workspaces = await fixture.db
    .insert(organizations)
    .values([
      {
        name: "Google workspace",
        slug: "google-one",
        createdByUserId: owner.id,
        createdAtMs: 1,
      },
      {
        name: "Second workspace",
        slug: "google-two",
        createdByUserId: owner.id,
        createdAtMs: 1,
      },
    ])
    .returning();
  [org, org2] = workspaces.map((o: any) => o.id);
  await fixture.db.insert(organizationMemberships).values([
    {
      userId: owner.id,
      organizationId: org,
      role: "owner",
      status: "active",
      createdAtMs: 1,
    },
    {
      userId: owner.id,
      organizationId: org2,
      role: "owner",
      status: "active",
      createdAtMs: 1,
    },
    {
      userId: other.id,
      organizationId: org,
      role: "admin",
      status: "active",
      createdAtMs: 1,
    },
    {
      userId: viewer.id,
      organizationId: org,
      role: "reviewer",
      status: "active",
      createdAtMs: 1,
    },
  ]);
  const app = express();
  registerGoogleAdsOAuth(app);
  server = app.listen(0, "127.0.0.1");
  await new Promise<void>(resolve => server.once("listening", resolve));
  origin = "http://127.0.0.1:" + (server.address() as any).port;
}, 30000);
afterAll(async () => {
  if (server) await new Promise<void>(resolve => server.close(() => resolve()));
  await engine?.close();
  vi.unstubAllEnvs();
});
beforeEach(async () => {
  fixture.user = owner;
  fixture.exchange.mockReset().mockImplementation(async () => grant());
  fixture.discover.mockReset().mockResolvedValue({ accounts, warnings: [] });
  fixture.verify
    .mockReset()
    .mockImplementation(async (_: string, a: any) =>
      accounts.find(c => c.id === a.id)
    );
  fixture.refresh.mockReset().mockImplementation(async (g: any) => ({
    ...g,
    accessToken: "refreshed-access",
    expiresAtMs: Date.now() + 3600000,
  }));
  await fixture.db.delete(channelOAuthSessions);
  await fixture.db.delete(channelConnections);
  await fixture.db.delete(activityEvents);
  await fixture.db.update(organizationMemberships).set({ status: "active" });
});
async function begin(workspace = org, userId = owner.id) {
  let cookie = "",
    options: any;
  const result = await beginGoogleOAuth(fixture.db, workspace, userId, {
    cookie: (_: string, value: string, opts: any) => {
      cookie = value;
      options = opts;
    },
  } as any);
  return {
    url: new URL(result.url),
    state: new URL(result.url).searchParams.get("state")!,
    cookie,
    options,
  };
}
function callback(state: string, cookie: string, query = "code=one-time-code") {
  return new Promise<{ location: string; headers: any }>((resolve, reject) => {
    const request = httpGet(
      `${origin}/api/channels/google/callback?${query}&state=${encodeURIComponent(state)}`,
      { headers: { Cookie: "evokeloop_google_state=" + cookie } },
      res => {
        res.resume();
        resolve({ location: res.headers.location ?? "", headers: res.headers });
      }
    );
    request.on("error", reject);
  });
}
async function selection(workspace = org) {
  const pending = await begin(workspace);
  const result = await callback(pending.state, pending.cookie);
  expect(result.location).toContain("googleSelection=");
  return new URL(result.location, origin).searchParams.get("googleSelection")!;
}
async function connect(ids = [accounts[0].id], workspace = org) {
  const discoveryId = await selection(workspace);
  return connectGoogleAccounts(fixture.db, {
    organizationId: workspace,
    userId: owner.id,
    discoveryId,
    accountIds: ids,
  });
}
async function row(id: string) {
  return (
    await fixture.db
      .select()
      .from(channelConnections)
      .where(eq(channelConnections.id, id))
  )[0];
}
const caller = (user = owner) =>
  googleAdsRouter.createCaller({ user, req: {}, res: {} } as any);

describe.sequential("Google OAuth and workspace isolation", () => {
  it("binds single-use state and PKCE to the user, workspace, client and fixed callback", async () => {
    const pending = await begin();
    const [session] = await fixture.db.select().from(channelOAuthSessions);
    expect(session.stateHash).not.toBe(pending.state);
    expect(session.userId).toBe(owner.id);
    expect(session.organizationId).toBe(org);
    const secret = JSON.parse(decryptToken(session.credentials));
    expect(pending.url.searchParams.get("code_challenge")).toBe(
      createHash("sha256").update(secret.verifier).digest("base64url")
    );
    expect(pending.url.searchParams.get("scope")).toBe(GOOGLE_ADS_SCOPE);
    expect(pending.url.searchParams.get("access_type")).toBe("offline");
    expect(pending.url.searchParams.get("redirect_uri")).toBe(
      "https://app.example.test/api/channels/google/callback"
    );
    expect(pending.options).toMatchObject({
      httpOnly: true,
      sameSite: "lax",
      path: "/api/channels/google/callback",
    });
    expect(JSON.stringify(session)).not.toContain(secret.verifier);
  });
  it("rejects callback cookie mismatches and unauthenticated sessions before contacting Google", async () => {
    const pending = await begin();
    expect((await callback(pending.state, "wrong")).location).toContain(
      "googleError=state"
    );
    fixture.user = null;
    expect((await callback(pending.state, pending.cookie)).location).toMatch(
      /^\/login\?/
    );
    expect(fixture.exchange).not.toHaveBeenCalled();
  });
  it("cannot complete another administrator's OAuth session", async () => {
    const pending = await begin();
    fixture.user = other;
    expect((await callback(pending.state, pending.cookie)).location).toContain(
      "googleError=expired"
    );
    expect(fixture.exchange).not.toHaveBeenCalled();
  });
  it("consumes state on cancellation and blocks callback replays", async () => {
    const pending = await begin();
    expect(
      (await callback(pending.state, pending.cookie, "error=access_denied"))
        .location
    ).toContain("googleError=declined");
    expect((await callback(pending.state, pending.cookie)).location).toContain(
      "googleError=expired"
    );
    expect(fixture.exchange).not.toHaveBeenCalled();
  });
  it("does not accept expired or another provider's OAuth state", async () => {
    let pending = await begin();
    await fixture.db.update(channelOAuthSessions).set({ expiresAtMs: 1 });
    expect((await callback(pending.state, pending.cookie)).location).toContain(
      "googleError=expired"
    );
    pending = await begin();
    await fixture.db.update(channelOAuthSessions).set({ purpose: "meta_ads" });
    expect((await callback(pending.state, pending.cookie)).location).toContain(
      "googleError=expired"
    );
    expect(fixture.exchange).not.toHaveBeenCalled();
  });
  it("rechecks workspace membership when the callback arrives", async () => {
    const pending = await begin();
    await fixture.db
      .update(organizationMemberships)
      .set({ status: "suspended" })
      .where(
        and(
          eq(organizationMemberships.userId, owner.id),
          eq(organizationMemberships.organizationId, org)
        )
      );
    expect((await callback(pending.state, pending.cookie)).location).toContain(
      "googleError=connection"
    );
    expect(fixture.exchange).not.toHaveBeenCalled();
  });
  it("encrypts credentials, removes state and never exposes tokens in selection responses", async () => {
    const pending = await begin();
    const result = await callback(pending.state, pending.cookie);
    expect(result.headers["cache-control"]).toContain("no-store");
    expect(result.headers["referrer-policy"]).toBe("no-referrer");
    const id = new URL(result.location, origin).searchParams.get(
      "googleSelection"
    )!;
    const rows = await fixture.db.select().from(channelOAuthSessions);
    expect(rows).toHaveLength(1);
    expect(rows[0].stateHash).toBeNull();
    expect(JSON.stringify(rows)).not.toContain("private-");
    expect(result.location).not.toContain("private-");
    expect(
      JSON.stringify(await googleSelection(fixture.db, org, owner.id, id))
    ).not.toContain("private-");
    expect((await callback(pending.state, pending.cookie)).location).toContain(
      "googleError=expired"
    );
  });
  it("binds account selection to the exact user and workspace and rejects arbitrary account IDs", async () => {
    const id = await selection();
    await expect(
      googleSelection(fixture.db, org, other.id, id)
    ).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
    await expect(
      googleSelection(fixture.db, org2, owner.id, id)
    ).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
    await expect(
      connectGoogleAccounts(fixture.db, {
        organizationId: org,
        userId: owner.id,
        discoveryId: id,
        accountIds: ["9999999999"],
      })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(fixture.verify).not.toHaveBeenCalled();
    expect(await fixture.db.select().from(channelConnections)).toHaveLength(0);
    await expect(
      readDiscovery(fixture.db, org, owner.id, id)
    ).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
  });
  it("connects only chosen accounts, retains the manager and consumes selection once", async () => {
    const id = await selection();
    const input = {
      organizationId: org,
      userId: owner.id,
      discoveryId: id,
      accountIds: [accounts[0].id],
    };
    const result = await connectGoogleAccounts(fixture.db, input);
    const c = await row(result.accounts[0].id);
    expect(c.accountId).toBe(accounts[0].id);
    expect(c.details.google.loginCustomerId).toBe("1111111111");
    expect(c.details.capabilities).toEqual(["read"]);
    expect(JSON.parse(decryptToken(c.credentials)).refreshToken).toBe(
      "private-refresh"
    );
    expect(safeGoogleConnection(c)).not.toHaveProperty("credentials");
    expect(fixture.verify).toHaveBeenCalledWith(
      "private-access",
      expect.objectContaining({ loginCustomerId: "1111111111" })
    );
    await expect(
      connectGoogleAccounts(fixture.db, input)
    ).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
    const publicRows = await caller().connections({ organizationId: org });
    expect(JSON.stringify(publicRows)).not.toContain("private-");
    expect(
      (await caller().connections({ organizationId: org2 })).items
    ).toEqual([]);
  });
  it("connects multiple selected accounts atomically and does not save when verification fails", async () => {
    fixture.verify.mockRejectedValueOnce(new GoogleAdsError("permission"));
    await expect(connect(accounts.map(a => a.id))).rejects.toMatchObject({
      reason: "permission",
    });
    expect(await fixture.db.select().from(channelConnections)).toHaveLength(0);
    const result = await connect(accounts.map(a => a.id));
    expect(result.accounts).toHaveLength(2);
  });
  it("cancels a pending selection without creating accounts", async () => {
    const id = await selection();
    await cancelGoogleSelection(fixture.db, org, owner.id, id);
    await expect(
      googleSelection(fixture.db, org, owner.id, id)
    ).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
    expect(await fixture.db.select().from(channelConnections)).toHaveLength(0);
  });
  it("requires owner/admin privileges for connecting, verification and disconnection", async () => {
    await expect(begin(org, viewer.id)).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    const c = (await connect()).accounts[0];
    await expect(
      caller(viewer).verify({ organizationId: org, id: c.id })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(
      caller(viewer).disconnect({
        organizationId: org,
        id: c.id,
        confirm: true,
      })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(
      caller().verify({ organizationId: org2, id: c.id })
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
  it("refreshes expired access tokens server-side and keeps refresh credentials private", async () => {
    const c = (await connect()).accounts[0];
    await fixture.db.update(channelConnections).set({
      credentials: encryptToken(JSON.stringify({ ...grant(), expiresAtMs: 1 })),
    });
    expect(
      await verifyGoogleConnection(fixture.db, org, owner.id, c.id)
    ).toMatchObject({ success: true });
    expect(fixture.refresh).toHaveBeenCalledTimes(1);
    expect(fixture.verify).toHaveBeenLastCalledWith(
      "refreshed-access",
      expect.objectContaining({ id: accounts[0].id })
    );
    expect(
      JSON.parse(decryptToken((await row(c.id)).credentials)).refreshToken
    ).toBe("private-refresh");
  });
  it("marks revoked grants as needing reconnect without altering other accounts", async () => {
    const connected = await connect(accounts.map(a => a.id));
    const c = connected.accounts[0];
    await fixture.db
      .update(channelConnections)
      .set({
        credentials: encryptToken(
          JSON.stringify({ ...grant(), expiresAtMs: 1 })
        ),
      })
      .where(eq(channelConnections.id, c.id));
    fixture.refresh.mockRejectedValueOnce(new GoogleAdsError("expired"));
    await expect(
      verifyGoogleConnection(fixture.db, org, owner.id, c.id)
    ).rejects.toMatchObject({ reason: "expired" });
    const failed = await row(c.id);
    expect(failed.credentials).toBeNull();
    expect(safeGoogleConnection(failed).needsReconnect).toBe(true);
    expect((await row(connected.accounts[1].id)).status).toBe("connected");
  });
  it("cannot resurrect credentials after disconnect races an in-flight refresh", async () => {
    const c = (await connect()).accounts[0];
    await fixture.db.update(channelConnections).set({
      credentials: encryptToken(JSON.stringify({ ...grant(), expiresAtMs: 1 })),
    });
    let finish!: (value: any) => void;
    let started!: () => void;
    const refreshing = new Promise<void>(resolve => {
      started = resolve;
    });
    fixture.refresh.mockImplementationOnce(() => {
      started();
      return new Promise(resolve => {
        finish = resolve;
      });
    });
    const pending = verifyGoogleConnection(fixture.db, org, owner.id, c.id);
    const assertion = expect(pending).rejects.toMatchObject({
      reason: "expired",
    });
    await refreshing;
    await disconnectGoogleAccount(fixture.db, org, owner.id, c.id);
    finish(grant());
    await assertion;
    expect((await row(c.id)).credentials).toBeNull();
    expect((await row(c.id)).status).toBe("disconnected");
  });
  it("reconnects the same account without duplicating it or touching another workspace", async () => {
    const first = (await connect()).accounts[0];
    const otherWorkspace = (await connect([accounts[0].id], org2)).accounts[0];
    await disconnectGoogleAccount(fixture.db, org, owner.id, first.id);
    expect((await row(otherWorkspace.id)).status).toBe("connected");
    const second = (await connect()).accounts[0];
    expect(second.id).toBe(first.id);
    expect((await row(second.id)).status).toBe("connected");
    expect(await fixture.db.select().from(channelConnections)).toHaveLength(2);
  });
  it("cannot route Google credentials through Meta or existing publishing/workflow adapters", async () => {
    const c = await row((await connect()).accounts[0].id);
    expect(() => connectionToken(c)).toThrow(/Google Ads connection service/);
    await expect(getConnection(fixture.db, org, c.id)).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
    expect(channelSchema.safeParse("google_ads").success).toBe(false);
    expect(Object.keys(googleAdsRouter._def.procedures)).toEqual([
      "campaigns.videoUploadStatus",
      "campaigns.uploadVideo",
      "campaigns.inventory",
      "campaigns.resources",
      "campaigns.drafts",
      "campaigns.draft",
      "campaigns.save",
      "campaigns.validate",
      "campaigns.publish",
      "connections",
      "beginOAuth",
      "selection",
      "cancelSelection",
      "connect",
      "verify",
      "disconnect",
    ]);
  });
});

it("refreshes a reporting read once and refuses foreign or disconnected workspace connections", async () => {
  const c = (await connect()).accounts[0];
  const read = vi
    .fn()
    .mockRejectedValueOnce(new GoogleAdsError("expired"))
    .mockResolvedValue({ spend: 10 });
  await expect(
    withGoogleAdsAccess(fixture.db, org2, c.id, read)
  ).rejects.toMatchObject({ code: "NOT_FOUND" });
  expect(read).not.toHaveBeenCalled();
  expect(await withGoogleAdsAccess(fixture.db, org, c.id, read)).toEqual({
    spend: 10,
  });
  expect(read).toHaveBeenLastCalledWith(
    expect.objectContaining({ organizationId: org, accountId: accounts[0].id }),
    "refreshed-access"
  );
  expect(fixture.refresh).toHaveBeenCalledTimes(1);
  await disconnectGoogleAccount(fixture.db, org, owner.id, c.id);
  read.mockClear();
  await expect(
    withGoogleAdsAccess(fixture.db, org, c.id, read)
  ).rejects.toMatchObject({ reason: "expired" });
  expect(read).not.toHaveBeenCalled();
});
