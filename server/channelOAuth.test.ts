import { randomUUID } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { get as httpGet } from "node:http";
import express from "express";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { eq } from "drizzle-orm";
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
  discover: vi.fn(),
  request: vi.fn(),
}));
vi.mock("./db", () => ({
  getDb: async () => fixture.db,
  closeDb: async () => {},
}));
vi.mock("./auth/supabase", async original => ({
  ...(await original<typeof import("./auth/supabase")>()),
  authenticateRequest: async () => fixture.user,
}));
vi.mock("./lib/channelGraph", async original => ({
  ...(await original<typeof import("./lib/channelGraph")>()),
  discoverMeta: (...args: any[]) => fixture.discover(...args),
  graphRequest: (...args: any[]) => fixture.request(...args),
}));
import {
  users,
  organizations,
  organizationMemberships,
} from "../drizzle/schema";
import {
  channelConnections,
  channelOAuthSessions,
  publications,
} from "../drizzle/channelSchema";
import {
  beginMetaOAuth,
  connectChoice,
  createDiscovery,
  readDiscovery,
  registerChannelOAuth,
  safeConnection,
} from "./lib/channelConnections";
import { decryptToken } from "./lib/secureToken";
import { contentSchema } from "../shared/channels";
let engine: PGlite,
  org = 0,
  owner = 0,
  other = 0,
  server: ReturnType<ReturnType<typeof express>["listen"]>,
  origin = "";
const discovery = () => ({
  identity: { id: "10", name: "Authorized identity" },
  granted: [
    "pages_show_list",
    "pages_read_engagement",
    "pages_manage_posts",
    "read_insights",
    "ads_read",
    "ads_management",
    "pages_manage_ads",
  ],
  pages: [
    {
      id: "123",
      name: "Granted Page",
      access_token: "fake-page-secret",
      tasks: ["MANAGE"],
    },
  ],
  accounts: [
    {
      id: "act_456",
      account_id: "456",
      name: "Granted account",
      account_status: 1,
    },
  ],
  warnings: [],
  expiresAtMs: null,
});
beforeAll(async () => {
  vi.stubEnv(
    "INTEGRATION_TOKEN_ENCRYPTION_SECRET",
    "test-only-integration-encryption"
  );
  vi.stubEnv("META_APP_ID", "test-app");
  vi.stubEnv("META_APP_SECRET", "test-secret");
  vi.stubEnv("APP_ORIGIN", "https://example.test");
  engine = new PGlite();
  for (const f of readdirSync("drizzle/postgres")
    .filter(f => f.endsWith(".sql"))
    .sort())
    await engine.exec(readFileSync("drizzle/postgres/" + f, "utf8"));
  fixture.db = drizzle(engine);
  const people = await fixture.db
    .insert(users)
    .values([
      { openId: "oauth-owner", name: "Owner" },
      { openId: "oauth-other", name: "Other admin" },
    ])
    .returning();
  owner = people[0].id;
  other = people[1].id;
  fixture.user = people[0];
  const [workspace] = await fixture.db
    .insert(organizations)
    .values({
      name: "OAuth test",
      slug: "oauth-test",
      createdByUserId: owner,
      createdAtMs: Date.now(),
    })
    .returning();
  org = workspace.id;
  await fixture.db.insert(organizationMemberships).values([
    {
      userId: owner,
      organizationId: org,
      role: "owner",
      status: "active",
      createdAtMs: 1,
    },
    {
      userId: other,
      organizationId: org,
      role: "admin",
      status: "active",
      createdAtMs: 1,
    },
  ]);
  const app = express();
  registerChannelOAuth(app);
  server = app.listen(0, "127.0.0.1");
  await new Promise<void>(resolve => server.once("listening", resolve));
  origin = "http://127.0.0.1:" + (server.address() as any).port;
}, 30000);
afterAll(async () => {
  await new Promise<void>(resolve => server?.close(() => resolve()));
  await engine?.close();
  vi.unstubAllEnvs();
});
beforeEach(async () => {
  fixture.discover.mockReset().mockResolvedValue(discovery());
  fixture.request
    .mockReset()
    .mockImplementation(async (path: string) =>
      path === "oauth/access_token"
        ? { access_token: "fake-user-secret" }
        : path === "123"
          ? { id: "123", name: "Verified Page" }
          : {
              account_id: "456",
              name: "Verified account",
              account_status: 1,
              currency: "USD",
              timezone_name: "America/New_York",
            }
    );
  await fixture.db.delete(publications);
  await fixture.db.delete(channelOAuthSessions);
  await fixture.db.delete(channelConnections);
});
async function begin() {
  let cookie = "";
  const res = {
    cookie: (_name: string, value: string) => {
      cookie = value;
    },
  };
  const result = await beginMetaOAuth(
    fixture.db,
    org,
    owner,
    "facebook",
    res as any
  );
  return {
    state: new URL(result.url).searchParams.get("state")!,
    cookie,
    url: result.url,
  };
}
async function callback(state: string, cookie: string) {
  return new Promise<{ location: string; status: number }>(
    (resolve, reject) => {
      const req = httpGet(
        origin +
          "/api/channels/meta/callback?code=one-time-code&state=" +
          state,
        { headers: { Cookie: "frame_meta_state=" + cookie } },
        res => {
          res.resume();
          resolve({
            location: res.headers.location ?? "",
            status: res.statusCode!,
          });
        }
      );
      req.on("error", reject);
    }
  );
}
describe.sequential("Meta OAuth consent boundary", () => {
  it("stores a hash of single-use state and uses a fixed callback", async () => {
    const r = await begin();
    const [row] = await fixture.db.select().from(channelOAuthSessions);
    expect(row.stateHash).not.toBe(r.state);
    expect(row.stateHash).toHaveLength(64);
    expect(r.state).toBe(r.cookie);
    expect(new URL(r.url).searchParams.get("redirect_uri")).toBe(
      "https://example.test/api/channels/meta/callback"
    );
  });
  it("rejects mismatched callback cookies before contacting Meta", async () => {
    const r = await begin();
    const result = await callback(r.state, "wrong-cookie");
    expect(result.location).toContain("metaError=state");
    expect(fixture.request).not.toHaveBeenCalled();
  });
  it("consumes valid state, encrypts discovery credentials, and never puts tokens in redirects", async () => {
    const r = await begin();
    const result = await callback(r.state, r.cookie);
    expect(result.location).toMatch(
      /^\/app\/settings\/integrations\?metaSelection=/
    );
    expect(result.location).not.toContain("fake-user-secret");
    const rows = await fixture.db.select().from(channelOAuthSessions);
    expect(rows).toHaveLength(1);
    expect(rows[0].stateHash).toBeNull();
    expect(decryptToken(rows[0].credentials)).toBe("fake-user-secret");
    expect((await callback(r.state, r.cookie)).location).toContain(
      "metaError=expired"
    );
  });
  it("binds asset selection to the exact user even when another user is an admin", async () => {
    const selection = await createDiscovery(
      fixture.db,
      org,
      owner,
      "facebook",
      "fake-user-secret"
    );
    await expect(
      readDiscovery(fixture.db, org, other, selection.id)
    ).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
    await expect(
      connectChoice(fixture.db, {
        organizationId: org,
        userId: owner,
        discoveryId: selection.id,
        accountId: "999",
      })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(await fixture.db.select().from(channelConnections)).toHaveLength(0);
  });
  it("uses the granted Page token rather than a user-entered Page token and blocks replays", async () => {
    const selection = await createDiscovery(
      fixture.db,
      org,
      owner,
      "facebook",
      "fake-user-secret"
    );
    const input = {
      organizationId: org,
      userId: owner,
      discoveryId: selection.id,
      accountId: "123",
    };
    await connectChoice(fixture.db, input);
    const [row] = await fixture.db.select().from(channelConnections);
    expect(decryptToken(row.credentials)).toBe("fake-page-secret");
    expect(row.details.capabilities).toContain("publish");
    expect(safeConnection(row)).not.toHaveProperty("credentials");
    await expect(connectChoice(fixture.db, input)).rejects.toMatchObject({
      code: "PRECONDITION_FAILED",
    });
  });
  it("does not advertise publishing access when Page tasks are missing", async () => {
    const d = discovery();
    d.pages[0].tasks = ["ANALYZE"];
    fixture.discover.mockResolvedValue(d);
    const selection = await createDiscovery(
      fixture.db,
      org,
      owner,
      "facebook",
      "fake-user-secret"
    );
    await connectChoice(fixture.db, {
      organizationId: org,
      userId: owner,
      discoveryId: selection.id,
      accountId: "123",
    });
    const [row] = await fixture.db.select().from(channelConnections);
    expect(row.details.capabilities).not.toContain("publish");
    expect(row.details.capabilities).toContain("read");
  });
  it("reconnection invalidates queued approvals and advances their revisions", async () => {
    const first = await createDiscovery(
      fixture.db,
      org,
      owner,
      "facebook",
      "fake-user-secret"
    );
    const c = await connectChoice(fixture.db, {
      organizationId: org,
      userId: owner,
      discoveryId: first.id,
      accountId: "123",
    });
    const p = {
      id: randomUUID(),
      organizationId: org,
      channel: "facebook",
      connectionId: c.id,
      content: contentSchema.parse({ title: "Queued", message: "Test" }),
      state: "scheduled",
      timezone: "UTC",
      createdByUserId: owner,
      createdAtMs: Date.now(),
      updatedAtMs: Date.now(),
    };
    await fixture.db.insert(publications).values(p);
    const second = await createDiscovery(
      fixture.db,
      org,
      owner,
      "facebook",
      "fake-user-secret"
    );
    await connectChoice(fixture.db, {
      organizationId: org,
      userId: owner,
      discoveryId: second.id,
      accountId: "123",
    });
    const [post] = await fixture.db.select().from(publications);
    expect(post.state).toBe("changes_requested");
    expect(post.revision).toBe(2);
  });
  it("does not replace credentials while delivery is in progress", async () => {
    const first = await createDiscovery(
      fixture.db,
      org,
      owner,
      "facebook",
      "fake-user-secret"
    );
    const c = await connectChoice(fixture.db, {
      organizationId: org,
      userId: owner,
      discoveryId: first.id,
      accountId: "123",
    });
    await fixture.db
      .insert(publications)
      .values({
        id: randomUUID(),
        organizationId: org,
        channel: "facebook",
        connectionId: c.id,
        content: contentSchema.parse({ title: "Delivering" }),
        state: "publishing",
        timezone: "UTC",
        createdByUserId: owner,
        createdAtMs: 1,
        updatedAtMs: 1,
      });
    const second = await createDiscovery(
      fixture.db,
      org,
      owner,
      "facebook",
      "fake-user-secret"
    );
    await expect(
      connectChoice(fixture.db, {
        organizationId: org,
        userId: owner,
        discoveryId: second.id,
        accountId: "123",
      })
    ).rejects.toMatchObject({ code: "CONFLICT" });
  });
});
