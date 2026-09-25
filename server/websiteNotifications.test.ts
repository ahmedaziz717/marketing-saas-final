import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { eq } from "drizzle-orm";
import { websiteRequests } from "../drizzle/websiteSchema";
const state = vi.hoisted(() => ({ db: null as any }));
vi.mock("./db", () => ({ getDb: async () => state.db }));
import {
  deliverWebsiteRequest,
  processWebsiteNotifications,
  websiteEmailConfigured,
} from "./lib/websiteNotifications";

let engine: PGlite;
const fetchMock = vi.fn();
const now = Date.now();
beforeAll(async () => {
  engine = new PGlite();
  for (const file of readdirSync("drizzle/postgres")
    .filter(f => f.endsWith(".sql"))
    .sort())
    await engine.exec(readFileSync("drizzle/postgres/" + file, "utf8"));
  state.db = drizzle(engine);
}, 30000);
beforeEach(async () => {
  await engine.exec("TRUNCATE app_private.website_requests");
  vi.stubEnv("APP_ORIGIN", "https://app.evokeloop.com");
  vi.stubEnv("CONTACT_RESEND_API_KEY", "test-key-not-a-real-credential");
  vi.stubEnv("CONTACT_EMAIL_FROM", "EvokeLoop <notifications@example.test>");
  vi.stubEnv("CONTACT_NOTIFICATION_EMAIL", "ahmed.aziz@cybertron.com");
  vi.stubGlobal("fetch", fetchMock);
  fetchMock
    .mockReset()
    .mockImplementation(async () => Response.json({ id: "provider-email-id" }));
  vi.spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});
afterAll(async () => {
  await engine?.close();
});

async function request(
  overrides: Partial<typeof websiteRequests.$inferInsert> = {}
) {
  const [row] = await state.db
    .insert(websiteRequests)
    .values({
      id: randomUUID(),
      receiptHash: randomUUID(),
      name: "A visitor\nBcc: unrelated@example.test",
      email: "visitor@example.test",
      topic: "support",
      workspace: "Example workspace",
      message: "Please help with <script>this</script> workspace.",
      createdAtMs: now,
      updatedAtMs: now,
      ...overrides,
    })
    .returning();
  return row as typeof websiteRequests.$inferSelect;
}
async function saved(id: string) {
  return (
    await state.db
      .select()
      .from(websiteRequests)
      .where(eq(websiteRequests.id, id))
  )[0];
}

describe.sequential("durable website contact email delivery", () => {
  it("routes every form topic only to the configured inbox with safe reply-to and no private receipt", async () => {
    const rows = [];
    for (const topic of ["access", "demo", "support", "privacy", "deletion"])
      rows.push(await request({ topic }));
    await processWebsiteNotifications();
    expect(fetchMock).toHaveBeenCalledTimes(5);
    for (const [url, options] of fetchMock.mock.calls) {
      expect(url).toBe("https://api.resend.com/emails");
      const body = JSON.parse(options.body);
      expect(body.to).toEqual(["ahmed.aziz@cybertron.com"]);
      expect(body.reply_to).toBe("visitor@example.test");
      expect(body.subject).not.toContain("\n");
      expect(body.subject).not.toContain("visitor");
      expect(body).not.toHaveProperty("html");
      expect(body.text).toContain(
        "https://app.evokeloop.com/app/platform/website"
      );
      expect(body.text).not.toContain("request-status/");
      expect(body.text).not.toContain("frame-staging");
    }
    for (const row of rows) {
      expect(await saved(row.id)).toMatchObject({
        emailState: "sent",
        emailAttempts: 1,
        emailProviderId: "provider-email-id",
        emailLeaseUntilMs: 0,
      });
    }
  });
  it("claims concurrent delivery once and never resends a provider-accepted request", async () => {
    const row = await request();
    const results = await Promise.all([
      deliverWebsiteRequest(row.id, now),
      deliverWebsiteRequest(row.id, now),
    ]);
    expect(results.sort()).toEqual([false, true]);
    expect(await deliverWebsiteRequest(row.id, now + 120000)).toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
  it("persists a transient failure and retries with the same payload and provider idempotency key", async () => {
    const row = await request();
    fetchMock.mockResolvedValueOnce(
      new Response("provider details must not be stored", { status: 503 })
    );
    expect(await deliverWebsiteRequest(row.id, now)).toBe(false);
    expect(await saved(row.id)).toMatchObject({
      emailState: "retrying",
      emailLastError: "provider_http_503",
      emailAttempts: 1,
    });
    expect(await deliverWebsiteRequest(row.id, now + 59999)).toBe(false);
    expect(await deliverWebsiteRequest(row.id, now + 60000)).toBe(true);
    expect(fetchMock.mock.calls[0][1].body).toBe(
      fetchMock.mock.calls[1][1].body
    );
    expect(fetchMock.mock.calls[0][1].headers["Idempotency-Key"]).toBe(
      `evokeloop-contact/${row.id}`
    );
    expect(fetchMock.mock.calls[1][1].headers["Idempotency-Key"]).toBe(
      `evokeloop-contact/${row.id}`
    );
  });
  it("keeps unconfigured mail queued without claiming delivery", async () => {
    const row = await request();
    vi.stubEnv("CONTACT_RESEND_API_KEY", "");
    expect(websiteEmailConfigured()).toBe(false);
    await processWebsiteNotifications();
    expect(await deliverWebsiteRequest(row.id, now)).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(await saved(row.id)).toMatchObject({
      emailState: "pending",
      emailAttempts: 0,
      emailSentAtMs: null,
    });
  });
  it("does not send with malformed sender or recipient headers", async () => {
    const row = await request();
    vi.stubEnv(
      "CONTACT_EMAIL_FROM",
      "notifications@example.test\nBcc: attacker@example.test"
    );
    expect(await deliverWebsiteRequest(row.id, now)).toBe(false);
    vi.stubEnv("CONTACT_EMAIL_FROM", "notifications@example.test");
    vi.stubEnv(
      "CONTACT_NOTIFICATION_EMAIL",
      "one@example.test,two@example.test"
    );
    expect(await deliverWebsiteRequest(row.id, now)).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it("makes permanent provider rejection visible for operator attention", async () => {
    const row = await request();
    fetchMock.mockResolvedValueOnce(
      new Response("Private API credential details", { status: 403 })
    );
    expect(await deliverWebsiteRequest(row.id, now)).toBe(false);
    expect(await saved(row.id)).toMatchObject({
      emailState: "needs_attention",
      emailLastError: "provider_http_403",
      emailSentAtMs: null,
    });
    expect(await deliverWebsiteRequest(row.id, now + 60000)).toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
  it("retries uncertain network failures without storing sensitive exception text", async () => {
    const row = await request();
    fetchMock.mockRejectedValueOnce(new Error("Secret provider response"));
    expect(await deliverWebsiteRequest(row.id, now)).toBe(false);
    expect(await saved(row.id)).toMatchObject({
      emailState: "retrying",
      emailLastError: "network_or_timeout",
    });
    expect(await deliverWebsiteRequest(row.id, now + 60000)).toBe(true);
  });
  it("stops uncertain retries before the provider deduplication window expires", async () => {
    const row = await request({
      emailState: "retrying",
      emailFirstAttemptAtMs: now - 23 * 60 * 60 * 1000,
      emailAttempts: 2,
    });
    expect(await deliverWebsiteRequest(row.id, now)).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(await saved(row.id)).toMatchObject({
      emailState: "needs_attention",
      emailLastError: "idempotency_window_expired",
    });
  });
});
