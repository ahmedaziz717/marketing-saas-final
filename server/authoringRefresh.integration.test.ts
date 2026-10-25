import { beforeAll, afterAll, it, expect } from "vitest";
import { randomBytes, randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { getDb } from "./db";
import {
  users,
  organizations,
  organizationMemberships,
  activityEvents,
} from "../drizzle/schema";
import {
  authoringOAuthGrants,
  authoringOAuthRequests,
  authoringOAuthRefreshTokens,
} from "../drizzle/workflowSchema";
import {
  authoringOAuth,
  opaqueHash,
  refreshIdleLifetimeMs,
} from "./mcp/authoringOAuth";

// Real PostgreSQL lock/race coverage, run by CI against its isolated database.
const config = {
  origin: "https://refresh.example",
  resource: "https://refresh.example/mcp/authoring",
  clientId: "refresh-test",
  redirectUris: ["https://chatgpt.com/connector_platform_oauth_redirect"],
};
const oauth = authoringOAuth(config);
let db: NonNullable<Awaited<ReturnType<typeof getDb>>>;
let userId: number, organizationId: number;
beforeAll(async () => {
  db = (await getDb())!;
  if (!db) throw new Error("Use an isolated integration database");
  const suffix = randomUUID();
  [{ id: userId }] = await db
    .insert(users)
    .values({ openId: "refresh-" + suffix })
    .returning();
  [{ id: organizationId }] = await db
    .insert(organizations)
    .values({
      slug: "refresh-" + suffix,
      name: "Refresh integration",
      createdByUserId: userId,
      createdAtMs: Date.now(),
    })
    .returning();
  await db
    .insert(organizationMemberships)
    .values({
      organizationId,
      userId,
      status: "active",
      role: "owner",
      createdAtMs: Date.now(),
    });
});
afterAll(async () => {
  if (!db || !organizationId) return;
  await db
    .delete(authoringOAuthGrants)
    .where(eq(authoringOAuthGrants.organizationId, organizationId));
  await db
    .delete(authoringOAuthRequests)
    .where(eq(authoringOAuthRequests.organizationId, organizationId));
  await db
    .delete(activityEvents)
    .where(eq(activityEvents.organizationId, organizationId));
  await db
    .delete(organizationMemberships)
    .where(eq(organizationMemberships.organizationId, organizationId));
  await db.delete(organizations).where(eq(organizations.id, organizationId));
  await db.delete(users).where(eq(users.id, userId));
});
async function seed() {
  const id = randomUUID(),
    refresh = randomBytes(32).toString("base64url");
  await db
    .insert(authoringOAuthGrants)
    .values({
      id,
      userId,
      organizationId,
      clientId: config.clientId,
      resource: config.resource,
      scope: "workflows:read workflows:draft",
      tokenHash: opaqueHash(randomUUID()),
      createdAtMs: Date.now(),
      expiresAtMs: Date.now() + 1800_000,
      refreshExpiresAtMs: Date.now() + refreshIdleLifetimeMs,
    });
  await db
    .insert(authoringOAuthRefreshTokens)
    .values({ connectionId: id, tokenHash: opaqueHash(refresh) });
  return {
    id,
    input: {
      grant_type: "refresh_token",
      client_id: config.clientId,
      resource: config.resource,
      refresh_token: refresh,
    },
  };
}
it("commits replay revocation under concurrent PostgreSQL refresh transactions", async () => {
  const { id, input } = await seed();
  const results = await Promise.allSettled([
    oauth.exchange(input),
    oauth.exchange(input),
  ]);
  expect(results.filter(r => r.status === "fulfilled")).toHaveLength(1);
  expect(results.filter(r => r.status === "rejected")).toHaveLength(1);
  const [row] = await db
    .select()
    .from(authoringOAuthGrants)
    .where(eq(authoringOAuthGrants.id, id));
  expect(row.revokedAtMs).toBeTruthy();
  const success = results.find(r => r.status === "fulfilled")!;
  if (success.status === "fulfilled") {
    expect(await oauth.verify(success.value.access_token)).toBeNull();
    await expect(
      oauth.exchange({ ...input, refresh_token: success.value.refresh_token })
    ).rejects.toThrow();
  }
});
it("never resurrects a connection when refresh races revocation", async () => {
  const { id, input } = await seed();
  const [refreshed] = await Promise.allSettled([
    oauth.exchange(input),
    oauth.revoke(userId, id),
  ]);
  const [row] = await db
    .select()
    .from(authoringOAuthGrants)
    .where(eq(authoringOAuthGrants.id, id));
  expect(row.revokedAtMs).toBeTruthy();
  if (refreshed.status === "fulfilled")
    expect(await oauth.verify(refreshed.value.access_token)).toBeNull();
  await expect(oauth.exchange(input)).rejects.toThrow();
});
